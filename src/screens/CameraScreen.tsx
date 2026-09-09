import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import CaptureTarget from '../components/CaptureTarget';
import CaptureChip from '../components/FloatingChip';
import SwitchCameraIcon from '../components/SwitchCameraIcon';
import { copyText } from '../lib/clipboard';
import { useCamera } from '../hooks/useCamera';
import { useColorExtraction } from '../hooks/useColorExtraction';
import { useHoldTimer } from '../hooks/useHoldTimer';
import { usePinchZoom } from '../hooks/usePinchZoom';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useFeedLuminance } from '../hooks/useFeedLuminance';
import {
  ANALYZE_FLOOR_MS,
  DUR_BASE,
  DUR_FLASH,
  DUR_QUICK,
  EASE_SNAP,
  HOLD_THRESHOLD_MS,
  LOADER_SHOW_DELAY_MS,
  STAGGER,
  STAGGER_REVERSE,
} from '../capture/motion';
import { NO_ZOOM, coverPointToNorm, coverZoomCrop } from '../capture/videoCoords';
import type { ZoomTransform } from '../capture/videoCoords';
import type { ChipAnchor, ChipPhase } from '../components/FloatingChip';
import type { Swatch } from '../types';

interface Props {
  savedIds: Set<string>;
  /** Add if not saved, remove if saved (the chip bookmark toggle). */
  onToggleSave: (swatch: Swatch) => void;
}

interface ChipLayout {
  position: { left: string; top: string };
  anchor: ChipAnchor;
}

