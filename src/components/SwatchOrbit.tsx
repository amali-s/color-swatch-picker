import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { MAX_ZOOM, MIN_ZOOM, usePinchZoom } from '../hooks/usePinchZoom';
import { NO_ZOOM, clampZoomTransform, viewportPointToLayer } from '../capture/videoCoords';
import type { ZoomTransform } from '../capture/videoCoords';
import { DUR_BASE, DUR_FLASH } from '../capture/motion';
import type { Swatch } from '../types';

interface Props {
  swatches: Swatch[];
  onRemove: (id: string) => void;
  onAnnounce: (message: string) => void;
  /** Fade up alongside the heading during the empty→filled ceremony. */
  entering?: boolean;
}

interface Placed {
  id: string;
  hex: string;
  hue: number;
  /** Distance from center as a percentage of the wheel's diameter. */
  radiusPct: number;
}

/** One slow revolution every ORBIT_SECONDS; still under reduced motion. */
const ORBIT_SECONDS = 130;
/**
 * Chip distance from center, as a % of the wheel's diameter: desaturated
 * core → saturated rim. The max is held well inside the rim because the wheel
 * bleeds past the screen edges — at 38% even a rim chip at 3 or 9 o'clock
 * stays fully on screen at 1×.
 */
const RADIUS_MIN = 22;
const RADIUS_MAX = 38;
/**
 * On-screen center-to-center clearance between chips (px). Chip tap boxes
 * floor at 44px (see .swatch-orbit__chip), so 50px keeps two touch targets
 * from overlapping. Chips are counter-scaled against zoom (they stay the same
 * size on screen, like map pins), so zooming in genuinely spreads a crowded
 * cluster apart instead of just magnifying the overlap.
 */
const CHIP_CLEARANCE_PX = 50;
/** Finger travel (px) before a press stops counting as a tap — matches Camera. */
const TAP_SLOP = 10;
/** Zoom multiplier for the − / + buttons. */
const BUTTON_ZOOM_STEP = 1.6;
/** Zoom must hold still this long (ms) before chip layout re-flows to it. */
const ZOOM_SETTLE_MS = 140;
const ZOOM_EPS = 0.001;

function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const n = Number.parseInt(raw, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hue (0–360) and saturation (0–1) for placing a swatch on the wheel. */
function hexToHueSat(hex: string): { h: number; s: number } {
  const rgb = parseHex(hex);
  if (!rgb) return { h: 0, s: 0 };
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s };
}

/**
 * Lays every swatch out by true hue (angle) and saturation (distance from
 * center), then nudges hue apart along each swatch's own ring just enough to
 * clear near neighbors. Radius (which carries real color meaning) never
 * moves — only the angle bends a little to resolve crowding.
 *
 * `minDist` is the required clearance as a fraction of the wheel diameter; it
 * shrinks as the user zooms in, so nudged chips relax back toward their true
 * hue once there is room.
 */
