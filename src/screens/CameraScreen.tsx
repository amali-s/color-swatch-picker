import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import BottomNav from '../components/BottomNav';
import CaptureTarget from '../components/CaptureTarget';
import CaptureChip from '../components/FloatingChip';
import SwitchCameraIcon from '../components/SwitchCameraIcon';
import { copyText } from '../lib/clipboard';
import { useCamera } from '../hooks/useCamera';
import { useColorExtraction } from '../hooks/useColorExtraction';
import { useHoldTimer } from '../hooks/useHoldTimer';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useFeedLuminance } from '../hooks/useFeedLuminance';
import {
  ANALYZE_FLOOR_MS,
  DUR_BASE,
  DUR_FLASH,
  DUR_QUICK,
  EASE_SNAP,
  HOLD_THRESHOLD_MS,
  STAGGER,
  STAGGER_REVERSE,
} from '../capture/motion';
import type { ChipAnchor, ChipPhase } from '../components/FloatingChip';
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
  anchor: ChipAnchor;
}

interface Size {
  w: number;
  h: number;
}

/** Forward morph / reverse retake. `live` covers idle, holding, and analyzing. */
type Story = 'live' | 'revealing' | 'revealed' | 'returning';

const CHIP_COUNT = 3;

// Idle seats and null-anchor fallback. Positions live as CSS variables on
// .camera-viewport so they stay clear of the full-width capture card (two
// above, one below — a pill at ~43% always sat on the card). Blob-anchored
// reveal still uses chipPlacements; de-collision of those is out of scope.
const CHIP_LAYOUT: ChipLayout[] = [
  { position: { left: 'var(--chip-0-left)', top: 'var(--chip-0-top)' }, anchor: 'center' },
  { position: { left: 'var(--chip-1-left)', top: 'var(--chip-1-top)' }, anchor: 'left' },
  { position: { left: 'var(--chip-2-left)', top: 'var(--chip-2-top)' }, anchor: 'center' },
];

// Keep a chip's clamped center at least this far from the viewport edge (px),
// so the whole ~150px pill stays on screen (point-only clamping isn't enough).
const CHIP_MARGIN = 12;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const RING_EMPTY = '1';
const RING_FULL = '0';

