import { useMemo } from 'react';

interface Props {
  /** Motion allowed (false under prefers-reduced-motion). */
  animate: boolean;
  /**
   * True once the state leaves idle — while holding ("Swatching") and through
   * the post-capture "Reading colors" beat: the six hex reels roll. Idle
   * (false) shows still em-dash slots.
   */
  scanning: boolean;
}

const HEX = '0123456789ABCDEF';
const CELLS = 6; // hex characters shown per code
const CHIPS = 3; // three stacked reveal slots

/**
 * Deterministic per-reel shuffle of the 16 hex glyphs, so each reel rolls its
 * own order (reads as scrambling, not a tidy 0→F count) but is stable across
 * re-renders. A tiny LCG keyed off the reel index — no Math.random churn.
 */
function shuffledHex(seed: number): string[] {
  const arr = HEX.split('');
  let s = seed + 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * The three faint stacked placeholders in the camera idle/hold/reading states
 * (14-67, 14-121): low-emphasis loaders that occupy the reveal slots before any
 * blob data exists.
 *
 * Two modes:
 *   - Idle (`scanning === false`): each pill sits still with six em-dash slots
 *     — a calm "nothing captured yet" placeholder.
 *   - Swatching / Reading colors (`scanning === true`, motion allowed): each
 *     pill rolls a six-character hex "counter" — six vertical reels of 0–9 A–F
 *     scrolling like a slot machine / matrix counter — foreshadowing the hex
 *     code the swatch resolves to on reveal. Pure-CSS loops (a duplicated glyph
 *     column translated -50% linearly), each with its own duration + negative
 *     delay so the six columns desync.
 *
 * Decorative, so hidden from assistive tech. Under reduced motion the reels
 * don't roll — the reading beat shows the same still em-dash slots.
 */
export default function SkeletonChips({ animate, scanning }: Props) {
  const rolling = scanning && animate;

  const chips = useMemo(
    () =>
      Array.from({ length: CHIPS }, (_, chip) =>
        Array.from({ length: CELLS }, (_, cell) => {
          const glyphs = shuffledHex(chip * 97 + cell * 13);
          const seq = [...glyphs, ...glyphs]; // duplicated → seamless -50% loop
          const dur = 0.72 + ((chip * CELLS + cell) % 5) * 0.14; // 0.72–1.28s
          const delay = -(((chip + cell) % 4) * 0.22); // desync the columns
          return { seq, dur, delay };
        }),
      ),
    [],
  );

  return (
    <div className={`skeleton-chips${rolling ? ' is-animated' : ''}`} aria-hidden="true">
      {chips.map((reels, i) => (
        <div className="skeleton-chip" key={i}>
          <span className="skeleton-chip__square" />
          <span className={`scramble-code${rolling ? '' : ' is-empty'}`}>
            <span className="scramble-code__hash">#</span>
            {rolling
              ? reels.map((reel, j) => (
                  <span className="scramble-reel" key={j}>
                    <span
                      className="scramble-reel__col"
                      style={{
                        animationDuration: `${reel.dur}s`,
                        animationDelay: `${reel.delay}s`,
                      }}
                    >
                      {reel.seq.map((g, k) => (
                        <span className="scramble-reel__glyph" key={k}>
                          {g}
                        </span>
                      ))}
                    </span>
                  </span>
                ))
              : Array.from({ length: CELLS }, (_, j) => (
                  <span className="scramble-em" key={j}>
                    —
                  </span>
                ))}
          </span>
        </div>
      ))}
    </div>
  );
}
