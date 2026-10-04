import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiService } from '../services/api';
import { Contest, Interview, Rating } from '../types';
import { Chip, Meter, SpecRow } from '../components/Meter';
import { SessionComparisonChart } from '../components/Charts';
import { AlertCircle } from 'lucide-react';

const TIER_SIGNAL: Record<string, 'sodium' | 'good' | 'cool' | 'flag' | 'neutral'> = {
  Diamond: 'sodium',
  Platinum: 'sodium',
  Gold: 'good',
  Silver: 'cool',
  Bronze: 'flag',
  Unrated: 'neutral',
};

const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [rating, setRating] = useState<Rating | null>(null);
  const [contests, setContests] = useState<Contest[]>([]);
  const [practice, setPractice] = useState<{ attempts: number; latest_score: number | null; best_score: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const user = ApiService.getCurrentStoredUser();

  useEffect(() => {
    if (!ApiService.getCurrentStoredUser() && !localStorage.getItem('intervux_token')) {
      navigate('/login');
      return;
    }

    Promise.all([
      ApiService.getInterviews(),
      ApiService.getRating().catch(() => null),
      ApiService.getContests().catch(() => []),
      ApiService.getSpeakingAttempts().catch(() => null),
    ])
      .then(([sessions, myRating, openContests, drills]) => {
        setInterviews(sessions);
        setRating(myRating);
        setContests(openContests);
        setPractice(drills ? drills.summary : null);
      })
      .catch((err) => setError(err.message || 'Could not load your dashboard.'))
      .finally(() => setLoading(false));
  }, [navigate]);

  const completed = interviews.filter((i) => i.status === 'completed' && i.overall_score != null);
  const hasData = completed.length > 0;

  // Averages over real sessions only. With nothing completed, nothing is claimed.
  const breakdown = [
    { label: 'Communication', value: average(completed.map((i) => i.communication_score || 0)) },
    { label: 'Body language', value: average(completed.map((i) => i.body_language_score || 0)) },
    { label: 'Speech and pacing', value: average(completed.map((i) => i.speech_score || 0)) },
    { label: 'Answer quality', value: average(completed.map((i) => i.answer_quality_score || 0)) },
    { label: 'Technical depth', value: average(completed.map((i) => i.technical_score || 0)) },
  ];

  const liveContest = contests.find((c) => c.status === 'live');
  const inProgress = interviews.find((i) => i.status === 'in_progress');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <header className="border-b border-line pb-6 mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="signage text-4xl sm:text-5xl text-chalk">
            {user ? user.name.split(' ')[0] : 'Candidate'}
          </h1>
          <p className="text-sm text-mute mt-2">
            {user?.target_company
              ? `Preparing for ${user.target_company}${user.target_role ? `, ${user.target_role}` : ''}`
              : 'No target company set yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/setup"
            className="px-4 py-2 bg-sodium-500 hover:bg-sodium-400 text-ink font-semibold text-sm rounded-control transition-colors"
          >
            New session
          </Link>
          {inProgress && (
            <Link
              to={`/interview/${inProgress.id}`}
              className="px-4 py-2 border border-sodium-600/50 text-sodium-300 text-sm rounded-control hover:border-sodium-500 transition-colors"
            >
              Resume session
            </Link>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-6 flex items-start gap-3 border border-peak-600/40 bg-peak-600/10 p-3.5 rounded-control text-sm text-peak-200">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-mute">Loading your sessions…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-8 items-start">
          <div className="space-y-8">
            {/* Measured breakdown, or an invitation if there is nothing yet */}
            <section className="panel p-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-sm font-semibold text-chalk">How you are performing</h2>
                {hasData && (
                  <span className="text-xs text-mute">
                    across <span className="readout">{completed.length}</span> completed{' '}
                    {completed.length === 1 ? 'session' : 'sessions'}
                  </span>
                )}
              </div>

              {hasData ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 mt-5">
                  {breakdown.map((row) => (
                    <Meter key={row.label} label={row.label} value={row.value ?? 0} />
                  ))}
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-chalk-dim leading-relaxed max-w-[56ch]">
                    Nothing measured yet. Finish one session and this fills with your own numbers
                    rather than a sample.
                  </p>
                  <Link
                    to="/setup"
                    className="inline-block mt-4 px-4 py-2 border border-line hover:border-mute text-chalk text-sm rounded-control transition-colors"
                  >
                    Run your first session
                  </Link>
                </div>
              )}
            </section>

            {completed.length > 1 && (
              <section className="panel p-6">
                <h2 className="text-sm font-semibold text-chalk mb-4">Session by session</h2>
                <SessionComparisonChart interviews={completed.slice(0, 8).reverse()} />
              </section>
            )}

            {/* Recent sessions as spec rows, not cards */}
            <section className="panel">
              <div className="flex items-baseline justify-between gap-4 px-6 pt-6 pb-3">
                <h2 className="text-sm font-semibold text-chalk">Recent sessions</h2>
                <Link to="/history" className="text-xs text-sodium-300 hover:underline">
                  All sessions
                </Link>
              </div>

              {interviews.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-mute">No sessions recorded yet.</p>
              ) : (
                <div className="divide-y divide-line">
                  {interviews.slice(0, 6).map((session) => (
                    <Link
                      key={session.id}
                      to={session.status === 'completed' ? `/report/${session.id}` : `/interview/${session.id}`}
                      className="flex items-center justify-between gap-4 px-6 py-3.5 hover:bg-steel/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-chalk truncate">
                          {session.type === 'hr' ? 'HR round' : 'Technical round'}
                          {session.target_company ? `, ${session.target_company}` : ''}
                          {session.contest_id ? ', contest' : ''}
                        </p>
                        <p className="text-[11px] text-mute">
                          {new Date(session.started_at).toLocaleDateString()}, {session.difficulty},{' '}
                          {session.mode}
                        </p>
                      </div>
                      {session.status === 'completed' ? (
                        <span
                          className={`readout text-base shrink-0 ${
                            (session.overall_score || 0) >= 70 ? 'text-good-300' : 'text-flag-300'
                          }`}
                        >
                          {session.overall_score?.toFixed(1)}
                        </span>
                      ) : (
                        <Chip signal="flag">open</Chip>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Standing, contest and practice rail */}
          <aside className="space-y-6">
            {rating && (
              <section className="panel p-5">
                <h2 className="text-sm font-semibold text-chalk">Your rating</h2>
                <div className="flex items-end justify-between gap-3 mt-2">
                  <span className="readout text-5xl text-sodium-300 leading-none">{rating.rating}</span>
                  <Chip signal={TIER_SIGNAL[rating.tier] || 'neutral'}>{rating.tier}</Chip>
                </div>
                <div className="mt-4 space-y-1">
                  <SpecRow label="Sessions" value={rating.sessions_completed} />
                  <SpecRow label="Best" value={rating.best_score ?? '--'} signal="good" />
                  <SpecRow label="Contests" value={rating.contests_entered} />
                </div>
                <Link to="/scoreboard" className="inline-block mt-4 text-xs text-sodium-300 hover:underline">
                  See the scoreboard
                </Link>
              </section>
            )}

            {liveContest && (
              <section className="panel p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-chalk">Open contest</h2>
                  <Chip signal={liveContest.kind === 'weekly' ? 'sodium' : 'cool'}>
                    {liveContest.kind === 'weekly' ? 'Weekly' : 'Daily'}
                  </Chip>
                </div>
                <p className="signage-tight text-xl text-chalk mt-2 leading-tight">
                  {liveContest.title}
                </p>
                <p className="text-xs text-mute mt-1.5">
                  <span className="readout">{liveContest.question_count}</span> questions,{' '}
                  <span className="readout">{liveContest.participants}</span> entered
                </p>
                <Link
                  to="/contests"
                  className="inline-block mt-4 px-3.5 py-2 bg-sodium-500 hover:bg-sodium-400 text-ink text-sm font-semibold rounded-control transition-colors"
                >
                  {liveContest.joined ? 'Open contest' : 'Enter contest'}
                </Link>
              </section>
            )}

            <section className="panel p-5">
              <h2 className="text-sm font-semibold text-chalk">Speaking practice</h2>
              {practice && practice.attempts > 0 ? (
                <>
                  <div className="flex items-end gap-2 mt-2">
                    <span className="readout text-4xl text-sodium-300 leading-none">
                      {practice.latest_score ?? 0}
                    </span>
                    <span className="text-xs text-mute">latest fluency</span>
                  </div>
                  <div className="mt-4 space-y-1">
                    <SpecRow label="Drills" value={practice.attempts} />
                    <SpecRow label="Best" value={practice.best_score ?? '--'} signal="good" />
                  </div>
                </>
              ) : (
                <p className="text-xs text-mute mt-2 leading-relaxed">
                  Short drills that score your English fluency from what you said, so you can work on
                  delivery without burning a full session.
                </p>
              )}
              <Link to="/speaking" className="inline-block mt-4 text-xs text-sodium-300 hover:underline">
                Open a drill
              </Link>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
};
