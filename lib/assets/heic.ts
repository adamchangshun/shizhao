import path from 'node:path'
import { Worker } from 'node:worker_threads'

// heic-convert decodes with WebAssembly synchronously, which would block the event loop and make
// the processing timeout unenforceable. Running it in a worker lets us terminate it on timeout.
// The worker loads heic-convert relative to the app root, so it works under next dev/start and
// in Docker without depending on how the bundler rewrites module paths.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
const { createRequire } = require('node:module')
const fs = require('node:fs')
const convert = createRequire(workerData.base)('heic-convert')
convert({ buffer: fs.readFileSync(workerData.input), format: 'JPEG', quality: 0.92 })
  .then((out) => {
    fs.writeFileSync(workerData.output, Buffer.from(out), { flag: 'wx', mode: 0o600 })
    parentPort.postMessage({ ok: true })
  })
  .catch((err) => parentPort.postMessage({ ok: false, message: String((err && err.message) || err) }))
`

/** Converts a HEIC/HEIF file to JPEG at `output`. Rejects on decode failure or when `signal` aborts. */
export function heicToJpeg(input: string, output: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'))
      return
    }
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { input, output, base: path.join(process.cwd(), 'package.json') },
    })
    const onAbort = () => {
      void worker.terminate()
      reject(new Error('aborted'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    const finish = () => signal.removeEventListener('abort', onAbort)
    worker.once('message', (msg: { ok: boolean; message?: string }) => {
      finish()
      void worker.terminate()
      if (msg.ok) resolve()
      else reject(new Error(`heic-convert failed: ${msg.message ?? 'unknown'}`))
    })
    worker.once('error', (err) => {
      finish()
      reject(err)
    })
    worker.once('exit', (code) => {
      finish()
      if (code !== 0) reject(new Error(`heic worker exited with code ${code}`))
    })
  })
}
