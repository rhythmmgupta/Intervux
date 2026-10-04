import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/api';
import { Company, LeaderboardRow, Rating } from '../types';
import { Chip, Meter, SpecRow } from '../components/Meter';
import { AlertCircle } from 'lucide-react';

const TIER_SIGNAL: Record<string, 'sodium' | 'good' | 'cool' | 'flag' | 'neutral'> = {
  Diamond: 'sodium',
  Platinum: 'sodium',
  Gold: 'good',
  Silver: 'cool',
  Bronze: 'flag',
  Unrated: 'neutral',
};

export const Leaderboard: React.FC = () => {
  const [me, setMe] = useState<Rating | null>(null);
  const [standings, setStandings] = useState<LeaderboardRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const storedUser = ApiService.getCurrentStoredUser();

  useEffect(() => {
    ApiService.getCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    setIsLoading(true);
    ApiService.getLeaderboard(companyFilter || undefined)
      .then((data) => {
        setMe(data.me);
        setStandings(data.standings);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Could not load the scoreboard.'))
      .finally(() => setIsLoading(false));
  }, [companyFilter]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <header className="border-b border-line pb-6 mb-8">
        <h1 className="signage text-4xl sm:text-5xl text-chalk">Scoreboard</h1>
        <p className="text-sm text-mute mt-2 max-w-[62ch] leading-relaxed">
          Your rating is the average of your five best completed sessions, scaled to 1000, plus up
          to 200 points for turning up regularly. Nothing hidden, so you can see exactly what moves it.
        </p>
      </header>

      {error && (
        <div className="mb-6 flex items-start gap-3 border border-peak-600/40 bg-peak-600/10 p-3.5 rounded-control text-sm text-peak-200">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Own rating, read as an instrument panel rather than a hero card */}
      {me && (
        <section className="panel mb-10">
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 p-6">
            <div className="sm:border-r border-line sm:pr-6">
              <p className="text-xs text-mute">Your rating</p>
              <p className="readout text-6xl text-sodium-300 leading-none mt-1">{me.rating}</p>
              <Chip signal={TIER_SIGNAL[me.tier] || 'neutral'} className="mt-3">
                {me.tier}
              </Chip>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 content-start">
              <SpecRow label="Sessions completed" value={me.sessions_completed} />
              <SpecRow label="Contests entered" value={me.contests_entered} />
              <SpecRow
                label="Best session"
                value={me.best_score === null ? '--' : me.best_score.toFixed(1)}
                signal={me.best_score && me.best_score >= 70 ? 'good' : undefined}
              />
              <SpecRow
                label="Average session"
                value={me.average_score === null ? '--' : me.average_score.toFixed(1)}
              />
              <div className="sm:col-span-2 mt-3">
                <Meter
                  label="Progress to the next 100 points"
                  value={me.rating % 100}
                  max={100}
                  signal="sodium"
                  note={
                    me.sessions_completed < 10
                      ? `${10 - me.sessions_completed} more sessions earns the full consistency credit.`
                      : 'Consistency credit is maxed. Rating now moves on session quality alone.'
                  }
                />
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setCompanyFilter('')}
          className={`px-3 py-1.5 text-xs rounded-control border transition-colors ${
            companyFilter === ''
              ? 'border-sodium-500 text-sodium-300 bg-sodium-600/10'
              : 'border-line text-mute hover:border-mute'
          }`}
        >
          Everyone
        </button>
        {companies.slice(0, 8).map((company) => (
          <button
            key={company.slug}
            onClick={() => setCompanyFilter(company.slug)}
            className={`px-3 py-1.5 text-xs rounded-control border transition-colors ${
              companyFilter === company.slug
                ? 'border-sodium-500 text-sodium-300 bg-sodium-600/10'
                : 'border-line text-mute hover:border-mute'
            }`}
          >
            {company.name}
          </button>
        ))}
      </div>

      <section className="panel overflow-hidden">
        <div className="grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[3rem_1fr_6rem_6rem_6rem] gap-3 px-5 py-2.5 border-b border-line text-[11px] text-mute">
          <span>Rank</span>
          <span>Candidate</span>
          <span className="hidden sm:block text-right">Sessions</span>
          <span className="hidden sm:block text-right">Best</span>
          <span className="text-right">Rating</span>
        </div>

        {isLoading ? (
          <p className="px-5 py-6 text-sm text-mute">Loading standings…</p>
        ) : standings.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-chalk">Nobody has finished a session here yet.</p>
            <p className="text-xs text-mute mt-1">
              Complete a mock interview and you will be ranked first.
            </p>
          </div>
        ) : (
          standings.map((row) => {
            const isMe = storedUser?.id === row.user_id;
            return (
              <div
                key={row.user_id}
                className={`grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[3rem_1fr_6rem_6rem_6rem] gap-3 px-5 py-3 items-center border-b border-line/60 last:border-0 ${
                  isMe ? 'bg-sodium-600/10' : ''
                }`}
              >
                <span
                  className={`readout text-sm ${
                    row.rank === 1 ? 'text-sodium-300' : row.rank && row.rank <= 3 ? 'text-chalk' : 'text-mute'
                  }`}
                >
                  {String(row.rank ?? 0).padStart(2, '0')}
                </span>

                <div className="min-w-0">
                  <p className="text-sm text-chalk truncate">
                    {row.name}
                    {isMe && <span className="text-sodium-300 text-xs ml-2">you</span>}
                  </p>
                  <p className="text-[11px] text-mute truncate">
                    {row.tier}
                    {row.target_company ? `, targeting ${row.target_company}` : ''}
                  </p>
                </div>

                <span className="readout text-xs text-mute hidden sm:block text-right">{row.sessions}</span>
                <span className="readout text-xs text-chalk-dim hidden sm:block text-right">
                  {row.best_score === null ? '--' : row.best_score.toFixed(1)}
                </span>
                <span className="readout text-base text-sodium-300 text-right">{row.rating}</span>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
};
