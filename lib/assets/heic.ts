import path from 'node:path'
import { Worker } from 'node:worker_threads'

// heic-convert decodes with WebAssembly synchronously, which would block the event loop and make
// the processing timeout unenforceable. Running it in a worker lets us terminate it on timeout.
// The worker loads heic-convert relative to the app root, so it works under next dev/start and
// in Docker without depending on how the bundler rewrites module paths.
//
// heic-convert decodes the first top-level image (heic-decode's `data[0]`), which need not be the
// primary image whose size sharp reported. So the worker first lists the images with heic-decode
// (header parse only, no pixel buffer) and refuses if that first image exceeds the pixel cap.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
const { createRequire } = require('node:module')
const fs = require('node:fs')
const appRequire = createRequire(workerData.base)
const convertPath = appRequire.resolve('heic-convert')
const convert = appRequire(convertPath)
const decode = createRequire(convertPath)('heic-decode')
;(async () => {
  const buffer = fs.readFileSync(workerData.input)
  const images = await decode.all({ buffer })
  const first = images[0]
  const pixels = first ? first.width * first.height : 0
  images.dispose()
  if (!first || !(pixels > 0)) throw new Error('no image in HEIF container')
  if (pixels > workerData.maxPixels) return { ok: false, reason: 'too_many_pixels' }
  const out = await convert({ buffer, format: 'JPEG', quality: 0.92 })
  fs.writeFileSync(workerData.output, Buffer.from(out), { flag: 'wx', mode: 0o600 })
  return { ok: true }
})()
  .then((msg) => parentPort.postMessage(msg))
  .catch((err) => parentPort.postMessage({ ok: false, reason: 'error', message: String((err && err.message) || err) }))
`

interface WorkerReply {
  ok: boolean
  reason?: 'too_many_pixels' | 'error'
  message?: string
}

export type HeicOutcome = 'converted' | 'too_many_pixels'

/**
 * Converts a HEIC/HEIF file to JPEG at `output`. Resolves 'too_many_pixels' without decoding when
 * the image heic-convert would decode exceeds `maxPixels`. Rejects on decode failure or abort;
 * on abort the worker is terminated before the promise settles.
 */
export function heicToJpeg(
  input: string,
  output: string,
  maxPixels: number,
  signal: AbortSignal,
): Promise<HeicOutcome> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'))
      return
    }
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { input, output, maxPixels, base: path.join(process.cwd(), 'package.json') },
    })
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      fn()
    }
    const onAbort = () => {
      void worker.terminate().finally(() => settle(() => reject(new Error('aborted'))))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    worker.once('message', (msg: WorkerReply) => {
      void worker.terminate()
      settle(() => {
        if (msg.ok) resolve('converted')
        else if (msg.reason === 'too_many_pixels') resolve('too_many_pixels')
        else reject(new Error(`heic-convert failed: ${msg.message ?? 'unknown'}`))
      })
    })
    worker.once('error', (err) => settle(() => reject(err)))
    worker.once('exit', (code) =>
      settle(() => reject(new Error(`heic worker exited with code ${code}`))),
    )
  })
}
