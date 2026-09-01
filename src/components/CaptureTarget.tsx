import type { RefObject } from 'react';

interface Props {
  /** "Hold to swatch" when idle, "Swatching" while holding. */
  label: string;
  /** The pulse-wash element, toggled between idle and the CSS heartbeat. */
  glowRef: RefObject<HTMLDivElement | null>;
  /** Cream progress stroke; dashoffset is painted from hold onTick. */
  ringRef: RefObject<SVGRectElement | null>;
  /** Fade/scale the card out as chip 0 begins travel. Stays mounted. */
  exiting?: boolean;
}

/**
 * The capture target card (Figma "Hold to swatch" frame). While the card is
 * held, the pulse glow (`glowRef`) washes the card with a cream heartbeat that
 * carries the physical "charging" feel, and a 2px cream stroke (`ringRef`)
 * tracks hold progress 0→1 linearly. The heartbeat is atmosphere; the ring is
 * the determinate signal. CameraScreen toggles `is-pulsing` and paints the
 * ring from `useHoldTimer`'s onTick.
 */
export default function CaptureTarget({ label, glowRef, ringRef, exiting }: Props) {
  return (
    <div className={`capture-card${exiting ? ' is-exiting' : ''}`}>
      <div ref={glowRef} className="capture-card__glow" aria-hidden="true" />
      <svg className="capture-card__ring" aria-hidden="true">
        <rect
          ref={ringRef}
          className="capture-card__ring-stroke"
          x="1"
          y="1"
          width="100%"
          height="100%"
          rx="7"
          ry="7"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1}
        />
      </svg>
      <h2 className="capture-card__label">{label}</h2>
    </div>
  );
}
