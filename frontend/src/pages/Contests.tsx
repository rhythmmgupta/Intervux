import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiService } from '../services/api';
import { Contest, ScoreboardRow } from '../types';
import { Chip, SpecRow } from '../components/Meter';
import { AlertCircle, Lock, Radio, Timer, Trophy, Users } from 'lucide-react';

const countdown = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'closed';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h left` : `${hours}h ${minutes}m left`;
};

export const Contests: React.FC = () => {
  const navigate = useNavigate();
  const [contests, setContests] = useState<Contest[]>([]);
  const [scoreboards, setScoreboards] = useState<Record<number, ScoreboardRow[]>>({});
  const [openBoard, setOpenBoard] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setContests(await ApiService.getContests());
    } catch (err: any) {
      setError(err.message || 'Could not load contests.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleJoin = async (contest: Contest) => {
    setBusyId(contest.id);
    setError(null);
    try {
      await ApiService.joinContest(contest.id);
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not enter this contest.');
    } finally {
      setBusyId(null);
    }
  };

  const handleStart = async (contest: Contest) => {
    setBusyId(contest.id);
    setError(null);
    try {
      const interview = await ApiService.createInterview(
        'technical',
        'simulation',
        (contest.difficulty as 'easy' | 'medium' | 'hard') || 'medium',
        contest.question_count,
        { contest_id: contest.id }
      );
      navigate(`/interview/${interview.id}`);
    } catch (err: any) {
      setError(err.message || 'Could not start the contest round.');
      setBusyId(null);
    }
  };

  const showScoreboard = async (contest: Contest) => {
    if (openBoard === contest.id) {
      setOpenBoard(null);
      return;
    }
    setOpenBoard(contest.id);
    if (!scoreboards[contest.id]) {
      try {
        const data = await ApiService.getContestScoreboard(contest.id);
        setScoreboards((prev) => ({ ...prev, [contest.id]: data.scoreboard }));
      } catch (err: any) {
        setError(err.message || 'Scoreboard unavailable.');
      }
    }
  };

  const live = contests.filter((c) => c.status === 'live');
  const past = contests.filter((c) => c.status !== 'live');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <header className="border-b border-line pb-6 mb-8">
        <h1 className="signage text-4xl sm:text-5xl text-chalk">Contests</h1>
        <p className="text-sm text-mute mt-2 max-w-[62ch] leading-relaxed">
          A new five-question set each day, and a harder one each week. The questions stay sealed
          until you enter, so everyone who sits a contest answers the same set.
        </p>
      </header>

      {error && (
        <div className="mb-6 flex items-start gap-3 border border-peak-600/40 bg-peak-600/10 p-3.5 rounded-control text-sm text-peak-200">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-mute">Loading contests…</p>
      ) : (
        <div className="space-y-10">
          {live.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Radio className="w-4 h-4 text-sodium-400" />
                <h2 className="text-sm font-semibold text-chalk">Open now</h2>
              </div>

              <div className="space-y-4">
                {live.map((contest) => (
                  <article key={contest.id} className="panel">
                    <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="signage-tight text-2xl text-chalk">{contest.title}</h3>
                          <Chip signal={contest.kind === 'weekly' ? 'sodium' : 'cool'}>
                            {contest.kind === 'weekly' ? 'Weekly' : 'Daily'}
                          </Chip>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-mute">
                          <span className="flex items-center gap-1.5">
                            <Timer className="w-3.5 h-3.5" />
                            <span className="readout">{countdown(contest.ends_at)}</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            <span className="readout">{contest.participants}</span> entered
                          </span>
                          <span>
                            {contest.question_count} questions, {contest.difficulty}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {contest.joined ? (
                          <>
                            <button
                              onClick={() => handleStart(contest)}
                              disabled={busyId === contest.id}
                              className="px-4 py-2 bg-sodium-500 hover:bg-sodium-400 disabled:opacity-50 text-ink font-semibold text-sm rounded-control transition-colors"
                            >
                              {contest.my_score === null ? 'Start round' : 'Sit it again'}
                            </button>
                            <button
                              onClick={() => showScoreboard(contest)}
                              className="px-3 py-2 border border-line hover:border-mute text-chalk-dim text-sm rounded-control transition-colors"
                            >
                              Scoreboard
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleJoin(contest)}
                            disabled={busyId === contest.id}
                            className="px-4 py-2 bg-sodium-500 hover:bg-sodium-400 disabled:opacity-50 text-ink font-semibold text-sm rounded-control transition-colors"
                          >
                            {busyId === contest.id ? 'Entering…' : 'Enter contest'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* The questions: locked for anyone who has not entered. */}
                    <div className="border-t border-line px-5 py-4">
                      {contest.questions ? (
                        <ol className="space-y-2.5">
                          {contest.questions.map((q, i) => (
                            <li key={i} className="flex gap-3">
                              <span className="readout text-xs text-sodium-400 pt-0.5">
                                {String(i + 1).padStart(2, '0')}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm text-chalk leading-snug">{q.question}</p>
                                <p className="text-[11px] text-mute mt-0.5">
                                  {q.category}, {q.difficulty}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <div className="flex items-center gap-2.5 text-sm text-mute">
                          <Lock className="w-4 h-4 text-flag-400" />
                          <span>
                            {contest.question_count} questions, revealed when you enter.
                          </span>
                        </div>
                      )}

                      {contest.my_score !== null && (
                        <p className="readout text-sm text-good-300 mt-3">
                          Your score: {contest.my_score?.toFixed(1)}
                        </p>
                      )}
                    </div>

                    {openBoard === contest.id && (
                      <div className="border-t border-line px-5 py-4 bg-ink/40">
                        <div className="flex items-center gap-2 mb-3">
                          <Trophy className="w-3.5 h-3.5 text-sodium-400" />
                          <h4 className="text-xs text-chalk-dim">Standings</h4>
                        </div>
                        {(scoreboards[contest.id] || []).length === 0 ? (
                          <p className="text-xs text-mute">
                            No completed rounds yet. Finish yours and you take the top spot.
                          </p>
                        ) : (
                          <div className="space-y-0.5">
                            {(scoreboards[contest.id] || []).map((row) => (
                              <SpecRow
                                key={row.user_id}
                                label={`${row.rank ? String(row.rank).padStart(2, '0') + '.' : '--'} ${row.name}`}
                                value={row.score === null ? 'in progress' : row.score.toFixed(1)}
                                signal={row.score === null ? undefined : row.rank === 1 ? 'sodium' : 'good'}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-chalk mb-4">Closed</h2>
              <div className="panel divide-y divide-line">
                {past.map((contest) => (
                  <div key={contest.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-chalk-dim truncate">{contest.title}</p>
                      <p className="text-[11px] text-mute">
                        {new Date(contest.starts_at).toLocaleDateString()}, {contest.participants} entered
                      </p>
                    </div>
                    {contest.my_score !== null ? (
                      <span className="readout text-sm text-good-300">{contest.my_score?.toFixed(1)}</span>
                    ) : (
                      <span className="text-xs text-mute">{contest.joined ? 'not finished' : 'missed'}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {contests.length === 0 && (
            <div className="panel p-8 text-center">
              <p className="text-sm text-chalk">No contests are scheduled.</p>
              <p className="text-xs text-mute mt-1">
                Daily and weekly sets are generated automatically. Check back shortly.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
