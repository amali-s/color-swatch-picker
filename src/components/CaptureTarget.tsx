import type { RefObject } from 'react';

interface Props {
  /** "Hold to swatch" when idle, "Swatching" while holding. */
  label: string;
  /** The pulse-wash element, painted imperatively each frame. */
  glowRef: RefObject<HTMLDivElement | null>;
  /** The determinate progress-ring <rect>, painted imperatively each frame. */
  ringRef: RefObject<SVGRectElement | null>;
}

/**
 * The capture target card (Figma "Hold to swatch" frame), upgraded for Phase 4
 * with the two progress layers working together:
 *   - the pulse glow (`glowRef`) carries the physical "charging" feel, and
 *   - the determinate ring (`ringRef`) traces the card border to show exactly
 *     how much of the hold remains — the honesty layer the prototype was
 *     missing.
 * Both are driven from useHoldTimer's per-frame tick in CameraScreen.
 */
export default function CaptureTarget({ label, glowRef, ringRef }: Props) {
  return (
    <div className="capture-card">
      <div ref={glowRef} className="capture-card__glow" aria-hidden="true" />
      <svg
        className="capture-ring"
        viewBox="0 0 329 114"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect
          ref={ringRef}
          x="1"
          y="1"
          width="327"
          height="112"
          rx="8"
          ry="8"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <h2 className="capture-card__label text-heading-2">{label}</h2>
    </div>
  );
}
