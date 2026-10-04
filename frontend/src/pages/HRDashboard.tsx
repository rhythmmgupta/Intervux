import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/api';
import { HRCandidate } from '../types';
import { Chip, SpecRow } from '../components/Meter';
import { AlertCircle, ChevronRight } from 'lucide-react';

const TIER_SIGNAL: Record<string, 'sodium' | 'good' | 'cool' | 'flag' | 'neutral'> = {
  Diamond: 'sodium',
  Platinum: 'sodium',
  Gold: 'good',
  Silver: 'cool',
  Bronze: 'flag',
  Unrated: 'neutral',
};

const dateLabel = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '--';

export const HRDashboard: React.FC = () => {
  const [candidates, setCandidates] = useState<HRCandidate[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hrUser = ApiService.getCurrentStoredUser();

  useEffect(() => {
    ApiService.getHRCandidates()
      .then(setCandidates)
      .catch((err) => setError(err.message || 'Could not load candidates.'))
      .finally(() => setIsLoading(false));
  }, []);

  const openCandidate = async (userId: number) => {
    if (selected?.candidate?.user_id === userId) {
      setSelected(null);
      return;
    }
    try {
      setSelected(await ApiService.getHRCandidate(userId));
    } catch (err: any) {
      setError(err.message || 'Could not open that candidate.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <header className="border-b border-line pb-6 mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="signage text-4xl sm:text-5xl text-chalk">Candidates</h1>
          <p className="text-sm text-mute mt-2 max-w-[62ch] leading-relaxed">
            Everyone preparing for {hrUser?.target_company || 'your roles'}, ranked by rating. Open a
            candidate to see each session, their scores and their speaking practice.
          </p>
        </div>
        <Chip signal="sodium">HR access</Chip>
      </header>

      {error && (
        <div className="mb-6 flex items-start gap-3 border border-peak-600/40 bg-peak-600/10 p-3.5 rounded-control text-sm text-peak-200">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-mute">Loading candidates…</p>
      ) : candidates.length === 0 ? (
        <div className="panel p-10 text-center">
          <p className="text-sm text-chalk">No candidates are targeting your company yet.</p>
          <p className="text-xs text-mute mt-1 max-w-[52ch] mx-auto leading-relaxed">
            Candidates appear here once they set your company as their target and complete a session.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-8 items-start">
          <section className="panel overflow-hidden">
            <div className="grid grid-cols-[1fr_4rem_5rem] sm:grid-cols-[1fr_5rem_5rem_5rem_1.5rem] gap-3 px-5 py-2.5 border-b border-line text-[11px] text-mute">
              <span>Candidate</span>
              <span className="text-right hidden sm:block">Sessions</span>
              <span className="text-right">Best</span>
              <span className="text-right">Rating</span>
              <span className="hidden sm:block" />
            </div>

            {candidates.map((candidate) => (
              <button
                key={candidate.user_id}
                onClick={() => openCandidate(candidate.user_id)}
                className={`w-full text-left grid grid-cols-[1fr_4rem_5rem] sm:grid-cols-[1fr_5rem_5rem_5rem_1.5rem] gap-3 px-5 py-3 items-center border-b border-line/60 last:border-0 transition-colors ${
                  selected?.candidate?.user_id === candidate.user_id
                    ? 'bg-sodium-600/10'
                    : 'hover:bg-steel/50'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm text-chalk truncate">{candidate.name}</p>
                  <p className="text-[11px] text-mute truncate">
                    {candidate.target_role || 'Role not set'}, last session {dateLabel(candidate.last_session_at)}
                  </p>
                </div>
                <span className="readout text-xs text-mute text-right hidden sm:block">
                  {candidate.sessions_completed}
                </span>
                <span className="readout text-xs text-chalk-dim text-right">
                  {candidate.best_score === null ? '--' : candidate.best_score.toFixed(1)}
                </span>
                <span className="readout text-base text-sodium-300 text-right">{candidate.rating}</span>
                <ChevronRight className="w-4 h-4 text-mute hidden sm:block" />
              </button>
            ))}
          </section>

          <aside className="panel lg:sticky lg:top-24">
            {selected ? (
              <div className="p-5">
                <h2 className="signage-tight text-2xl text-chalk leading-tight">
                  {selected.candidate.name}
                </h2>
                <p className="text-xs text-mute mt-1">{selected.candidate.email}</p>
                <Chip signal={TIER_SIGNAL[selected.rating.tier] || 'neutral'} className="mt-3">
                  {selected.rating.tier}, {selected.rating.rating}
                </Chip>

                <div className="mt-5 space-y-1">
                  <SpecRow label="Target company" value={selected.candidate.target_company || '--'} />
                  <SpecRow label="Target role" value={selected.candidate.target_role || '--'} />
                  <SpecRow label="Sessions completed" value={selected.rating.sessions_completed} />
                  <SpecRow label="Contests entered" value={selected.rating.contests_entered} />
                  <SpecRow
                    label="Average score"
                    value={selected.rating.average_score ?? '--'}
                  />
                </div>

                <h3 className="text-xs text-chalk-dim mt-6 mb-2">Sessions</h3>
                {selected.sessions.length === 0 ? (
                  <p className="text-xs text-mute">No sessions recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {selected.sessions.slice(0, 8).map((session: any) => (
                      <div key={session.id} className="panel-inset p-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs text-chalk">
                            {session.type === 'hr' ? 'HR round' : 'Technical round'}
                            {session.contest_id ? ', contest' : ''}
                          </span>
                          <span
                            className={`readout text-sm ${
                              (session.overall_score ?? 0) >= 70 ? 'text-good-300' : 'text-flag-300'
                            }`}
                          >
                            {session.overall_score === null ? 'open' : session.overall_score.toFixed(1)}
                          </span>
                        </div>
                        <p className="text-[11px] text-mute mt-0.5">
                          {session.target_company || 'no target'}, {session.difficulty},{' '}
                          {session.question_count} questions, {dateLabel(session.started_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {selected.speaking_practice.length > 0 && (
                  <>
                    <h3 className="text-xs text-chalk-dim mt-6 mb-2">Speaking practice</h3>
                    <div className="space-y-1">
                      {selected.speaking_practice.slice(0, 5).map((drill: any) => (
                        <SpecRow
                          key={drill.id}
                          label={drill.fluency_band}
                          value={drill.fluency_score}
                          signal={drill.fluency_score >= 70 ? 'good' : 'flag'}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="p-5">
                <p className="text-sm text-chalk">Select a candidate</p>
                <p className="text-xs text-mute mt-1 leading-relaxed">
                  Their session history, scores and speaking practice open here.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};
