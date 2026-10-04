import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ApiService } from '../services/api';
import { Interview, Question } from '../types';
import { useCamera } from '../hooks/useCamera';
import { useMicrophone } from '../hooks/useMicrophone';
import { useInterviewSocket } from '../hooks/useInterviewSocket';
import { useProctor } from '../hooks/useProctor';
import { CameraPreview } from '../components/CameraPreview';
import { InterviewQuestion } from '../components/InterviewQuestion';
import { LiveMetrics } from '../components/LiveMetrics';
import { FeedbackCard } from '../components/FeedbackCard';
import { Chip, Meter } from '../components/Meter';
import {
  Clock,
  Play,
  Square,
  ArrowRight,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Users,
  Eye,
  Activity,
} from 'lucide-react';

export const InterviewRoom: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const interviewId = Number(id);
  const navigate = useNavigate();

  const [interview, setInterview] = useState<Interview | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [isAnswering, setIsAnswering] = useState<boolean>(false);
  const [interviewElapsed, setInterviewElapsed] = useState<number>(0);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [feedbackDialog, setFeedbackDialog] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Overall session timer
  useEffect(() => {
    const timer = setInterval(() => {
      setInterviewElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format MM:SS
  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  // 1. Hardware Hooks
  const {
    videoRef,
    status: camStatus,
    errorMessage: camError,
    startCamera,
    stopCamera,
    captureSampledFrame,
  } = useCamera();

  const {
    status: micStatus,
    errorMessage: micError,
    volume,
    transcript,
    speakingSpeed,
    fillerCount,
    duration: answerDuration,
    startMicrophone,
    stopMicrophone,
    resetTranscript,
  } = useMicrophone();

  // 2. WebSocket Hook
  const {
    isConnected,
    connectionStatus,
    currentQuestion: wsQuestion,
    liveMetrics,
    integrity,
    coachingTip,
    lastQuestionFeedback,
    sendVideoFrame,
    sendIntegrityEvent,
    sendAudioChunk,
    completeQuestion,
    requestCompleteInterview,
  } = useInterviewSocket({
    interviewId,
    onInterviewCompleted: () => {
      navigate(`/report/${interviewId}`);
    },
    onQuestionStarted: (newQ) => {
      setActiveQuestion(newQ);
      setIsEvaluating(false);
      setFeedbackDialog(null);
    },
  });

  // 3. Session Integrity Watcher (browser environment signals)
  const { localFlags, enterLockdown } = useProctor({
    active: isAnswering,
    onEvent: sendIntegrityEvent,
  });

  // Load Interview data from backend API
  useEffect(() => {
    const loadInterview = async () => {
      try {
        const data = await ApiService.getInterview(interviewId);
        setInterview(data);
        if (data.questions && data.questions.length > 0) {
          setActiveQuestion(data.questions[0]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load interview session.');
      }
    };
    loadInterview();

    // Start video on entry
    startCamera();

    return () => {
      stopCamera();
      stopMicrophone();
    };
  }, [interviewId, startCamera, stopCamera, stopMicrophone]);

  // Synchronize WebSocket pushed question if available
  useEffect(() => {
    if (wsQuestion) {
      setActiveQuestion(wsQuestion);
      if (interview && interview.questions) {
        const idx = interview.questions.findIndex((q) => q.id === wsQuestion.id);
        if (idx !== -1) setCurrentQuestionIndex(idx);
      }
    }
  }, [wsQuestion, interview]);

  // Live telemetry changes many times a second. Reading it through a ref keeps the
  // sampling intervals below from being torn down and rebuilt on every tick.
  const telemetryRef = useRef({ speakingSpeed, volume, transcript, isAnswering });
  useEffect(() => {
    telemetryRef.current = { speakingSpeed, volume, transcript, isAnswering };
  }, [speakingSpeed, volume, transcript, isAnswering]);

  // Sample a frame every 1.5s for as long as the camera is live, so the eye
  // contact and posture readings keep moving between questions too. The flag
  // tells the server which frames belong to the answer being scored.
  useEffect(() => {
    if (camStatus !== 'active' || !isConnected) return;

    const sampleInterval = setInterval(() => {
      const frameBase64 = captureSampledFrame();
      if (frameBase64) {
        const live = telemetryRef.current;
        sendVideoFrame(frameBase64, live.speakingSpeed, live.isAnswering);
      }
    }, 1500);

    return () => clearInterval(sampleInterval);
  }, [camStatus, isConnected, captureSampledFrame, sendVideoFrame]);

  // Periodic audio telemetry chunk to WebSocket
  useEffect(() => {
    if (!isAnswering) return;

    const audioInterval = setInterval(() => {
      const live = telemetryRef.current;
      sendAudioChunk(live.volume, live.speakingSpeed, live.transcript);
    }, 1000);

    return () => clearInterval(audioInterval);
  }, [isAnswering, sendAudioChunk]);

  // Handle Question Feedback Dialog
  useEffect(() => {
    if (lastQuestionFeedback) {
      setIsEvaluating(false);
      setFeedbackDialog(lastQuestionFeedback);
    }
  }, [lastQuestionFeedback]);

  // Start Candidate Answer
  const handleStartAnswer = async () => {
    setError(null);
    await startMicrophone();
    await enterLockdown();
    setIsAnswering(true);
  };

  // End Candidate Answer
  const handleEndAnswer = async () => {
    setIsAnswering(false);
    stopMicrophone();
    setIsEvaluating(true);

    if (activeQuestion) {
      const sent = completeQuestion(activeQuestion.id, transcript, answerDuration);

      const fallbackToRest = async () => {
        try {
          const resp = await ApiService.submitResponse({
            question_id: activeQuestion.id,
            transcript: transcript || 'Candidate completed spoken response.',
            duration: answerDuration || 20,
            speaking_speed: speakingSpeed || 140,
            pause_duration: 1.5,
            filler_count: fillerCount || 0,
            volume_score: volume || 75,
            vision: liveMetrics,
          });

          let evalData: any = {};
          if (resp.answer_evaluation?.feedback) {
            try {
              evalData = JSON.parse(resp.answer_evaluation.feedback);
            } catch {}
          }

          setFeedbackDialog({
            question_id: activeQuestion.id,
            overall_score: Math.round(resp.answer_evaluation?.overall_score || 75),
            strengths: evalData.strengths || ['Clear and structured communication'],
            weaknesses: evalData.weaknesses || ['Could expand with specific examples'],
            suggestions: evalData.suggestions || ['Structure your explanation with concrete metrics'],
            speech_metrics: {
              speaking_speed: resp.speaking_speed || 140,
              filler_count: resp.filler_count || 0,
              pause_duration: resp.pause_duration || 1.5,
            },
            vision_metrics: liveMetrics,
          });
          setIsEvaluating(false);
        } catch (err: any) {
          console.error('Evaluation fallback error:', err);
          setIsEvaluating(false);
          setError(err.message || 'Evaluation encountered an error. Please continue to next question.');
        }
      };

      if (!sent) {
        await fallbackToRest();
      } else {
        // Safety timeout: If WebSocket response does not arrive within 6 seconds, invoke fallback
        setTimeout(() => {
          setIsEvaluating((current) => {
            if (current) {
              fallbackToRest();
            }
            return current;
          });
        }, 6000);
      }
    }
  };


  // Advance to next question manually or proceed from feedback dialog
  const handleNextQuestion = () => {
    setFeedbackDialog(null);
    if (!interview || !interview.questions) return;

    const nextIdx = currentQuestionIndex + 1;
    if (nextIdx < interview.questions.length) {
      setCurrentQuestionIndex(nextIdx);
      setActiveQuestion(interview.questions[nextIdx]);
      resetTranscript();
    } else {
      // Complete entire interview
      requestCompleteInterview();
    }
  };

  const totalQuestions = interview?.questions?.length || 3;

  return (
    <div className="min-h-screen bg-ink text-chalk flex flex-col">
      {/* Top Header Bar */}
      <header className="bg-panel border-b border-line px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg text-chalk">IntervuX</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-sodium-500/10 text-sodium-400 border border-sodium-500/20 font-semibold">
            {interview?.type || 'Technical'} / {interview?.mode || 'Practice'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* WebSocket Connection Status */}
          <div className="flex items-center gap-1.5 text-xs">
            {isConnected ? (
              <span className="text-good-400 flex items-center gap-1">
                <Wifi className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Connected</span>
              </span>
            ) : (
              <span className="text-flag-400 flex items-center gap-1">
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reconnecting...</span>
              </span>
            )}
          </div>

          {/* Session Timer */}
          <div className="flex items-center gap-1.5 bg-ink px-3 py-1.5 rounded-control border border-line font-mono text-sm text-chalk">
            <Clock className="w-4 h-4 text-sodium-400" />
            <span>{formatTimer(interviewElapsed)}</span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Error Banners */}
        {(error || camError || micError) && (
          <div className="p-4 bg-peak-500/10 border border-peak-500/20 rounded-control flex items-center gap-3 text-peak-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error || camError || micError}</span>
          </div>
        )}

        {/* Practice Mode Live Coaching Tip Alert */}
        {interview?.mode === 'practice' && coachingTip && (
          <FeedbackCard tip={coachingTip} />
        )}

        {/* Webcam Preview Screen */}
        <div className="w-full">
          <CameraPreview
            videoRef={videoRef}
            status={camStatus}
            errorMessage={camError}
            metrics={liveMetrics}
            isRecording={isAnswering}
            onRetry={startCamera}
          />
        </div>

        {/* Session Integrity Monitor */}
        <div
          className={`rounded-panel border p-4 ${
 integrity.status === 'clean'
              ? 'bg-panel/80 border-line'
              : integrity.status === 'review'
              ? 'bg-flag-500/5 border-flag-500/30'
              : 'bg-peak-500/5 border-peak-500/30'
          }`}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="flex items-center gap-2 text-sm font-semibold text-chalk">
              {integrity.status === 'clean' ? (
                <ShieldCheck className="w-4 h-4 text-good-400" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-flag-400" />
              )}
              Session Integrity
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
 integrity.status === 'clean'
                    ? 'text-good-400 border-good-500/30 bg-good-500/10'
                    : integrity.status === 'review'
                    ? 'text-flag-400 border-flag-500/30 bg-flag-500/10'
                    : 'text-peak-400 border-peak-500/30 bg-peak-500/10'
                }`}
              >
                {integrity.integrity_score}/100
              </span>
            </span>

            <div className="flex items-center gap-4 text-[11px] text-mute">
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-sodium-400" />
                {liveMetrics.gaze_direction || 'On camera'}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-sodium-400" />
                {liveMetrics.person_count ?? 1} in frame
              </span>
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-sodium-400" />
                Background {(liveMetrics.background_motion ?? 0).toFixed(1)}%
              </span>
              {integrity.hidden_seconds > 0 && (
                <span className="text-flag-400">{integrity.hidden_seconds}s off-tab</span>
              )}
            </div>
          </div>

          {integrity.flags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {integrity.flags.map((flag) => (
                <li
                  key={flag.type}
                  className={`text-[11px] px-2.5 py-1 rounded-control border ${
 flag.severity === 'high'
                      ? 'text-peak-300 border-peak-500/30 bg-peak-500/10'
                      : flag.severity === 'medium'
                      ? 'text-flag-300 border-flag-500/30 bg-flag-500/10'
                      : 'text-chalk-dim border-line bg-steel/60'
                  }`}
                >
                  {flag.label}
                  {flag.count > 1 && <span className="font-mono"> ×{flag.count}</span>}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-[10px] text-mute leading-relaxed">
            Tracks eye movement, posture, background activity, tab and window focus, displays, and
            page injections. A screen overlay that draws outside the browser cannot be read directly
            by any web page &mdash; what gives it away here is where the eyes go and where focus
            goes. These are review flags, not an automated verdict.
            {localFlags.length > 0 && (
              <span className="text-mute"> Local triggers: {localFlags.join(', ')}.</span>
            )}
          </p>
        </div>

        {/* Current Question */}
        <InterviewQuestion
          question={activeQuestion}
          questionIndex={currentQuestionIndex}
          totalQuestions={totalQuestions}
        />

        {/* Live Metrics Telemetry Bar */}
        <LiveMetrics
          isListening={isAnswering}
          speakingSpeed={speakingSpeed}
          volume={volume}
          fillerCount={fillerCount}
          visionMetrics={liveMetrics}
        />

        {/* Interim Spoken Transcript Preview */}
        {transcript && (
          <div className="bg-panel/60 border border-line/80 rounded-control p-4 text-xs">
            <div className="flex items-center justify-between text-mute mb-1">
              <span className="font-medium text-chalk-dim">Live Speech Transcript Preview:</span>
              <span>{answerDuration}s elapsed</span>
            </div>
            <p className="text-chalk font-mono italic leading-relaxed">
              "{transcript}"
            </p>
          </div>
        )}

        {/* Controls Section */}
        <div className="bg-panel/90 border border-line rounded-panel p-5 flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto">
          <div className="text-xs text-mute">
            {isAnswering ? (
              <span className="flex items-center gap-2 text-good-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-good-400 animate-pulse" />
                Active speech recording in progress... Press "End Answer" when finished.
              </span>
            ) : isEvaluating ? (
              <span className="flex items-center gap-2 text-sodium-400 font-medium">
                <div className="w-3.5 h-3.5 border-2 border-sodium-400 border-t-transparent rounded-full animate-spin" />
                Multimodal AI is evaluating your answer and signals...
              </span>
            ) : (
              <span>Ready. Press "Start Answer" when you are prepared to speak.</span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {!isAnswering ? (
              <button
                onClick={handleStartAnswer}
                disabled={isEvaluating}
                className="w-full sm:w-auto px-6 py-3 bg-good-600 hover:bg-good-500 disabled:opacity-50 text-chalk font-semibold text-sm rounded-control transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-white" />
                Start Answer
              </button>
            ) : (
              <button
                onClick={handleEndAnswer}
                className="w-full sm:w-auto px-6 py-3 bg-peak-600 hover:bg-peak-500 text-chalk font-semibold text-sm rounded-control transition-all flex items-center justify-center gap-2 animate-pulse"
              >
                <Square className="w-4 h-4 fill-white" />
                End Answer
              </button>
            )}

            {!isAnswering && !isEvaluating && currentQuestionIndex + 1 < totalQuestions && (
              <button
                onClick={handleNextQuestion}
                className="w-full sm:w-auto px-4 py-3 bg-steel hover:bg-line text-chalk-dim font-medium text-xs rounded-control border border-line transition-colors flex items-center justify-center gap-1.5"
              >
                Skip Question
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Intermediate Question Evaluation Dialog */}
      {feedbackDialog && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-panel border border-line rounded-panel p-6 sm:p-8 max-w-lg w-full animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-good-500/10 text-good-400 border border-good-500/20">
                Question {currentQuestionIndex + 1} Evaluated
              </span>
              <span className="text-xl font-bold text-chalk">
                Score: {feedbackDialog.overall_score} / 100
              </span>
            </div>

            <h3 className="text-lg font-bold text-chalk mb-2">How that answer landed</h3>

            {/* Spoken fluency for the answer just given */}
            {feedbackDialog.fluency && feedbackDialog.fluency.fluency_score > 0 && (
              <div className="panel-inset p-4 mb-4">
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <span className="text-xs text-chalk-dim">Spoken fluency</span>
                  <span className="flex items-baseline gap-2">
                    <span className="readout text-xl text-sodium-300">
                      {feedbackDialog.fluency.fluency_score}
                    </span>
                    <Chip
                      signal={
                        feedbackDialog.fluency.fluency_score >= 70
                          ? 'good'
                          : feedbackDialog.fluency.fluency_score >= 40
                          ? 'flag'
                          : 'peak'
                      }
                    >
                      {feedbackDialog.fluency.band}
                    </Chip>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <Meter label="Pace" value={feedbackDialog.fluency.components.pace} />
                  <Meter label="Filler control" value={feedbackDialog.fluency.components.filler_control} />
                </div>
              </div>
            )}

            {/* Strengths */}
            {feedbackDialog.strengths && feedbackDialog.strengths.length > 0 && (
              <div className="mb-3">
                <span className="text-xs font-semibold text-good-400">Strengths</span>
                <ul className="mt-1 space-y-1 text-xs text-chalk-dim">
                  {feedbackDialog.strengths.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-good-400 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggestions */}
            {feedbackDialog.suggestions && feedbackDialog.suggestions.length > 0 && (
              <div className="mb-6">
                <span className="text-xs font-semibold text-flag-400">Recommendations</span>
                <ul className="mt-1 space-y-1 text-xs text-chalk-dim">
                  {feedbackDialog.suggestions.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-flag-400 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleNextQuestion}
              className="w-full py-3 px-4 bg-sodium-600 hover:bg-sodium-500 text-chalk rounded-control text-sm font-semibold transition-all flex items-center justify-center gap-2"
            >
              {currentQuestionIndex + 1 < totalQuestions ? 'Next Question' : 'Complete Interview & View Report'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
