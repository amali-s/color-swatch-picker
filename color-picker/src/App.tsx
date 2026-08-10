import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamera } from './hooks/useCamera'
import { useHoldTimer } from './hooks/useHoldTimer'
import './App.css'

/**
 * How long the user must press-and-hold to capture a frame.
 * Tune freely between 3000–5000ms.
 */
const HOLD_DURATION_MS = 3000

// PHASE 2: this hardcoded hex is a placeholder. Real color sampling (reading
// pixels from the captured canvas and computing the dominant color) will
// replace it, and `copyText` below will use the sampled value instead.
const PLACEHOLDER_HEX = '#FFFFFF'

type CopyState = 'idle' | 'copied' | 'error'

export default function App() {
  const { videoRef, status, error } = useCamera()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Draw the current video frame onto the canvas. Runs synchronously at the
  // moment the hold completes, while the <video> is still mounted and playing.
  const handleCapture = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) return

    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, width, height)

    // PHASE 2: sample pixel data here, e.g.
    //   const { data } = ctx.getImageData(0, 0, width, height)
    // then run the color-extraction algorithm to produce the real hex value.
  }, [videoRef])

  const { state, progress, start, cancel, reset } = useHoldTimer(
    HOLD_DURATION_MS,
    handleCapture,
  )

  const [copyState, setCopyState] = useState<CopyState>('idle')
  const copyResetRef = useRef<number | null>(null)

  const handleCopy = useCallback(async () => {
    // PHASE 2: replace PLACEHOLDER_HEX with the sampled color hex string.
    const copyText = PLACEHOLDER_HEX
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }
      // Called directly from the click handler to satisfy the browser's
      // user-gesture requirement for clipboard writes.
      await navigator.clipboard.writeText(copyText)
      setCopyState('copied')
    } catch {
      // Rejects in non-secure contexts (non-HTTPS) or when permission is denied.
      setCopyState('error')
    }
    if (copyResetRef.current) window.clearTimeout(copyResetRef.current)
    copyResetRef.current = window.setTimeout(() => setCopyState('idle'), 1500)
  }, [])

  useEffect(
    () => () => {
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current)
    },
    [],
  )

  const isCaptured = state === 'captured'

  return (
    <main className="app">
      <h1>color-picker</h1>

      {status === 'error' ? (
        <p className="message error" role="alert">
          {error}
        </p>
      ) : (
        <>
          <p className="message">
            {status === 'pending' && 'Requesting camera access…'}
            {status === 'ready' && !isCaptured &&
              `Press and hold for ${HOLD_DURATION_MS / 1000}s to capture a frame.`}
            {isCaptured && 'Frame captured. Tap the image or Retake to try again.'}
          </p>

          <div
            className="stage"
            // Pointer down starts the hold; releasing or leaving the area
            // before the threshold cancels it. start()/cancel() self-guard on
            // the current state, so these are safe to fire in any phase.
            onPointerDown={start}
            onPointerUp={cancel}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
          >
            <video
              ref={videoRef}
              className="feed"
              autoPlay
              muted
              playsInline
            />

            {state === 'holding' && <HoldProgress progress={progress} />}

            {/* Canvas is always mounted (so it exists when the frame is drawn)
                but only shown and interactive once captured. */}
            <canvas
              ref={canvasRef}
              className={`capture${isCaptured ? '' : ' is-hidden'}`}
              onClick={isCaptured ? reset : undefined}
              title={isCaptured ? 'Tap to retake' : undefined}
            />
          </div>

          {isCaptured && (
            <div className="controls">
              <button type="button" onClick={handleCopy}>
                {copyState === 'copied'
                  ? 'Copied!'
                  : copyState === 'error'
                    ? 'Copy failed'
                    : `Copy ${PLACEHOLDER_HEX}`}
              </button>
              <button type="button" onClick={reset}>
                Retake
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}

/** Minimal circular progress indicator shown while holding. */
function HoldProgress({ progress }: { progress: number }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  return (
    <div className="progress" aria-live="polite" aria-label="Hold progress">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle className="progress-track" cx="55" cy="55" r={radius} />
        <circle
          className="progress-bar"
          cx="55"
          cy="55"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          transform="rotate(-90 55 55)"
        />
      </svg>
      <span className="progress-label">{Math.round(progress * 100)}%</span>
    </div>
  )
}
