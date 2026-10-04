import React, { useEffect, useMemo, useState } from 'react';
import { ApiService } from '../services/api';
import { FluencyReport, SpeakingAttempt, SpeakingPrompt } from '../types';
import { useMicrophone } from '../hooks/useMicrophone';
import { Chip, Meter, SpecRow } from '../components/Meter';
import { AlertCircle, Mic, Square } from 'lucide-react';

const LEVELS: Array<SpeakingPrompt['level']> = ['starter', 'intermediate', 'advanced'];

const BAND_SIGNAL = (score: number) =>
  score >= 70 ? 'good' : score >= 40 ? 'flag' : 'peak';

export const SpeakingPractice: React.FC = () => {
  const [prompts, setPrompts] = useState<SpeakingPrompt[]>([]);
  const [level, setLevel] = useState<SpeakingPrompt['level']>('starter');
  const [activePrompt, setActivePrompt] = useState<SpeakingPrompt | null>(null);
  const [result, setResult] = useState<FluencyReport | null>(null);
  const [history, setHistory] = useState<SpeakingAttempt[]>([]);
  const [summary, setSummary] = useState<{
    attempts: number;
    latest_score: number | null;
    best_score: number | null;
    average_score: number | null;
    trend: number;
  } | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    status: micStatus,
    errorMessage: micError,
    volume,
    transcript,
    speakingSpeed,
    fillerCount,
    duration,
    startMicrophone,
    stopMicrophone,
  } = useMicrophone();

  const isRecording = micStatus === 'recording';

  const loadHistory = () =>
    ApiService.getSpeakingAttempts()
      .then((data) => {
        setHistory(data.attempts);
        setSummary(data.summary);
      })
      .catch(() => undefined);

  useEffect(() => {
    ApiService.getSpeakingPrompts()
      .then((data) => {
        setPrompts(data);
        setActivePrompt(data.find((p) => p.level === 'starter') || data[0] || null);
      })
      .catch((err) => setError(err.message || 'Could not load the drills.'));
    loadHistory();
  }, []);

  const visiblePrompts = useMemo(() => prompts.filter((p) => p.level === level), [prompts, level]);

  const handleStart = async () => {
    setResult(null);
    setError(null);
    await startMicrophone();
  };

  const handleStop = async () => {
    stopMicrophone();
    const spoken = transcript.trim();
    if (!spoken) {
      setError('No speech was captured. Check that the microphone is allowed, then try again.');
      return;
    }

    setIsScoring(true);
    try {
      const scored = await ApiService.submitSpeakingAttempt({
        prompt_id: activePrompt?.id,
        prompt: activePrompt?.prompt,
        transcript: spoken,
        duration: duration || 1,
        filler_count: fillerCount,
      });
      setResult(scored);
      await loadHistory();
    } catch (err: any) {
      setError(err.message || 'Could not score that attempt.');
    } finally {
      setIsScoring(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <header className="border-b border-line pb-6 mb-8">
        <h1 className="signage text-4xl sm:text-5xl text-chalk">Speaking practice</h1>
        <p className="text-sm text-mute mt-2 max-w-[62ch] leading-relaxed">
          Speak to a prompt and get your English fluency measured from what you actually said:
          pace, stalling, filler words, vocabulary range and sentence flow. Accent is never scored.
        </p>
      </header>

      {(error || micError) && (
        <div className="mb-6 flex items-start gap-3 border border-peak-600/40 bg-peak-600/10 p-3.5 rounded-control text-sm text-peak-200">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error || micError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-8">
        <div className="space-y-6">
          {/* Drill picker */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              {LEVELS.map((value) => (
                <button
                  key={value}
                  onClick={() => setLevel(value)}
                  className={`px-3 py-1.5 text-xs rounded-control border capitalize transition-colors ${
                    level === value
                      ? 'border-sodium-500 text-sodium-300 bg-sodium-600/10'
                      : 'border-line text-mute hover:border-mute'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visiblePrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => {
                    setActivePrompt(prompt);
                    setResult(null);
                  }}
                  className={`text-left p-4 border rounded-control transition-colors ${
                    activePrompt?.id === prompt.id
                      ? 'border-sodium-500 bg-sodium-600/10'
                      : 'border-line bg-panel hover:border-mute'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-chalk-dim">{prompt.focus}</span>
                    <span className="readout text-[11px] text-mute">{prompt.seconds}s</span>
                  </div>
                  <p className="text-sm text-chalk mt-1.5 leading-snug">{prompt.prompt}</p>
                </button>
              ))}
            </div>
          </section>

          {/* The booth */}
          {activePrompt && (
            <section className="panel p-6">
              <p className="text-xs text-mute">Now speaking to</p>
              <p className="signage-tight text-2xl text-chalk mt-1 leading-tight">{activePrompt.prompt}</p>
              <p className="text-xs text-chalk-dim mt-2 border-l-2 border-sodium-600 pl-3 leading-relaxed">
                {activePrompt.hint}
              </p>

              <div className="grid grid-cols-3 gap-4 mt-6">
                <Meter label="Input level" value={volume} signal={volume > 8 ? 'good' : 'flag'} />
                <Meter
                  label="Pace"
                  value={speakingSpeed}
                  max={240}
                  band={[120, 165]}
                  unit="wpm"
                />
                <Meter
                  label="Fillers"
                  value={fillerCount}
                  max={12}
                  signal={fillerCount <= 2 ? 'good' : fillerCount <= 5 ? 'flag' : 'peak'}
                />
              </div>

              <div className="flex items-center justify-between gap-4 mt-6 pt-5 border-t border-line">
                <div className="text-xs text-mute">
                  {isRecording ? (
                    <span className="flex items-center gap-2 text-good-300">
                      <span className="w-2 h-2 rounded-full bg-good-400 animate-pulse" />
                      Recording, <span className="readout">{duration}s</span> of {activePrompt.seconds}s
                    </span>
                  ) : isScoring ? (
                    'Scoring your delivery…'
                  ) : (
                    `Aim for about ${activePrompt.seconds} seconds.`
                  )}
                </div>

                {isRecording ? (
                  <button
                    onClick={handleStop}
                    className="flex items-center gap-2 px-5 py-2.5 bg-peak-500 hover:bg-peak-400 text-chalk font-semibold text-sm rounded-control transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    Stop and score
                  </button>
                ) : (
                  <button
                    onClick={handleStart}
                    disabled={isScoring}
                    className="flex items-center gap-2 px-5 py-2.5 bg-sodium-500 hover:bg-sodium-400 disabled:opacity-50 text-ink font-semibold text-sm rounded-control transition-colors"
                  >
                    <Mic className="w-4 h-4" />
                    Start speaking
                  </button>
                )}
              </div>

              {transcript && (
                <div className="panel-inset mt-5 p-4">
                  <p className="text-[11px] text-mute mb-1.5">What we heard</p>
                  <p className="text-sm text-chalk-dim leading-relaxed">{transcript}</p>
                </div>
              )}
            </section>
          )}

          {/* Result */}
          {result && (
            <section className="panel p-6">
              <div className="flex items-end justify-between gap-4 pb-5 border-b border-line">
                <div>
                  <p className="text-xs text-mute">Fluency</p>
                  <p className="readout text-6xl leading-none text-sodium-300 mt-1">
                    {result.fluency_score}
                  </p>
                </div>
                <Chip signal={BAND_SIGNAL(result.fluency_score)}>{result.band}</Chip>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mt-5">
                <Meter label="Pace" value={result.components.pace} />
                <Meter label="Continuity" value={result.components.continuity} />
                <Meter label="Filler control" value={result.components.filler_control} />
                <Meter label="Vocabulary range" value={result.components.vocabulary} />
                <Meter label="Sentence flow" value={result.components.sentence_flow} />
                <div className="space-y-1">
                  <SpecRow label="Words" value={result.word_count ?? 0} />
                  <SpecRow label="Speed" value={`${result.speaking_speed ?? 0} wpm`} />
                  <SpecRow label="Fillers" value={result.filler_count ?? 0} />
                </div>
              </div>

              {result.strengths.length > 0 && (
                <ul className="mt-5 space-y-1.5">
                  {result.strengths.map((item, i) => (
                    <li key={i} className="text-sm text-good-200 flex gap-2.5">
                      <span className="text-good-400">+</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
              {result.tips.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {result.tips.map((item, i) => (
                    <li key={i} className="text-sm text-flag-200 flex gap-2.5">
                      <span className="text-flag-400">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        {/* Progress rail */}
        <aside className="space-y-6">
          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-chalk">Your progress</h2>
            {summary && summary.attempts > 0 ? (
              <>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className="readout text-4xl text-sodium-300">{summary.latest_score ?? 0}</span>
                  {summary.trend !== 0 && (
                    <span
                      className={`readout text-xs ${
                        summary.trend > 0 ? 'text-good-300' : 'text-peak-300'
                      }`}
                    >
                      {summary.trend > 0 ? '+' : ''}
                      {summary.trend} since your first
                    </span>
                  )}
                </div>
                <div className="mt-4 space-y-1">
                  <SpecRow label="Drills completed" value={summary.attempts} />
                  <SpecRow
                    label="Best"
                    value={summary.best_score ?? '--'}
                    signal="good"
                  />
                  <SpecRow label="Average" value={summary.average_score ?? '--'} />
                </div>
              </>
            ) : (
              <p className="text-xs text-mute mt-2 leading-relaxed">
                Nothing recorded yet. Finish one drill and your scores start building a trend here.
              </p>
            )}
          </section>

          {history.length > 0 && (
            <section className="panel">
              <h2 className="text-sm font-semibold text-chalk px-5 pt-5 pb-3">Recent drills</h2>
              <div className="divide-y divide-line">
                {history.slice(0, 8).map((attempt) => (
                  <div key={attempt.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs text-chalk-dim truncate">{attempt.prompt}</span>
                      <span
                        className={`readout text-sm shrink-0 ${
                          attempt.fluency_score >= 70
                            ? 'text-good-300'
                            : attempt.fluency_score >= 40
                            ? 'text-flag-300'
                            : 'text-peak-300'
                        }`}
                      >
                        {attempt.fluency_score}
                      </span>
                    </div>
                    <p className="text-[11px] text-mute mt-0.5">
                      {attempt.fluency_band}, <span className="readout">{attempt.speaking_speed}</span> wpm
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};
