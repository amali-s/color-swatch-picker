import { test } from 'node:test'
import assert from 'node:assert/strict'
import { largestBlobs } from './blob.ts'

/** Build a labels grid from a rows-of-numbers layout for readable fixtures. */
function grid(rows: number[][]): { labels: Int8Array; w: number; h: number } {
  const h = rows.length
  const w = rows[0].length
  const labels = new Int8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) labels[y * w + x] = rows[y][x]
  }
  return { labels, w, h }
}

test('picks the largest contiguous region, not the scattered specks', () => {
  // Label 0 has a solid 3x2 block on the left and two lone specks on the right.
  const { labels, w, h } = grid([
    [0, 0, 0, 1, 0],
    [0, 0, 0, 1, 1],
    [0, 0, 0, 1, 0],
  ])
  const blobs = largestBlobs(labels, w, h, 2)
  const zero = blobs[0]
  assert.ok(zero)
  assert.equal(zero.size, 9) // the whole left 3x3 column region
  // Centroid sits inside the block (columns 0–2), not pulled toward the specks.
  assert.ok(zero.cx <= 1.1, `cx ${zero.cx} should be within the left block`)
})

test('returns null for a label with no cells (no crash on zero pixels)', () => {
  const { labels, w, h } = grid([
    [0, 0],
    [0, 0],
  ])
  const blobs = largestBlobs(labels, w, h, 3)
  assert.equal(blobs[0]?.size, 4)
  assert.equal(blobs[1], null) // label 1 never appears
  assert.equal(blobs[2], null) // label 2 never appears
})

test('scattered (checkerboard) label yields size-1 blobs without crashing', () => {
  const { labels, w, h } = grid([
    [0, 1, 0, 1],
    [1, 0, 1, 0],
    [0, 1, 0, 1],
  ])
  const blobs = largestBlobs(labels, w, h, 2)
  // 4-connectivity: no two same-label cells touch, so the largest blob is 1.
  assert.equal(blobs[0]?.size, 1)
  assert.equal(blobs[1]?.size, 1)
  // Centroids are finite grid coordinates.
  assert.ok(Number.isFinite(blobs[0]!.cx) && Number.isFinite(blobs[0]!.cy))
})

test('negative labels are treated as empty and never join a component', () => {
  const { labels, w, h } = grid([
    [-1, -1, 0],
    [-1, 0, 0],
  ])
  const blobs = largestBlobs(labels, w, h, 1)
  assert.equal(blobs[0]?.size, 3) // only the three 0-cells, empties excluded
})
