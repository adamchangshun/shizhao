import { createHash } from 'node:crypto'
import sharp, { type OutputInfo } from 'sharp'
import { ApiError } from '../core/errors'
import { UploadErrors } from './errors'
import { heicToJpeg } from './heic'
import { MAX_INPUT_PIXELS, PROCESS_TIMEOUT_MS, SIZES } from './limits'
import type { UploadedFile } from './multipart'
import { sniffImageFormat, type ImageFormat } from './sniff'

export interface NormalizedImage {
  display: Buffer
  thumb: Buffer
  /** Dimensions of the display rendition, after EXIF orientation. */
  width: number
  height: number
  /** sha256 of the display rendition, used for per-project dedupe. */
  sha256: string
}

export type HeicPath = 'sharp' | 'heic-convert'

export interface NormalizeOptions {
  timeoutMs?: number
  /** Called with the decoder actually used for a HEIC/HEIF input. */
  onHeicPath?: (path: HeicPath) => void
}

const SHARP_INPUT = { limitInputPixels: MAX_INPUT_PIXELS, sequentialRead: true } as const
// metadata() parses headers only and never decodes pixels, so it can run without the cap.
const HEADER_ONLY = { limitInputPixels: false } as const

// sharp reports `heif` for HEIC/HEIF (and AVIF, which the sniffer already refused).
const SHARP_FORMAT: Record<ImageFormat, string> = {
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  heif: 'heif',
}

// Prebuilt sharp has no HEVC decoder; only this failure switches HEIC input to heic-convert.
const MISSING_DECODER = /not been built in|decoder plugin|no decoding plugin|unsupported codec/i
const SHARP_TIMEOUT = /\btimeout\b/i

/**
 * Validates one uploaded file by magic bytes and header dimensions, then renders the display and
 * thumb WebP renditions: auto-oriented, all metadata dropped (sharp writes none by default, and
 * colour is converted to sRGB without embedding a profile). Never decodes more than 40MP and
 * gives up after 20 seconds.
 */
export async function normalizeImage(
  file: UploadedFile,
  opts: NormalizeOptions = {},
): Promise<NormalizedImage> {
  const timeoutMs = opts.timeoutMs ?? PROCESS_TIMEOUT_MS
  const deadline = Date.now() + timeoutMs
  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(UploadErrors.timeout(file.name))
    }, timeoutMs)
  })
  const work = render(file, deadline, controller.signal, opts)
  try {
    return await Promise.race([work, timeout])
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err instanceof Error && SHARP_TIMEOUT.test(err.message))
      throw UploadErrors.timeout(file.name)
    console.warn('[assets] image processing failed', err)
    throw UploadErrors.corrupt(file.name)
  } finally {
    clearTimeout(timer)
    controller.abort()
    // Hold the caller's concurrency slot until the decoder has really stopped: after the abort,
    // the HEIC worker is terminated and any sharp pipeline ends at its own (remaining-time) timeout.
    // Header parsing (file-type, sharp metadata) has no cancel hook, so the wait is capped: a parser
    // that never returns can hold a slot for at most timeout + SETTLE_GRACE_MS.
    await settleWithin(work, SETTLE_GRACE_MS)
  }
}

const SETTLE_GRACE_MS = 5_000

async function settleWithin(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const grace = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  try {
    await Promise.race([work.then(noop, noop), grace])
  } finally {
    clearTimeout(timer)
  }
}

function noop(): void {}

/** Seconds left before the deadline, for sharp's own pipeline timeout (minimum 1). */
function secondsLeft(deadline: number): number {
  return Math.max(1, Math.ceil((deadline - Date.now()) / 1000))
}

async function render(
  file: UploadedFile,
  deadline: number,
  signal: AbortSignal,
  opts: NormalizeOptions,
): Promise<NormalizedImage> {
  const checkpoint = () => {
    if (signal.aborted) throw UploadErrors.timeout(file.name)
  }
  const format = await sniffImageFormat(file.tmpPath)
  if (!format) throw UploadErrors.unsupportedFormat(file.name)

  // Header-only read: dimensions are known before any pixel is decoded. The pixel cap is applied
  // here by hand (sharp would report it as a generic error), and again by sharp on every decode.
  const meta = await sharp(file.tmpPath, HEADER_ONLY).metadata()
  if (meta.format !== SHARP_FORMAT[format]) throw UploadErrors.unsupportedFormat(file.name)
  if (!meta.width || !meta.height) throw UploadErrors.corrupt(file.name)
  if (meta.width * meta.height > MAX_INPUT_PIXELS) throw UploadErrors.tooManyPixels(file.name)
  checkpoint()

  let display: { data: Buffer; info: OutputInfo }
  try {
    display = await renderDisplay(file.tmpPath, secondsLeft(deadline))
    if (format === 'heif') opts.onHeicPath?.('sharp')
  } catch (err) {
    if (format !== 'heif' || !(err instanceof Error) || !MISSING_DECODER.test(err.message))
      throw err
    checkpoint()
    const source = `${file.tmpPath}.jpg`
    // The worker re-checks the pixel count of the image it will decode before allocating it.
    const outcome = await heicToJpeg(file.tmpPath, source, MAX_INPUT_PIXELS, signal)
    if (outcome === 'too_many_pixels') throw UploadErrors.tooManyPixels(file.name)
    checkpoint()
    const converted = await sharp(source, HEADER_ONLY).metadata()
    if (!converted.width || !converted.height) throw UploadErrors.corrupt(file.name)
    if (converted.width * converted.height > MAX_INPUT_PIXELS)
      throw UploadErrors.tooManyPixels(file.name)
    display = await renderDisplay(source, secondsLeft(deadline))
    opts.onHeicPath?.('heic-convert')
  }
  checkpoint()

  const thumb = await sharp(display.data)
    .timeout({ seconds: secondsLeft(deadline) })
    .resize({
      width: SIZES.thumb.longEdge,
      height: SIZES.thumb.longEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: SIZES.thumb.quality })
    .toBuffer()

  return {
    display: display.data,
    thumb,
    width: display.info.width,
    height: display.info.height,
    sha256: createHash('sha256').update(display.data).digest('hex'),
  }
}

function renderDisplay(source: string, seconds: number) {
  return sharp(source, SHARP_INPUT)
    .timeout({ seconds })
    .rotate() // apply EXIF orientation; the output carries no metadata
    .resize({
      width: SIZES.display.longEdge,
      height: SIZES.display.longEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: SIZES.display.quality })
    .toBuffer({ resolveWithObject: true })
}
