import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamera } from './hooks/useCamera'
import { useHoldTimer } from './hooks/useHoldTimer'
import { useColorExtraction } from './hooks/useColorExtraction'
import { readableInkOn } from './color/kmeans'
import type { Cluster } from './color/types'
import './App.css'

/**
 * How long the user must press-and-hold to capture a frame.
 * Tune freely between 3000–5000ms.
 */
const HOLD_DURATION_MS = 3000

export default function App() {
  const { videoRef, status: cameraStatus, error: cameraError } = useCamera()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const {
    extract,
    result,
    status: extractStatus,
    error: extractError,
    reset: resetExtraction,
  } = useColorExtraction()

  // Capture a single frame at the instant the hold completes (progress === 1),
  // then hand its pixels to the extraction pipeline. Single frame, no averaging
  // — multi-frame averaging is a Phase 3 stretch goal, deliberately out of
  // scope here (see roadmap Phase 3). Runs synchronously inside the hold
  // timer's completion tick, while <video> is still mounted and playing, so it
  // fires exactly once per completed hold.
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

    // One frame's pixels → k-means (colors) + blob detection (positions).
    const frame = ctx.getImageData(0, 0, width, height)
    extract(frame)
  }, [videoRef, extract])

  const { state, progress, start, cancel, reset } = useHoldTimer(
    HOLD_DURATION_MS,
    handleCapture,
  )

  const handleReset = useCallback(() => {
    reset()
    resetExtraction()
  }, [reset, resetExtraction])

  const isCaptured = state === 'captured'

  return (
    <main className="app">
      <h1>color-picker</h1>

      {cameraStatus === 'error' ? (
        <p className="message error" role="alert">
          {cameraError}
        </p>
      ) : (
        <>
          <p className="message">
            {cameraStatus === 'pending' && 'Requesting camera access…'}
            {cameraStatus === 'ready' && !isCaptured &&
              `Press and hold for ${HOLD_DURATION_MS / 1000}s to capture a frame.`}
            {isCaptured &&
              extractStatus === 'working' &&
              'Reading the colors…'}
            {isCaptured &&
              extractStatus !== 'working' &&
              'Frame captured. Tap the image or Retake to try again.'}
          </p>

          <div
            className="stage"
            ref={stageRef}
            // Pointer down starts the hold; releasing or leaving the area
            // before the threshold cancels it. start()/cancel() self-guard on
            // the current state, so these are safe to fire in any phase.
            onPointerDown={start}
            onPointerUp={cancel}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
          >
            <video ref={videoRef} className="feed" autoPlay muted playsInline />

            {state === 'holding' && <HoldProgress progress={progress} />}

            {/* Canvas is always mounted (so it exists when the frame is drawn)
                but only shown and interactive once captured. */}
            <canvas
              ref={canvasRef}
              className={`capture${isCaptured ? '' : ' is-hidden'}`}
              onClick={isCaptured ? handleReset : undefined}
              title={isCaptured ? 'Tap to retake' : undefined}
            />

            {/* Tooltip markers anchored to each color's largest contiguous
                region, mapped through the same object-fit: cover geometry the
                frozen frame is displayed with. */}
            {isCaptured && extractStatus === 'done' && result && (
              <AnchorMarkers
                clusters={result.clusters}
                imageWidth={result.meta.width}
                imageHeight={result.meta.height}
                stageRef={stageRef}
              />
            )}
          </div>

          {isCaptured && (
            <RevealPanel
              status={extractStatus}
              error={extractError}
              clusters={result?.clusters ?? []}
              onRetake={handleReset}
            />
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

type CopyState = 'idle' | 'copied' | 'error'

/** The swatch list + copy controls shown under the frozen frame after capture. */
function RevealPanel({
  status,
  error,
  clusters,
  onRetake,
}: {
  status: ReturnType<typeof useColorExtraction>['status']
  error: string | null
  clusters: Cluster[]
  onRetake: () => void
}) {
  if (status === 'working') {
    // NOTE: no deliberate minimum-duration loading state here — that's an open
    // Phase 4 follow-up, intentionally out of scope for Phase 3.
    return (
      <p className="message" aria-live="polite">
        Analyzing…
      </p>
    )
  }
  if (status === 'error') {
    return (
      <div className="controls">
        <p className="message error" role="alert">
          {error ?? 'Color analysis failed.'}
        </p>
        <button type="button" onClick={onRetake}>
          Retake
        </button>
      </div>
    )
  }

  return (
    <div className="reveal">
      <ul className="swatches">
        {clusters.map((cluster, i) => (
          <SwatchRow key={`${cluster.hex}-${i}`} cluster={cluster} rank={i + 1} />
        ))}
      </ul>
      <p className="reveal-note">
        Each color is averaged across the whole frame — everywhere it appears.
        The marker just points to the largest area it fills.
      </p>
      <div className="controls">
        <button type="button" onClick={onRetake}>
          Retake
        </button>
      </div>
    </div>
  )
}

/** One color row: chip, hex, share of frame, and a per-color copy button. */
function SwatchRow({ cluster, rank }: { cluster: Cluster; rank: number }) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const copyResetRef = useRef<number | null>(null)

  const handleCopy = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }
      // Called directly from the click handler to satisfy the browser's
      // user-gesture requirement for clipboard writes.
      await navigator.clipboard.writeText(cluster.hex)
      setCopyState('copied')
    } catch {
      // Rejects in non-secure contexts (non-HTTPS) or when permission is denied.
      setCopyState('error')
    }
    if (copyResetRef.current) window.clearTimeout(copyResetRef.current)
    copyResetRef.current = window.setTimeout(() => setCopyState('idle'), 1500)
  }, [cluster.hex])

  useEffect(
    () => () => {
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current)
    },
    [],
  )

  return (
    <li className="swatch">
      <span
        className="swatch-chip"
        style={{ background: cluster.hex, color: readableInkOn(cluster.rgb) }}
        aria-hidden="true"
      >
        {rank}
      </span>
      <span className="swatch-hex">{cluster.hex}</span>
      <span className="swatch-pct">{(cluster.proportion * 100).toFixed(1)}%</span>
      <button
        type="button"
        className="swatch-copy"
        onClick={handleCopy}
        aria-label={`Copy ${cluster.hex}`}
      >
        {copyState === 'copied'
          ? 'Copied!'
          : copyState === 'error'
            ? 'Failed'
            : 'Copy'}
      </button>
    </li>
  )
}

