import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import BottomNav from '../components/BottomNav';
import CaptureTarget from '../components/CaptureTarget';
import FloatingChip from '../components/FloatingChip';
import SkeletonChips from '../components/SkeletonChips';
import SwitchCameraIcon from '../components/SwitchCameraIcon';
import { copyText } from '../lib/clipboard';
import { useCamera } from '../hooks/useCamera';
import { useColorExtraction } from '../hooks/useColorExtraction';
import { useHoldTimer } from '../hooks/useHoldTimer';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useFeedLuminance } from '../hooks/useFeedLuminance';
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
  /** Add if not saved, remove if saved (the chip bookmark toggle). */
  onToggleSave: (swatch: Swatch) => void;
  onNavChange: (view: View) => void;
}

interface ChipLayout {
  position: { left: string; top: string };
  anchor: 'center' | 'left';
}

interface Size {
  w: number;
  h: number;
}

// Null-anchor fallback: fixed Figma 2:260 positions used when a color has no
// contiguous region to point at (cluster.anchor === null) and the real
// object-fit:cover mapping can't be computed. Chip 2 is pinned flush-left (a
// centered 13% would clip it off the viewport), so it keeps its own anchor +
// reveal keyframe. When a real anchor exists, chipPlacements maps it to where
// the color actually sits in the frame instead.
const CHIP_LAYOUT: ChipLayout[] = [
  { position: { left: '50%', top: '9%' }, anchor: 'center' },
  { position: { left: '50px', top: '43%' }, anchor: 'left' },
  { position: { left: '50%', top: '78%' }, anchor: 'center' },
];

// Keep a chip's clamped center at least this far from the viewport edge (px),
// so the whole ~150px pill stays on screen (point-only clamping isn't enough).
const CHIP_MARGIN = 12;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * The capture moment (Phase 4) wired to the real extraction pipeline (Phase 5
 * integration). `useCamera` drives a live viewfinder; on hold-complete the
 * current video frame is grabbed to a canvas and handed to `useColorExtraction`
 * (k-means + blob detection in a Web Worker). The Phase 4 choreography — pulse,
 * determinate ring, capture flash + freeze punch, staggered reveal — is
 * unchanged; the reveal is now gated on real extraction completing rather than a
 * fixed delay, and the detected chips carry the actual dominant colors.
 */
