import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractPalette } from './extract.ts'
import type { ImageLike } from './extract.ts'
import { oklabDistSq, srgbToOklab } from './oklab.ts'
import type { RGB } from './types.ts'

/** Build an opaque RGBA frame from a per-pixel color function. */
function makeImage(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => RGB,
): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const [r, g, b] = colorAt(x, y)
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

const RED: RGB = [220, 30, 30]
const GREEN: RGB = [30, 200, 30]
const BLUE: RGB = [30, 30, 210]

/** Three solid vertical bands: red | green | blue. */
function bandsImage(w = 60, h = 60): ImageLike {
  return makeImage(w, h, (x) => (x < w / 3 ? RED : x < (2 * w) / 3 ? GREEN : BLUE))
}

test('extracts three clusters whose colors match the bands', () => {
  const result = extractPalette(bandsImage(), { seed: 1 })
  assert.equal(result.clusters.length, 3)
  assert.ok(result.clusters.length <= 3)
  assert.ok(result.clusters.length <= 6)
  assert.equal(
    result.clusters.reduce((sum, c) => sum + c.count, 0),
    result.meta.sparseSamples,
  )
  // Saturated mid-L bands survive L/chroma filters, so every 2-D cell is fed
  // to k-means.
  assert.equal(result.meta.sparseSamples, Math.ceil(60 / 4) * Math.ceil(60 / 4))

  // Solid bands should land near the true red/green/blue in OKLab.
  const truths = [RED, GREEN, BLUE]
  const thresholdSq = 0.05 * 0.05
  for (const cluster of result.clusters) {
    const lab = srgbToOklab(cluster.rgb)
    const near = truths.some((t) => oklabDistSq(lab, srgbToOklab(t)) < thresholdSq)
    assert.ok(near, `cluster ${cluster.hex} not near any band color`)
  }

  // Solid bands are contiguous, so every cluster gets a real anchor in [0,1].
  for (const cluster of result.clusters) {
    assert.ok(cluster.anchor, `expected an anchor for ${cluster.hex}`)
    assert.ok(cluster.anchor!.x >= 0 && cluster.anchor!.x <= 1)
    assert.ok(cluster.anchor!.y >= 0 && cluster.anchor!.y <= 1)
    assert.ok(cluster.blobCells > 0)
  }
})

test('membership ignores blob density; hex is deterministic at a given denseStep', () => {
  // Same seed → identical k-means. Only the dense (positioning) stride differs.
  const img = bandsImage()
  const dense = extractPalette(img, { seed: 99, denseStep: 2 })
  const sparse = extractPalette(img, { seed: 99, denseStep: 16 })
  const denseAgain = extractPalette(img, { seed: 99, denseStep: 2 })

  // Count, proportion, and cluster order stay post-merge k-means — blob
  // density must not reshuffle membership. Hex is allowed to differ across
  // denseStep.
  assert.deepEqual(
    dense.clusters.map((c) => c.count),
    sparse.clusters.map((c) => c.count),
  )
  assert.deepEqual(
    dense.clusters.map((c) => c.proportion),
    sparse.clusters.map((c) => c.proportion),
  )
  assert.notEqual(dense.meta.denseCells, sparse.meta.denseCells)

  // Same seed + same denseStep → hex is deterministic.
  assert.deepEqual(
    dense.clusters.map((c) => c.hex),
    denseAgain.clusters.map((c) => c.hex),
  )
})

