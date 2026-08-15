/*
 * Phase 4 motion tokens + paint helpers for the capture moment.
 *
 * The values here are the "quick and physical" spec: everything discrete lives
 * at 160–220ms with a snappy ease-out; the only sustained motion is the pulse,
 * which *accelerates* (tempo shortens as the hold nears capture) rather than
 * drifting. See phase4-capture-moment-spec.md §6.
 */

/** Full hold duration. Locked scope is 3–5s; 3.5s sits mid-range. */
export const HOLD_THRESHOLD_MS = 3500;

export const DUR_QUICK = 160; // press feedback, freeze punch
export const DUR_FLASH = 180; // capture flash
export const DUR_BASE = 220; // chip reveal, standard transitions
export const STAGGER = 60; // gap between the three chips revealing

/** Pulse beat interval, in ms, at the start vs. the moment of capture. */
export const TEMPO_START = 640;
export const TEMPO_END = 220;

/** Snappy ease-out for discrete transitions. */
export const EASE_SNAP = 'cubic-bezier(0.22, 1, 0.36, 1)';

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Beat interval shortens as progress climbs — the accelerando. */
export const beatInterval = (progress: number): number =>
  lerp(TEMPO_START, TEMPO_END, progress);

/** Per-beat ease-in-out shape in [0,1] from a continuous beat phase. */
export const pulseShape = (beatPhase: number): number => {
  const t = beatPhase % 1;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
};

/**
 * Paint the pulse glow imperatively (called every frame while holding). The
 * glow is a wash that fills the capture card, breathing in scale + opacity and
 * tinting toward the accent as capture approaches.
 */
export function paintGlow(
  glow: HTMLElement,
  progress: number,
  shape: number,
  accent: string,
): void {
  glow.style.transform = `scale(${lerp(1, 1.08, shape)})`;
  glow.style.opacity = String(lerp(0.4, 0.7, shape));
  const tint = Math.pow(progress, 1.6);
  glow.style.background = `linear-gradient(180deg, rgba(255,248,240,${
    0.9 - 0.35 * tint
  }) 0%, ${accent} 100%)`;
  glow.style.filter = `saturate(${0.4 + 0.6 * tint})`;
}

/**
 * Paint the determinate progress ring — the honesty layer that the prototype
 * wired up but never rendered. The ring's <rect> uses pathLength=1 with
 * dasharray "1", so dashoffset = 1 - progress fills it clockwise from the top.
 */
export function paintRing(
  ring: SVGRectElement,
  progress: number,
  accent: string,
): void {
  ring.style.stroke = accent;
  ring.setAttribute('stroke-dashoffset', String(1 - progress));
}
