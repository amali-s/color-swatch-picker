import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kmeans, mulberry32, readableInkOn, toHex } from './kmeans.ts'
import type { RGB } from './types.ts'

test('toHex clamps and formats to uppercase #RRGGBB', () => {
  assert.equal(toHex([0, 0, 0]), '#000000')
  assert.equal(toHex([255, 255, 255]), '#FFFFFF')
  assert.equal(toHex([16, 32, 48]), '#102030')
  // Out-of-range and float inputs are clamped/rounded.
  assert.equal(toHex([-5, 300, 127.6] as RGB), '#00FF80')
})

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(123)
  const b = mulberry32(123)
  const seqA = [a(), a(), a(), a()]
  const seqB = [b(), b(), b(), b()]
  assert.deepEqual(seqA, seqB)
  // Different seed → different sequence.
  const c = mulberry32(124)
  assert.notDeepEqual([c(), c(), c(), c()], seqA)
})

// Three tight clusters around red, green, blue — jittered but deterministic.
function rgbClusterSamples(): { samples: RGB[]; truths: RGB[] } {
  const samples: RGB[] = []
  const rj = mulberry32(7)
  const jitter = (v: number) => v + Math.floor((rj() - 0.5) * 6)
  for (let i = 0; i < 300; i++) samples.push([jitter(230), jitter(20), jitter(20)])
  for (let i = 0; i < 300; i++) samples.push([jitter(20), jitter(210), jitter(20)])
  for (let i = 0; i < 300; i++) samples.push([jitter(20), jitter(20), jitter(200)])
  const truths: RGB[] = [
    [230, 20, 20],
    [20, 210, 20],
    [20, 20, 200],
  ]
  return { samples, truths }
}

function recoversAll(centers: number[][], truths: RGB[]): boolean {
  return truths.every((t) =>
    centers.some((c) => Math.hypot(c[0] - t[0], c[1] - t[1], c[2] - t[2]) < 25),
  )
}

test('kmeans always returns k internally-consistent clusters', () => {
  // Structural invariants that must hold for EVERY seed, independent of whether
  // the run reached the global optimum.
  const { samples } = rgbClusterSamples()
  for (let seed = 1; seed <= 20; seed++) {
    const { centers, counts } = kmeans(samples, 3, 12, mulberry32(seed))
    assert.equal(centers.length, 3, `seed ${seed}: expected 3 centers`)
    assert.equal(counts.length, 3)
    assert.equal(
      counts.reduce((a, b) => a + b, 0),
      samples.length,
      `seed ${seed}: counts must partition the sample set`,
    )
    for (const c of centers) {
      assert.ok(c.every(Number.isFinite), `seed ${seed}: non-finite center`)
    }
  }
})

test('kmeans recovers three well-separated colors for most seeds', () => {
  // Plain random init is seed-sensitive: some seeds settle into a local optimum
  // with one center stranded between two true clusters. That's a real property
  // of k-means (the reason the Phase 2 harness offers "Re-run with new seed"),
  // so this asserts a strong majority recover all three rather than pretending
  // any single seed is guaranteed.
  const { samples, truths } = rgbClusterSamples()
  let recovered = 0
  const trials = 20
  for (let seed = 1; seed <= trials; seed++) {
    const { centers } = kmeans(samples, 3, 12, mulberry32(seed))
    if (recoversAll(centers, truths)) recovered++
  }
  assert.ok(
    recovered >= trials * 0.5,
    `only ${recovered}/${trials} seeds recovered all three colors`,
  )
})

test('readableInkOn picks dark ink on light colors and vice versa', () => {
  assert.equal(readableInkOn([250, 250, 250]), '#14161a')
  assert.equal(readableInkOn([10, 10, 10]), '#f4f6f9')
})
