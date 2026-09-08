const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export interface NormPoint {
  x: number
  y: number
}

/**
 * Map a pixel in the viewport onto the live video's normalized sensor space
 * ([0,1] × [0,1]), inverting `object-fit: cover`. Returns null when either
 * box has no size yet (stream not producing frames).
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
): NormPoint | null {
  if (!viewW || !viewH || !videoW || !videoH) return null
  const scale = Math.max(viewW / videoW, viewH / videoH)
  const displayW = videoW * scale
  const displayH = videoH * scale
  const offsetX = (viewW - displayW) / 2
  const offsetY = (viewH - displayH) / 2
  return {
    x: clamp((px - offsetX) / displayW, 0, 1),
    y: clamp((py - offsetY) / displayH, 0, 1),
  }
}