interface Size {
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

/** Forward morph / reverse retake. `live` covers idle, holding, and analyzing. */
type Story = 'live' | 'revealing' | 'revealed' | 'returning';

/** Hold/analyzing loader count. Reveal uses `detected.length` (1–3 today, cap 6). */
const CHIP_COUNT = 3;

/** Loader pills are absent until a hold is committed, then fade out on cancel. */
type ChipGate = 'hidden' | 'in' | 'out';
const MAX_CHIPS = 6;

// Hold/analyze seats and null-anchor fallback. Positions live as CSS variables on
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

// Pointer travel (px) allowed before a press on the captured frame stops
// counting as a "tap to retake" — a dragged chip must never retake.
const TAP_SLOP = 10;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const RING_EMPTY = '1';
const RING_FULL = '0';
/** Half of a ~200ms feed crossfade; maps onto DUR_QUICK (160 × 5/8). */
const FEED_FADE_MS = (DUR_QUICK * 5) / 8;

/**
 * The capture moment wired to the real extraction pipeline. Hold progress
 * paints a cream ring from the hold timer's onTick; on capture the flash +
 * freeze punch still snap, then a minimum analyzing beat lets them finish
 * before the loader pills morph into hex chips (count follows the merged
 * palette, so a two-color scene does not leave a blank third slot). Loader
 * pills stay off the idle viewfinder; they fade in after a short hold beat
 * so a tap does not flash them. Retake plays that sequence backward.
 */
export default function CameraScreen({ savedIds, onToggleSave }: Props) {
  const reduced = usePrefersReducedMotion();
  const {
    videoRef,
    status: cameraStatus,
    error: cameraError,
    canSwitch,
    switching,
    switchCamera,
    focusAt,
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
  // Where the user has dragged each revealed chip (center, viewport px).
  // Overrides the blob anchor until the next retake.
  const [chipDrags, setChipDrags] = useState<(Point | null)[]>([]);
  // Loader pills: hidden on the idle viewfinder, in after a hold beat,
  // out while fading after a cancelled hold.
  const [chipGate, setChipGate] = useState<ChipGate>('hidden');

  const viewportRef = useRef<HTMLDivElement>(null);
  const feedLayerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const switchFreezeRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGRectElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const sizerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const capturedAtRef = useRef(0);
  const flipLockRef = useRef(false);
  const wasSwitchingRef = useRef(false);
  const [feedFaded, setFeedFaded] = useState(false);
  const [freezeOn, setFreezeOn] = useState(false);
  const [switchRotation, setSwitchRotation] = useState(0);
  const [reticle, setReticle] = useState<{ id: number; x: number; y: number } | null>(
    null,
  );
  const reticleIdRef = useRef(0);

  // Live digital zoom. Owned here (not inside usePinchZoom) so the capture and
  // tap-to-focus paths can read it regardless of hook ordering.
  const zoomRef = useRef<ZoomTransform>(NO_ZOOM);
  // Where a press on the captured frame started, for tap-vs-drag on retake.
  const tapRef = useRef<{ id: number; x: number; y: number } | null>(null);
  // Chip center (viewport px) when the current chip drag began.
  const dragBaseRef = useRef<Point | null>(null);

  const accentRef = useRef('#0095cc');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toastDwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastExitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastLiveRef = useRef(false);
  const loaderShowRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detected = useMemo<Swatch[]>(() => {
    if (!result) return [];
    return result.clusters.slice(0, MAX_CHIPS).map((cluster) => {
      const hex = cluster.hex.replace('#', '');
      return { id: `detected-${hex}`, hex };
    });
  }, [result]);

  // Hold/analyze shows the default three loaders. Once extraction lands, reveal,
  // stagger, and retake follow the merged cluster count — never a blank extra
  // slot, never more than MAX_CHIPS.
  const chipCount = detected.length > 0 ? detected.length : CHIP_COUNT;

  // Where each chip actually lands. When a color has a real anchor and the
  // viewport is measured, its normalized image-space position is pushed through
  // the same object-fit:cover transform the frozen frame is drawn with, then the
  // chip's center is clamped by half its measured size (+margin) so the whole
  // pill stays on screen. Otherwise it falls back to the fixed CHIP_LAYOUT slot.
  // Chip position is the blob centroid; hex is a blob-core reading of that
  // same region (see color/types.ts). Chip overlap is out of scope.
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

  // A dragged chip owns its position outright: the user has overruled the blob
  // anchor, so it stays put until the next retake clears the override.
  const chipDestinations = useMemo<ChipLayout[]>(() => {
    return chipPlacements.map((placement, i) => {
      const drag = chipDrags[i];
      if (!drag || !viewportBox.w || !viewportBox.h) return placement;
      return {
        position: {
          left: `${(drag.x / viewportBox.w) * 100}%`,
          top: `${(drag.y / viewportBox.h) * 100}%`,
        },
        anchor: 'center' as const,
      };
    });
  }, [chipPlacements, chipDrags, viewportBox]);

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

  // Captures what the user can actually see: the sensor is cropped to the
  // zoomed viewfinder, so extraction (and every blob anchor derived from it)
  // is in the same space as the frozen frame the chips land on.
  const grabFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return false;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return false;

    const viewport = viewportRef.current;
    const crop =
      coverZoomCrop(
        viewport?.clientWidth ?? 0,
        viewport?.clientHeight ?? 0,
        width,
        height,
        zoomRef.current,
      ) ?? { sx: 0, sy: 0, sw: width, sh: height };

    canvas.width = crop.sw;
    canvas.height = crop.sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);

    extract(ctx.getImageData(0, 0, crop.sw, crop.sh));
    return true;
  }, [extract, videoRef]);

  const capture = useCallback(() => {
    capturedAtRef.current = performance.now();
    paintRing(RING_FULL);
    setReticle(null);

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

  const cameraReady = cameraStatus === 'ready';
  const isCaptured = hold.state === 'captured';
  const inputLocked = story === 'returning' || story === 'revealing';
  const failed =
    isCaptured &&
    story === 'live' &&
    (grabFailed ||
      extractStatus === 'error' ||
      (extractStatus === 'done' && detected.length === 0));
  // Once the frame is frozen, the viewport itself is the retake target —
  // everything on it except a filled swatch container.
  const canTapRetake = isCaptured && !failed && (story === 'revealing' || story === 'revealed');
  const feedDark = useFeedLuminance(videoRef, cameraReady && story === 'live' && !isCaptured);

  useEffect(() => {
    const glow = glowRef.current;
    if (glow) glow.classList.toggle('is-pulsing', hold.state === 'holding');
    if (hold.state === 'idle') paintRing(RING_EMPTY);
    if (hold.state === 'captured') paintRing(RING_FULL);
  }, [hold.state, paintRing]);

  // Loader pills stay off the idle viewfinder. A short beat after hold starts
  // they fade in (scramble already rolling); a lift before capture fades them
  // out. Capture keeps them up so they can morph into filled chips.
  useEffect(() => {
    if (hold.state === 'holding') {
      setChipGate((gate) => (gate === 'hidden' ? gate : 'in'));
      loaderShowRef.current = setTimeout(() => {
        loaderShowRef.current = null;
        setChipGate('in');
      }, LOADER_SHOW_DELAY_MS);
      return () => {
        if (loaderShowRef.current) {
          clearTimeout(loaderShowRef.current);
          loaderShowRef.current = null;
        }
      };
    }

    if (hold.state === 'captured') {
      setChipGate('in');
      return;
    }

    setChipGate((gate) => {
      if (gate === 'hidden' || gate === 'out') return gate;
      return reduced ? 'hidden' : 'out';
    });
  }, [hold.state, reduced]);

  useEffect(() => {
    if (chipGate !== 'out') return;
    const t = setTimeout(() => setChipGate('hidden'), DUR_QUICK);
    return () => clearTimeout(t);
  }, [chipGate]);

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
    const lastStagger = Math.max(0, chipCount - 1) * STAGGER;
    const t = setTimeout(() => setStory('revealed'), DUR_BASE + lastStagger);
    return () => clearTimeout(t);
  }, [story, chipCount]);

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
    setChipDrags([]);
    setChipGate('hidden');
    if (loaderShowRef.current) {
      clearTimeout(loaderShowRef.current);
      loaderShowRef.current = null;
    }
    sizerRefs.current = [];
    dragBaseRef.current = null;
    capturedAtRef.current = 0;
    setReticle(null);
    const viewport = viewportRef.current;
    if (viewport) viewport.style.transform = 'scale(1)';
    resetVisuals();
  }, [clearTimers, hold, resetExtraction, resetVisuals]);

  const onHoldEnd = useCallback(() => {
    if (hold.state !== 'holding') return;
    hold.cancel();
    resetVisuals();
  }, [hold, resetVisuals]);

  const onReticleDone = useCallback((id: number) => {
    setReticle((current) => (current?.id === id ? null : current));
  }, []);

  // A second finger means the user is framing, not swatching — drop the hold
  // so a pinch can never trip the capture.
  const onPinchStart = useCallback(() => {
    if (hold.state === 'holding') hold.cancel();
    resetVisuals();
    setReticle(null);
  }, [hold, resetVisuals]);

  const {
    pointerCount: fingersDown,
    onPointerDown: onPinchPointerDown,
    onPointerUp: onPinchPointerUp,
    reset: resetZoom,
  } = usePinchZoom({
    enabled: cameraReady && !isCaptured && !inputLocked && !switching,
    viewportRef,
    layerRef: feedLayerRef,
    transformRef: zoomRef,
    onPinchStart,
  });

  const paintSwitchFreeze = useCallback(() => {
    const video = videoRef.current;
    const canvas = switchFreezeRef.current;
    if (!video || !canvas) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
  }, [videoRef]);

  const onSwitchCamera = useCallback(() => {
    if (flipLockRef.current || switching) return;

    const wasHolding = hold.state === 'holding';
    if (wasHolding) {
      hold.cancel();
      resetVisuals();
    }
    if (!reduced) setSwitchRotation((deg) => deg + 180);

    // The other camera has its own framing, so zoom does not carry over. The
    // reset rides the fade-out, where the layer is already invisible — snapping
    // it while the frozen flip frame is on screen would read as a glitch.
    const startFlip = () => {
      flipLockRef.current = true;
      if (reduced) {
        resetZoom();
        switchCamera();
        return;
      }
      paintSwitchFreeze();
      setFreezeOn(true);
      setFeedFaded(true);
      after(FEED_FADE_MS, () => {
        resetZoom();
        switchCamera();
      });
    };

    // Keep CaptureTarget mounted through the press-in spring-back (160ms)
    // before the stream swap drops the old feed.
    if (wasHolding && !reduced) {
      after(DUR_QUICK, startFlip);
    } else {
      startFlip();
    }
  }, [after, hold, paintSwitchFreeze, reduced, resetVisuals, resetZoom, switchCamera, switching]);

  useEffect(() => {
    if (switching) {
      wasSwitchingRef.current = true;
      return;
    }
    if (!wasSwitchingRef.current) return;
    wasSwitchingRef.current = false;
    setFreezeOn(false);
    setFeedFaded(false);
    flipLockRef.current = false;
  }, [switching]);

  const onRetake = useCallback(() => {
    if (story === 'returning') return;
    if (reduced || story === 'live') {
      instantReset();
      return;
    }
    clearTimers();
    setStory('returning');
    const cardInAt = STAGGER_REVERSE * Math.max(0, chipCount - 1);
    after(cardInAt, () => {
      setCardExiting(false);
      setFrameReleasing(true);
    });
    after(cardInAt + DUR_BASE, instantReset);
  }, [story, reduced, instantReset, clearTimers, after, chipCount]);

  const onViewportPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      onPinchPointerDown(event);

      // Captured: the press is a candidate retake tap. Filled chips stop their
      // own pointers from reaching here, so anything that arrives is "not a
      // swatch container".
      if (isCaptured) {
        tapRef.current = canTapRetake
          ? { id: event.pointerId, x: event.clientX, y: event.clientY }
          : null;
        return;
      }

      if (!cameraReady || inputLocked) return;
      // The second finger of a pinch must not start (or re-arm) a hold.
      if (fingersDown() > 1) return;

      hold.start();
      if (switching) return;

      const viewport = viewportRef.current;
      const video = videoRef.current;
      if (!viewport) return;

      const rect = viewport.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      reticleIdRef.current += 1;
      const id = reticleIdRef.current;
      setReticle({ id, x: px, y: py });

      const norm = coverPointToNorm(
        px,
        py,
        rect.width,
        rect.height,
        video?.videoWidth ?? 0,
        video?.videoHeight ?? 0,
        zoomRef.current,
      );
      if (norm) focusAt(norm.x, norm.y);
    },
    [
      cameraReady,
      canTapRetake,
      fingersDown,
      focusAt,
      hold,
      inputLocked,
      isCaptured,
      onPinchPointerDown,
      switching,
      videoRef,
    ],
  );

  const onViewportPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      onPinchPointerUp(event);
      onHoldEnd();

      const tap = tapRef.current;
      tapRef.current = null;
      if (!tap || tap.id !== event.pointerId || !canTapRetake) return;
      if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP) return;
      onRetake();
    },
    [canTapRetake, onHoldEnd, onPinchPointerUp, onRetake],
  );

  const onViewportPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      onPinchPointerUp(event);
      tapRef.current = null;
      onHoldEnd();
    },
    [onHoldEnd, onPinchPointerUp],
  );

  const onViewportPointerLeave = useCallback(() => {
    tapRef.current = null;
    onHoldEnd();
  }, [onHoldEnd]);

  const onChipDragStart = useCallback((rect: DOMRect) => {
    const viewport = viewportRef.current?.getBoundingClientRect();
    if (!viewport) return;
    dragBaseRef.current = {
      x: rect.left + rect.width / 2 - viewport.left,
      y: rect.top + rect.height / 2 - viewport.top,
    };
  }, []);

  // Same size-aware clamp the blob anchors use, so a dragged pill cannot be
  // pushed half off the viewport.
  const onChipDragMove = useCallback(
    (index: number, dx: number, dy: number) => {
      const base = dragBaseRef.current;
      if (!base || !viewportBox.w || !viewportBox.h) return;
      const size = chipSizes[index];
      const halfW = size ? size.w / 2 : 0;
      const halfH = size ? size.h / 2 : 0;
      const next = {
        x: clamp(base.x + dx, halfW + CHIP_MARGIN, viewportBox.w - halfW - CHIP_MARGIN),
        y: clamp(base.y + dy, halfH + CHIP_MARGIN, viewportBox.h - halfH - CHIP_MARGIN),
      };
      setChipDrags((prev) => {
        const drags = prev.slice();
        drags[index] = next;
        return drags;
      });
    },
    [chipSizes, viewportBox],
  );

  const onChipDragEnd = useCallback(() => {
    dragBaseRef.current = null;
  }, []);

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
  useEffect(
    () => () => {
      if (loaderShowRef.current) clearTimeout(loaderShowRef.current);
    },
    [],
  );

  const showTarget = cameraReady && !failed;
  const targetLabel =
    hold.state === 'holding'
      ? 'Swatching'
      : hold.state === 'captured' && story !== 'returning'
        ? 'Reading colors'
        : 'Hold to swatch';

  const chipPhase = (): ChipPhase => {
    if (story === 'returning') return 'returning';
    if (story === 'revealed') return 'revealed';
    if (story === 'revealing') return 'settling';
    // Keep reels rolling through a cancelled-hold fade-out.
    if (hold.state === 'idle' && chipGate !== 'out') return 'idle';
    return 'scanning';
  };

  const travelDelay = (i: number) =>
    story === 'returning' ? (chipCount - 1 - i) * STAGGER_REVERSE : i * STAGGER;

  // Only `in` / `out` mount chips. Idle + live never does, even if gate is stale
  // (HMR hook-order shift used to leave a non-'hidden' value and keep the pills).
  const showChips =
    chipGate === 'out' ||
    (chipGate === 'in' && (hold.state !== 'idle' || story !== 'live'));

  return (
    <div className="screen" style={{ background: 'var(--layer-1)' }}>
      <div
        ref={viewportRef}
        className={`camera-viewport${feedDark ? ' is-dark-feed' : ''}`}
        onPointerDown={onViewportPointerDown}
        onPointerUp={onViewportPointerUp}
        onPointerLeave={onViewportPointerLeave}
        onPointerCancel={onViewportPointerCancel}
      >
        <div
          ref={feedLayerRef}
          className={[
            'camera-feed-layer',
            cameraReady ? '' : 'is-hidden',
            feedFaded ? 'is-faded' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <video ref={videoRef} className="camera-feed" autoPlay muted playsInline />
          <canvas
            ref={switchFreezeRef}
            className={`camera-feed camera-switch-freeze${freezeOn ? ' is-on' : ''}`}
            aria-hidden="true"
          />
        </div>
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
            {showChips &&
              Array.from({ length: chipCount }, (_, i) => {
                const swatch = detected[i] ?? null;
                const slot = CHIP_LAYOUT[i % CHIP_LAYOUT.length];
                const dest = chipDestinations[i] ?? slot;
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
                    gate={chipGate === 'out' ? 'out' : 'in'}
                    sizerRef={(el) => {
                      sizerRefs.current[i] = el;
                    }}
                    onToggle={swatch ? () => toggleChip(swatch) : () => {}}
                    onCopy={swatch ? () => copyChip(swatch) : () => {}}
                    onDragStart={onChipDragStart}
                    onDragMove={(dx, dy) => onChipDragMove(i, dx, dy)}
                    onDragEnd={onChipDragEnd}
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

        {reticle && (
          <div
            key={reticle.id}
            className={`focus-reticle${reduced ? ' is-reduced' : ''}`}
            style={{ left: reticle.x, top: reticle.y }}
            aria-hidden="true"
            onAnimationEnd={() => onReticleDone(reticle.id)}
          />
        )}

        {canSwitch && cameraReady && (
          <button
            type="button"
            className="switch-camera-btn"
            aria-label="Switch camera"
            disabled={isCaptured || inputLocked}
            onClick={onSwitchCamera}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SwitchCameraIcon
              disabled={isCaptured || inputLocked}
              rotation={switchRotation}
              animate={!reduced}
            />
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
    </div>
  );
}
