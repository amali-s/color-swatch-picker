import type { RGB } from './types.ts'

/**
 * Seedable PRNG (mulberry32). Ported unchanged from the Phase 2 harness so a
 * run is reproducible for debugging and tests, and so a re-seed can expose
 * k-means' sensitivity to its random initial centers.
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
  /** Final cluster centers (float RGB), in stable center-index order 0…k-1. */
  centers: number[][]
  /** Samples assigned to each center under the final assignment, same order. */
  counts: number[]
}

/**
 * k-means, written by hand and ported from the Phase 2 test harness:
 *   - random initial centers drawn from the sampled pixels
 *   - assign each sample to the nearest center (squared RGB Euclidean)
 *   - recompute each centroid as the mean R/G/B of its members
 *   - fixed iteration count, no convergence detection (per the roadmap)
 *   - empty clusters are re-seeded to a random sample so k stays meaningful
 *
 * Returns centers in center-index order (NOT ranked) so callers can keep a
 * stable mapping between a center and the dense grid it labels; ranking by
 * size happens downstream once positions have been attached.
 *
 * Distance is plain RGB Euclidean — not perceptually uniform. That RGB↔vision
 * gap is a known v1 limitation carried over from Phase 2, not fixed here.
 */
export function kmeans(
  samples: RGB[],
  k: number,
  iters: number,
  rng: () => number,
): KMeansResult {
  const n = samples.length
  const centers: number[][] = []
  const used = new Set<number>()
  while (centers.length < k && used.size < n) {
    const idx = (rng() * n) | 0
    if (used.has(idx)) continue
    used.add(idx)
    centers.push(samples[idx].slice())
  }
  while (centers.length < k) centers.push(samples[(rng() * n) | 0].slice())

  const assign = new Int8Array(n)

  const assignStep = () => {
    for (let s = 0; s < n; s++) {
      const px = samples[s]
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const ce = centers[c]
        const dr = px[0] - ce[0]
        const dg = px[1] - ce[1]
        const db = px[2] - ce[2]
        const d = dr * dr + dg * dg + db * db
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      assign[s] = best
    }
  }

  for (let it = 0; it < iters; it++) {
    assignStep()
    // Update step: each centroid becomes the mean of its members.
    const sum = Array.from({ length: k }, () => [0, 0, 0, 0]) // r, g, b, count
    for (let s = 0; s < n; s++) {
      const a = assign[s]
      const px = samples[s]
      sum[a][0] += px[0]
      sum[a][1] += px[1]
      sum[a][2] += px[2]
      sum[a][3]++
    }
    for (let c = 0; c < k; c++) {
      if (sum[c][3] === 0) {
        // Dead cluster — re-seed from a random sample to keep k meaningful.
        centers[c] = samples[(rng() * n) | 0].slice()
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
  assignStep()
  const counts = new Array<number>(k).fill(0)
  for (let s = 0; s < n; s++) counts[assign[s]]++

  return { centers, counts }
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
