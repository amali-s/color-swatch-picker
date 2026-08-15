import { kmeans, mulberry32, toHex } from './kmeans.ts'
import { largestBlobs } from './blob.ts'
import type { Cluster, PaletteResult, RGB } from './types.ts'

/** Minimal shape of a captured frame — matches the browser's `ImageData`. */
export interface ImageLike {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface ExtractOptions {
  /** k for k-means. Default 3 (the three dominant colors). */
  k?: number
  /**
   * 1-D pixel stride for the k-means sampling pass (Phase 2's density). Keep
   * this sparse (10–20) — it's what the roadmap tuned the clustering against.
   */
  kmeansStep?: number
  /**
   * 2-D pixel stride for the dense blob-detection pass. Must be denser than the
   * k-means stride or contiguous regions fragment into false blobs. Default 4.
   */
  denseStep?: number
  iterations?: number
  seed?: number
}

const DEFAULTS = {
  k: 3,
  kmeansStep: 12,
  denseStep: 4,
  iterations: 12,
} as const

/**
 * Full Phase 3 pipeline against a single captured frame. Two deliberately
 * separate passes over the pixels:
 *
 *   1. Sparse pass → k-means → the *reported colors*. Each cluster's color is
 *      the centroid of the sparse full-frame sample assigned to it: an
 *      aggregate of the color everywhere it appears, not a local reading.
 *
 *   2. Dense pass → connected components → *tooltip positions only*. Every
 *      dense-grid cell is labeled by nearest final k-means center, then the
 *      largest contiguous region per cluster gives the anchor point.
 *
 * The color values come entirely from pass 1; pass 2 only produces positions.
 * So the blob density can change (or the whole positioning pass be removed)
 * without moving a single displayed hex value — see the invariant test.
 *
 * Pure and DOM-free: takes an `ImageData`-shaped object, so it runs identically
 * on the main thread, in a Web Worker, or under Node in tests.
 */
export function extractPalette(
  image: ImageLike,
  opts: ExtractOptions = {},
): PaletteResult {
  const k = opts.k ?? DEFAULTS.k
  const kmeansStep = opts.kmeansStep ?? DEFAULTS.kmeansStep
  const denseStep = opts.denseStep ?? DEFAULTS.denseStep
  const iterations = opts.iterations ?? DEFAULTS.iterations
  const seed = opts.seed ?? ((Math.random() * 1e9) | 0)
  const { data, width, height } = image

  // ---- Pass 1: sparse sampling + k-means (produces the reported colors) ----
  const t0 = performance.now()
  const samples: RGB[] = []
  const totalPixels = width * height
  for (let p = 0; p < totalPixels; p += kmeansStep) {
    const i = p * 4
    if (data[i + 3] < 128) continue // ignore transparent pixels
    samples.push([data[i], data[i + 1], data[i + 2]])
  }

  // Degenerate frame (all transparent / too few pixels): bail with no clusters
  // rather than feeding k-means garbage.
  if (samples.length < k) {
    const t = performance.now()
    return {
      clusters: [],
      meta: {
        width,
        height,
        kmeansStep,
        denseStep,
        iterations,
        sparseSamples: samples.length,
        denseCells: 0,
        seed,
        kmeansMs: t - t0,
        blobMs: 0,
        totalMs: t - t0,
      },
    }
  }

  const rng = mulberry32(seed)
  const { centers, counts } = kmeans(samples, k, iterations, rng)
  const t1 = performance.now()

  // ---- Pass 2: dense sampling + connected-component blob detection ----------
  // Its own, denser grid. Each cell is labeled by nearest final center so the
  // labeling is consistent with the reported colors.
  const gridW = Math.ceil(width / denseStep)
  const gridH = Math.ceil(height / denseStep)
  const labels = new Int8Array(gridW * gridH)
  for (let gy = 0; gy < gridH; gy++) {
    const py = Math.min(gy * denseStep, height - 1)
    const rowBase = py * width
    const gridRow = gy * gridW
    for (let gx = 0; gx < gridW; gx++) {
      const px = Math.min(gx * denseStep, width - 1)
      const i = (rowBase + px) * 4
      if (data[i + 3] < 128) {
        labels[gridRow + gx] = -1 // transparent → empty cell
        continue
      }
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const ce = centers[c]
        const dr = r - ce[0]
        const dg = g - ce[1]
        const db = b - ce[2]
        const d = dr * dr + dg * dg + db * db
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      labels[gridRow + gx] = best
    }
  }
  const blobs = largestBlobs(labels, gridW, gridH, k)
  const t2 = performance.now()

  // ---- Assemble clusters, attach anchors, rank by size ----------------------
  const clusters: Cluster[] = centers.map((c, idx) => {
    const rgb: RGB = [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]
    const blob = blobs[idx]
    // Grid centroid → normalized image coords for the tooltip.
    const anchor = blob
      ? {
          x: Math.min(1, (blob.cx * denseStep) / width),
          y: Math.min(1, (blob.cy * denseStep) / height),
        }
      : null
    return {
      rgb,
      hex: toHex(rgb),
      count: counts[idx],
      proportion: samples.length ? counts[idx] / samples.length : 0,
      anchor,
      blobCells: blob ? blob.size : 0,
    }
  })
  clusters.sort((a, b) => b.count - a.count)

  return {
    clusters,
    meta: {
      width,
      height,
      kmeansStep,
      denseStep,
      iterations,
      sparseSamples: samples.length,
      denseCells: gridW * gridH,
      seed,
      kmeansMs: t1 - t0,
      blobMs: t2 - t1,
      totalMs: t2 - t0,
    },
  }
}
