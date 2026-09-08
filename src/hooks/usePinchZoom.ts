import { useCallback, useEffect, useRef } from 'react';
import {
  NO_ZOOM,
  clampZoomTransform,
  pinchStep,
  viewportPointToLayer,
} from '../capture/videoCoords';
import type { PinchStart, ZoomTransform } from '../capture/videoCoords';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

interface Options {
  /** Pinches are only started while this is true (live feed, not captured). */
  enabled: boolean;
  /** The element the gesture is measured against — also the transform's frame. */
  viewportRef: React.RefObject<HTMLElement | null>;
  /** The element the zoom transform is painted onto (the feed layer). */
  layerRef: React.RefObject<HTMLElement | null>;
  /**
   * Owned by the caller so the capture path can read the live transform
   * without depending on this hook's call order.
   */
  transformRef: React.RefObject<ZoomTransform>;
  /** Fired once when a second finger lands, so the caller can abort its hold. */
  onPinchStart?: () => void;
}

interface UsePinchZoomResult {
  /** Fingers currently down on the viewport. */
  pointerCount: () => number;
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  /** Snap back to 1x (camera flip). */
  reset: () => void;
}

/**
 * Two-finger pinch zoom for the camera preview, as a CSS transform on the feed
 * layer rather than a `MediaTrackConstraints.zoom` request — hardware zoom is
 * unevenly supported (absent on iOS Safari), and a transform is also what lets
 * the capture path crop the sensor to exactly what was on screen.
 *
 * Mapping is the phone-camera standard: fingers apart zooms in, together zooms
 * out. The layer point under the pinch midpoint stays under it, so the gesture
 * pans as well as scales; pan is clamped so the feed never uncovers the
 * viewport.
 *
 * The transform is painted imperatively (like the hold ring) so a pinch does
 * not re-render the capture screen every frame.
 */
export function usePinchZoom({
  enabled,
  viewportRef,
  layerRef,
  transformRef,
  onPinchStart,
}: Options): UsePinchZoomResult {
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  // A pinch belongs to the two fingers that started it, so a third finger
  // landing (or the first of three lifting) cannot swap the pair mid-gesture
  // and snap the zoom to a new ratio.
  const gestureRef = useRef<{ ids: [number, number]; start: PinchStart } | null>(null);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onPinchStartRef = useRef(onPinchStart);
  onPinchStartRef.current = onPinchStart;

  const paint = useCallback(() => {
    const el = layerRef.current;
    if (!el) return;
    const { zoom, tx, ty } = transformRef.current;
    el.style.transform =
      zoom === 1 && tx === 0 && ty === 0
        ? ''
        : `translate(${tx}px, ${ty}px) scale(${zoom})`;
  }, [layerRef, transformRef]);

  const reset = useCallback(() => {
    transformRef.current = NO_ZOOM;
    paint();
  }, [paint, transformRef]);

  /** Distance and viewport-relative midpoint of a pair of fingers. */
  const measure = useCallback((ids: [number, number], rect: DOMRect) => {
    const a = pointersRef.current.get(ids[0]);
    const b = pointersRef.current.get(ids[1]);
    if (!a || !b) return null;
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2 - rect.left,
      midY: (a.y + b.y) / 2 - rect.top,
    };
  }, []);

  const beginPinch = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    const [first, second] = [...pointersRef.current.keys()];
    if (first === undefined || second === undefined) return;

    const ids: [number, number] = [first, second];
    const measured = measure(ids, rect);
    // Two fingers landing on the same spot would make the ratio explode.
    if (!measured || measured.distance < 1) return;

    gestureRef.current = {
      ids,
      start: {
        distance: measured.distance,
        anchor: viewportPointToLayer(
          measured.midX,
          measured.midY,
          rect.width,
          rect.height,
          transformRef.current,
        ),
        transform: transformRef.current,
      },
    };
    onPinchStartRef.current?.();
  }, [measure, transformRef, viewportRef]);

  const updatePinch = useCallback(() => {
    const gesture = gestureRef.current;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!gesture || !rect) return;
    const measured = measure(gesture.ids, rect);
    if (!measured) return;

    transformRef.current = pinchStep(
      gesture.start,
      measured.distance,
      measured.midX,
      measured.midY,
      rect.width,
      rect.height,
      MIN_ZOOM,
      MAX_ZOOM,
    );
    paint();
  }, [measure, paint, transformRef, viewportRef]);

  const endGesture = useCallback(() => {
    gestureRef.current = null;
  }, []);

  /** End the pinch when either of its own fingers lifts. */
  const releasePointer = useCallback(
    (pointerId: number) => {
      pointersRef.current.delete(pointerId);
      if (gestureRef.current?.ids.includes(pointerId)) endGesture();
    },
    [endGesture],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!enabledRef.current) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointersRef.current.size === 2) beginPinch();
    },
    [beginPinch],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => releasePointer(event.pointerId),
    [releasePointer],
  );

  // Track moves and releases on the window: a pinching finger routinely slides
  // off the viewport (or off the page) mid-gesture.
  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!gestureRef.current) return;
      event.preventDefault();
      updatePinch();
    };
    const handleRelease = (event: PointerEvent) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      releasePointer(event.pointerId);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleRelease);
    window.addEventListener('pointercancel', handleRelease);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleRelease);
      window.removeEventListener('pointercancel', handleRelease);
    };
  }, [releasePointer, updatePinch]);

  // iOS Safari still drives its own page pinch-zoom through these non-standard
  // gesture events, over the top of `touch-action: none`. Suppress them on the
  // viewport alone so the rest of the app stays pinch-zoomable.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const swallow = (event: Event) => {
      if (enabledRef.current) event.preventDefault();
    };
    const names = ['gesturestart', 'gesturechange', 'gestureend'];
    names.forEach((name) => el.addEventListener(name, swallow, { passive: false }));
    return () => names.forEach((name) => el.removeEventListener(name, swallow));
  }, [viewportRef]);

  // A rotation or resize shrinks the cover bounds; re-clamp so the feed cannot
  // be left panned off its own edge.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (transformRef.current.zoom === 1) return;
      transformRef.current = clampZoomTransform(
        transformRef.current,
        el.clientWidth,
        el.clientHeight,
        MIN_ZOOM,
        MAX_ZOOM,
      );
      paint();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [paint, transformRef, viewportRef]);

  // Drop any half-finished gesture the moment pinching is disallowed
  // (capture fires mid-pinch, camera drops out).
  useEffect(() => {
    if (enabled) return;
    pointersRef.current.clear();
    endGesture();
  }, [enabled, endGesture]);

  const pointerCount = useCallback(() => pointersRef.current.size, []);

  return { pointerCount, onPointerDown, onPointerUp, reset };
}
