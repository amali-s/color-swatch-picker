import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractPalette } from './extract.ts'
import type { ImageLike } from './extract.ts'
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

  // Every reported color should be near one of the three true band colors.
  const truths = [RED, GREEN, BLUE]
  for (const cluster of result.clusters) {
    const near = truths.some((t) => {
      const dr = cluster.rgb[0] - t[0]
      const dg = cluster.rgb[1] - t[1]
      const db = cluster.rgb[2] - t[2]
      return Math.sqrt(dr * dr + dg * dg + db * db) < 30
    })
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

test('INVARIANT: blob density does not change the reported colors', () => {
  // Same seed → identical k-means. Only the dense (positioning) stride differs.
  const img = bandsImage()
  const dense = extractPalette(img, { seed: 99, denseStep: 2 })
  const sparse = extractPalette(img, { seed: 99, denseStep: 16 })

  const denseHexes = dense.clusters.map((c) => c.hex)
  const sparseHexes = sparse.clusters.map((c) => c.hex)
  // Colors, order, and proportions are all driven by the clustering pass, so
  // they must be byte-identical regardless of how the blobs were sampled.
  assert.deepEqual(denseHexes, sparseHexes)
  assert.deepEqual(
    dense.clusters.map((c) => c.count),
    sparse.clusters.map((c) => c.count),
  )
  // The positioning pass is what changed, so its cell counts may differ.
  assert.notEqual(dense.meta.denseCells, sparse.meta.denseCells)
})

test('does not crash when a cluster has no contiguous region (k > distinct colors)', () => {
  // Two colors but k=3 forces a near-duplicate center that may claim no cells.
  const img = makeImage(40, 40, (x) => (x < 20 ? [15, 15, 15] : [240, 240, 240]))
  const result = extractPalette(img, { seed: 3, k: 3 })
  assert.equal(result.clusters.length, 3)
  for (const cluster of result.clusters) {
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
  const img = makeImage(48, 48, (x, y) =>
    (x + y) % 2 === 0 ? [200, 40, 40] : [40, 40, 200],
  )
  const result = extractPalette(img, { seed: 5, denseStep: 4 })
  assert.ok(result.clusters.length >= 1)
  for (const cluster of result.clusters) {
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
})
