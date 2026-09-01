import { useLayoutEffect, useRef, useState } from 'react';
import { DUR_FLASH } from '../capture/motion';
import type { RefObject } from 'react';

interface Props {
  /** "Hold to swatch" | "Swatching" | "Reading colors". */
  label: string;
  /** The pulse-wash element, toggled between idle and the CSS heartbeat. */
  glowRef: RefObject<HTMLDivElement | null>;
  /** Cream progress stroke; dashoffset is painted from hold onTick. */
  ringRef: RefObject<SVGRectElement | null>;
  /** Fade/scale the card out as chip 0 begins travel. Stays mounted. */
  exiting?: boolean;
  /** Pointer-down press-in. Transform lives on an inner wrapper so it
   *  never fights `.is-exiting` or the viewport freeze punch. */
  pressed?: boolean;
  /** Motion allowed (false under prefers-reduced-motion). */
  animate?: boolean;
}

/**
 * The capture target card (Figma "Hold to swatch" frame). While the card is
 * held, the pulse glow (`glowRef`) washes the card with a cream heartbeat that
 * carries the physical "charging" feel, and a 2px cream stroke (`ringRef`)
 * tracks hold progress 0→1 linearly. The heartbeat is atmosphere; the ring is
 * the determinate signal. CameraScreen toggles `is-pulsing` and paints the
 * ring from `useHoldTimer`'s onTick.
 */
export default function CaptureTarget({
  label,
  glowRef,
  ringRef,
  exiting,
  pressed = false,
  animate = true,
}: Props) {
  const [incoming, setIncoming] = useState(label);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const displayedRef = useRef(label);

  useLayoutEffect(() => {
    if (label === displayedRef.current) return;
    const prev = displayedRef.current;
    displayedRef.current = label;
    if (!animate) {
      setIncoming(label);
      setOutgoing(null);
      return;
    }
    setOutgoing(prev);
    setIncoming(label);
    const t = setTimeout(() => setOutgoing(null), DUR_FLASH);
    return () => clearTimeout(t);
  }, [label, animate]);

  return (
    <div
      className={`capture-card capture-card--live${exiting ? ' is-exiting' : ''}`}
    >
      <div className={`capture-card__press${pressed ? ' is-pressed' : ''}`}>
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
        <h2 className={`capture-card__label${outgoing ? ' is-swapping' : ''}`}>
          {outgoing !== null && (
            <span className="capture-card__swap is-out" aria-hidden="true">
              {outgoing}
            </span>
          )}
          <span className="capture-card__swap is-in">{incoming}</span>
        </h2>
      </div>
    </div>
  );
}
