import { srgbToOklab } from './oklab.ts'
import type { RGB } from './types.ts'

/**
 * Unparsable hex is treated as darker than black so it sinks to the bottom
 * of a light→dark list without throwing.
 */
const INVALID_L = -1

interface HexSwatch {
  hex: string
}

/**
 * Parse a 6-digit hex (optional leading `#`, any case) to 8-bit sRGB.
 * Returns `null` for anything that is not exactly RRGGBB.
 */
function parseHexRgb(hex: string): RGB | null {
  const raw = hex.startsWith('#') ? hex.slice(1) : hex
  if (!/^[0-9A-Fa-f]{6}$/.test(raw)) return null
  const n = Number.parseInt(raw, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function normalizeHex(hex: string): string {
  const raw = hex.startsWith('#') ? hex.slice(1) : hex
  return raw.toUpperCase()
}

/** OKLab L for a swatch hex, or `INVALID_L` when the string is not RRGGBB. */
export function hexLightness(hex: string): number {
  const rgb = parseHexRgb(hex)
  if (!rgb) return INVALID_L
  return srgbToOklab(rgb)[0]
}

/**
 * Lightest first (OKLab L descending), then uppercase hex ascending so equal-L
 * colors stay in a stable, reload-safe order. Not lexicographic hex order:
 * `#FF0000` is not “closer to white” than `#00FF00`.
 */
export function compareSwatchesByLightness(a: HexSwatch, b: HexSwatch): number {
  const dL = hexLightness(b.hex) - hexLightness(a.hex)
  if (dL !== 0) return dL
  return normalizeHex(a.hex).localeCompare(normalizeHex(b.hex))
}

/** New array, lightest → darkest. Does not mutate `swatches`. */
export function sortSwatchesByLightness<T extends HexSwatch>(swatches: T[]): T[] {
  return [...swatches].sort(compareSwatchesByLightness)
}
