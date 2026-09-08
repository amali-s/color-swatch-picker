import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coverPointToNorm } from './videoCoords.ts'

test('matching aspect maps viewport corners and center onto 0–1', () => {
  const view = { w: 400, h: 400 }
  const video = { w: 1920, h: 1920 }
  assert.deepEqual(coverPointToNorm(0, 0, view.w, view.h, video.w, video.h), {
    x: 0,
    y: 0,
  })
  assert.deepEqual(coverPointToNorm(400, 400, view.w, view.h, video.w, video.h), {
    x: 1,
    y: 1,
  })
  assert.deepEqual(coverPointToNorm(200, 200, view.w, view.h, video.w, video.h), {
    x: 0.5,
    y: 0.5,
  })
})

test('wide video in a tall viewport crops the sides', () => {
  // 16:9 into 1:2 — height fills, left/right are cropped.
  const point = coverPointToNorm(0, 400, 400, 800, 1920, 1080)
  assert.ok(point)
  assert.equal(point.y, 0.5)
  assert.ok(point.x > 0.3 && point.x < 0.4, `left edge should be inset, got ${point.x}`)
  const center = coverPointToNorm(200, 400, 400, 800, 1920, 1080)
  assert.ok(center)
  assert.ok(Math.abs(center.x - 0.5) < 1e-9)
  assert.ok(Math.abs(center.y - 0.5) < 1e-9)
})

test('tall video in a wide viewport crops the top and bottom', () => {
  const point = coverPointToNorm(400, 0, 800, 400, 1080, 1920)
  assert.ok(point)
  assert.equal(point.x, 0.5)
  assert.ok(point.y > 0.3 && point.y < 0.4, `top edge should be inset, got ${point.y}`)
})

test('returns null when either box has no size', () => {
  assert.equal(coverPointToNorm(10, 10, 0, 400, 1920, 1080), null)
  assert.equal(coverPointToNorm(10, 10, 400, 400, 0, 1080), null)
})
