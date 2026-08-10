import { useCallback, useEffect, useRef, useState } from 'react'

export type HoldState = 'idle' | 'holding' | 'captured'

interface UseHoldTimerResult {
  state: HoldState
  /** 0 → 1 progress toward capture while `state === 'holding'`. */
  progress: number
  /** Begin a hold (no-op unless currently idle). */
  start: () => void
  /** Abort an in-progress hold and return to idle (no-op unless holding). */
  cancel: () => void
  /** Return to idle from any state, e.g. a "Retake". */
  reset: () => void
}

/**
 * Hold-to-capture state machine: idle → holding → captured.
 *
 * `start` kicks off a hold; if `cancel` is called before `durationMs` elapses
 * it falls back to idle. Once the full duration is held it transitions to
 * `captured` and invokes `onCapture` exactly once. Progress is driven by
 * requestAnimationFrame so the visual indicator stays smooth.
 */
export function useHoldTimer(
  durationMs: number,
  onCapture: () => void,
): UseHoldTimerResult {
  const [state, setState] = useState<HoldState>('idle')
  const [progress, setProgress] = useState(0)

  // Mirror of `state` for synchronous transition guards inside callbacks/RAF,
  // avoiding stale-closure reads of the state variable.
  const stateRef = useRef<HoldState>('idle')
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef(0)

  // Keep the latest callback without making the RAF loop depend on it.
  const onCaptureRef = useRef(onCapture)
  onCaptureRef.current = onCapture

  const setPhase = useCallback((next: HoldState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const tick = useCallback(() => {
    const elapsed = performance.now() - startTimeRef.current
    const next = Math.min(elapsed / durationMs, 1)
    setProgress(next)

    if (next >= 1) {
      rafRef.current = null
      setPhase('captured')
      onCaptureRef.current()
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [durationMs, setPhase])

  const start = useCallback(() => {
    if (stateRef.current !== 'idle') return
    setPhase('holding')
    startTimeRef.current = performance.now()
    setProgress(0)
    stopRaf()
    rafRef.current = requestAnimationFrame(tick)
  }, [setPhase, stopRaf, tick])

  const cancel = useCallback(() => {
    if (stateRef.current !== 'holding') return
    stopRaf()
    setProgress(0)
    setPhase('idle')
  }, [setPhase, stopRaf])

  const reset = useCallback(() => {
    stopRaf()
    setProgress(0)
    setPhase('idle')
  }, [setPhase, stopRaf])

  // Cancel any pending frame if the component unmounts mid-hold.
  useEffect(() => stopRaf, [stopRaf])

  return { state, progress, start, cancel, reset }
}
