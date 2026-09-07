export interface Blob {
  /** Centroid X in grid coordinates (0…gridW-1). */
  cx: number
  /** Centroid Y in grid coordinates (0…gridH-1). */
  cy: number
  /** Component size in grid cells. */
  size: number
  /** Cell indices (`y * gridW + x`) of this winning component, scan/flood order. */
  cells: number[]
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
 * Also returns the winning component's cell indices so the caller can erode
 * and sample a blob-core color without a second flood fill. Centroid/size
 * remain the public anchoring fields.
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
    const cells: number[] = []

    while (top > 0) {
      const idx = stack[--top]
      const x = idx % gridW
      const y = (idx / gridW) | 0
      size++
      sumX += x
      sumY += y
      cells.push(idx)

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
      best[label] = { cx: sumX / size, cy: sumY / size, size, cells }
    }
  }

  return best
}

/**
 * 4-neighbor morphological erosion of a connected component given as cell
 * indices. A cell is interior when all four neighbors exist and belong to the
 * component. If that leaves nothing (thin or scattered region), return `cells`
 * unchanged so callers can still sample.
 *
 * DOM-free, no recursion, O(component) with an O(grid) membership mask.
 */
export function erode4(cells: number[], gridW: number, gridH: number): number[] {
  if (cells.length === 0) return cells
  const cellCount = gridW * gridH
  const inComp = new Uint8Array(cellCount)
  for (let i = 0; i < cells.length; i++) inComp[cells[i]] = 1

  const interior: number[] = []
  for (let i = 0; i < cells.length; i++) {
    const idx = cells[i]
    const x = idx % gridW
    const y = (idx / gridW) | 0
    if (x === 0 || x === gridW - 1 || y === 0 || y === gridH - 1) continue
    if (inComp[idx - 1] && inComp[idx + 1] && inComp[idx - gridW] && inComp[idx + gridW]) {
      interior.push(idx)
    }
  }
  return interior.length > 0 ? interior : cells
}
