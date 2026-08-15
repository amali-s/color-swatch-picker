import { useEffect, useRef, useState } from 'react'

export type CameraStatus = 'pending' | 'ready' | 'error'

interface UseCameraResult {
  /** Attach this to the <video> element that should show the live feed. */
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: CameraStatus
  /** Human-readable reason when status === 'error', otherwise null. */
  error: string | null
}

/**
 * Requests the camera on mount and pipes the stream into a <video> element.
 *
 * Note: `getUserMedia` only works in a secure context — HTTPS or
 * http://localhost. Over plain HTTP (e.g. a LAN IP) the API is undefined and
 * this hook reports an error rather than throwing.
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<CameraStatus>('pending')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    // Guards against the StrictMode mount/unmount/mount cycle resolving a
    // getUserMedia promise after this effect has already been cleaned up.
    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setError(
          'Camera API unavailable. This needs a secure context — run over HTTPS or http://localhost.',
        )
        return
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setStatus('ready')
        setError(null)
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(describeCameraError(err))
      }
    }

    void start()

    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return { videoRef, status, error }
}

function describeCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Camera permission denied. Allow camera access and reload the page.'
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
