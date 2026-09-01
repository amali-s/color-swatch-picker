/*
 * Phase 4 motion tokens for the capture moment.
 *
 * The values here are the "quick and physical" spec: everything discrete lives
 * at 160–220ms with a snappy ease-out. The sustained hold pulse is a CSS-driven
 * cream heartbeat (see `.capture-card__glow.is-pulsing` in App.css); determinate
 * progress is a 2px cream stroke painted from `useHoldTimer`'s onTick.
 */

/** Full hold duration. Locked scope is 3–5s; 3.5s sits mid-range. */
export const HOLD_THRESHOLD_MS = 3500;

export const DUR_QUICK = 160; // press feedback, freeze punch, square fill
export const DUR_FLASH = 180; // capture flash, card exit
export const DUR_BASE = 220; // chip travel, canvas blend, standard transitions
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
