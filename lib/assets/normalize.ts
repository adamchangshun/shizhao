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
  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(UploadErrors.timeout(file.name))
    }, timeoutMs)
  })
  try {
    return await Promise.race([render(file, timeoutMs, controller.signal, opts), timeout])
  } catch (err) {
    if (err instanceof ApiError) throw err
    console.warn('[assets] image processing failed', err)
    throw UploadErrors.corrupt(file.name)
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

async function render(
  file: UploadedFile,
  timeoutMs: number,
  signal: AbortSignal,
  opts: NormalizeOptions,
): Promise<NormalizedImage> {
  const format = await sniffImageFormat(file.tmpPath)
  if (!format) throw UploadErrors.unsupportedFormat(file.name)

  // Header-only read: dimensions are known before any pixel is decoded. The pixel cap is applied
  // here by hand (sharp would report it as a generic error), and again by sharp on every decode.
  const meta = await sharp(file.tmpPath, HEADER_ONLY).metadata()
  if (meta.format !== SHARP_FORMAT[format]) throw UploadErrors.unsupportedFormat(file.name)
  if (!meta.width || !meta.height) throw UploadErrors.corrupt(file.name)
  if (meta.width * meta.height > MAX_INPUT_PIXELS) throw UploadErrors.tooManyPixels(file.name)

  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000))
  let source = file.tmpPath
  let display: { data: Buffer; info: OutputInfo }
  try {
    display = await renderDisplay(source, seconds)
    if (format === 'heif') opts.onHeicPath?.('sharp')
  } catch (err) {
    if (format !== 'heif' || signal.aborted) throw err
    // Prebuilt sharp ships without an HEVC decoder: convert to JPEG first, then retry.
    source = `${file.tmpPath}.jpg`
    await heicToJpeg(file.tmpPath, source, signal)
    const converted = await sharp(source, HEADER_ONLY).metadata()
    if (!converted.width || !converted.height) throw UploadErrors.corrupt(file.name)
    if (converted.width * converted.height > MAX_INPUT_PIXELS)
      throw UploadErrors.tooManyPixels(file.name)
    display = await renderDisplay(source, seconds)
    opts.onHeicPath?.('heic-convert')
  }
  if (signal.aborted) throw UploadErrors.timeout(file.name)

  const thumb = await sharp(display.data)
    .timeout({ seconds })
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
