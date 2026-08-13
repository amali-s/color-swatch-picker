import { useCallback, useEffect, useRef, useState } from 'react';
import BottomNav from '../components/BottomNav';
import CaptureTarget from '../components/CaptureTarget';
import FloatingChip from '../components/FloatingChip';
import { useHoldTimer } from '../hooks/useHoldTimer';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import {
  DUR_FLASH,
  DUR_QUICK,
  EASE_SNAP,
  HOLD_THRESHOLD_MS,
  STAGGER,
  beatInterval,
  paintGlow,
  paintRing,
  pulseShape,
} from '../capture/motion';
import type { Swatch } from '../types';
import type { View } from '../App';

interface Props {
  detected: Swatch[];
  savedIds: Set<string>;
  onSave: (swatch: Swatch) => void;
  onNavChange: (view: View) => void;
}

interface ChipLayout {
  position: { left: string; top: string };
  anchor: 'center' | 'left';
}

// Positions from Figma 2:260. Chip 2 is pinned flush-left (a centered 13%
// would clip it off the viewport), so it gets its own anchor + reveal keyframe.
const CHIP_LAYOUT: ChipLayout[] = [
  { position: { left: '50%', top: '9%' }, anchor: 'center' },
  { position: { left: '50px', top: '43%' }, anchor: 'left' },
  { position: { left: '50%', top: '78%' }, anchor: 'center' },
];

/**
 * The capture moment (Phase 4). Reuses `useHoldTimer` for idle → holding →
 * captured, and layers the pulse + determinate ring (painted imperatively off
 * the hook's per-frame tick), the capture flash + freeze punch, and the
 * staggered swatch reveal. Camera-feed wiring (getUserMedia) is a separate
 * roadmap phase — the viewport keeps the Figma placeholder gradient for now.
 */
export default function CameraScreen({ detected, savedIds, onSave, onNavChange }: Props) {
  const reduced = usePrefersReducedMotion();

  const [revealed, setRevealed] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const viewportRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGRectElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);

  const beatPhaseRef = useRef(0);
  const accentRef = useRef('#0095cc');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Pull the live accent token so the ring/glow/flash stay in sync with CSS.
  useEffect(() => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim();
    if (value) accentRef.current = value;
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const showToast = useCallback(
    (message: string) => {
      setToast(message);
      after(1400, () => setToast(''));
    },
    [after],
  );

  // Per-frame: advance the pulse accelerando and paint both progress layers.
  const onTick = useCallback(
    (progress: number, dt: number) => {
      const ring = ringRef.current;
      if (ring) paintRing(ring, progress, accentRef.current);

      const glow = glowRef.current;
      if (!glow) return;
      if (reduced) {
        glow.style.opacity = '0';
        return;
      }
      beatPhaseRef.current += dt / beatInterval(progress);
      paintGlow(glow, progress, pulseShape(beatPhaseRef.current), accentRef.current);
    },
    [reduced],
  );

  const capture = useCallback(() => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        /* Vibration unsupported (e.g. iOS Safari) — visual snap carries it. */
      }
    }

    const glow = glowRef.current;
    if (glow) glow.style.opacity = '0';

    const flash = flashRef.current;
    const viewport = viewportRef.current;

    if (reduced) {
      if (flash) {
        flash.style.transition = 'none';
        flash.style.background = accentRef.current;
        flash.style.opacity = '0.16';
        after(120, () => {
          flash.style.opacity = '0';
        });
      }
    } else {
      if (flash) {
        flash.style.background = '#ffffff';
        flash.style.transition = 'none';
        flash.style.opacity = '0.9';
        requestAnimationFrame(() => {
          flash.style.transition = `opacity ${DUR_FLASH}ms ${EASE_SNAP}`;
          flash.style.opacity = '0';
        });
      }
      if (viewport) {
        viewport.style.transition = `transform ${DUR_QUICK / 2}ms ${EASE_SNAP}`;
        viewport.style.transform = 'scale(1.03)';
        after(DUR_QUICK / 2, () => {
          viewport.style.transform = 'scale(1)';
        });
      }
    }

    after(200, () => setRevealed(true));
  }, [after, reduced]);

  const hold = useHoldTimer(HOLD_THRESHOLD_MS, capture, onTick);

  const resetVisuals = useCallback(() => {
    beatPhaseRef.current = 0;
    const ring = ringRef.current;
    if (ring) paintRing(ring, 0, accentRef.current);
    const glow = glowRef.current;
    if (glow) glow.style.opacity = '0';
  }, []);

  const onHoldEnd = useCallback(() => {
    if (hold.state !== 'holding') return;
    hold.cancel();
    resetVisuals();
  }, [hold, resetVisuals]);

  const onRetake = useCallback(() => {
    clearTimers();
    hold.reset();
    setRevealed(false);
    setCopiedId(null);
    const viewport = viewportRef.current;
    if (viewport) viewport.style.transform = 'scale(1)';
    resetVisuals();
  }, [clearTimers, hold, resetVisuals]);

  const copyChip = useCallback(
    (swatch: Swatch) => {
      const hex = `#${swatch.hex}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(hex).catch(() => {
          /* Clipboard blocked (permissions / insecure context) — toast still shows intent. */
        });
      }
      setCopiedId(swatch.id);
      after(1200, () => setCopiedId((current) => (current === swatch.id ? null : current)));
      showToast(`Copied ${hex}`);
    },
    [after, showToast],
  );

  const saveChip = useCallback(
    (swatch: Swatch) => {
      onSave(swatch);
      showToast('Saved to swatches');
    },
    [onSave, showToast],
  );

  // Clear pending timers on unmount.
  useEffect(() => clearTimers, [clearTimers]);

  const targetLabel = hold.state === 'holding' ? 'Swatching' : 'Hold to swatch';
  const showTarget = hold.state === 'idle' || hold.state === 'holding';
  const isCaptured = hold.state === 'captured';

  return (
    <div className="screen" style={{ background: 'var(--layer-1)' }}>
      <div
        ref={viewportRef}
        className="camera-viewport"
        onPointerDown={hold.start}
        onPointerUp={onHoldEnd}
        onPointerLeave={onHoldEnd}
        onPointerCancel={onHoldEnd}
      >
        {showTarget && (
          <CaptureTarget label={targetLabel} glowRef={glowRef} ringRef={ringRef} />
        )}

        {isCaptured &&
          revealed &&
          detected.map((swatch, i) => {
            const layout = CHIP_LAYOUT[i % CHIP_LAYOUT.length];
            return (
              <FloatingChip
                key={swatch.id}
                swatch={swatch}
                position={layout.position}
                anchor={layout.anchor}
                saved={savedIds.has(swatch.id)}
                copied={copiedId === swatch.id}
                revealDelay={i * STAGGER}
                animate={!reduced}
                onSave={() => saveChip(swatch)}
                onCopy={() => copyChip(swatch)}
              />
            );
          })}

        {isCaptured && (
          <button type="button" className="retake-btn text-heading-1" onClick={onRetake}>
            Tap to retake
          </button>
        )}

        <div ref={flashRef} className="capture-flash" aria-hidden="true" />
      </div>

      {toast && (
        <div className="capture-toast-layer" aria-live="polite">
          <div className="capture-toast text-heading-1">{toast}</div>
        </div>
      )}

      <BottomNav view="camera" onChange={onNavChange} />
    </div>
  );
}
