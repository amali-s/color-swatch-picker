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
  /** Toggle between the front and rear camera. */
  switchCamera: () => void
}

/**
 * Requests the camera on mount and pipes the stream into a <video> element.
 * Defaults to the rear camera ('environment') since the app is about pointing
 * at objects, and can switch to the front camera when the device has more than
 * one video input.
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

  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
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

      // Re-entering (a facingMode change) — return to the pending state while
      // the new stream is acquired.
      setStatus('pending')

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
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setStatus('ready')
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
        setError(describeCameraError(err))
      }
    }

    void start()

    return () => {
      cancelled = true
      // Stop the current stream's tracks BEFORE the next effect run requests a
      // new one — iOS Safari won't grant the second camera while the first is
      // still live.
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [facingMode])

  return { videoRef, status, error, facingMode, canSwitch, switchCamera }
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