test('reported hex sits on the blob interior, not the cluster-mean of a shadow patch', () => {
  const INTERIOR: RGB = [220, 40, 40]
  const SHADOW: RGB = [100, 15, 15]
  const w = 96
  const h = 48
  // Large bright-red field, a smaller disconnected darker patch of the same
  // hue (so k-means keeps them in one cluster), plus green and blue bands.
  const img = makeImage(w, h, (x, y) => {
    if (y >= 24 && y < 28) return GREEN // gap so shadow is its own blob
    if (y >= 28 && x < 48) return SHADOW
    if (x < 48) return INTERIOR
    if (x < 72) return GREEN
    return BLUE
  })

  const result = extractPalette(img, { seed: 11, k: 3 })
  assert.equal(result.clusters.length, 3)

  const thresholdSq = 0.05 * 0.05
  const interiorLab = srgbToOklab(INTERIOR)
  const shadowLab = srgbToOklab(SHADOW)
  const mix: RGB = [
    Math.round(0.55 * INTERIOR[0] + 0.45 * SHADOW[0]),
    Math.round(0.55 * INTERIOR[1] + 0.45 * SHADOW[1]),
    Math.round(0.55 * INTERIOR[2] + 0.45 * SHADOW[2]),
  ]
  const mixLab = srgbToOklab(mix)

  const red = result.clusters.find(
    (c) => oklabDistSq(srgbToOklab(c.rgb), interiorLab) < thresholdSq,
  )
  assert.ok(red, 'expected a cluster near the large interior red')
  // Bright + dark patches together are ~45% of the frame; if k-means split
  // them this proportion would be closer to ~0.25.
  assert.ok(
    red.proportion > 0.35,
    `red proportion ${red.proportion} should include the shadow patch in the same cluster`,
  )
  // Mean-centroid of interior+shadow lands near `mix`; blob-core median
  // should stay on the large interior, not halfway to the shadow.
  assert.ok(
    oklabDistSq(srgbToOklab(red.rgb), interiorLab) <
      oklabDistSq(srgbToOklab(red.rgb), mixLab),
    `hex ${red.hex} should be closer to the interior than to the mean mix`,
  )
  assert.ok(
    oklabDistSq(srgbToOklab(red.rgb), shadowLab) > 0.08 * 0.08,
    `hex ${red.hex} should not sit on the shadow patch`,
  )
})

