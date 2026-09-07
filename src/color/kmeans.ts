import { oklabDistSq, oklabToSrgb, srgbToOklab, type Oklab } from './oklab.ts'
import type { RGB } from './types.ts'

/**
 * Seedable PRNG (mulberry32). Ported unchanged from the Phase 2 harness so a
 * given seed is reproducible: k-means++ init and restart draws all come from
 * this stream.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface KMeansResult {
  /**
   * Final cluster centers as float sRGB, derived from the settled OKLab
   * centroids. Stable center-index order 0…k-1.
   */
  centers: number[][]
  /** Samples assigned to each center under the final assignment, same order. */
  counts: number[]
}

/**
 * k-means++ seeding in OKLab. First center is a uniform random sample; each
 * next center is drawn with probability proportional to D² (squared OKLab
 * distance to the nearest already-chosen center). Distinct samples are
 * preferred while n ≥ k; if n < k the leftover centers duplicate a random
 * sample so k stays filled.
 */
function initKMeansPlusPlus(labs: Oklab[], k: number, rng: () => number): Oklab[] {
  const n = labs.length
  const centers: Oklab[] = []
  const used = new Set<number>()

  const first = (rng() * n) | 0
  used.add(first)
  centers.push(labs[first].slice() as Oklab)

  const d2 = new Float64Array(n)
  while (centers.length < k && used.size < n) {
    let total = 0
    for (let i = 0; i < n; i++) {
      if (used.has(i)) {
        d2[i] = 0
        continue
      }
      let best = Infinity
      for (let c = 0; c < centers.length; c++) {
        const d = oklabDistSq(labs[i], centers[c])
        if (d < best) best = d
      }
      d2[i] = best
      total += best
    }

    let idx = -1
    if (total <= 0) {
      // Remaining samples sit on already-chosen centers; take any unused one.
      for (let i = 0; i < n; i++) {
        if (!used.has(i)) {
          idx = i
          break
        }
      }
    } else {
      const r = rng() * total
      let acc = 0
      for (let i = 0; i < n; i++) {
        if (used.has(i)) continue
        acc += d2[i]
        if (r <= acc) {
          idx = i
          break
        }
      }
      if (idx < 0) {
        for (let i = n - 1; i >= 0; i--) {
          if (!used.has(i)) {
            idx = i
            break
          }
        }
      }
    }

    used.add(idx)
    centers.push(labs[idx].slice() as Oklab)
  }

  while (centers.length < k) centers.push(labs[(rng() * n) | 0].slice() as Oklab)
  return centers
}

/**
 * k-means, written by hand and ported from the Phase 2 test harness:
 *   - convert samples to OKLab once
 *   - k-means++ initial centers from the sampled pixels (in OKLab)
 *   - a few independent runs (default 3) keep the lowest within-cluster SSE
 *   - assign each sample to the nearest center (squared OKLab Euclidean)
 *   - recompute each centroid as the mean L/a/b of its members
 *   - convert the winning settled centroids back to sRGB for callers
 *   - fixed iteration count, no convergence detection (per the roadmap)
 *   - empty clusters are re-seeded to a random sample (in OKLab) so k stays
 *     meaningful
 *
 * Returns sRGB centers in center-index order (NOT ranked) so callers can keep a
 * stable mapping between a center and the dense grid it labels; ranking by
 * size happens downstream once positions have been attached. Dense labeling
 * must convert those sRGB centers back to OKLab so assignment and positioning
 * share one space.
 *
 * Distance and centroids are OKLab so assignment tracks perceptual difference
 * more closely than RGB Euclidean (especially dark shades and similar hues at
 * different brightness). Callers use these mean centers for membership,
 * ranking, and dense labeling; displayed hex is chosen downstream.
 */
export function kmeans(
  samples: RGB[],
  k: number,
  iters: number,
  rng: () => number,
  restarts = 3,
): KMeansResult {
  const n = samples.length
  const labs: Oklab[] = new Array(n)
  for (let i = 0; i < n; i++) labs[i] = srgbToOklab(samples[i])

  const runs = Math.max(1, restarts)
  const assign = new Int8Array(n)

  const assignStep = (centers: Oklab[]) => {
    for (let s = 0; s < n; s++) {
      const px = labs[s]
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const d = oklabDistSq(px, centers[c])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      assign[s] = best
    }
  }

  let bestSse = Infinity
  let bestCenters: Oklab[] = []
  let bestCounts: number[] = []

  for (let run = 0; run < runs; run++) {
    const centers = initKMeansPlusPlus(labs, k, rng)

    for (let it = 0; it < iters; it++) {
      assignStep(centers)
      // Update step: each centroid becomes the mean of its members in OKLab.
      const sum = Array.from({ length: k }, () => [0, 0, 0, 0]) // L, a, b, count
      for (let s = 0; s < n; s++) {
        const a = assign[s]
        const px = labs[s]
        sum[a][0] += px[0]
        sum[a][1] += px[1]
        sum[a][2] += px[2]
        sum[a][3]++
      }
      for (let c = 0; c < k; c++) {
        if (sum[c][3] === 0) {
          // Dead cluster — re-seed from a random sample to keep k meaningful.
          centers[c] = labs[(rng() * n) | 0].slice() as Oklab
        } else {
          centers[c] = [
            sum[c][0] / sum[c][3],
            sum[c][1] / sum[c][3],
            sum[c][2] / sum[c][3],
          ]
        }
      }
    }

    // One final assignment against the settled centers so counts (and the dense
    // grid's labels, which reuse these same centers) line up with what's shown.
    assignStep(centers)
    const counts = new Array<number>(k).fill(0)
    let sse = 0
    for (let s = 0; s < n; s++) {
      const c = assign[s]
      counts[c]++
      sse += oklabDistSq(labs[s], centers[c])
    }

    // Strict < so a tie keeps the first run (deterministic).
    if (sse < bestSse) {
      bestSse = sse
      bestCenters = centers
      bestCounts = counts
    }
  }

  return {
    centers: bestCenters.map((c) => oklabToSrgb(c) as number[]),
    counts: bestCounts,
  }
}

/** Clamp to 0–255 and format as an uppercase #RRGGBB string. */
export function toHex(rgb: RGB): string {
  return (
    '#' +
    rgb
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  )
}

/** Pick a readable overlay text color (near-black or near-white) for a swatch. */
export function readableInkOn(rgb: RGB): string {
  const brightness = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
  return brightness > 140 ? '#14161a' : '#f4f6f9'
}