/**
 * The capture moment wired to the real extraction pipeline. Hold progress
 * paints a cream ring from the hold timer's onTick; on capture the flash +
 * freeze punch still snap, then a minimum analyzing beat lets them finish
 * before the three loader pills morph into hex chips. Retake plays that
 * sequence backward.
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

  const [story, setStory] = useState<Story>('live');
  const [cardExiting, setCardExiting] = useState(false);
  const [frameReleasing, setFrameReleasing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [toastExiting, setToastExiting] = useState(false);
  const [toastEpoch, setToastEpoch] = useState(0);
  // Set when a hold completes but no frame could be grabbed (camera not yet
  // producing pixels). Distinct from an extraction error.
  const [grabFailed, setGrabFailed] = useState(false);
  // Measured viewport size, needed to push normalized anchors through the same
  // object-fit:cover transform the frozen frame is displayed with.
  const [viewportBox, setViewportBox] = useState<Size>({ w: 0, h: 0 });
  // Measured size of each revealed chip, used for size-aware edge clamping.
  // `null` until the hidden sizer has been laid out.
  const [chipSizes, setChipSizes] = useState<(Size | null)[]>([]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGRectElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const sizerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const capturedAtRef = useRef(0);

  const accentRef = useRef('#0095cc');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toastDwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastExitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastLiveRef = useRef(false);

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

      const scale = Math.max(viewportBox.w / imageW, viewportBox.h / imageH);
      const displayW = imageW * scale;
      const displayH = imageH * scale;
      const offsetX = (viewportBox.w - displayW) / 2;
      const offsetY = (viewportBox.h - displayH) / 2;
      const px = offsetX + anchor.x * displayW;
      const py = offsetY + anchor.y * displayH;

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
        anchor: 'center' as const,
      };
    });
  }, [detected, result, viewportBox, chipSizes]);

  useEffect(() => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim();
    if (value) accentRef.current = value;
  }, []);

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

  const paintRing = useCallback((dashoffset: string) => {
    const ring = ringRef.current;
    if (ring) ring.style.strokeDashoffset = dashoffset;
  }, []);

  const onHoldTick = useCallback(
    (progress: number) => {
      paintRing(String(1 - progress));
    },
    [paintRing],
  );

  const clearToastTimers = useCallback(() => {
    if (toastDwellRef.current) clearTimeout(toastDwellRef.current);
    if (toastExitRef.current) clearTimeout(toastExitRef.current);
    toastDwellRef.current = null;
    toastExitRef.current = null;
  }, []);

  const showToast = useCallback(
    (message: string) => {
      clearToastTimers();
      if (!toastLiveRef.current) {
        setToastEpoch((n) => n + 1);
      }
      toastLiveRef.current = true;
      setToastExiting(false);
      setToast(message);
      toastDwellRef.current = setTimeout(() => {
        setToastExiting(true);
        toastLiveRef.current = false;
        toastExitRef.current = setTimeout(() => {
          setToast('');
          setToastExiting(false);
        }, DUR_FLASH);
      }, 1400);
    },
    [clearToastTimers],
  );

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

    extract(ctx.getImageData(0, 0, width, height));
    return true;
  }, [extract, videoRef]);

  const capture = useCallback(() => {
    capturedAtRef.current = performance.now();
    paintRing(RING_FULL);

    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        /* Vibration unsupported (e.g. iOS Safari) — visual snap carries it. */
      }
    }

    const glow = glowRef.current;
    if (glow) glow.classList.remove('is-pulsing');

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

    if (!grabFrame()) setGrabFailed(true);
  }, [after, reduced, grabFrame, paintRing]);

  const hold = useHoldTimer(HOLD_THRESHOLD_MS, capture, onHoldTick);

  useEffect(() => {
    const glow = glowRef.current;
    if (glow) glow.classList.toggle('is-pulsing', hold.state === 'holding');
    if (hold.state === 'idle') paintRing(RING_EMPTY);
    if (hold.state === 'captured') paintRing(RING_FULL);
  }, [hold.state, paintRing]);

  // Measure destination chip size as soon as extraction lands, so the clamp is
  // applied to chipPlacements before travel starts (no land-then-jump).
  useLayoutEffect(() => {
    if (detected.length === 0) return;
    setChipSizes((prev) => {
      let changed = false;
      const next = detected.map((_, i) => {
        const el = sizerRefs.current[i];
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
  }, [detected]);

  // Gate reveal on extract-done AND a floor after capture so a fast worker
  // cannot reveal before the flash and freeze punch have finished.
  // Reduced motion keeps the 0ms path.
  useEffect(() => {
    if (hold.state !== 'captured' || extractStatus !== 'done') return;
    if (detected.length === 0) return;
    if (story !== 'live') return;
    const sized = detected.every((_, i) => chipSizes[i]);
    if (!sized) return;
    if (reduced) {
      setStory('revealed');
      setCardExiting(true);
      return;
    }
    const elapsed = performance.now() - capturedAtRef.current;
    const wait = Math.max(0, ANALYZE_FLOOR_MS - elapsed);
    const t = setTimeout(() => {
      setStory('revealing');
      setCardExiting(true);
    }, wait);
    return () => clearTimeout(t);
  }, [hold.state, extractStatus, detected, reduced, story, chipSizes]);

  useEffect(() => {
    if (story !== 'revealing') return;
    const t = setTimeout(() => setStory('revealed'), DUR_BASE + 2 * STAGGER);
    return () => clearTimeout(t);
  }, [story]);

  const resetVisuals = useCallback(() => {
    const glow = glowRef.current;
    if (glow) glow.classList.remove('is-pulsing');
    paintRing(RING_EMPTY);
  }, [paintRing]);

  const instantReset = useCallback(() => {
    clearTimers();
    hold.reset();
    resetExtraction();
    setStory('live');
    setCardExiting(false);
    setFrameReleasing(false);
    setCopiedId(null);
    setGrabFailed(false);
    setChipSizes([]);
    sizerRefs.current = [];
    capturedAtRef.current = 0;
    const viewport = viewportRef.current;
    if (viewport) viewport.style.transform = 'scale(1)';
    resetVisuals();
  }, [clearTimers, hold, resetExtraction, resetVisuals]);

  const onHoldEnd = useCallback(() => {
    if (hold.state !== 'holding') return;
    hold.cancel();
    resetVisuals();
  }, [hold, resetVisuals]);

  const onSwitchCamera = useCallback(() => {
    if (hold.state === 'holding') {
      hold.cancel();
      resetVisuals();
    }
    switchCamera();
  }, [hold, resetVisuals, switchCamera]);

  const onRetake = useCallback(() => {
    if (story === 'returning') return;
    if (reduced || story === 'live') {
      instantReset();
      return;
    }
    clearTimers();
    setStory('returning');
    const cardInAt = STAGGER_REVERSE * 2;
    after(cardInAt, () => {
      setCardExiting(false);
      setFrameReleasing(true);
    });
    after(cardInAt + DUR_BASE, instantReset);
  }, [story, reduced, instantReset, clearTimers, after]);

  const copyChip = useCallback(
    async (swatch: Swatch) => {
      const hex = `#${swatch.hex}`;
      const ok = await copyText(hex);
      if (!ok) return;
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

  useEffect(() => clearTimers, [clearTimers]);
  useEffect(() => clearToastTimers, [clearToastTimers]);

  const cameraReady = cameraStatus === 'ready';
  const isCaptured = hold.state === 'captured';
  const feedDark = useFeedLuminance(videoRef, cameraReady && story === 'live' && !isCaptured);
  const failed =
    isCaptured &&
    story === 'live' &&
    (grabFailed ||
      extractStatus === 'error' ||
      (extractStatus === 'done' && detected.length === 0));
  const showTarget = cameraReady && !failed;
  const targetLabel = hold.state === 'idle' ? 'Hold to swatch' : 'Swatching';

  const inputLocked = story === 'returning' || story === 'revealing';

  const chipPhase = (): ChipPhase => {
    if (story === 'returning') return 'returning';
    if (story === 'revealed') return 'revealed';
    if (story === 'revealing') return 'settling';
    if (hold.state === 'idle') return 'idle';
    return 'scanning';
  };

  const travelDelay = (i: number) =>
    story === 'returning' ? (CHIP_COUNT - 1 - i) * STAGGER_REVERSE : i * STAGGER;

  return (
    <div className="screen" style={{ background: 'var(--layer-1)' }}>
      <div
        ref={viewportRef}
        className={`camera-viewport${feedDark ? ' is-dark-feed' : ''}`}
        onPointerDown={cameraReady && !inputLocked && !isCaptured ? hold.start : undefined}
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
        <canvas
          ref={canvasRef}
          className={[
            'camera-frame',
            isCaptured || frameReleasing ? '' : 'is-hidden',
            frameReleasing ? 'is-releasing' : '',
          ]
            .filter(Boolean)
            .join(' ')}
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
            <CaptureTarget
              label={targetLabel}
              glowRef={glowRef}
              ringRef={ringRef}
              exiting={cardExiting}
              pressed={hold.state === 'holding' && !reduced}
              animate={!reduced}
            />
            {Array.from({ length: CHIP_COUNT }, (_, i) => {
              const swatch = detected[i] ?? null;
              const slot = CHIP_LAYOUT[i];
              const dest = chipPlacements[i] ?? slot;
              return (
                <CaptureChip
                  key={i}
                  index={i}
                  phase={chipPhase()}
                  slot={slot.position}
                  slotAnchor={slot.anchor}
                  destination={dest.position}
                  destAnchor={dest.anchor}
                  swatch={swatch}
                  saved={Boolean(swatch && savedIds.has(swatch.id))}
                  copied={Boolean(swatch && copiedId === swatch.id)}
                  animate={!reduced}
                  travelDelay={travelDelay(i)}
                  sizerRef={(el) => {
                    sizerRefs.current[i] = el;
                  }}
                  onToggle={swatch ? () => toggleChip(swatch) : () => {}}
                  onCopy={swatch ? () => copyChip(swatch) : () => {}}
                />
              );
            })}
          </>
        )}

        {failed && (
          <button type="button" className="capture-card capture-card--error" onClick={onRetake}>
            <span className="capture-card__label">
              Unable to collect colors. Tap to try again.
            </span>
          </button>
        )}

        {isCaptured &&
          !failed &&
          (story === 'revealing' || story === 'revealed' || story === 'returning') && (
            <button
              type="button"
              className={`retake-btn text-heading-1${
                reduced
                  ? ''
                  : story === 'returning'
                    ? ' retake-btn--exit'
                    : ' retake-btn--enter'
              }`}
              onClick={onRetake}
              disabled={story === 'returning'}
            >
              Tap to retake
            </button>
          )}

        <div ref={flashRef} className="capture-flash" aria-hidden="true" />

        {canSwitch && cameraReady && (
          <button
            type="button"
            className="switch-camera-btn"
            aria-label="Switch camera"
            disabled={isCaptured || inputLocked}
            onClick={onSwitchCamera}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SwitchCameraIcon disabled={isCaptured || inputLocked} />
          </button>
        )}
      </div>

      {toast && (
        <div className="capture-toast-layer" aria-live="polite">
          <div
            key={toastEpoch}
            className={`capture-toast text-heading-1${toastExiting ? ' is-exiting' : ''}${
              reduced ? ' is-reduced' : ''
            }`}
          >
            {toast}
          </div>
        </div>
      )}

      <BottomNav view="camera" onChange={onNavChange} />
    </div>
  );
}
