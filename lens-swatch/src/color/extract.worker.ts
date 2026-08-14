import { extractPalette } from './extract.ts'
import type { ExtractOptions } from './extract.ts'
import type { PaletteResult } from './types.ts'

export interface ExtractRequest {
  id: number
  /** Raw RGBA buffer, transferred (zero-copy) from the caller's ImageData. */
  buffer: ArrayBuffer
  width: number
  height: number
  options?: ExtractOptions
}

export interface ExtractResponse {
  id: number
  result: PaletteResult
}

// Keep the pixel work off the main thread so the dense blob pass can't stall
// the reveal. Typed via a local scope interface so this file needs only the DOM
// lib (`self`, `MessageEvent`) that the app tsconfig already pulls in — no
// separate WebWorker lib required.
interface WorkerScope {
  onmessage: ((e: MessageEvent<ExtractRequest>) => void) | null
  postMessage: (message: ExtractResponse) => void
}

const ctx = self as unknown as WorkerScope

ctx.onmessage = (e: MessageEvent<ExtractRequest>) => {
  const { id, buffer, width, height, options } = e.data
  const data = new Uint8ClampedArray(buffer)
  const result = extractPalette({ data, width, height }, options)
  ctx.postMessage({ id, result })
}