function computePlacements(swatches: Swatch[], minDist: number): Placed[] {
  const base = swatches.map((s) => {
    const { h, s: sat } = hexToHueSat(s.hex);
    return { id: s.id, hex: s.hex, hue: h, radiusPct: RADIUS_MIN + sat * (RADIUS_MAX - RADIUS_MIN) };
  });

  const DEG = 180 / Math.PI;
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let i = 0; i < base.length; i++) {
      for (let j = i + 1; j < base.length; j++) {
        const a = base[i];
        const b = base[j];
        const ar = a.radiusPct / 100;
        const br = b.radiusPct / 100;
        const d = Math.hypot(
          ar * Math.cos(a.hue / DEG) - br * Math.cos(b.hue / DEG),
          ar * Math.sin(a.hue / DEG) - br * Math.sin(b.hue / DEG),
        );
        if (d >= minDist) continue;
        const push = (minDist - d) / 2 + 0.002;
        const diff = ((b.hue - a.hue + 540) % 360) - 180;
        const dir = diff >= 0 ? 1 : -1;
        a.hue -= dir * (push / ar) * DEG;
        b.hue += dir * (push / br) * DEG;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return base;
}

/** The transform that zooms to `zoom` while keeping viewport point (px, py) fixed. */
function zoomAbout(
  zoom: number,
  px: number,
  py: number,
  base: ZoomTransform,
  w: number,
  h: number,
): ZoomTransform {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const anchor = viewportPointToLayer(px, py, w, h, base);
  return clampZoomTransform(
    { zoom: z, tx: px - w / 2 - (anchor.x - w / 2) * z, ty: py - h / 2 - (anchor.y - h / 2) * z },
    w,
    h,
    MIN_ZOOM,
    MAX_ZOOM,
  );
}

/**
 * The "Saved swatches" view as a color wheel: each swatch orbits at the angle
 * of its true hue and the distance its saturation earns — pale colors settle
 * near the core, bold ones ride out toward the rim. Replaces the plain
 * vertical list so the collection reads as a palette, not a log.
 *
 * Mobile-first:
 * - The wheel runs full-bleed and slightly past both screen edges.
 * - Two-finger pinch zooms (the same `usePinchZoom` the camera uses, so the
 *   gesture feels identical across tabs); once zoomed, one finger pans.
 *   − / + buttons are the single-pointer alternative, and ctrl/trackpad-pinch
 *   wheel events zoom on desktop.
 * - Chip tap boxes floor at 44px, and a press that drags or pinches never
 *   counts as a tap.
 * - Tapping a chip opens a thumb-reachable bottom sheet with Copy / Remove.
 *
 * Spin and zoom are painted imperatively (CSS custom properties on refs) so
 * neither re-renders React every frame — the same approach the camera's hold
 * ring and pinch zoom take.
 */
export default function SwatchOrbit({ swatches, onRemove, onAnnounce, entering = false }: Props) {
  const reduced = usePrefersReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ZoomTransform>(NO_ZOOM);

  const [stageSize, setStageSize] = useState(400);
  /** Committed zoom — updates once a gesture settles, not every frame. */
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [ready, setReady] = useState(false);
  const [detail, setDetail] = useState<Swatch | null>(null);
  const detailRef = useRef<Swatch | null>(null);
  detailRef.current = detail;
  const [sheetPhase, setSheetPhase] = useState<'in' | 'out'>('in');
  const [copied, setCopied] = useState(false);

  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const tapRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const panRef = useRef<{ id: number; x: number; y: number; tx: number; ty: number } | null>(null);
  const suppressClickRef = useRef(false);
  const tweenRef = useRef<{ from: ZoomTransform; to: ZoomTransform; start: number } | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    pointerCount,
    onPointerDown: pinchPointerDown,
    onPointerUp: pinchPointerUp,
  } = usePinchZoom({
    enabled: !detail,
    viewportRef,
    layerRef,
    transformRef,
    onPinchStart: () => {
      suppressClickRef.current = true;
      panRef.current = null;
      tweenRef.current = null;
    },
  });

  const placed = useMemo(
    () => computePlacements(swatches, CHIP_CLEARANCE_PX / (stageSize * zoom)),
    [swatches, stageSize, zoom],
  );

  /** Same transform format usePinchZoom paints, so both can drive the layer. */
  const paintLayer = useCallback(() => {
    const el = layerRef.current;
    if (!el) return;
    const { zoom: z, tx, ty } = transformRef.current;
    el.style.transform = z === 1 && tx === 0 && ty === 0 ? '' : `translate(${tx}px, ${ty}px) scale(${z})`;
  }, []);

  // Track the stage's laid-out diameter (transforms don't affect this), which
  // converts the px chip clearance into a fraction of the wheel.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageSize(el.offsetWidth || 400));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Node re-flow transitions only after first paint, so mounting (and the
  // first stage measurement) never plays a settle animation.
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  // One frame loop for everything continuous: button-zoom tweens, syncing
  // --zoom (chip counter-scale) to whatever transform is live, committing the
  // zoom once it settles, and the slow spin — which eases to a stop while a
  // finger is down, a mouse hovers/keyboard focuses a chip, the sheet is open,
  // or the wheel is zoomed (orbiting under a zoomed view is disorienting).
  useEffect(() => {
    const baseSpeed = reduced ? 0 : 360 / ORBIT_SECONDS;
    let speed = baseSpeed;
    let deg = 0;
    let lastTs: number | null = null;
    let paintedZoom = Number.NaN;
    let paintedSpin = '';
    let changedAt = 0;
    let raf = 0;

    const frame = (ts: number) => {
      const tween = tweenRef.current;
      if (tween) {
        const p = Math.min(1, Math.max(0, (ts - tween.start) / DUR_BASE));
        const e = 1 - (1 - p) ** 4; // snappy ease-out, close to EASE_SNAP
        transformRef.current = {
          zoom: tween.from.zoom + (tween.to.zoom - tween.from.zoom) * e,
          tx: tween.from.tx + (tween.to.tx - tween.from.tx) * e,
          ty: tween.from.ty + (tween.to.ty - tween.from.ty) * e,
        };
        if (p >= 1) {
          transformRef.current = tween.to;
          tweenRef.current = null;
        }
        paintLayer();
      }

      const z = transformRef.current.zoom;
      if (z !== paintedZoom) {
        viewportRef.current?.style.setProperty('--zoom', String(z));
        paintedZoom = z;
        changedAt = ts;
      }
      if (
        Math.abs(z - zoomRef.current) > ZOOM_EPS &&
        pointerCount() === 0 &&
        !tweenRef.current &&
        ts - changedAt > ZOOM_SETTLE_MS
      ) {
        zoomRef.current = z;
        setZoom(z);
      }

      if (baseSpeed > 0) {
        if (lastTs !== null) {
          const dt = Math.min((ts - lastTs) / 1000, 0.1);
          const paused =
            pointerCount() > 0 ||
            hoverRef.current ||
            focusRef.current ||
            detailRef.current !== null ||
            z > 1 + ZOOM_EPS;
          const target = paused ? 0 : baseSpeed;
          speed += (target - speed) * Math.min(1, dt * 5);
          if (target === 0 && speed < 0.002) speed = 0;
          deg = (deg + speed * dt) % 360;
        }
        lastTs = ts;
        const v = `${deg.toFixed(3)}deg`;
        if (v !== paintedSpin) {
          spinRef.current?.style.setProperty('--spin', v);
          paintedSpin = v;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced, paintLayer, pointerCount]);

  const zoomTo = useCallback(
    (target: (base: ZoomTransform, w: number, h: number) => ZoomTransform) => {
      const el = viewportRef.current;
      if (!el) return;
      const base = tweenRef.current?.to ?? transformRef.current;
      const next = target(base, el.clientWidth, el.clientHeight);
      if (reduced) {
        tweenRef.current = null;
        transformRef.current = next;
        paintLayer();
        return;
      }
      tweenRef.current = { from: transformRef.current, to: next, start: performance.now() };
    },
    [paintLayer, reduced],
  );

  const zoomBy = useCallback(
    (factor: number) => zoomTo((base, w, h) => zoomAbout(base.zoom * factor, w / 2, h / 2, base, w, h)),
    [zoomTo],
  );

  const resetZoom = useCallback(() => zoomTo(() => NO_ZOOM), [zoomTo]);

  const onViewportPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      pinchPointerDown(event);
      const count = pointerCount();
      if (count === 1) {
        suppressClickRef.current = false;
        tapRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        tweenRef.current = null; // grabbing the wheel interrupts a button zoom
        if (zoomRef.current > 1 + ZOOM_EPS) {
          const t = transformRef.current;
          panRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, tx: t.tx, ty: t.ty };
        }
      } else if (count >= 2) {
        suppressClickRef.current = true;
        panRef.current = null;
      }
    },
    [pinchPointerDown, pointerCount],
  );

  // One-finger pan once zoomed, plus tap-vs-drag bookkeeping. Tracked on the
  // window because a dragging finger routinely slides off the wheel.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const tap = tapRef.current;
      if (tap && tap.id === event.pointerId) {
        if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP) {
          suppressClickRef.current = true;
        }
      }
      const pan = panRef.current;
      if (!pan || pan.id !== event.pointerId) return;
      if (pointerCount() >= 2) {
        panRef.current = null;
        return;
      }
      const el = viewportRef.current;
      if (!el) return;
      transformRef.current = clampZoomTransform(
        {
          zoom: transformRef.current.zoom,
          tx: pan.tx + (event.clientX - pan.x),
          ty: pan.ty + (event.clientY - pan.y),
        },
        el.clientWidth,
        el.clientHeight,
        MIN_ZOOM,
        MAX_ZOOM,
      );
      paintLayer();
      if (event.cancelable) event.preventDefault();
    };
    const onRelease = (event: PointerEvent) => {
      if (tapRef.current?.id === event.pointerId) tapRef.current = null;
      if (panRef.current?.id === event.pointerId) panRef.current = null;
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onRelease);
    window.addEventListener('pointercancel', onRelease);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('pointercancel', onRelease);
    };
  }, [paintLayer, pointerCount]);

  // At 1× the wheel keeps `touch-action: pan-y` so a one-finger swipe still
  // scrolls the page. Pointer events can't cancel a scroll, so a non-passive
  // touchmove stops the browser from scrolling or page-zooming the moment a
  // second finger is down (and always once zoomed, where one finger pans).
  // Desktop: ctrl + wheel (what trackpad pinch sends) zooms about the cursor.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onTouchMove = (event: TouchEvent) => {
      if (detailRef.current) return;
      if ((event.touches.length >= 2 || zoomRef.current > 1 + ZOOM_EPS) && event.cancelable) {
        event.preventDefault();
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || detailRef.current) return;
      event.preventDefault();
      tweenRef.current = null;
      const rect = el.getBoundingClientRect();
      // Trackpad pinch sends small deltas; a mouse-wheel notch is ~100.
      // Clamp per event so one notch is ~1.6×, not a jump straight to max.
      const delta = Math.max(-50, Math.min(50, event.deltaY));
      transformRef.current = zoomAbout(
        transformRef.current.zoom * Math.exp(-delta * 0.01),
        event.clientX - rect.left,
        event.clientY - rect.top,
        transformRef.current,
        el.clientWidth,
        el.clientHeight,
      );
      paintLayer();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('wheel', onWheel);
    };
  }, [paintLayer]);

  const openDetail = useCallback((swatch: Swatch) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setDetail(swatch);
    setSheetPhase('in');
    setCopied(false);
  }, []);

  const closeDetail = useCallback(() => {
    if (!detailRef.current) return;
    setSheetPhase('out');
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setDetail(null), reduced ? 0 : DUR_FLASH);
  }, [reduced]);

  const handleCopy = useCallback(async () => {
    if (!detail) return;
    const ok = await copyText(`#${detail.hex}`);
    if (!ok) return; // clipboard blocked — no false "Copied" feedback
    setCopied(true);
    onAnnounce(`Copied #${detail.hex}`);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1200);
  }, [detail, onAnnounce]);

  const handleRemove = useCallback(() => {
    if (!detail) return;
    onRemove(detail.id);
    onAnnounce(`Removed #${detail.hex}`);
    closeDetail();
  }, [detail, onRemove, onAnnounce, closeDetail]);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  // Sheet focus: move into it on open, hand focus back to the chip on close.
  useEffect(() => {
    if (!detail) return;
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [detail, closeDetail]);

  const zoomed = zoom > 1 + ZOOM_EPS;

  return (
    <>
      <div className={`swatch-orbit${entering ? ' is-entering' : ''}`}>
        <div
          ref={viewportRef}
          className={['swatch-orbit__viewport', zoomed ? 'is-zoomed' : '', ready ? 'is-ready' : '']
            .filter(Boolean)
            .join(' ')}
          onPointerDown={onViewportPointerDown}
          onPointerUp={pinchPointerUp}
          onPointerOver={(e) => {
            if (e.pointerType === 'mouse') {
              hoverRef.current = Boolean((e.target as Element).closest?.('.swatch-orbit__chip'));
            }
          }}
          onPointerLeave={() => {
            hoverRef.current = false;
          }}
          onFocus={(e) => {
            focusRef.current = Boolean((e.target as Element).closest?.('.swatch-orbit__chip'));
          }}
          onBlur={() => {
            focusRef.current = false;
          }}
        >
          <div ref={layerRef} className="swatch-orbit__layer">
            <div ref={stageRef} className="swatch-orbit__stage">
              <div ref={spinRef} className="swatch-orbit__spin">
                <div className="swatch-orbit__wheel" aria-hidden="true" />
                {[0, 60, 120, 180, 240, 300].map((h) => (
                  <div
                    key={h}
                    className="swatch-orbit__tick"
                    style={{ '--tick-hue': h } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    <span>{{ 0: 'R', 60: 'Y', 120: 'G', 180: 'C', 240: 'B', 300: 'M' }[h]}</span>
                  </div>
                ))}
                {placed.map((p) => (
                  <div
                    key={p.id}
                    className="swatch-orbit__node"
                    style={
                      {
                        '--hue': p.hue.toFixed(2),
                        // A length in container-query units, not a percentage:
                        // this node's own box is 0×0, and percentages in
                        // `translate()` resolve against the element's own box.
                        '--radius': `${p.radiusPct.toFixed(2)}cqw`,
                      } as React.CSSProperties
                    }
                  >
                    <button
                      type="button"
                      className={`swatch-orbit__chip${detail?.id === p.id ? ' is-active' : ''}`}
                      style={{ '--hex': `#${p.hex}` } as React.CSSProperties}
                      aria-label={`View #${p.hex}`}
                      onClick={(e) => {
                        // detail 0 = keyboard activation, which is never a drag.
                        if (e.detail !== 0 && suppressClickRef.current) return;
                        openDetail({ id: p.id, hex: p.hex });
                      }}
                    >
                      <span className="swatch-orbit__chip-dot" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="swatch-orbit__hub" aria-hidden="true">
                <span className="swatch-orbit__hub-count">{swatches.length}</span>
                <span className="swatch-orbit__hub-label">
                  {swatches.length === 1 ? 'color' : 'colors'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="swatch-orbit__toolbar">
          {zoomed ? (
            <button type="button" className="swatch-orbit__reset text-heading-1" onClick={resetZoom}>
              Reset zoom
            </button>
          ) : (
            <p className="swatch-orbit__hint text-body-1">Tap a color · pinch to zoom</p>
          )}
          <div className="swatch-orbit__zoom" role="group" aria-label="Zoom">
            <button
              type="button"
              className="swatch-orbit__zoom-btn"
              aria-label="Zoom out"
              disabled={!zoomed}
              onClick={() => zoomBy(1 / BUTTON_ZOOM_STEP)}
            >
              −
            </button>
            <button
              type="button"
              className="swatch-orbit__zoom-btn"
              aria-label="Zoom in"
              disabled={zoom >= MAX_ZOOM - ZOOM_EPS}
              onClick={() => zoomBy(BUTTON_ZOOM_STEP)}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Siblings of .swatch-orbit (not children) so they position against
          .screen — the whole phone screen — rather than the wheel, and so
          the wheel's overflow clip and container can never trap them. */}
      {detail && (
        <>
          <div
            className={`swatch-orbit__scrim${sheetPhase === 'out' ? ' is-exiting' : ''}`}
            onClick={closeDetail}
            aria-hidden="true"
          />
          <div
            ref={sheetRef}
            className={`swatch-orbit__sheet${sheetPhase === 'out' ? ' is-exiting' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={`#${detail.hex}`}
          >
            <span className="swatch-orbit__sheet-grip" aria-hidden="true" />
            <div className="swatch-orbit__sheet-row">
              <span className="swatch-orbit__sheet-swatch" style={{ background: `#${detail.hex}` }} />
              <span className="swatch-orbit__sheet-hex">#{detail.hex}</span>
            </div>
            <div className="swatch-orbit__sheet-actions">
              <button
                type="button"
                className="swatch-orbit__sheet-btn swatch-orbit__sheet-btn--primary"
                onClick={handleCopy}
              >
                {copied ? 'Copied' : 'Copy hex'}
              </button>
              <button type="button" className="swatch-orbit__sheet-btn" onClick={handleRemove}>
                Remove
              </button>
            </div>
            <button type="button" className="swatch-orbit__sheet-close" onClick={closeDetail}>
              Done
            </button>
          </div>
        </>
      )}
    </>
  );
}
