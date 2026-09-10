import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareSwatchesByLightness,
  hexLightness,
  sortSwatchesByLightness,
} from './swatchOrder.ts'
import { srgbToOklab } from './oklab.ts'

function swatch(hex: string) {
  return { id: `detected-${hex}`, hex }
}

test('white sorts before black', () => {
  const sorted = sortSwatchesByLightness([swatch('000000'), swatch('FFFFFF')])
  assert.deepEqual(
    sorted.map((s) => s.hex),
    ['FFFFFF', '000000'],
  )
})

test('light gray sorts above dark gray', () => {
  const sorted = sortSwatchesByLightness([swatch('333333'), swatch('CCCCCC')])
  assert.deepEqual(
    sorted.map((s) => s.hex),
    ['CCCCCC', '333333'],
  )
})

test('primaries follow OKLab L, not lexicographic hex', () => {
  const red = swatch('FF0000')
  const green = swatch('00FF00')
  const blue = swatch('0000FF')
  const white = swatch('FFFFFF')
  const black = swatch('000000')

  const lGreen = srgbToOklab([0, 255, 0])[0]
  const lRed = srgbToOklab([255, 0, 0])[0]
  const lBlue = srgbToOklab([0, 0, 255])[0]
  assert.ok(lGreen > lRed && lRed > lBlue, 'fixture: green lighter than red than blue')

  const sorted = sortSwatchesByLightness([black, red, blue, green, white])
  assert.deepEqual(
    sorted.map((s) => s.hex),
    ['FFFFFF', '00FF00', 'FF0000', '0000FF', '000000'],
  )

  // Lexicographic descending hex would put red (#FF0000) above green (#00FF00).
  assert.ok(compareSwatchesByLightness(green, red) < 0)
  assert.ok('FF0000'.localeCompare('00FF00') > 0)
})

test('equal lightness ties break by uppercase hex ascending', () => {
  // Unparsable hexes share INVALID_L; order is then the hex string.
  const sorted = sortSwatchesByLightness([
    swatch('ZZZZZZ'),
    swatch('HHHHHH'),
    swatch('GGGGGG'),
  ])
  assert.deepEqual(
    sorted.map((s) => s.hex),
    ['GGGGGG', 'HHHHHH', 'ZZZZZZ'],
  )
  assert.equal(hexLightness('GGGGGG'), hexLightness('ZZZZZZ'))
})

test('hash prefix and mixed case do not change rank', () => {
  assert.equal(compareSwatchesByLightness({ hex: '#fffFff' }, { hex: 'FFFFFF' }), 0)
  const sorted = sortSwatchesByLightness([
    { hex: '#000000' },
    { hex: 'ffffff' },
  ])
  assert.equal(sorted[0]?.hex, 'ffffff')
})

test('invalid hex does not throw and sinks below black', () => {
  const sorted = sortSwatchesByLightness([
    swatch('000000'),
    swatch('GGGGGG'),
    swatch('FFF'),
    swatch('FFFFFF'),
  ])
  assert.deepEqual(
    sorted.map((s) => s.hex),
    ['FFFFFF', '000000', 'FFF', 'GGGGGG'],
  )
  assert.ok(hexLightness('not-a-color') < hexLightness('000000'))
})

test('sortSwatchesByLightness does not mutate the input', () => {
  const input = [swatch('000000'), swatch('FFFFFF')]
  const copy = [...input]
  sortSwatchesByLightness(input)
  assert.deepEqual(input, copy)
})
