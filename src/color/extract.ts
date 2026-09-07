import { kmeans, mulberry32, toHex } from './kmeans.ts'
import { oklabDistSq, oklabToSrgb, srgbToOklab, type Oklab } from './oklab.ts'
import { erode4, largestBlobs } from './blob.ts'
import type { Cluster, PaletteResult, RGB } from './types.ts'

/** Minimal shape of a captured frame — matches the browser's `ImageData`. */
export interface ImageLike {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface ExtractOptions {
  /** k for k-means. Default 3 (the three dominant colors). Capped at 6. */
  k?: number
  /**
   * 2-D grid stride for the k-means sampling pass. Same (x, y) pattern as
   * `denseStep` (including `Math.min` so the last column/row can be hit).
   * Default 4 — in the same ballpark as the dense pass so small objects are
   * not skipped. A 1-D buffer walk of the same size would be a different
   * (and biased) sample.
   */
  kmeansStep?: number
  /**
   * 2-D pixel stride for the dense blob-detection pass. Must be denser than
   * or equal to the k-means stride or contiguous regions fragment into false
   * blobs. Default 4.
   */
  denseStep?: number
  iterations?: number
  seed?: number
}

const DEFAULTS = {
  k: 3,
  kmeansStep: 4,
  denseStep: 4,
  iterations: 12,
} as const

/** Ceiling on returned clusters. Default k stays 3; this is not a target. */
const MAX_CLUSTERS = 6

/**
 * Drop near-black shadows and near-white speculars so they cannot steal a
 * k-means cluster from a real surface. Luminance-only: unsaturated charcoal
 * / off-white objects are valid swatches and must not be dropped here.
 *
 * `L_SPECULAR` is slightly above the 0.92 sketch so saturated yellow
 * (OKLab L ≈ 0.968) stays in; clipped whites (L ≈ 1) still drop.
 * sRGB gray ≲ 1 maps under `L_SHADOW`; gray ≳ 246 maps over `L_SPECULAR`.
 */
const L_SHADOW = 0.08
const L_SPECULAR = 0.97

/**
 * Below this OKLab chroma (`hypot(a, b)`), keep only every other 2-D grid
 * cell (checkerboard). Down-weights walls / gray noise without weighted
 * k-means. Saturated cells stay on every grid point.
 */
const CHROMA_GRAY = 0.04

/**
 * Squared OKLab distance below which two k-means centers are the same color
 * to the user and get collapsed. ΔE ≈ 0.05 (`0.05²`) matches the "same color"
 * recovery checks; solid R/G/B bands sit at ΔE ≳ 0.4 and must not merge.
 * Two leftover centers on the same gray/red (k-means split of one hue) should.
 *
 * Applied after k-means, before dense labeling. Merge never raises k.
 */
const MERGE_DIST_SQ = 0.05 * 0.05

/**
 * Full Phase 3 pipeline against a single captured frame. Two deliberately
 * separate passes over the pixels:
 *
 *   1. Sparse 2-D grid → drop extreme-L highlights/shadows and checkerboard
 *      down-weight low-chroma cells (fallback: unfiltered grid if fewer than
 *      k samples remain) → k-means++ in OKLab (3 restarts, lowest SSE) →
 *      near-duplicate OKLab centers collapsed (count-weighted mean) so a
 *      leftover k-means ghost does not become an extra chip → cluster
 *      membership, counts, ranking, and the merged mean centers used to
 *      label the dense grid. Lloyd updates stay OKLab means; k into k-means
 *      is not adaptive. Merge never raises the cluster count.
 *
 *   2. Dense pass → connected components → chip positions *and* the reported
 *      hex. Every dense-grid cell is labeled by nearest merged k-means center
 *      in OKLab. The largest contiguous region per cluster is the anchor.
 *      Hex is the blob-core median of that region (eroded interior, or the
 *      whole component if erosion is empty), snapped to the nearest actual
 *      core pixel. If a cluster has no blob, hex falls back to the OKLab
 *      median of its sparse samples — never the k-means mean.
 *
 * Membership, count, proportion, and ranking stay pass 1 (after the
 * near-duplicate merge, ranked by merged count). Pass 2 may change the
 * displayed hex (blob density can move it) but must not change which
 * samples belong to which cluster. Hex/chips match colors the user can
 * tell apart because near-duplicate OKLab centers are collapsed before
 * labeling.
 *
 * Pure and DOM-free: takes an `ImageData`-shaped object, so it runs identically
 * on the main thread, in a Web Worker, or under Node in tests.
 */
export function extractPalette(
  image: ImageLike,
  opts: ExtractOptions = {},
): PaletteResult {
  const k = Math.min(opts.k ?? DEFAULTS.k, MAX_CLUSTERS)
  const kmeansStep = opts.kmeansStep ?? DEFAULTS.kmeansStep
  const denseStep = opts.denseStep ?? DEFAULTS.denseStep
  const iterations = opts.iterations ?? DEFAULTS.iterations
  const seed = opts.seed ?? ((Math.random() * 1e9) | 0)
  const { data, width, height } = image

  // ---- Pass 1: 2-D grid sampling + k-means (membership / ranking) -----------
  const t0 = performance.now()
  let samples = sampleGrid(data, width, height, kmeansStep, keepForKmeans)
  // Frame of only highlights/shadows (or all gray skipped by chroma): still
  // cluster the opaque 2-D grid so k > distinct colors cannot return empty.
  if (samples.length < k) {
    samples = sampleGrid(data, width, height, kmeansStep)
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
  const { centers: rawCenters, counts: rawCounts } = kmeans(samples, k, iterations, rng)
  // Collapse near-duplicate OKLab centers before dense labeling so leftover
  // k-means ghosts (k > distinct colors) do not become extra hex chips.
  const { centers, counts, labCenters } = mergeNearDuplicateCenters(rawCenters, rawCounts)
  const kMerged = centers.length
  const t1 = performance.now()

  // ---- Pass 2: dense sampling + connected-component blob detection ----------
  // Its own, denser grid. Each cell is labeled by nearest merged center in
  // OKLab so the labeling matches post-merge assignment (not RGB Euclidean).
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
      const lab = srgbToOklab([data[i], data[i + 1], data[i + 2]])
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < kMerged; c++) {
        const d = oklabDistSq(lab, labCenters[c])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      labels[gridRow + gx] = best
    }
  }
  const blobs = largestBlobs(labels, gridW, gridH, kMerged)
  const t2 = performance.now()

