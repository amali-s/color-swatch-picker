const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export interface NormPoint {
  x: number
  y: number
}

/**
 * Digital zoom of the live feed: the CSS transform
 * `translate(tx, ty) scale(zoom)` applied to the feed layer about its center.
 * The layer box is the viewport box, so this is also the transform that has to
 * be inverted to know which sensor pixels the user can actually see.
 */
export interface ZoomTransform {
  zoom: number
  /** Pan in viewport pixels, applied after the scale. */
  tx: number
  ty: number
}

export const NO_ZOOM: ZoomTransform = { zoom: 1, tx: 0, ty: 0 }

/**
 * Largest pan (px, either direction) that still leaves the scaled layer
 * covering the viewport — beyond this the feed would show its own edge.
 */
export function maxPan(viewSize: number, zoom: number): number {
  return Math.max(0, (viewSize * (zoom - 1)) / 2)
}

/** Clamp a candidate transform into range and back inside the cover bounds. */
export function clampZoomTransform(
  transform: ZoomTransform,
  viewW: number,
  viewH: number,
  minZoom: number,
  maxZoom: number,
): ZoomTransform {
  const zoom = clamp(transform.zoom, minZoom, maxZoom)
  const panX = maxPan(viewW, zoom)
  const panY = maxPan(viewH, zoom)
  return {
    zoom,
    tx: clamp(transform.tx, -panX, panX),
    ty: clamp(transform.ty, -panY, panY),
  }
}

/**
 * Invert the zoom transform: a pixel on screen → the pixel of the untransformed
 * feed layer sitting under it.
 */
export function viewportPointToLayer(
  px: number,
  py: number,
  viewW: number,
  viewH: number,
  transform: ZoomTransform = NO_ZOOM,
): NormPoint {
  const zoom = transform.zoom || 1
  const cx = viewW / 2
  const cy = viewH / 2
  return {
    x: cx + (px - cx - transform.tx) / zoom,
    y: cy + (py - cy - transform.ty) / zoom,
  }
}

/** The state of a pinch at the moment the second finger landed. */
export interface PinchStart {
  /** Distance between the two fingers, in viewport pixels. */
  distance: number
  /** Layer-space point that was under the pinch midpoint. */
  anchor: NormPoint
  transform: ZoomTransform
}

/**
 * The transform for a pinch in progress.
 *
 * Fingers moving apart increases the distance and so zooms in, which is the
 * phone-camera convention. The layer point the gesture started on is kept under
 * the (moving) midpoint, so a pinch pans as well as scales — and the pan is
 * derived from the clamped zoom, or hitting the 4x ceiling would keep sliding
 * the feed.
 */
export function pinchStep(
  start: PinchStart,
  distance: number,
  midX: number,
  midY: number,
  viewW: number,
  viewH: number,
  minZoom: number,
  maxZoom: number,
): ZoomTransform {
  const ratio = start.distance > 0 ? distance / start.distance : 1
  const zoom = clamp(start.transform.zoom * ratio, minZoom, maxZoom)
  const cx = viewW / 2
  const cy = viewH / 2
  return clampZoomTransform(
    {
      zoom,
      tx: midX - cx - (start.anchor.x - cx) * zoom,
      ty: midY - cy - (start.anchor.y - cy) * zoom,
    },
    viewW,
    viewH,
    minZoom,
    maxZoom,
  )
}

/**
 * Map a pixel in the viewport onto the live video's normalized sensor space
 * ([0,1] × [0,1]), inverting the zoom transform and then `object-fit: cover`.
 * Returns null when either box has no size yet (stream not producing frames).
 *
 * Cover scales the video to fill the viewport and crops overflow, so a tap
 * at the viewport edge is not (0,0) / (1,1) unless the aspect ratios match.
 */
export function coverPointToNorm(
  px: number,
  py: number,
  viewW: number,
  viewH: number,
  videoW: number,
  videoH: number,
  transform: ZoomTransform = NO_ZOOM,
): NormPoint | null {
  if (!viewW || !viewH || !videoW || !videoH) return null
  const layer = viewportPointToLayer(px, py, viewW, viewH, transform)
  const scale = Math.max(viewW / videoW, viewH / videoH)
  const displayW = videoW * scale
  const displayH = videoH * scale
  const offsetX = (viewW - displayW) / 2
  const offsetY = (viewH - displayH) / 2
  return {
    x: clamp((layer.x - offsetX) / displayW, 0, 1),
    y: clamp((layer.y - offsetY) / displayH, 0, 1),
  }
}

/** Source rectangle in video pixels, for `drawImage`. */
export interface CropRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/**
 * The region of the sensor the user can currently see: the viewport box pushed
 * back through the zoom transform and then through `object-fit: cover`.
 *
 * The result always has the viewport's aspect ratio, so drawing it into a
 * canvas that is itself displayed with `object-fit: cover` reproduces the
 * preview exactly — which is what makes the frozen frame match what was
 * on screen at capture.
 */
export function coverZoomCrop(
  viewW: number,
  viewH: number,
  videoW: number,
  videoH: number,
  transform: ZoomTransform = NO_ZOOM,
): CropRect | null {
  if (!viewW || !viewH || !videoW || !videoH) return null
  const scale = Math.max(viewW / videoW, viewH / videoH)
  const offsetX = (viewW - videoW * scale) / 2
  const offsetY = (viewH - videoH * scale) / 2

  const topLeft = viewportPointToLayer(0, 0, viewW, viewH, transform)
  const bottomRight = viewportPointToLayer(viewW, viewH, viewW, viewH, transform)

  const sx = Math.round((topLeft.x - offsetX) / scale)
  const sy = Math.round((topLeft.y - offsetY) / scale)
  const sw = Math.round((bottomRight.x - topLeft.x) / scale)
  const sh = Math.round((bottomRight.y - topLeft.y) / scale)

  // Rounding (and an unclamped pan) can push the rect a pixel past the frame;
  // getImageData on an out-of-bounds rect yields transparent padding, which
  // would poison the k-means pass.
  const x = clamp(sx, 0, Math.max(0, videoW - 1))
  const y = clamp(sy, 0, Math.max(0, videoH - 1))
  return {
    sx: x,
    sy: y,
    sw: clamp(sw, 1, videoW - x),
    sh: clamp(sh, 1, videoH - y),
  }
}