export default function CameraScreen({ savedIds, onToggleSave, onNavChange }: Props) {
  const reduced = usePrefersReducedMotion();
  const {
    videoRef,
    status: cameraStatus,
    error: cameraError,
    canSwitch,
    switchCamera,
  } = useCamera();
  const {
    extract,
    result,
    status: extractStatus,
    reset: resetExtraction,
  } = useColorExtraction();

  const [revealed, setRevealed] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  // Set when a hold completes but no frame could be grabbed (camera not yet
  // producing pixels). Distinct from an extraction error.
  const [grabFailed, setGrabFailed] = useState(false);
  // Measured viewport size, needed to push normalized anchors through the same
  // object-fit:cover transform the frozen frame is displayed with.
  const [viewportBox, setViewportBox] = useState<Size>({ w: 0, h: 0 });
  // Measured size of each revealed chip, used for size-aware edge clamping.
  // `null` until the chip has been laid out and measured.
  const [chipSizes, setChipSizes] = useState<(Size | null)[]>([]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGRectElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  // Root elements of the revealed chips, kept so a useLayoutEffect can measure
  // them before paint.
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  // Where each chip actually lands. When a color has a real anchor and the
  // viewport is measured, its normalized image-space position is pushed through
  // the same object-fit:cover transform the frozen frame is drawn with, then the
  // chip's center is clamped by half its measured size (+margin) so the whole
  // pill stays on screen. Otherwise it falls back to the fixed CHIP_LAYOUT slot.
  // `anchor` never influences the reported color — it only moves the chip (see
  // color/types.ts). Chip overlap (two close blobs colliding) is out of scope.
  const chipPlacements = useMemo<ChipLayout[]>(() => {
    return detected.map((_, i) => {
      const fallback = CHIP_LAYOUT[i % CHIP_LAYOUT.length];
      const anchor = result?.clusters[i]?.anchor;
      const imageW = result?.meta.width ?? 0;
      const imageH = result?.meta.height ?? 0;
      if (!anchor || !viewportBox.w || !viewportBox.h || !imageW || !imageH) {
        return fallback;
      }

      // object-fit: cover — scale so the image fills the box, center the overflow.
      const scale = Math.max(viewportBox.w / imageW, viewportBox.h / imageH);
      const displayW = imageW * scale;
      const displayH = imageH * scale;
      const offsetX = (viewportBox.w - displayW) / 2;
      const offsetY = (viewportBox.h - displayH) / 2;
      const px = offsetX + anchor.x * displayW;
      const py = offsetY + anchor.y * displayH;

      // Size-aware clamp against the chip's center (anchor: 'center'). Half its
      // measured size keeps the full pill on screen; 0 until first measured.
      const size = chipSizes[i];
      const halfW = size ? size.w / 2 : 0;
      const halfH = size ? size.h / 2 : 0;
      const cx = clamp(px, halfW + CHIP_MARGIN, viewportBox.w - halfW - CHIP_MARGIN);
      const cy = clamp(py, halfH + CHIP_MARGIN, viewportBox.h - halfH - CHIP_MARGIN);

      return {
        position: {
          left: `${(cx / viewportBox.w) * 100}%`,
          top: `${(cy / viewportBox.h) * 100}%`,
        },
        anchor: 'center',
      };
    });
  }, [detected, result, viewportBox, chipSizes]);

  // Pull the live accent token so the ring/glow/flash stay in sync with CSS.
  useEffect(() => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim();
    if (value) accentRef.current = value;
  }, []);

  // Track the viewport's pixel size (same pattern as the engine's AnchorMarkers)
  // so anchors can be mapped into it. The viewport is always mounted.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setViewportBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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

  // Measure the revealed chips before paint so the size-aware clamp is applied
  // to the position the user first sees (no visible jump). A chip's size is
  // fixed regardless of where it lands, so only writing state when a measured
  // size actually changed stops this from re-triggering itself into a loop.
  useLayoutEffect(() => {
    if (!revealed) return;
    setChipSizes((prev) => {
      let changed = false;
      const next = detected.map((_, i) => {
        const el = chipRefs.current[i];
        if (!el) return prev[i] ?? null;
        const size = { w: el.offsetWidth, h: el.offsetHeight };
        const previous = prev[i];
        if (previous && previous.w === size.w && previous.h === size.h) {
          return previous;
        }
        changed = true;
        return size;
      });
      return changed ? next : prev;
    });
  }, [detected, revealed]);

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

  // Flipping the camera mid-hold would swatch the wrong feed, so bail out of any
  // in-progress hold (and clear its ring/glow) before requesting the new camera.
  const onSwitchCamera = useCallback(() => {
    if (hold.state === 'holding') {
      hold.cancel();
      resetVisuals();
    }
    switchCamera();
  }, [hold, resetVisuals, switchCamera]);

  const onRetake = useCallback(() => {
    clearTimers();
    hold.reset();
    resetExtraction();
    setRevealed(false);
    setCopiedId(null);
    setGrabFailed(false);
    setChipSizes([]);
    chipRefs.current = [];
    const viewport = viewportRef.current;
    if (viewport) viewport.style.transform = 'scale(1)';
    resetVisuals();
  }, [clearTimers, hold, resetExtraction, resetVisuals]);

  const copyChip = useCallback(
    async (swatch: Swatch) => {
      const hex = `#${swatch.hex}`;
      const ok = await copyText(hex);
      if (!ok) return; // clipboard blocked — no false "Copied" swap
      setCopiedId(swatch.id);
      after(1200, () => setCopiedId((current) => (current === swatch.id ? null : current)));
      showToast(`Copied ${hex}`);
    },
    [after, showToast],
  );

  const toggleChip = useCallback(
    (swatch: Swatch) => {
      const wasSaved = savedIds.has(swatch.id);
      onToggleSave(swatch);
      showToast(wasSaved ? 'Removed from swatches' : 'Saved to swatches');
    },
    [onToggleSave, savedIds, showToast],
  );

  // Clear pending timers on unmount.
  useEffect(() => clearTimers, [clearTimers]);

  const cameraReady = cameraStatus === 'ready';
  const isCaptured = hold.state === 'captured';
  // Is the area behind the capture card dark? Drives light vs. dark card ink.
  // Sampled while a live feed is showing; defaults to dark (light ink) for the
  // no-feed states (pending / denied), which render over a dark fallback.
  const feedDark = useFeedLuminance(videoRef, cameraReady && !revealed);
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
        className={`camera-viewport${feedDark ? ' is-dark-feed' : ''}`}
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
            <h2 className="capture-card__label">Starting camera…</h2>
          </div>
        )}
        {cameraStatus === 'error' && (
          <div className="capture-card">
            <h2 className="capture-card__label">{cameraError}</h2>
          </div>
        )}

        {showTarget && (
          <>
            <CaptureTarget label={targetLabel} glowRef={glowRef} ringRef={ringRef} />
            {/* Low-emphasis loading skeletons occupying the reveal slots while
                there's no blob data yet (idle + hold + the analysis beat). */}
            <SkeletonChips animate={!reduced} />
          </>
        )}

        {isCaptured &&
          revealed &&
          detected.map((swatch, i) => {
            const layout = chipPlacements[i] ?? CHIP_LAYOUT[i % CHIP_LAYOUT.length];
            return (
              <FloatingChip
                key={swatch.id}
                swatch={swatch}
                position={layout.position}
                anchor={layout.anchor}
                rootRef={(el) => {
                  chipRefs.current[i] = el;
                }}
                saved={savedIds.has(swatch.id)}
                copied={copiedId === swatch.id}
                revealDelay={i * STAGGER}
                animate={!reduced}
                onToggle={() => toggleChip(swatch)}
                onCopy={() => copyChip(swatch)}
              />
            );
          })}

        {/* Extraction errored, returned nothing, or the frame couldn't be
            grabbed (26-347). Tapping the card returns to idle. */}
        {failed && (
          <button type="button" className="capture-card capture-card--error" onClick={onRetake}>
            <span className="capture-card__label">
              Unable to collect colors. Tap to try again.
            </span>
          </button>
        )}

        {isCaptured && !failed && (
          <button type="button" className="retake-btn text-heading-1" onClick={onRetake}>
            Tap to retake
          </button>
        )}

        <div ref={flashRef} className="capture-flash" aria-hidden="true" />

        {/* Front/rear toggle — only on multi-camera devices, and only while a
            live feed is showing. Disabled once a swatch is on screen. */}
        {canSwitch && cameraReady && (
          <button
            type="button"
            className="switch-camera-btn"
            aria-label="Switch camera"
            disabled={isCaptured}
            onClick={onSwitchCamera}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SwitchCameraIcon disabled={isCaptured} />
          </button>
        )}
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
