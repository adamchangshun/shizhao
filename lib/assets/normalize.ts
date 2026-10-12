import { fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ApiError } from '../core/errors'
import { UploadErrors } from './errors'
import { MAX_INPUT_PIXELS, PROCESS_TIMEOUT_MS, SIZES } from './limits'
import type { UploadedFile } from './multipart'

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
  /** Pixel cap; defaults to MAX_INPUT_PIXELS (tests lower it). */
  maxPixels?: number
  /** Called with the processor child's pid once it is started (tests). */
  onChild?: (pid: number) => void
  /** Called with the processor child's peak resident memory, in MB (tests, memory probe). */
  onChildPeakRss?: (mb: number) => void
}

type Reply =
  | { ok: true; width: number; height: number; heicPath?: HeicPath; peakRssMb: number }
  | {
      ok: false
      code: 'unsupported_format' | 'too_many_pixels' | 'corrupt'
      detail?: string
      peakRssMb: number
    }

/** Plain ESM, started by path so the bundler never rewrites it (see the file header). */
const PROCESSOR = path.join(process.cwd(), 'lib', 'assets', 'processor.mjs')

/**
 * Validates one uploaded file by magic bytes and header dimensions, then renders the display and
 * thumb WebP renditions: auto-oriented, all metadata dropped (sharp writes none by default, and
 * colour is converted to sRGB without embedding a profile). Never decodes more than 40MP.
 *
 * All parsing of the untrusted bytes happens in a child process. On timeout it is SIGKILLed and
 * this promise settles only after the child has exited, so a caller's concurrency slot is never
 * released while work on the file is still running.
 */
export async function normalizeImage(
  file: UploadedFile,
  opts: NormalizeOptions = {},
): Promise<NormalizedImage> {
  const displayOut = `${file.tmpPath}.display.webp`
  const thumbOut = `${file.tmpPath}.thumb.webp`
  const reply = await runProcessor(
    {
      input: file.tmpPath,
      displayOut,
      thumbOut,
      maxPixels: opts.maxPixels ?? MAX_INPUT_PIXELS,
      sizes: SIZES,
    },
    file.name,
    opts,
  )
  opts.onChildPeakRss?.(reply.peakRssMb)
  if (!reply.ok) {
    if (reply.code === 'unsupported_format') throw UploadErrors.unsupportedFormat(file.name)
    if (reply.code === 'too_many_pixels') throw UploadErrors.tooManyPixels(file.name)
    if (reply.detail) console.warn('[assets] image processing failed', reply.detail)
    throw UploadErrors.corrupt(file.name)
  }
  if (reply.heicPath) opts.onHeicPath?.(reply.heicPath)
  const [display, thumb] = await Promise.all([fs.readFile(displayOut), fs.readFile(thumbOut)])
  return {
    display,
    thumb,
    width: reply.width,
    height: reply.height,
    sha256: createHash('sha256').update(display).digest('hex'),
  }
}

function runProcessor(job: object, name: string, opts: NormalizeOptions): Promise<Reply> {
  const timeoutMs = opts.timeoutMs ?? PROCESS_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    const child = fork(PROCESSOR, [], {
      execArgv: [], // do not inherit test-runner or dev-server loaders
      serialization: 'json',
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    })
    if (child.pid !== undefined) opts.onChild?.(child.pid)
    let reply: Reply | undefined
    let failure: ApiError | undefined
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 2000) stderr += chunk.toString('utf8')
    })
    const timer = setTimeout(() => {
      failure = UploadErrors.timeout(name)
      child.kill('SIGKILL')
    }, timeoutMs)
    child.once('message', (msg: Reply) => {
      reply = msg
    })
    child.once('error', (err) => {
      console.error('[assets] image processor error', err)
      failure ??= UploadErrors.corrupt(name)
      if (child.pid === undefined) {
        // Never started, so no 'exit' will follow.
        clearTimeout(timer)
        reject(failure)
        return
      }
      child.kill('SIGKILL')
    })
    // Settle only on exit: the slot stays taken until the process is really gone.
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (failure) return reject(failure)
      if (reply) return resolve(reply)
      console.warn('[assets] image processor exited without a reply', { code, signal, stderr })
      reject(UploadErrors.corrupt(name))
    })
    child.send(job, (err) => {
      if (err) child.kill('SIGKILL') // reported through 'exit' without a reply
    })
  })
}
