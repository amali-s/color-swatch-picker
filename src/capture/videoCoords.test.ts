import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampZoomTransform,
  coverPointToNorm,
  coverZoomCrop,
  maxPan,
  pinchStep,
  viewportPointToLayer,
} from './videoCoords.ts'

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

test('zoom pulls the tapped point toward the viewport center', () => {
  // At 2x about the center, the left edge of the screen shows what used to be
  // a quarter of the way in, so the same tap reads a more central sensor point.
  const plain = coverPointToNorm(0, 200, 400, 400, 400, 400)
  const zoomed = coverPointToNorm(0, 200, 400, 400, 400, 400, { zoom: 2, tx: 0, ty: 0 })
  assert.ok(plain && zoomed)
  assert.equal(plain.x, 0)
  assert.ok(Math.abs(zoomed.x - 0.25) < 1e-9, `expected 0.25, got ${zoomed.x}`)
  assert.equal(zoomed.y, 0.5)
})

test('crop at 1x matches the plain cover crop', () => {
  // 16:9 sensor in a 1:2 viewport: full height, sides cropped.
  const crop = coverZoomCrop(400, 800, 1920, 1080)
  assert.deepEqual(crop, { sx: 690, sy: 0, sw: 540, sh: 1080 })
})

test('crop at 2x about the center halves the sampled region', () => {
  const crop = coverZoomCrop(400, 400, 1000, 1000, { zoom: 2, tx: 0, ty: 0 })
  assert.deepEqual(crop, { sx: 250, sy: 250, sw: 500, sh: 500 })
})

test('crop keeps the viewport aspect ratio at every zoom', () => {
  const crop = coverZoomCrop(400, 800, 1920, 1080, { zoom: 3, tx: 40, ty: -20 })
  assert.ok(crop)
  assert.ok(
    Math.abs(crop.sw / crop.sh - 400 / 800) < 0.01,
    `expected 0.5, got ${crop.sw / crop.sh}`,
  )
})

test('crop never samples outside the frame, even with an unclamped pan', () => {
  const crop = coverZoomCrop(400, 400, 1000, 1000, { zoom: 2, tx: 9999, ty: -9999 })
  assert.ok(crop)
  assert.ok(crop.sx >= 0 && crop.sy >= 0)
  assert.ok(crop.sx + crop.sw <= 1000)
  assert.ok(crop.sy + crop.sh <= 1000)
})

test('crop returns null before the stream reports a size', () => {
  assert.equal(coverZoomCrop(400, 400, 0, 0), null)
})

test('pan is bounded so the scaled feed still covers the viewport', () => {
  assert.equal(maxPan(400, 1), 0)
  assert.equal(maxPan(400, 2), 200)

  // Zoom saturates at 4x, which allows ±600 of pan; only the y overshoot bites.
  const clamped = clampZoomTransform({ zoom: 9, tx: 500, ty: -900 }, 400, 400, 1, 4)
  assert.equal(clamped.zoom, 4)
  assert.equal(clamped.tx, 500)
  assert.equal(clamped.ty, -600)

  // At 1x there is no room to pan at all.
  assert.deepEqual(clampZoomTransform({ zoom: 1, tx: 80, ty: 80 }, 400, 400, 1, 4), {
    zoom: 1,
    tx: 0,
    ty: 0,
  })
})

/** A pinch centered on the viewport, starting from the given transform. */
const pinchFromCenter = (view = 400, transform = { zoom: 1, tx: 0, ty: 0 }) => ({
  distance: 100,
  anchor: viewportPointToLayer(view / 2, view / 2, view, view, transform),
  transform,
})

test('fingers apart zooms in, fingers together zooms out', () => {
  const start = pinchFromCenter()
  const apart = pinchStep(start, 200, 200, 200, 400, 400, 1, 4)
  const together = pinchStep(start, 50, 200, 200, 400, 400, 1, 4)

  assert.equal(apart.zoom, 2)
  // 1x is the floor, so pinching in from 1x has nowhere to go.
  assert.equal(together.zoom, 1)

  const fromTwoX = pinchFromCenter(400, { zoom: 2, tx: 0, ty: 0 })
  assert.equal(pinchStep(fromTwoX, 50, 200, 200, 400, 400, 1, 4).zoom, 1)
  assert.equal(pinchStep(fromTwoX, 150, 200, 200, 400, 400, 1, 4).zoom, 3)
})

test('zoom saturates at the ceiling without the feed drifting', () => {
  const start = pinchFromCenter()
  const wayPastMax = pinchStep(start, 5000, 200, 200, 400, 400, 1, 4)
  assert.equal(wayPastMax.zoom, 4)
  // Pan is derived from the clamped zoom, so a centered pinch stays centered.
  assert.equal(wayPastMax.tx, 0)
  assert.equal(wayPastMax.ty, 0)
})

test('the point pinched on stays under the fingers', () => {
  const view = 400
  const transform = { zoom: 1, tx: 0, ty: 0 }
  // Pinch about a point up and to the left of center, then drift the midpoint.
  const anchor = viewportPointToLayer(120, 160, view, view, transform)
  const start = { distance: 100, anchor, transform }

  const next = pinchStep(start, 150, 180, 200, view, view, 1, 4)
  const under = viewportPointToLayer(180, 200, view, view, next)
  assert.ok(Math.abs(under.x - anchor.x) < 1e-9, `x drifted to ${under.x}`)
  assert.ok(Math.abs(under.y - anchor.y) < 1e-9, `y drifted to ${under.y}`)
})

test('a pinch never pans the feed off its own edge', () => {
  const start = pinchFromCenter()
  // Fingers shoved into the corner while barely zooming.
  const next = pinchStep(start, 105, 0, 0, 400, 400, 1, 4)
  const limit = maxPan(400, next.zoom)
  assert.ok(Math.abs(next.tx) <= limit + 1e-9, `tx ${next.tx} exceeds ${limit}`)
  assert.ok(Math.abs(next.ty) <= limit + 1e-9, `ty ${next.ty} exceeds ${limit}`)
})
