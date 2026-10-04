import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Meter, SpecRow } from '../components/Meter';

/**
 * The hero is the instrument itself: the panel a candidate sees while speaking.
 * Its needles settle once on load, which is the page's only unprompted motion.
 */
const DEMO_READING = {
  eye_contact: 64,
  pace: 182,
  fillers: 7,
  fluency: 58,
};

const MEASURES = [
  {
    signal: 'Where your eyes go',
    detail:
      'Pupil position is measured inside each eye socket, so looking past the lens at a second screen shows up as a reading, not a guess.',
  },
  {
    signal: 'How you are sitting',
    detail:
      'Head height and centring each frame, plus how much you drift over the answer. Slouching and swaying score differently.',
  },
  {
    signal: 'How you sound',
    detail:
      'Words per minute against the band interviewers are comfortable with, filler density, stalling, and how varied your sentences are.',
  },
  {
    signal: 'What you actually said',
    detail:
      'Relevance, structure, depth and grammar, scored per answer, with the strengths and the gaps written out.',
  },
];

export const Landing: React.FC = () => {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 220);
    return () => clearTimeout(timer);
  }, []);

  const reading = settled ? DEMO_READING : { eye_contact: 0, pace: 0, fillers: 0, fluency: 0 };

  return (
    <div className="flex flex-col">
      {/* Hero: headline against the live panel */}
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
          <div>
            <h1 className="signage text-5xl sm:text-6xl lg:text-7xl text-chalk leading-[0.95]">
              Your delivery,
              <br />
              on the meter.
            </h1>

            <p className="mt-6 text-base sm:text-lg text-chalk-dim max-w-[52ch] leading-relaxed">
              Most interview practice marks your answer and stops there. IntervuX measures how you
              delivered it: where your eyes went, how fast you spoke, how much you stalled, how you
              sat. Then it tells you which one cost you the round.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to="/setup"
                className="px-6 py-3 bg-sodium-500 hover:bg-sodium-400 text-ink font-semibold text-sm rounded-control transition-colors"
              >
                Start a session
              </Link>
              <Link
                to="/speaking"
                className="px-6 py-3 border border-line hover:border-mute text-chalk text-sm rounded-control transition-colors"
              >
                Practise speaking first
              </Link>
            </div>

            <p className="mt-6 text-xs text-mute max-w-[52ch] leading-relaxed">
              Works without an API key. Camera and microphone stay in your browser, and every score
              names the signal it came from.
            </p>
          </div>

          {/* The panel */}
          <div className="panel">
            <div className="flex items-center justify-between px-5 py-3 border-b border-line">
              <span className="text-xs text-chalk-dim">Live session, question 3 of 5</span>
              <span className="flex items-center gap-1.5 text-[11px] text-peak-300">
                <span className="w-1.5 h-1.5 rounded-full bg-peak-400 animate-pulse" />
                recording
              </span>
            </div>

            <div className="p-5 space-y-5">
              <Meter
                label="Eye contact"
                value={reading.eye_contact}
                size="lg"
                unit="%"
                note="Eyes left of lens for 31% of frames."
              />
              <Meter
                label="Speaking pace"
                value={reading.pace}
                max={240}
                band={[120, 165]}
                unit="wpm"
                size="lg"
                note="Above the comfortable band. Interviewers lose the thread here."
              />
              <Meter
                label="Filler words"
                value={reading.fillers}
                max={12}
                signal="peak"
                size="lg"
                note="Seven in 90 seconds, mostly before a technical term."
              />

              <div className="pt-4 border-t border-line space-y-1">
                <SpecRow label="Fluency band" value="Upper Intermediate" signal="flag" />
                <SpecRow label="Answer quality" value="78.4" signal="good" />
                <SpecRow label="Session integrity" value="clean" signal="good" />
              </div>

              <p className="text-xs text-chalk-dim border-l-2 border-sodium-600 pl-3 leading-relaxed">
                Strong technical substance, delivered too fast with your eyes off the lens. Slow to
                150 wpm and the same answer reads as confident.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What gets measured */}
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="signage text-3xl sm:text-4xl text-chalk">What gets measured</h2>
          <p className="text-sm text-mute mt-2 max-w-[62ch] leading-relaxed">
            Four signals, each from something observable. No scores for confidence, mood or
            personality, because a webcam cannot evidence any of them.
          </p>

          <dl className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {MEASURES.map((item) => (
              <div key={item.signal} className="border-t border-line pt-4">
                <dt className="text-base text-chalk font-semibold">{item.signal}</dt>
                <dd className="text-sm text-mute mt-1.5 leading-relaxed max-w-[48ch]">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Where it fits */}
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-10">
          <div>
            <h3 className="signage-tight text-2xl text-chalk">Company rounds</h3>
            <p className="text-sm text-mute mt-2 leading-relaxed">
              Pick where you are applying. Microsoft, Google, Amazon, TCS, Infosys and more, each
              with the questions and focus areas its loop actually uses.
            </p>
            <Link to="/setup" className="inline-block mt-3 text-sm text-sodium-300 hover:underline">
              Choose a company
            </Link>
          </div>

          <div>
            <h3 className="signage-tight text-2xl text-chalk">Daily and weekly contests</h3>
            <p className="text-sm text-mute mt-2 leading-relaxed">
              Five sealed questions, the same set for everyone who sits it, with a scoreboard at the
              end. Enter to see them.
            </p>
            <Link to="/contests" className="inline-block mt-3 text-sm text-sodium-300 hover:underline">
              See open contests
            </Link>
          </div>

          <div>
            <h3 className="signage-tight text-2xl text-chalk">Speaking practice</h3>
            <p className="text-sm text-mute mt-2 leading-relaxed">
              Short drills that score your English fluency from what you said: pace, stalling,
              fillers, vocabulary and sentence flow. Accent is never scored.
            </p>
            <Link to="/speaking" className="inline-block mt-3 text-sm text-sodium-300 hover:underline">
              Open a drill
            </Link>
          </div>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-mute">
          IntervuX measures observable delivery. It does not judge character.
        </p>
        <div className="flex items-center gap-5 text-xs">
          <Link to="/register" className="text-chalk-dim hover:text-chalk transition-colors">
            Create an account
          </Link>
          <Link to="/login" className="text-chalk-dim hover:text-chalk transition-colors">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
};
