import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExtractOptions } from '../color/extract.ts'
import type { PaletteResult } from '../color/types.ts'
import type { ExtractRequest, ExtractResponse } from '../color/extract.worker.ts'

export type ExtractionStatus = 'idle' | 'working' | 'done' | 'error'

interface UseColorExtractionResult {
  /** Kick off analysis of a captured frame. Safe to call repeatedly; only the
   *  most recent request's result is surfaced. */
  extract: (image: ImageData, options?: ExtractOptions) => void
  result: PaletteResult | null
  status: ExtractionStatus
  error: string | null
  /** Clear state and invalidate any in-flight request (e.g. on Retake). */
  reset: () => void
}

/**
 * Runs the color-extraction pipeline in a Web Worker so the dense blob pass
 * never blocks the main thread during the reveal. Falls back to running on the
 * main thread if a module worker can't be constructed (older/embedded
 * webviews, or a non-browser test environment).
 *
 * Each `extract` call carries an incrementing id; late responses from a worker
 * that has since been superseded are dropped, so a fast Retake-then-recapture
 * can't paint a stale palette.
 */
export function useColorExtraction(): UseColorExtractionResult {
  const workerRef = useRef<Worker | null>(null)
  const reqIdRef = useRef(0)
  const [status, setStatus] = useState<ExtractionStatus>('idle')
  const [result, setResult] = useState<PaletteResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let worker: Worker | null = null
    try {
      worker = new Worker(
        new URL('../color/extract.worker.ts', import.meta.url),
        { type: 'module' },
      )
      worker.onmessage = (e: MessageEvent<ExtractResponse>) => {
        if (e.data.id !== reqIdRef.current) return // superseded — ignore
        setResult(e.data.result)
        setStatus('done')
      }
      worker.onerror = () => {
        setStatus('error')
        setError('Color analysis failed.')
      }
      workerRef.current = worker
    } catch {
      // No worker available — extract() will run on the main thread instead.
      workerRef.current = null
    }
    return () => {
      worker?.terminate()
      workerRef.current = null
    }
  }, [])

  const extract = useCallback((image: ImageData, options?: ExtractOptions) => {
    const id = ++reqIdRef.current
    setStatus('working')
    setError(null)

    const worker = workerRef.current
    if (worker) {
      // Transfer the pixel buffer (zero-copy). The ImageData is freshly read
      // from the canvas per capture and not reused after this, so detaching it
      // is fine.
      const { data, width, height } = image
      const buffer = data.buffer
      const req: ExtractRequest = { id, buffer, width, height, options }
      worker.postMessage(req, [buffer])
      return
    }

    // Main-thread fallback. Dynamic import keeps the algorithm out of the
    // initial bundle path taken when a worker is available.
    import('../color/extract.ts')
      .then(({ extractPalette }) => {
        if (id !== reqIdRef.current) return
        setResult(extractPalette(image, options))
        setStatus('done')
      })
      .catch(() => {
        if (id !== reqIdRef.current) return
        setStatus('error')
        setError('Color analysis failed.')
      })
  }, [])

  const reset = useCallback(() => {
    reqIdRef.current++ // invalidate any in-flight response
    setStatus('idle')
    setResult(null)
    setError(null)
  }, [])

  return { extract, result, status, error, reset }
}
