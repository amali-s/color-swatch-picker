import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'pending' | 'ready' | 'error'

/** Which physical camera to prefer: front-facing ('user') or rear ('environment'). */
export type FacingMode = 'user' | 'environment'

interface UseCameraResult {
  /** Attach this to the <video> element that should show the live feed. */
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: CameraStatus
  /** Human-readable reason when status === 'error', otherwise null. */
  error: string | null
  /** The camera currently requested (front vs. rear). */
  facingMode: FacingMode
  /** True only when the device exposes more than one video input. */
  canSwitch: boolean
  /**
   * True while a facing flip is acquiring the other camera. Distinct from
   * initial `pending` — the capture card and live feed stay up.
   */
  switching: boolean
  /** Toggle between the front and rear camera. */
  switchCamera: () => void
  /**
   * Ask the camera to meter/focus at a normalized sensor point ([0,1] × [0,1],
   * origin top-left). No-op when the device or browser does not expose
   * Image Capture 3A constraints (typical on iOS Safari and most webcams).
   */
  focusAt: (x: number, y: number) => void
}

/**
 * Requests the camera on mount and pipes the stream into a <video> element.
 * Defaults to the rear camera ('environment') since the app is about pointing
 * at objects, and can switch to the front camera when the device has more than
 * one video input.
 *
 * A facing flip does not drop `status` back to `'pending'` (that path flashes
 * "Starting camera…" and unmounts CaptureTarget). After the first ready
 * stream, later facingMode changes set `switching` instead.
 *
 * `focusAt` asks the live track to meter at a point (Image Capture 3A:
 * pointsOfInterest + single-shot focus/exposure). Browsers and cameras that
 * do not expose those constraints no-op; the viewfinder reticle is the
 * always-on feedback.
 *
 * Note: `getUserMedia` only works in a secure context — HTTPS or
 * http://localhost. Over plain HTTP (e.g. a LAN IP) the API is undefined and
 * this hook reports an error rather than throwing.
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<CameraStatus>('pending')
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<FacingMode>('environment')
  const [canSwitch, setCanSwitch] = useState(false)
  const [switching, setSwitching] = useState(false)
  const hasBeenReadyRef = useRef(false)
  const trackRef = useRef<MediaStreamTrack | null>(null)

  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
  }, [])

  const focusAt = useCallback((x: number, y: number) => {
    void focusTrackAt(trackRef.current, x, y)
  }, [])

  useEffect(() => {
    let stream: MediaStream | null = null
    // Guards against the StrictMode mount/unmount/mount cycle (and camera
    // switches) resolving a getUserMedia promise after this effect has already
    // been cleaned up.
    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setError(
          'Camera API unavailable. This needs a secure context — run over HTTPS or http://localhost.',
        )
        return
      }

      const isSwitch = hasBeenReadyRef.current
      if (isSwitch) {
        setSwitching(true)
      } else {
        setStatus('pending')
      }

      try {
        // `ideal` (not `exact`) so a single-camera device falls back to its
        // only camera instead of throwing OverconstrainedError.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        trackRef.current = stream.getVideoTracks()[0] ?? null
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => {
            /* Autoplay can reject if the element is not yet visible; the
               `autoPlay` attribute retries when it is. */
          })
        }
        hasBeenReadyRef.current = true
        setStatus('ready')
        setSwitching(false)
        setError(null)

        // Now that permission is granted, device labels/counts are populated,
        // so we can tell whether a second camera exists to switch to.
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          if (cancelled) return
          const videoInputs = devices.filter((d) => d.kind === 'videoinput')
          setCanSwitch(videoInputs.length > 1)
        } catch {
          // enumerateDevices unsupported or threw — leave canSwitch as-is.
        }
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setSwitching(false)
        setError(describeCameraError(err))
      }
    }

    void start()

    return () => {
      cancelled = true
      trackRef.current = null
      // Stop the current stream's tracks BEFORE the next effect run requests a
      // new one — iOS Safari won't grant the second camera while the first is
      // still live.
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [facingMode])

  return {
    videoRef,
    status,
    error,
    facingMode,
    canSwitch,
    switching,
    switchCamera,
    focusAt,
  }
}

/** Image Capture extensions not yet in TypeScript's DOM lib. */
interface ImageCaptureCapabilities {
  focusMode?: string[]
  exposureMode?: string[]
}

interface ImageCaptureConstraintSet {
  pointsOfInterest?: { x: number; y: number }[]
  focusMode?: string
  exposureMode?: string
}

/**
 * Tap-to-focus via the Image Capture 3A constraints. `pointsOfInterest` is a
 * normalized sensor coordinate; `single-shot` focus/exposure matches a phone
 * camera tap (meter once at that point) when the device advertises it.
 */
async function focusTrackAt(
  track: MediaStreamTrack | null,
  x: number,
  y: number,
): Promise<void> {
  if (!track || track.readyState !== 'live') return
  if (!Number.isFinite(x) || !Number.isFinite(y)) return

  const nx = Math.min(1, Math.max(0, x))
  const ny = Math.min(1, Math.max(0, y))
  const point = { x: nx, y: ny }

  const caps = (typeof track.getCapabilities === 'function'
    ? track.getCapabilities()
    : {}) as ImageCaptureCapabilities

  const advanced: ImageCaptureConstraintSet = {
    pointsOfInterest: [point],
  }
  if (caps.focusMode?.includes('single-shot')) {
    advanced.focusMode = 'single-shot'
  }
  if (caps.exposureMode?.includes('single-shot')) {
    advanced.exposureMode = 'single-shot'
  }

  try {
    await track.applyConstraints({
      advanced: [advanced],
    } as unknown as MediaTrackConstraints)
  } catch {
    try {
      await track.applyConstraints({
        advanced: [{ pointsOfInterest: [point] }],
      } as unknown as MediaTrackConstraints)
    } catch {
      /* Device rejected the 3A hint — the on-screen reticle still stands in. */
    }
  }
}

function describeCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Camera permissions are denied. Enable camera and reload.'
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No camera was found on this device.'
      case 'NotReadableError':
        return 'The camera is already in use by another application.'
      default:
        return `Could not start the camera (${err.name}).`
    }
  }
  return 'Could not access the camera. This needs HTTPS or http://localhost.'
}
