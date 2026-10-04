import React from 'react';
import { ScoreCardData } from '../types';

interface ScoreCardProps {
  card: ScoreCardData;
}

export const ScoreCard: React.FC<ScoreCardProps> = ({ card }) => {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'excellent':
        return 'bg-good-500/10 text-good-400 border-good-500/20';
      case 'good':
        return 'bg-sodium-500/10 text-sodium-400 border-sodium-500/20';
      case 'fair':
        return 'bg-flag-500/10 text-flag-400 border-flag-500/20';
      default:
        return 'bg-peak-500/10 text-peak-400 border-peak-500/20';
    }
  };

  const getBarColor = (score: number) => {
    if (score >= 85) return 'bg-gradient-to-r from-good-500 to-cool-400';
    if (score >= 70) return 'bg-gradient-to-r from-sodium-500 to-sodium-400';
    if (score >= 55) return 'bg-gradient-to-r from-flag-500 to-flag-400';
    return 'bg-gradient-to-r from-peak-500 to-peak-400';
  };

  return (
    <div className="bg-panel/80 border border-line rounded-panel p-5 flex flex-col justify-between hover:border-line transition-colors">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h4 className="text-sm font-medium text-chalk-dim">{card.title}</h4>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(card.status)}`}>
            {card.status}
          </span>
        </div>

        <div className="flex items-baseline gap-1.5 mt-2">
          <span className="text-3xl font-bold text-chalk tracking-tight">{Math.round(card.score)}</span>
          <span className="text-xs text-mute">/ 100</span>
        </div>

        <p className="text-xs text-mute mt-2 line-clamp-2 leading-relaxed">
          {card.description}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-line/60">
        <div className="w-full bg-steel h-2 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getBarColor(card.score)}`}
            style={{ width: `${Math.min(100, Math.max(0, card.score))}%` }}
          />
        </div>
      </div>
    </div>
  );
};
