import { useLayoutEffect, useMemo, useRef } from 'react';
import { DUR_BASE, EASE_SNAP } from '../capture/motion';

interface Props {
  /** True while holding / reading: six hex reels roll (if motion is allowed). */
  scanning: boolean;
  /**
   * When set, freeze the CSS loops and decelerate each reel onto that hex
   * glyph (six characters, no hash). Not a string swap.
   */
  settleHex?: string | null;
  /** Motion allowed (false under prefers-reduced-motion). */
  animate: boolean;
  /** Per-chip seed so the three pills don't roll in lockstep. */
  chipIndex: number;
}

const HEX = '0123456789ABCDEF';
const CELLS = 6;

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

function readTranslateY(el: HTMLElement): number {
  const computed = getComputedStyle(el).transform;
  if (!computed || computed === 'none') return 0;
  return new DOMMatrix(computed).m42;
}

/**
 * Hex scramble guts shared by the capture chips. Idle shows still em-dashes;
 * scanning rolls six linear reels; settle decelerates onto the real glyphs
 * with EASE_SNAP. Decorative, so hidden from assistive tech.
 */
export default function ScrambleCode({ scanning, settleHex, animate, chipIndex }: Props) {
  // Keep the CSS loop class on through settle so useLayoutEffect can read the
  // live transform before freezing it. Inline `animation: none` then wins.
  const rolling = scanning && animate;
  const colRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const reels = useMemo(
    () =>
      Array.from({ length: CELLS }, (_, cell) => {
        const glyphs = shuffledHex(chipIndex * 97 + cell * 13);
        const seq = [...glyphs, ...glyphs];
        const dur = 0.72 + ((chipIndex * CELLS + cell) % 5) * 0.14;
        const delay = -(((chipIndex + cell) % 4) * 0.22);
        return { glyphs, seq, dur, delay };
      }),
    [chipIndex],
  );

  useLayoutEffect(() => {
    if (!settleHex || !animate) return;
    const hex = settleHex.toUpperCase().slice(0, CELLS);
    const cleanups: Array<() => void> = [];

    reels.forEach((reel, j) => {
      const col = colRefs.current[j];
      if (!col) return;
      const target = hex[j];
      if (!target) return;

      const glyphH = (col.firstElementChild as HTMLElement | null)?.offsetHeight ?? 18;
      const cycle = reel.glyphs.length * glyphH;
      const currentY = readTranslateY(col);

      col.style.animation = 'none';
      col.style.transition = 'none';
      col.style.transform = `translateY(${currentY}px)`;

      const idx = reel.glyphs.indexOf(target);
      if (idx < 0) return;

      let yNorm = currentY % cycle;
      if (yNorm > 0) yNorm -= cycle;

      let targetY = -idx * glyphH;
      while (targetY > yNorm + 0.5) targetY -= cycle;
      if (Math.abs(targetY - yNorm) < 1) targetY -= cycle;

      const frame = requestAnimationFrame(() => {
        col.style.transition = `transform ${DUR_BASE}ms ${EASE_SNAP}`;
        col.style.transform = `translateY(${targetY}px)`;
      });
      cleanups.push(() => cancelAnimationFrame(frame));
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [settleHex, animate, reels]);

  return (
    <span
      className={`scramble-code${rolling ? ' is-rolling' : ''}${
        scanning || settleHex ? '' : ' is-empty'
      }`}
      aria-hidden="true"
    >
      <span className="scramble-code__hash">#</span>
      {rolling || settleHex
        ? reels.map((reel, j) => (
            <span className="scramble-reel" key={j}>
              <span
                ref={(el) => {
                  colRefs.current[j] = el;
                }}
                className="scramble-reel__col"
                style={
                  rolling
                    ? {
                        animationDuration: `${reel.dur}s`,
                        animationDelay: `${reel.delay}s`,
                      }
                    : undefined
                }
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
  );
}