/**
 * Positions a small marker at each color's anchor. The frozen frame is shown
 * with object-fit: cover, so normalized image coords have to be pushed through
 * the same scale-and-center transform to line up with what's on screen.
 * Clusters with no contiguous region (anchor === null) get no marker.
 */
function AnchorMarkers({
  clusters,
  imageWidth,
  imageHeight,
  stageRef,
}: {
  clusters: Cluster[]
  imageWidth: number
  imageHeight: number
  stageRef: React.RefObject<HTMLDivElement | null>
}) {
  const [box, setBox] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [stageRef])

  if (!box.w || !box.h || !imageWidth || !imageHeight) return null

  // object-fit: cover — scale so the image fills the box, center the overflow.
  const scale = Math.max(box.w / imageWidth, box.h / imageHeight)
  const displayW = imageWidth * scale
  const displayH = imageHeight * scale
  const offsetX = (box.w - displayW) / 2
  const offsetY = (box.h - displayH) / 2

  return (
    <div className="markers" aria-hidden="true">
      {clusters.map((cluster, i) => {
        if (!cluster.anchor) return null
        const px = offsetX + cluster.anchor.x * displayW
        const py = offsetY + cluster.anchor.y * displayH
        // Clamp so an anchor in a cropped-out region still reads at the edge.
        const leftPct = Math.max(0, Math.min(100, (px / box.w) * 100))
        const topPct = Math.max(0, Math.min(100, (py / box.h) * 100))
        return (
          <span
            key={`${cluster.hex}-${i}`}
            className="marker"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              background: cluster.hex,
              color: readableInkOn(cluster.rgb),
            }}
          >
            <span className="marker-hex">{cluster.hex}</span>
          </span>
        )
      })}
    </div>
  )
}
