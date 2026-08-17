import type { RefObject } from 'react';

interface Props {
  /** "Hold to swatch" when idle, "Swatching" while holding. */
  label: string;
  /** The pulse-wash element, toggled between idle and the CSS heartbeat. */
  glowRef: RefObject<HTMLDivElement | null>;
}

/**
 * The capture target card (Figma "Hold to swatch" frame). While the card is
 * held, the pulse glow (`glowRef`) washes the card with a cream heartbeat that
 * carries the physical "charging" feel. The heartbeat itself is CSS-driven —
 * CameraScreen only toggles the `is-pulsing` class on the glow as the hold
 * starts and ends.
 */
export default function CaptureTarget({ label, glowRef }: Props) {
  return (
    <div className="capture-card">
      <div ref={glowRef} className="capture-card__glow" aria-hidden="true" />
      <h2 className="capture-card__label">{label}</h2>
    </div>
  );
}
