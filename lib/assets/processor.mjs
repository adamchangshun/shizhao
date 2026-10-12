// Image processor child process (module 03). The parent (lib/assets/normalize.ts) forks one per
// image and SIGKILLs it on timeout, so every step that parses untrusted bytes — magic-byte sniff,
// header read, decode, HEIC conversion — runs where it can always be stopped. Plain ESM on
// purpose: it is started by path, never bundled.
//
// Request (IPC):  { input, displayOut, thumbOut, maxPixels, sizes }
// Reply (IPC):    { ok: true, width, height, heicPath?, peakRssMb }
//               | { ok: false, code: 'unsupported_format' | 'too_many_pixels' | 'corrupt', detail?, peakRssMb }
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileTypeFromFile } from 'file-type'
import sharp from 'sharp'

const require = createRequire(import.meta.url)

// Only these MIME types (from magic bytes) are accepted. AVIF, HEIC sequences, GIF, SVG, PDF and
// everything else are refused. Extension and client Content-Type are never consulted.
const ACCEPTED = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heif',
  'image/heif': 'heif',
}

// Prebuilt sharp has no HEVC decoder; only this failure switches HEIC input to heic-convert.
const MISSING_DECODER = /not been built in|decoder plugin|no decoding plugin|unsupported codec/i

class Refusal extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

function peakRssMb() {
  try {
    const kb = /^VmHWM:\s+(\d+)\s+kB/m.exec(readFileSync('/proc/self/status', 'utf8'))?.[1]
    if (kb) return Math.round(Number(kb) / 1024)
  } catch {
    // not Linux
  }
  return Math.round(process.resourceUsage().maxRSS / 1024)
}

async function headerSize(source) {
  // Header-only read: never decodes pixels, so it runs without sharp's pixel cap.
  const meta = await sharp(source, { limitInputPixels: false }).metadata()
  if (!meta.width || !meta.height) throw new Refusal('corrupt')
  return { format: meta.format, pixels: meta.width * meta.height }
}

function renderDisplay(source, job) {
  return sharp(source, { limitInputPixels: job.maxPixels, sequentialRead: true })
    .rotate() // apply EXIF orientation; sharp writes no metadata unless asked to
    .resize({
      width: job.sizes.display.longEdge,
      height: job.sizes.display.longEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: job.sizes.display.quality })
    .toBuffer({ resolveWithObject: true })
}

/** heic-convert decodes heic-decode's data[0], which need not be the image sharp measured. */
async function heicToJpeg(input, job) {
  const convertPath = require.resolve('heic-convert')
  const convert = require(convertPath)
  const decode = createRequire(convertPath)('heic-decode')
  const buffer = readFileSync(input)
  const images = await decode.all({ buffer }) // parses the container; allocates no pixels
  const first = images[0]
  const pixels = first ? first.width * first.height : 0
  images.dispose()
  if (!(pixels > 0)) throw new Refusal('corrupt')
  if (pixels > job.maxPixels) throw new Refusal('too_many_pixels')
  return Buffer.from(await convert({ buffer, format: 'JPEG', quality: 0.92 }))
}

async function run(job) {
  const type = await fileTypeFromFile(job.input)
  const format = type ? ACCEPTED[type.mime] : undefined
  if (!format) throw new Refusal('unsupported_format')
  const head = await headerSize(job.input)
  // sharp reports 'heif' for HEIC/HEIF; any disagreement with the sniff is refused.
  if (head.format !== format) throw new Refusal('unsupported_format')
  if (head.pixels > job.maxPixels) throw new Refusal('too_many_pixels')

  let display
  let heicPath
  try {
    display = await renderDisplay(job.input, job)
    if (format === 'heif') heicPath = 'sharp'
  } catch (err) {
    if (format !== 'heif' || !MISSING_DECODER.test(String(err?.message))) throw err
    const jpeg = await heicToJpeg(job.input, job)
    const converted = await headerSize(jpeg)
    if (converted.pixels > job.maxPixels) throw new Refusal('too_many_pixels')
    display = await renderDisplay(jpeg, job)
    heicPath = 'heic-convert'
  }

  const thumb = await sharp(display.data)
    .resize({
      width: job.sizes.thumb.longEdge,
      height: job.sizes.thumb.longEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: job.sizes.thumb.quality })
    .toBuffer()

  await writeFile(job.displayOut, display.data, { flag: 'wx', mode: 0o600 })
  await writeFile(job.thumbOut, thumb, { flag: 'wx', mode: 0o600 })
  return { ok: true, width: display.info.width, height: display.info.height, heicPath }
}

process.once('message', (job) => {
  run(job)
    .catch((err) =>
      err instanceof Refusal
        ? { ok: false, code: err.code }
        : { ok: false, code: 'corrupt', detail: String(err?.message ?? err).slice(0, 300) },
    )
    .then((reply) => process.send({ ...reply, peakRssMb: peakRssMb() }, () => process.exit(0)))
})
