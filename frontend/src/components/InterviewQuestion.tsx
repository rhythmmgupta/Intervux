import React from 'react';
import { Question } from '../types';
import { HelpCircle, Tag, Zap } from 'lucide-react';

interface InterviewQuestionProps {
  question: Question | null;
  questionIndex: number;
  totalQuestions: number;
}

export const InterviewQuestion: React.FC<InterviewQuestionProps> = ({
  question,
  questionIndex,
  totalQuestions,
}) => {
  if (!question) {
    return (
      <div className="bg-panel/60 border border-line rounded-panel p-6 text-center animate-pulse">
        <p className="text-sm text-mute">Loading next question...</p>
      </div>
    );
  }

  const difficultyColors: Record<string, string> = {
    easy: 'bg-good-500/10 text-good-400 border-good-500/20',
    medium: 'bg-flag-500/10 text-flag-400 border-flag-500/20',
    hard: 'bg-peak-500/10 text-peak-400 border-peak-500/20',
  };

  const badgeColor = difficultyColors[question.difficulty.toLowerCase()] || difficultyColors.medium;

  return (
    <div className="bg-panel/80 border border-line/80 rounded-panel p-6 relative overflow-hidden">
      {/* Background subtle gradient glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-sodium-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

      {/* Header tags */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-control bg-sodium-500/10 text-sodium-400 border border-sodium-500/20">
            Question {questionIndex + 1} of {totalQuestions}
          </span>
          <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-control bg-steel text-chalk-dim border border-line/60">
            <Tag className="w-3 h-3 text-mute" />
            {question.category}
          </span>
        </div>

        <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-control border ${badgeColor}`}>
          <Zap className="w-3 h-3" />
          {question.difficulty}
        </span>
      </div>

      {/* Question Text */}
      <div className="flex items-start gap-3">
        <HelpCircle className="w-6 h-6 text-sodium-400 shrink-0 mt-0.5" />
        <h2 className="text-xl sm:text-2xl font-semibold text-chalk leading-snug">
          "{question.question_text}"
        </h2>
      </div>
    </div>
  );
};
