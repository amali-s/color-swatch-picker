import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BottomNav from '../components/BottomNav';
import CaptureTarget from '../components/CaptureTarget';
import FloatingChip from '../components/FloatingChip';
import { useCamera } from '../hooks/useCamera';
import { useColorExtraction } from '../hooks/useColorExtraction';
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
// v1 keeps these fixed design positions; anchoring chips to each color's real
// blob (result.clusters[i].anchor) is a deliberate follow-up — see
// phase5-integration-plan.md.
const CHIP_LAYOUT: ChipLayout[] = [
  { position: { left: '50%', top: '9%' }, anchor: 'center' },
  { position: { left: '50px', top: '43%' }, anchor: 'left' },
  { position: { left: '50%', top: '78%' }, anchor: 'center' },
];

/**
 * The capture moment (Phase 4) wired to the real extraction pipeline (Phase 5
 * integration). `useCamera` drives a live viewfinder; on hold-complete the
 * current video frame is grabbed to a canvas and handed to `useColorExtraction`
 * (k-means + blob detection in a Web Worker). The Phase 4 choreography — pulse,
 * determinate ring, capture flash + freeze punch, staggered reveal — is
 * unchanged; the reveal is now gated on real extraction completing rather than a
 * fixed delay, and the detected chips carry the actual dominant colors.
 */
export default function CameraScreen({ savedIds, onSave, onNavChange }: Props) {
  const reduced = usePrefersReducedMotion();
  const { videoRef, status: cameraStatus, error: cameraError } = useCamera();
  const {
    extract,
    result,
    status: extractStatus,
    error: extractError,
    reset: resetExtraction,
  } = useColorExtraction();

  const [revealed, setRevealed] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  // Set when a hold completes but no frame could be grabbed (camera not yet
  // producing pixels). Distinct from an extraction error.
  const [grabFailed, setGrabFailed] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGRectElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);

  const beatPhaseRef = useRef(0);
  const accentRef = useRef('#0095cc');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Adapt the engine's PaletteResult into the UI's Swatch shape. The engine
  // emits "#RRGGBB" (uppercase, with hash); Swatch stores the bare hex and the
  // UI re-adds the hash. The id is derived from the hex so saving the same
  // color across captures dedupes by color in the saved list.
  const detected = useMemo<Swatch[]>(() => {
    if (!result) return [];
    return result.clusters.map((cluster) => {
      const hex = cluster.hex.replace('#', '');
      return { id: `detected-${hex}`, hex };
    });
  }, [result]);

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

  // Grab the current video frame and hand its pixels to the extraction worker.
  // Runs synchronously inside the hold timer's completion tick, while <video> is
  // still mounted and playing. Returns false if no frame could be read.
  const grabFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return false;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return false;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, width, height);

    // One frame's pixels → k-means (colors) + blob detection (positions).
    extract(ctx.getImageData(0, 0, width, height));
    return true;
  }, [extract, videoRef]);

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

    // Kick off real extraction. Reveal is gated on it completing (see effect).
    if (!grabFrame()) setGrabFailed(true);
  }, [after, reduced, grabFrame]);

  const hold = useHoldTimer(HOLD_THRESHOLD_MS, capture, onTick);

  // Reveal the swatches once extraction lands. A short beat lets the capture
  // flash breathe first; under reduced motion it reveals immediately.
  useEffect(() => {
    if (hold.state !== 'captured' || extractStatus !== 'done') return;
    if (detected.length === 0) return; // degenerate frame → handled as a failure state
    const t = setTimeout(() => setRevealed(true), reduced ? 0 : 140);
    return () => clearTimeout(t);
  }, [hold.state, extractStatus, detected.length, reduced]);

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
    resetExtraction();
    setRevealed(false);
    setCopiedId(null);
    setGrabFailed(false);
    const viewport = viewportRef.current;
    if (viewport) viewport.style.transform = 'scale(1)';
    resetVisuals();
  }, [clearTimers, hold, resetExtraction, resetVisuals]);

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

  const cameraReady = cameraStatus === 'ready';
  const isCaptured = hold.state === 'captured';
  // Extraction failed, produced nothing, or the frame couldn't be grabbed.
  const failed =
    isCaptured &&
    (grabFailed ||
      extractStatus === 'error' ||
      (extractStatus === 'done' && detected.length === 0));
  // Held/holding target card also covers the brief "analyzing" beat after
  // capture, before the reveal — until it either reveals or fails.
  const showTarget = cameraReady && !revealed && !failed;
  const targetLabel =
    hold.state === 'holding'
      ? 'Swatching'
      : isCaptured
        ? 'Reading colors'
        : 'Hold to swatch';

  return (
    <div className="screen" style={{ background: 'var(--layer-1)' }}>
      <div
        ref={viewportRef}
        className="camera-viewport"
        onPointerDown={cameraReady ? hold.start : undefined}
        onPointerUp={onHoldEnd}
        onPointerLeave={onHoldEnd}
        onPointerCancel={onHoldEnd}
      >
        <video
          ref={videoRef}
          className={`camera-feed${cameraReady ? '' : ' is-hidden'}`}
          autoPlay
          muted
          playsInline
        />
        {/* Frozen frame, drawn on capture and shown over the live feed so the
            revealed chips sit on the image the colors came from. */}
        <canvas
          ref={canvasRef}
          className={`camera-frame${isCaptured ? '' : ' is-hidden'}`}
          aria-hidden="true"
        />

        {cameraStatus === 'pending' && (
          <div className="capture-card">
            <h2 className="capture-card__label text-heading-2">Starting camera…</h2>
          </div>
        )}
        {cameraStatus === 'error' && (
          <div className="capture-card">
            <h2 className="capture-card__label text-heading-2">{cameraError}</h2>
          </div>
        )}

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

        {failed && (
          <div className="capture-card">
            <h2 className="capture-card__label text-heading-2">
              {extractError ?? "Couldn't read the colors"}
            </h2>
          </div>
        )}

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
