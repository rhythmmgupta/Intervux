import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiService } from '../services/api';
import { useCamera } from '../hooks/useCamera';
import { useMicrophone } from '../hooks/useMicrophone';
import { Code2, Users, Lightbulb, ShieldCheck, Camera, Mic, AlertCircle } from 'lucide-react';
import { Company } from '../types';
import { Meter } from '../components/Meter';

export const InterviewSetup: React.FC = () => {
  const navigate = useNavigate();

  const [type, setType] = useState<'technical' | 'hr'>('technical');
  const [mode, setMode] = useState<'practice' | 'simulation'>('practice');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questionCount, setQuestionCount] = useState<number>(3);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState<string>('');
  const [role, setRole] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-flight hardware test
  const { videoRef, status: camStatus, startCamera, stopCamera } = useCamera();
  const { status: micStatus, volume: micVolume, startMicrophone, stopMicrophone } = useMicrophone();

  useEffect(() => {
    ApiService.getCompanies()
      .then((data) => {
        setCompanies(data);
        // Default to whatever the candidate set as their target on their profile.
        const stored = ApiService.getCurrentStoredUser();
        const match = data.find((c) => c.name === stored?.target_company);
        if (match) {
          setCompany(match.slug);
          setRole(stored?.target_role || '');
        }
      })
      .catch(() => setCompanies([]));
  }, []);

  const selectedCompany = companies.find((c) => c.slug === company);

  useEffect(() => {
    // Automatically initialize camera and microphone for device pre-check
    startCamera();
    startMicrophone();

    return () => {
      stopCamera();
      stopMicrophone();
    };
  }, [startCamera, startMicrophone, stopCamera, stopMicrophone]);

  const handleStart = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      // Ensure user is logged in or create guest demo account seamlessly
      if (!ApiService.getCurrentStoredUser() && !localStorage.getItem('intervux_token')) {
        await ApiService.login('candidate@intervux.ai', 'DemoPass123!').catch(async () => {
          await ApiService.register('Guest Candidate', `guest_${Date.now()}@intervux.ai`, 'GuestPass123!');
        });
      }

      const interview = await ApiService.createInterview(type, mode, difficulty, questionCount, {
        target_company: company || null,
        target_role: role || null,
      });
      navigate(`/interview/${interview.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize mock interview. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink text-chalk py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <header className="border-b border-line pb-6 mb-8">
        <h1 className="signage text-4xl sm:text-5xl text-chalk">Set up a session</h1>
        <p className="text-sm text-mute mt-2 max-w-[62ch] leading-relaxed">
          Pick who you are interviewing with, how much coaching you want mid-answer, and check your
          camera and microphone before you start.
        </p>
      </header>

      {error && (
        <div className="mb-8 p-4 bg-peak-500/10 border border-peak-500/20 rounded-control flex items-center gap-3 text-peak-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Setup Options */}
        <div className="lg:col-span-2 space-y-8">
          {/* 1. Track Selection */}
          <div className="bg-panel border border-line rounded-panel p-6">
            <h3 className="text-sm font-semibold text-chalk-dim mb-4">
              1. Select Interview Track
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setType('technical')}
                className={`p-4 rounded-control text-left border transition-all ${
 type === 'technical'
                    ? 'bg-sodium-600/15 border-sodium-500 text-chalk'
                    : 'bg-ink/60 border-line text-mute hover:border-line'
                }`}
              >
                <Code2 className={`w-6 h-6 mb-2 ${type === 'technical' ? 'text-sodium-400' : 'text-mute'}`} />
                <h4 className="font-semibold text-base text-chalk">Technical Interview</h4>
                <p className="text-xs text-mute mt-1 leading-relaxed">
                  DSA, Operating Systems, DBMS, Networks, OOP, System Design.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setType('hr')}
                className={`p-4 rounded-control text-left border transition-all ${
 type === 'hr'
                    ? 'bg-sodium-600/15 border-sodium-500 text-chalk'
                    : 'bg-ink/60 border-line text-mute hover:border-line'
                }`}
              >
                <Users className={`w-6 h-6 mb-2 ${type === 'hr' ? 'text-sodium-400' : 'text-mute'}`} />
                <h4 className="font-semibold text-base text-chalk">HR & Behavioral</h4>
                <p className="text-xs text-mute mt-1 leading-relaxed">
                  Leadership, Conflict resolution, Teamwork, Strengths, Failure.
                </p>
              </button>
            </div>
          </div>

          {/* 2. Mode Selection */}
          <div className="bg-panel border border-line rounded-panel p-6">
            <h3 className="text-sm font-semibold text-chalk-dim mb-4">
              2. Select Feedback Mode
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setMode('practice')}
                className={`p-4 rounded-control text-left border transition-all ${
 mode === 'practice'
                    ? 'bg-sodium-600/15 border-sodium-500 text-chalk'
                    : 'bg-ink/60 border-line text-mute hover:border-line'
                }`}
              >
                <Lightbulb className={`w-6 h-6 mb-2 ${mode === 'practice' ? 'text-flag-400' : 'text-mute'}`} />
                <h4 className="font-semibold text-base text-chalk">Practice Mode</h4>
                <p className="text-xs text-mute mt-1 leading-relaxed">
                  Real-time coaching alerts pop up during your answers for pacing and eye contact.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('simulation')}
                className={`p-4 rounded-control text-left border transition-all ${
 mode === 'simulation'
                    ? 'bg-sodium-600/15 border-sodium-500 text-chalk'
                    : 'bg-ink/60 border-line text-mute hover:border-line'
                }`}
              >
                <ShieldCheck className={`w-6 h-6 mb-2 ${mode === 'simulation' ? 'text-sodium-400' : 'text-mute'}`} />
                <h4 className="font-semibold text-base text-chalk">Simulation Mode</h4>
                <p className="text-xs text-mute mt-1 leading-relaxed">
                  Strict exam environment. No live coaching interruptions; full report at completion.
                </p>
              </button>
            </div>
          </div>

          {/* 3. Difficulty & Length */}
          <div className="bg-panel border border-line rounded-panel p-6">
            <h3 className="text-sm font-semibold text-chalk-dim mb-4">
              3. Difficulty & Duration
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-chalk-dim mb-2">Target Difficulty</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['easy', 'medium', 'hard'] as const).map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setDifficulty(diff)}
                      className={`py-2 px-3 rounded-control text-xs font-semibold capitalize border transition-all ${
 difficulty === diff
                          ? 'bg-sodium-600 border-sodium-500 text-chalk '
                          : 'bg-ink/80 border-line text-mute hover:border-line'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-chalk-dim mb-2">Question Count</label>
                <div className="grid grid-cols-3 gap-2">
                  {[2, 3, 5].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setQuestionCount(count)}
                      className={`py-2 px-3 rounded-control text-xs font-semibold border transition-all ${
 questionCount === count
                          ? 'bg-sodium-600 border-sodium-500 text-chalk '
                          : 'bg-ink/80 border-line text-mute hover:border-line'
                      }`}
                    >
                      {count} Questions
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Device Pre-Check & Action */}
        <div className="space-y-6">
          <div className="bg-panel border border-line rounded-panel p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-chalk mb-3">Device check</h2>

              {/* Webcam Test Container */}
              <div className="aspect-video bg-ink rounded-control overflow-hidden border border-line relative mb-4 flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${
 camStatus === 'active' ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                {camStatus !== 'active' && (
                  <div className="text-center p-4">
                    <Camera className="w-8 h-8 text-line mx-auto mb-1.5" />
                    <p className="text-xs text-mute">
                      {camStatus === 'requesting' ? 'Requesting Camera...' : 'Camera Inactive'}
                    </p>
                  </div>
                )}
                {camStatus === 'active' && (
                  <span className="absolute bottom-2 right-2 text-[10px] text-good-300 border border-good-600/40 bg-ink/80 px-2 py-0.5 rounded-control">
                    Camera ready
                  </span>
                )}
              </div>

              <div className="panel-inset p-3.5 mb-6">
                <Meter
                  label="Microphone level"
                  value={micVolume}
                  signal={micVolume > 8 ? 'good' : 'flag'}
                  note={micVolume > 8 ? 'Picking you up clearly.' : 'Say something to check the level.'}
                />
                <p className="text-[11px] text-mute mt-3 flex items-center gap-1.5">
                  <Mic className="w-3 h-3" />
                  {micStatus === 'recording' ? 'Microphone live' : 'Microphone idle'}
                </p>
              </div>
            </div>

            <button
              onClick={handleStart}
              disabled={isSubmitting}
              className="w-full py-3.5 px-6 rounded-control bg-sodium-500 hover:bg-sodium-400 disabled:opacity-50 text-ink font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-chalk border-t-transparent rounded-full animate-spin" />
              ) : (
                'Start the session'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
