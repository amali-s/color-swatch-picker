/**
 * Decode a user-picked photo into a canvas-ready frame.
 *
 * Android Chrome + Google Photos is a special case the naive
 * `file.type.startsWith('image/')` + `URL.createObjectURL(file)` path
 * cannot handle:
 *
 *   1. The picker often hands over a File with an empty MIME type (or
 *      `application/octet-stream`). Rejecting on `type` drops real JPEGs.
 *   2. The File is frequently a content-provider proxy. Reading it later
 *      (Image `src` after createObjectURL) fails with NotReadableError /
 *      ERR_UPLOAD_FILE_CHANGED because Google Photos has already closed
 *      the underlying URI. The bytes have to be copied in the change
 *      handler, before any await that isn't the copy itself.
 *   3. Cloud-only / HEIC originals still fail to decode; callers surface
 *      that as a toast after the snapshot.
 */

export class PhotoFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhotoFileError'
  }
}

export interface StillFrame {
  width: number
  height: number
  source: CanvasImageSource
  close: () => void
}

const EMPTY_OR_GENERIC = new Set(['', 'application/octet-stream', 'binary/octet-stream'])

const HEIC_BRANDS = new Set(['heic', 'heix', 'heif', 'hevc', 'hevx', 'mif1', 'msf1'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

/** JPEG / PNG / GIF / WebP / HEIF / AVIF magic. `null` if unknown. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
    if (HEIC_BRANDS.has(brand)) return 'image/heic'
    if (AVIF_BRANDS.has(brand)) return 'image/avif'
  }
  return null
}

export function isHeicMime(mime: string): boolean {
  return mime === 'image/heic' || mime === 'image/heif' || mime.endsWith('heic-sequence') || mime.endsWith('heif-sequence')
}

/**
 * True when the File metadata is not a hard "this is not an image".
 * Empty / generic MIME is allowed — Google Photos on Android omits it.
 */
export function mightBeImageFile(file: { type: string; name?: string }): boolean {
  if (EMPTY_OR_GENERIC.has(file.type)) return true
  if (file.type.startsWith('image/')) return true
  const name = file.name ?? ''
  return /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(name)
}

/**
 * Copy the picker's File into a Blob we own, with a real image MIME.
 * This is the Android/Google Photos-safe ingest step; decode comes after.
 */
export async function snapshotPhotoBlob(file: File): Promise<{ blob: Blob; mime: string }> {
  if (!mightBeImageFile(file)) {
    throw new PhotoFileError('Choose a photo to swatch')
  }

  let buffer: ArrayBuffer
  try {
    // Copy immediately. Delayed reads of Google Photos proxies fail.
    buffer = await file.arrayBuffer()
  } catch {
    throw new PhotoFileError('Could not read that photo')
  }
  if (buffer.byteLength === 0) {
    throw new PhotoFileError('Could not read that photo')
  }

  const sniffed = sniffImageMime(new Uint8Array(buffer))
  const declared = file.type.startsWith('image/') ? file.type : ''
  const mime = sniffed ?? declared

  if (!mime) {
    throw new PhotoFileError('Choose a photo to swatch')
  }

  return { blob: new Blob([buffer], { type: mime }), mime }
}

export async function decodePhotoFile(file: File): Promise<StillFrame> {
  const { blob, mime } = await snapshotPhotoBlob(file)
  try {
    return await bitmapFromBlob(blob)
  } catch {
    throw new PhotoFileError(
      isHeicMime(mime)
        ? "This photo's format isn't supported. Save it as JPEG and try again."
        : 'Could not read that photo',
    )
  }
}

async function bitmapFromBlob(blob: Blob): Promise<StillFrame> {
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    } catch {
      bitmap = await createImageBitmap(blob)
    }
    if (!bitmap.width || !bitmap.height) {
      bitmap.close()
      throw new Error('empty bitmap')
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => bitmap.close(),
    }
  }
  return decodeWithImage(blob)
}

function decodeWithImage(blob: Blob): Promise<StillFrame> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error('empty image'))
        return
      }
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        source: img,
        close: () => {
          img.src = ''
        },
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image decode failed'))
    }
    img.src = url
  })
}
