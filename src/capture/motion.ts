/*
 * Phase 4 motion tokens for the capture moment.
 *
 * The values here are the "quick and physical" spec: everything discrete lives
 * at 160–220ms with a snappy ease-out. The sustained hold pulse is now a
 * CSS-driven cream heartbeat (see `.capture-card__glow.is-pulsing` in App.css),
 * so no per-frame paint helpers live here anymore.
 */

/** Full hold duration. Locked scope is 3–5s; 3.5s sits mid-range. */
export const HOLD_THRESHOLD_MS = 3500;

export const DUR_QUICK = 160; // press feedback, freeze punch
export const DUR_FLASH = 180; // capture flash
export const DUR_BASE = 220; // chip reveal, standard transitions
export const STAGGER = 60; // gap between the three chips revealing

/** Snappy ease-out for discrete transitions. */
export const EASE_SNAP = 'cubic-bezier(0.22, 1, 0.36, 1)';
