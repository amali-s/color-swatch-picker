import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isHeicMime, mightBeImageFile, sniffImageMime, snapshotPhotoBlob } from './photoFile.ts'

describe('mightBeImageFile', () => {
  it('accepts a normal JPEG MIME', () => {
    assert.equal(mightBeImageFile({ type: 'image/jpeg', name: 'a.jpg' }), true)
  })

  it('accepts empty MIME from Android / Google Photos', () => {
    assert.equal(mightBeImageFile({ type: '', name: 'IMG_1234' }), true)
  })

  it('accepts generic octet-stream', () => {
    assert.equal(mightBeImageFile({ type: 'application/octet-stream', name: 'photo' }), true)
  })

  it('rejects an explicit non-image type without an image extension', () => {
    assert.equal(mightBeImageFile({ type: 'video/mp4', name: 'clip.mp4' }), false)
  })

  it('accepts a missing MIME when the name looks like a photo', () => {
    assert.equal(mightBeImageFile({ type: 'video/mp4', name: 'clip.jpg' }), true)
  })
})

describe('sniffImageMime', () => {
  it('recognizes JPEG SOI', () => {
    assert.equal(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
  })

  it('recognizes PNG', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    assert.equal(sniffImageMime(png), 'image/png')
  })

  it('recognizes GIF', () => {
    assert.equal(sniffImageMime(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), 'image/gif')
  })

  it('recognizes WebP', () => {
    const webp = new Uint8Array(12)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x45, 0x42, 0x50], 8)
    assert.equal(sniffImageMime(webp), 'image/webp')
  })

  it('recognizes HEIC ftyp brand', () => {
    const heic = new Uint8Array(12)
    heic.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])
    assert.equal(sniffImageMime(heic), 'image/heic')
  })

  it('returns null for unknown bytes', () => {
    assert.equal(sniffImageMime(new Uint8Array([0x00, 0x01, 0x02])), null)
  })
})

describe('isHeicMime', () => {
  it('flags HEIC / HEIF types', () => {
    assert.equal(isHeicMime('image/heic'), true)
    assert.equal(isHeicMime('image/heif'), true)
    assert.equal(isHeicMime('image/jpeg'), false)
  })
})

describe('snapshotPhotoBlob', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])

  it('recovers image/jpeg when Google Photos omits the MIME type', async () => {
    const file = new File([jpeg], 'IMG_1234', { type: '' })
    const { mime, blob } = await snapshotPhotoBlob(file)
    assert.equal(mime, 'image/jpeg')
    assert.equal(blob.type, 'image/jpeg')
    assert.equal(blob.size, jpeg.byteLength)
  })

  it('recovers image/jpeg from application/octet-stream', async () => {
    const file = new File([jpeg], 'photo', { type: 'application/octet-stream' })
    const { mime } = await snapshotPhotoBlob(file)
    assert.equal(mime, 'image/jpeg')
  })

  it('rejects an empty file', async () => {
    const file = new File([], 'empty.jpg', { type: 'image/jpeg' })
    await assert.rejects(() => snapshotPhotoBlob(file), { message: 'Could not read that photo' })
  })
})
