import React from 'react';
import { Lightbulb, X } from 'lucide-react';

interface FeedbackCardProps {
  tip: string | null;
  onDismiss?: () => void;
}

export const FeedbackCard: React.FC<FeedbackCardProps> = ({ tip, onDismiss }) => {
  if (!tip) return null;

  return (
    <div className="bg-gradient-to-r from-flag-500/15 via-sodium-500/15 to-sodium-500/15 border border-flag-500/30 rounded-control p-4 backdrop-blur-md flex items-center justify-between gap-3 animate-fade-in transition-all">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-control bg-flag-500/20 text-flag-400 flex items-center justify-center shrink-0 border border-flag-500/30">
          <Lightbulb className="w-4 h-4" />
        </div>
        <div>
          <span className="text-[11px] font-semibold text-flag-400 block">
            Practice Coaching Tip
          </span>
          <p className="text-sm font-medium text-chalk mt-0.5 leading-snug">
            {tip}
          </p>
        </div>
      </div>

      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-mute hover:text-chalk p-1 rounded-control hover:bg-steel/60 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
