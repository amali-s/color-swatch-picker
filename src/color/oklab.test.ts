import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oklabDistSq, oklabToSrgb, srgbToOklab } from './oklab.ts'
import type { RGB } from './types.ts'

function maxChannelErr(a: RGB, b: RGB): number {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]),
  )
}

test('OKLab round-trip on sRGB primaries and gray stays within ~2 levels', () => {
  const samples: RGB[] = [
    [0, 0, 0],
    [255, 255, 255],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [128, 128, 128],
    [64, 64, 64],
    [192, 128, 64],
  ]
  for (const rgb of samples) {
    const back = oklabToSrgb(srgbToOklab(rgb))
    const err = maxChannelErr(rgb, back)
    assert.ok(
      err <= 2,
      `round-trip of ${rgb.join(',')} drifted by ${err} (got ${back.map((v) => v.toFixed(3)).join(',')})`,
    )
  }
})

test('OKLab of black / white / gray has the expected L and near-zero a/b', () => {
  const black = srgbToOklab([0, 0, 0])
  const white = srgbToOklab([255, 255, 255])
  const gray = srgbToOklab([128, 128, 128])
  assert.ok(Math.abs(black[0]) < 1e-6, `black L should be ~0, got ${black[0]}`)
  assert.ok(Math.abs(white[0] - 1) < 1e-5, `white L should be ~1, got ${white[0]}`)
  assert.ok(gray[0] > black[0] && gray[0] < white[0])
  for (const lab of [black, white, gray]) {
    assert.ok(Math.abs(lab[1]) < 1e-4, `neutral a drifted: ${lab[1]}`)
    assert.ok(Math.abs(lab[2]) < 1e-4, `neutral b drifted: ${lab[2]}`)
  }
})

test('oklabDistSq is zero for identical points and positive otherwise', () => {
  const red = srgbToOklab([220, 30, 30])
  const green = srgbToOklab([30, 200, 30])
  assert.equal(oklabDistSq(red, red), 0)
  assert.ok(oklabDistSq(red, green) > 0)
})