  // Sparse OKLab-median fallback is only built if some cluster has no blob.
  let sparseMembers: { rgb: RGB; lab: Oklab }[][] | null = null
  const getSparseMembers = () => {
    if (sparseMembers) return sparseMembers
    const members: { rgb: RGB; lab: Oklab }[][] = Array.from(
      { length: kMerged },
      () => [],
    )
    for (let s = 0; s < samples.length; s++) {
      const rgb = samples[s]
      const lab = srgbToOklab(rgb)
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < kMerged; c++) {
        const d = oklabDistSq(lab, labCenters[c])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      members[best].push({ rgb, lab })
    }
    sparseMembers = members
    return members
  }

  // ---- Assemble clusters, attach anchors, rank by merged k-means count ------
  const clusters: Cluster[] = centers.map((c, idx) => {
    const blob = blobs[idx]
    // Grid centroid → normalized image coords for the tooltip.
    const anchor = blob
      ? {
          x: Math.min(1, (blob.cx * denseStep) / width),
          y: Math.min(1, (blob.cy * denseStep) / height),
        }
      : null

    let rgb: RGB
    if (blob) {
      const core = erode4(blob.cells, gridW, gridH)
      rgb = readingFromCells(data, width, height, denseStep, gridW, core)
    } else {
      const members = getSparseMembers()[idx]
      rgb =
        members.length > 0
          ? nearestToMedian(members)
          : [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]
    }

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
  if (clusters.length > MAX_CLUSTERS) clusters.length = MAX_CLUSTERS

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

/**
 * 2-D grid sample, same gx/gy → pixel mapping as the dense labeling loop
 * (including `Math.min` so the last column/row can be hit when the size is
 * not a multiple of `step`). Transparent pixels (alpha < 128) are always
 * skipped. `keep` is applied after that; omit it for the unfiltered fallback.
 */
function sampleGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  step: number,
  keep?: (lab: Oklab, gx: number, gy: number) => boolean,
): RGB[] {
  const samples: RGB[] = []
  const gridW = Math.ceil(width / step)
  const gridH = Math.ceil(height / step)
  for (let gy = 0; gy < gridH; gy++) {
    const py = Math.min(gy * step, height - 1)
    const rowBase = py * width
    for (let gx = 0; gx < gridW; gx++) {
      const px = Math.min(gx * step, width - 1)
      const i = (rowBase + px) * 4
      if (data[i + 3] < 128) continue
      const rgb: RGB = [data[i], data[i + 1], data[i + 2]]
      if (keep) {
        const lab = srgbToOklab(rgb)
        if (!keep(lab, gx, gy)) continue
      }
      samples.push(rgb)
    }
  }
  return samples
}

/**
 * Greedy nearest-pair merge of k-means centers in OKLab. While any pair is
 * closer than `MERGE_DIST_SQ`, replace the closest pair with their
 * count-weighted OKLab mean and the summed count. Stops at one cluster.
 * Never increases the list length.
 */
function mergeNearDuplicateCenters(
  srgbCenters: number[][],
  counts: number[],
): { centers: number[][]; counts: number[]; labCenters: Oklab[] } {
  const labCenters: Oklab[] = srgbCenters.map((c) => srgbToOklab([c[0], c[1], c[2]]))
  const mergedCounts = counts.slice()

  while (labCenters.length > 1) {
    let bestI = -1
    let bestJ = -1
    let bestD = Infinity
    for (let i = 0; i < labCenters.length; i++) {
      for (let j = i + 1; j < labCenters.length; j++) {
        const d = oklabDistSq(labCenters[i], labCenters[j])
        if (d < bestD) {
          bestD = d
          bestI = i
          bestJ = j
        }
      }
    }
    if (bestD >= MERGE_DIST_SQ) break

    const n1 = mergedCounts[bestI]
    const n2 = mergedCounts[bestJ]
    const n = n1 + n2
    if (n > 0) {
      const a = labCenters[bestI]
      const b = labCenters[bestJ]
      labCenters[bestI] = [
        (a[0] * n1 + b[0] * n2) / n,
        (a[1] * n1 + b[1] * n2) / n,
        (a[2] * n1 + b[2] * n2) / n,
      ]
      mergedCounts[bestI] = n
    }
    labCenters.splice(bestJ, 1)
    mergedCounts.splice(bestJ, 1)
  }

  return {
    labCenters,
    counts: mergedCounts,
    centers: labCenters.map((lab) => oklabToSrgb(lab) as number[]),
  }
}

function keepForKmeans(lab: Oklab, gx: number, gy: number): boolean {
  const L = lab[0]
  if (L < L_SHADOW || L > L_SPECULAR) return false
  const chroma = Math.hypot(lab[1], lab[2])
  if (chroma < CHROMA_GRAY && ((gx + gy) & 1) === 1) return false
  return true
}

/** Same gx/gy → pixel mapping as the dense labeling loop. */
function readingFromCells(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  denseStep: number,
  gridW: number,
  cells: number[],
): RGB {
  const members: { rgb: RGB; lab: Oklab }[] = new Array(cells.length)
  for (let i = 0; i < cells.length; i++) {
    const idx = cells[i]
    const gx = idx % gridW
    const gy = (idx / gridW) | 0
    const px = Math.min(gx * denseStep, width - 1)
    const py = Math.min(gy * denseStep, height - 1)
    const p = (py * width + px) * 4
    const rgb: RGB = [data[p], data[p + 1], data[p + 2]]
    members[i] = { rgb, lab: srgbToOklab(rgb) }
  }
  return nearestToMedian(members)
}

/**
 * Component-wise OKLab median, then the sample whose OKLab is nearest that
 * median so the reported hex existed in the frame. Even count averages the
 * two middle values per channel. First-on-tie for the nearest pixel.
 */
function nearestToMedian(members: { rgb: RGB; lab: Oklab }[]): RGB {
  const n = members.length
  const Ls = new Float64Array(n)
  const As = new Float64Array(n)
  const Bs = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const lab = members[i].lab
    Ls[i] = lab[0]
    As[i] = lab[1]
    Bs[i] = lab[2]
  }
  Ls.sort()
  As.sort()
  Bs.sort()
  const mid = n >> 1
  const median: Oklab =
    n % 2 === 1
      ? [Ls[mid], As[mid], Bs[mid]]
      : [
          (Ls[mid - 1] + Ls[mid]) / 2,
          (As[mid - 1] + As[mid]) / 2,
          (Bs[mid - 1] + Bs[mid]) / 2,
        ]

  let bestI = 0
  let bestD = Infinity
  for (let i = 0; i < n; i++) {
    const d = oklabDistSq(members[i].lab, median)
    if (d < bestD) {
      bestD = d
      bestI = i
    }
  }
  return members[bestI].rgb
}
