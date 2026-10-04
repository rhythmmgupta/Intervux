import React from 'react';

type Signal = 'sodium' | 'good' | 'flag' | 'peak' | 'cool';

const FILL: Record<Signal, string> = {
  sodium: 'bg-sodium-400',
  good: 'bg-good-400',
  flag: 'bg-flag-400',
  peak: 'bg-peak-400',
  cool: 'bg-cool-400',
};

const TEXT: Record<Signal, string> = {
  sodium: 'text-sodium-300',
  good: 'text-good-300',
  flag: 'text-flag-300',
  peak: 'text-peak-300',
  cool: 'text-cool-300',
};

/** Which signal a value lands on, given the band it is supposed to sit in. */
export function bandSignal(value: number, lowGood = 70, lowFlag = 50): Signal {
  if (value >= lowGood) return 'good';
  if (value >= lowFlag) return 'flag';
  return 'peak';
}

interface MeterProps {
  label: string;
  value: number;
  /** Scale maximum. Defaults to 100 for percentage-style readings. */
  max?: number;
  /** Ideal range, drawn on the scale as a dashed band. */
  band?: [number, number];
  unit?: string;
  signal?: Signal;
  /** Shown under the meter: what the reading means or what to do about it. */
  note?: string;
  size?: 'sm' | 'lg';
}

/**
 * A reading against a scale, with the target range marked on it.
 * The one piece of signature hardware in this interface: a bare percentage
 * tells you nothing, while a percentage sitting outside a marked band does.
 */
export const Meter: React.FC<MeterProps> = ({
  label,
  value,
  max = 100,
  band,
  unit = '',
  signal,
  note,
  size = 'sm',
}) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const resolved: Signal = signal ?? (band
    ? value >= band[0] && value <= band[1] ? 'good' : 'flag'
    : bandSignal(value));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`${size === 'lg' ? 'text-sm' : 'text-xs'} text-chalk-dim`}>{label}</span>
        <span className={`readout ${size === 'lg' ? 'text-2xl' : 'text-sm'} ${TEXT[resolved]}`}>
          {Number.isFinite(value) ? Math.round(value * 10) / 10 : 0}
          {unit && <span className="text-mute text-[11px] ml-0.5">{unit}</span>}
        </span>
      </div>

      <div className={`meter mt-1.5 ${size === 'lg' ? 'h-3' : ''}`}>
        <div className="meter-ticks" />
        {band && (
          <div
            className="meter-band"
            style={{ left: `${(band[0] / max) * 100}%`, width: `${((band[1] - band[0]) / max) * 100}%` }}
          />
        )}
        <div className={`meter-fill ${FILL[resolved]}`} style={{ width: `${pct}%`, opacity: 0.85 }} />
      </div>

      {note && <p className="text-[11px] text-mute mt-1 leading-snug">{note}</p>}
    </div>
  );
};

/** A label/value line, the spec-sheet row this interface is built from. */
export const SpecRow: React.FC<{
  label: string;
  value: React.ReactNode;
  signal?: Signal;
}> = ({ label, value, signal }) => (
  <div className="flex items-baseline gap-3 py-1.5 border-b border-line/60 last:border-0">
    <span className="text-xs text-mute whitespace-nowrap">{label}</span>
    <span className="flex-1 border-b border-dotted border-line translate-y-[-3px]" />
    <span className={`readout text-sm ${signal ? TEXT[signal] : 'text-chalk'}`}>{value}</span>
  </div>
);

/** Tier and status chips. Flat, bordered, no gradient. */
export const Chip: React.FC<{
  children: React.ReactNode;
  signal?: Signal | 'neutral';
  className?: string;
}> = ({ children, signal = 'neutral', className = '' }) => {
  const styles: Record<string, string> = {
    neutral: 'border-line text-chalk-dim bg-steel/60',
    sodium: 'border-sodium-600/50 text-sodium-300 bg-sodium-600/10',
    good: 'border-good-600/50 text-good-300 bg-good-600/10',
    flag: 'border-flag-600/50 text-flag-300 bg-flag-600/10',
    peak: 'border-peak-600/50 text-peak-300 bg-peak-600/10',
    cool: 'border-cool-600/50 text-cool-300 bg-cool-600/10',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 border text-[11px] font-medium rounded-control ${styles[signal]} ${className}`}
    >
      {children}
    </span>
  );
};