test('does not crash when a cluster has no contiguous region (k > distinct colors)', () => {
  // Two colors but k=3 used to force a near-duplicate center. Merge collapses
  // that ghost so the user sees 2 chips (near-black and near-white), not 3.
  const NEAR_BLACK: RGB = [15, 15, 15]
  const NEAR_WHITE: RGB = [240, 240, 240]
  const img = makeImage(40, 40, (x) => (x < 20 ? NEAR_BLACK : NEAR_WHITE))
  const result = extractPalette(img, { seed: 3, k: 3 })
  assert.equal(result.clusters.length, 2)
  assert.ok(result.clusters.length <= 3)
  assert.ok(result.clusters.length <= 6)
  assert.equal(
    result.clusters.reduce((sum, c) => sum + c.count, 0),
    result.meta.sparseSamples,
  )
  const thresholdSq = 0.05 * 0.05
  assert.ok(
    result.clusters.some(
      (c) => oklabDistSq(srgbToOklab(c.rgb), srgbToOklab(NEAR_BLACK)) < thresholdSq,
    ),
    'expected a near-black cluster',
  )
  assert.ok(
    result.clusters.some(
      (c) => oklabDistSq(srgbToOklab(c.rgb), srgbToOklab(NEAR_WHITE)) < thresholdSq,
    ),
    'expected a near-white cluster',
  )
  for (const cluster of result.clusters) {
    assert.ok(cluster.rgb.every(Number.isFinite), `non-finite rgb for ${cluster.hex}`)
    assert.match(cluster.hex, /^#[0-9A-F]{6}$/)
    // Anchor is either null (no region) or a finite normalized point.
    if (cluster.anchor) {
      assert.ok(Number.isFinite(cluster.anchor.x) && Number.isFinite(cluster.anchor.y))
      assert.equal(cluster.blobCells > 0, true)
    } else {
      assert.equal(cluster.blobCells, 0)
    }
  }
})

test('handles scattered pixels without crashing and keeps anchors finite', () => {
  // Fine checkerboard: colors are spatially scattered at the dense-grid scale.
  // Stride-4 sampling lands on one parity, so k-means sees a single hue and
  // merge collapses the three identical centers. Still must not throw.
  const img = makeImage(48, 48, (x, y) =>
    (x + y) % 2 === 0 ? [200, 40, 40] : [40, 40, 200],
  )
  const result = extractPalette(img, { seed: 5, k: 3, denseStep: 4 })
  assert.equal(result.clusters.length, 1)
  for (const cluster of result.clusters) {
    assert.ok(cluster.rgb.every(Number.isFinite), `non-finite rgb for ${cluster.hex}`)
    assert.match(cluster.hex, /^#[0-9A-F]{6}$/)
    if (cluster.anchor) {
      assert.ok(cluster.anchor.x >= 0 && cluster.anchor.x <= 1)
      assert.ok(cluster.anchor.y >= 0 && cluster.anchor.y <= 1)
    }
  }
})

test('degenerate frame (all transparent) yields no clusters, no throw', () => {
  const data = new Uint8ClampedArray(20 * 20 * 4) // alpha 0 everywhere
  const result = extractPalette({ data, width: 20, height: 20 })
  assert.equal(result.clusters.length, 0)
  assert.equal(result.meta.sparseSamples, 0)
})

test('reports separate timings for the clustering and blob passes', () => {
  const result = extractPalette(bandsImage(120, 120), { seed: 2 })
  assert.ok(result.meta.kmeansMs >= 0)
  assert.ok(result.meta.blobMs >= 0)
  assert.ok(result.meta.totalMs >= result.meta.kmeansMs)
  assert.equal(result.meta.kmeansStep, 4)
})

test('2-D grid recovers a thin unique-color band a 1-D p+=12 walk would miss', () => {
  // Unique green lives only on y % 12 === 4 and x % 12 !== 0. Width 96 is a
  // multiple of 12, so a 1-D `p += 12` walk only hits x % 12 === 0 on those
  // rows and would never see green. The 2-D stride-4 grid samples (4, 8, …)
  // on those rows and must still form a green cluster.
  const UNIQUE: RGB = [30, 200, 30]
  const LEFT: RGB = [220, 30, 30]
  const RIGHT: RGB = [30, 30, 210]
  const w = 96
  const h = 96
  const img = makeImage(w, h, (x, y) => {
    if (y % 12 === 4 && x % 12 !== 0) return UNIQUE
    return x < w / 2 ? LEFT : RIGHT
  })

  const result = extractPalette(img, { seed: 7, k: 3 })
  assert.equal(result.clusters.length, 3)
  assert.equal(result.meta.kmeansStep, 4)

  const thresholdSq = 0.05 * 0.05
  const unique = result.clusters.find(
    (c) => oklabDistSq(srgbToOklab(c.rgb), srgbToOklab(UNIQUE)) < thresholdSq,
  )
  assert.ok(unique, `expected the unique band among ${result.clusters.map((c) => c.hex).join(', ')}`)
})

test('highlights and shadows do not steal a cluster when real colors remain', () => {
  const WHITE: RGB = [255, 255, 255]
  const BLACK: RGB = [0, 0, 0]
  const w = 96
  const h = 96
  // Small specular / shadow patches — far enough in OKLab that k-means++
  // would spend a center on them if they were sampled, but small enough that
  // pass-2 blob-core still sits on the real surface they get labeled onto.
  const img = makeImage(w, h, (x, y) => {
    if (x < 16 && y < 16) return WHITE
    if (x < 16 && y >= 80) return BLACK
    if (x < 32) return RED
    if (x < 64) return GREEN
    return BLUE
  })

  const result = extractPalette(img, { seed: 13, k: 3 })
  assert.equal(result.clusters.length, 3)

  const gridCells = Math.ceil(w / 4) * Math.ceil(h / 4)
  assert.ok(
    result.meta.sparseSamples < gridCells,
    `sparseSamples ${result.meta.sparseSamples} should drop white/black vs grid ${gridCells}`,
  )
  assert.ok(result.meta.sparseSamples >= 3)

  const whiteLab = srgbToOklab(WHITE)
  const blackLab = srgbToOklab(BLACK)
  const extremeSq = 0.08 * 0.08
  for (const cluster of result.clusters) {
    const lab = srgbToOklab(cluster.rgb)
    assert.ok(
      oklabDistSq(lab, whiteLab) > extremeSq,
      `cluster ${cluster.hex} must not be the white specular`,
    )
    assert.ok(
      oklabDistSq(lab, blackLab) > extremeSq,
      `cluster ${cluster.hex} must not be the black shadow`,
    )
  }

  const thresholdSq = 0.05 * 0.05
  const truths = [RED, GREEN, BLUE]
  for (const truth of truths) {
    const near = result.clusters.some(
      (c) => oklabDistSq(srgbToOklab(c.rgb), srgbToOklab(truth)) < thresholdSq,
    )
    assert.ok(near, `expected a cluster near ${truth.join(',')} among ${result.clusters.map((c) => c.hex).join(', ')}`)
  }
})

test('all-near-black + all-near-white falls back to the unfiltered grid', () => {
  const w = 40
  const h = 40
  const img = makeImage(w, h, (x) => (x < 20 ? [0, 0, 0] : [255, 255, 255]))
  const result = extractPalette(img, { seed: 3, k: 3 })
  // Unfiltered grid still feeds k=3; merge collapses the leftover duplicate.
  assert.equal(result.clusters.length, 2)
  const gridCells = Math.ceil(w / 4) * Math.ceil(h / 4)
  // Every opaque cell is extreme-L, so k-means sees the unfiltered 2-D grid.
  assert.equal(result.meta.sparseSamples, gridCells)
  for (const cluster of result.clusters) {
    assert.ok(cluster.rgb.every(Number.isFinite), `non-finite rgb for ${cluster.hex}`)
    assert.match(cluster.hex, /^#[0-9A-F]{6}$/)
  }
})

test('low-chroma cells are checkerboard-down-weighted', () => {
  const w = 20
  const h = 20
  const img = makeImage(w, h, () => [128, 128, 128])
  const result = extractPalette(img, { seed: 1, k: 3 })
  // One gray; leftover k-means centers merge rather than mint extra chips.
  assert.equal(result.clusters.length, 1)
  // 5×5 grid; keep cells where (gx + gy) is even → 13 of 25. Mid-gray is
  // not extreme-L, so this is chroma down-weight, not the unfiltered fallback.
  assert.equal(result.meta.sparseSamples, 13)
})

test('chroma down-weight falls back to the unfiltered grid when under k samples', () => {
  // 2×2 grid, checkerboard keeps 2 cells < k=3, so the opaque grid is used.
  const img = makeImage(8, 8, () => [128, 128, 128])
  const result = extractPalette(img, { seed: 1, k: 3 })
  assert.equal(result.clusters.length, 1)
  assert.equal(result.meta.sparseSamples, 4)
})

test('near-duplicate red centers merge; green and blue stay', () => {
  // Two close reds (OKLab ΔE ≈ 0.025, under the merge threshold) plus green
  // and blue, sized so k-means at k=4 spends a center on each red. Merge must
  // collapse the reds and not invent a fourth chip.
  const RED_A: RGB = [220, 30, 30]
  const RED_B: RGB = [230, 40, 40]
  const w = 96
  const h = 48
  const img = makeImage(w, h, (x) =>
    x < w / 4 ? RED_A : x < w / 2 ? RED_B : x < (3 * w) / 4 ? GREEN : BLUE,
  )
  const result = extractPalette(img, { seed: 1, k: 4 })
  assert.equal(result.clusters.length, 3)
  assert.ok(result.clusters.length <= 4)
  assert.ok(result.clusters.length <= 6)
  assert.equal(
    result.clusters.reduce((sum, c) => sum + c.count, 0),
    result.meta.sparseSamples,
  )

  const thresholdSq = 0.05 * 0.05
  const hexes = result.clusters.map((c) => c.hex).join(', ')
  const reds = result.clusters.filter((c) => {
    const lab = srgbToOklab(c.rgb)
    return (
      oklabDistSq(lab, srgbToOklab(RED_A)) < thresholdSq ||
      oklabDistSq(lab, srgbToOklab(RED_B)) < thresholdSq
    )
  })
  assert.equal(reds.length, 1, `expected one red among ${hexes}`)
  assert.ok(
    result.clusters.some(
      (c) => oklabDistSq(srgbToOklab(c.rgb), srgbToOklab(GREEN)) < thresholdSq,
    ),
    `expected green among ${hexes}`,
  )
  assert.ok(
    result.clusters.some(
      (c) => oklabDistSq(srgbToOklab(c.rgb), srgbToOklab(BLUE)) < thresholdSq,
    ),
    `expected blue among ${hexes}`,
  )
})

test('distinct red and green do not merge at the OKLab threshold', () => {
  const img = makeImage(60, 40, (x) => (x < 30 ? RED : GREEN))
  const result = extractPalette(img, { seed: 1, k: 3 })
  assert.equal(result.clusters.length, 2)
  const thresholdSq = 0.05 * 0.05
  assert.ok(
    result.clusters.some(
      (c) => oklabDistSq(srgbToOklab(c.rgb), srgbToOklab(RED)) < thresholdSq,
    ),
    'expected a red cluster',
  )
  assert.ok(
    result.clusters.some(
      (c) => oklabDistSq(srgbToOklab(c.rgb), srgbToOklab(GREEN)) < thresholdSq,
    ),
    'expected a green cluster',
  )
  const labs = result.clusters.map((c) => srgbToOklab(c.rgb))
  assert.ok(
    oklabDistSq(labs[0], labs[1]) >= thresholdSq,
    'red and green must stay above the merge threshold',
  )
})
