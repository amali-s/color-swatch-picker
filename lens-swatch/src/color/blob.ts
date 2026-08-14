export interface Blob {
  /** Centroid X in grid coordinates (0…gridW-1). */
  cx: number
  /** Centroid Y in grid coordinates (0…gridH-1). */
  cy: number
  /** Component size in grid cells. */
  size: number
}

/**
 * Connected-component pass for tooltip anchoring.
 *
 * Given a dense grid where every cell carries the cluster label of its pixel
 * (or a negative label for "empty/transparent"), find, per label, the single
 * largest 4-connected component and return its centroid in grid coordinates.
 *
 * Why a blob and not a raw centroid: a color can appear in several disconnected
 * places, and the mean of all those scattered pixels can land in empty space
 * between them. Anchoring to the biggest contiguous region instead keeps the
 * marker on an area that actually shows the color.
 *
 * Why this pass wants a denser sample than k-means: too sparse a grid punches
 * holes in genuinely contiguous regions, splitting one blob into many false
 * fragments and moving the anchor. Callers give it its own stride.
 *
 * Returns `null` for any label with no cells in the grid — the caller skips the
 * marker rather than inventing a position. Never throws on empty/scattered
 * input; a lone cell is simply a size-1 blob at its own coordinate.
 *
 * Single linear scan with a preallocated explicit stack (no recursion, so deep
 * regions can't blow the call stack), O(gridW · gridH).
 */
export function largestBlobs(
  labels: Int8Array,
  gridW: number,
  gridH: number,
  k: number,
): (Blob | null)[] {
  const cellCount = gridW * gridH
  const visited = new Uint8Array(cellCount)
  const best: (Blob | null)[] = new Array(k).fill(null)
  // Stack of cell indices to flood; can never hold more than every cell once.
  const stack = new Int32Array(cellCount)

  for (let start = 0; start < cellCount; start++) {
    if (visited[start]) continue
    const label = labels[start]
    visited[start] = 1
    if (label < 0) continue // empty cell — not part of any component

    let top = 0
    stack[top++] = start
    let size = 0
    let sumX = 0
    let sumY = 0

    while (top > 0) {
      const idx = stack[--top]
      const x = idx % gridW
      const y = (idx / gridW) | 0
      size++
      sumX += x
      sumY += y

      // 4-connected neighbours sharing this label.
      if (x > 0) {
        const nIdx = idx - 1
        if (!visited[nIdx] && labels[nIdx] === label) {
          visited[nIdx] = 1
          stack[top++] = nIdx
        }
      }
      if (x < gridW - 1) {
        const nIdx = idx + 1
        if (!visited[nIdx] && labels[nIdx] === label) {
          visited[nIdx] = 1
          stack[top++] = nIdx
        }
      }
      if (y > 0) {
        const nIdx = idx - gridW
        if (!visited[nIdx] && labels[nIdx] === label) {
          visited[nIdx] = 1
          stack[top++] = nIdx
        }
      }
      if (y < gridH - 1) {
        const nIdx = idx + gridW
        if (!visited[nIdx] && labels[nIdx] === label) {
          visited[nIdx] = 1
          stack[top++] = nIdx
        }
      }
    }

    const prev = best[label]
    if (prev === null || size > prev.size) {
      best[label] = { cx: sumX / size, cy: sumY / size, size }
    }
  }

  return best
}
