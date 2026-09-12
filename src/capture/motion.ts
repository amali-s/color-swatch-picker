/*
 * Phase 4 motion tokens for the capture moment.
 *
 * The values here are the "quick and physical" spec: most discrete motion lives
 * at 160–220ms with a snappy ease-out. The overlay detail-card morph is the
 * exception (`DUR_FOCUS`) so a settle bounce can read. The sustained hold pulse
 * is a CSS-driven cream heartbeat (see `.capture-card__glow.is-pulsing` in
 * App.css); determinate progress is a 2px cream stroke painted from
 * `useHoldTimer`'s onTick.
 */

/** Full hold duration. Locked scope is 3–5s; 3.5s sits mid-range. */
export const HOLD_THRESHOLD_MS = 3500;

export const DUR_QUICK = 160; // press feedback, freeze punch, square fill
export const DUR_FLASH = 180; // capture flash, card exit
export const DUR_BASE = 220; // chip travel, canvas blend, standard transitions
/** Overlay detail-card morph + matching wheel zoom. Long enough for a settle bounce. */
export const DUR_FOCUS = 380;
/** Wait after hold starts before loader pills appear, so a tap does not flash them. */
export const LOADER_SHOW_DELAY_MS = 150;
export const STAGGER = 60; // gap between the three chips revealing
/** Reverse of STAGGER for retake — last chip to land is first to leave. */
export const STAGGER_REVERSE = 40;

/**
 * Minimum analyzing beat after capture so a fast worker cannot reveal
 * before the flash (180ms) and freeze punch have finished.
 */
export const ANALYZE_FLOOR_MS = 280;

/** Snappy ease-out for discrete arrivals (Copied in, bookmark save). */
export const EASE_SNAP = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** Inverse of EASE_SNAP — ease-in for discrete departures (Copied out, unsave). */
export const EASE_SNAP_IN = 'cubic-bezier(0.64, 0, 0.78, 0)';
/**
 * Snap family with a short overshoot — nav pill spring. Same control-x as
 * EASE_SNAP; the raised y lets translateX travel ~10% past the slot then settle.
 */
export const EASE_SNAP_OVERSHOOT = 'cubic-bezier(0.22, 1.35, 0.36, 1)';

/**
 * JS counterpart of CSS `cubic-bezier(x1,y1,x2,y2)` — maps time [0,1] → eased
 * progress. Used by the wheel zoom tween so it shares EASE_SNAP with CSS.
 */
function cubicBezierEase(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleXd = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solveX = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = sampleXd(t);
      if (Math.abs(d) < 1e-6) break;
      const next = t - (sampleX(t) - x) / d;
      if (next < 0 || next > 1) break;
      t = next;
    }
    return t;
  };
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveX(x));
  };
}

/** Sampled EASE_SNAP for imperative tweens (wheel zoom). */
export const easeSnap = cubicBezierEase(0.22, 1, 0.36, 1);
