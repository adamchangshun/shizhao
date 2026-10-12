// Child-process probe for the decompression-bomb test: uploads one file through uploadAssets()
// in a fresh process and reports the response plus the process's peak RSS.
// Usage: node --import tsx lib/assets/__fixtures__/memory-probe.ts <file>  (env: DATA_DIR, ADMIN_TOKEN, PUBLIC_BASE_URL)
import fs from 'node:fs'
import path from 'node:path'
import { ApiError } from '../../core/errors'
import { runMigrations } from '../../db/client'
import { insertProject } from '../../db/repo/projects'
import { uploadAssets } from '../upload'

async function main(): Promise<void> {
  const file = process.argv[2]
  if (!file) throw new Error('missing file argument')
  runMigrations()
  const project = insertProject({ type: 'single', title: 'memory probe' })
  const form = new FormData()
  form.append('images', new File([fs.readFileSync(file)], path.basename(file)))
  const request = new Request('http://localhost/upload', { method: 'POST', body: form })
  let outcome: { ok: true } | { ok: false; status: number; code: string; message: string }
  try {
    await uploadAssets(project.id, request)
    outcome = { ok: true }
  } catch (err) {
    if (!(err instanceof ApiError)) throw err
    outcome = { ok: false, status: err.status, code: err.code, message: err.message }
  }
  process.stdout.write(JSON.stringify({ ...outcome, maxRssMb: peakRssMb() }))
}

/**
 * Peak resident memory of this process. On Linux, getrusage's ru_maxrss survives execve and so
 * reports the parent's (the test runner's) peak; VmHWM belongs to this address space only.
 */
function peakRssMb(): number {
  try {
    const status = fs.readFileSync('/proc/self/status', 'utf8')
    const kb = /^VmHWM:\s+(\d+)\s+kB/m.exec(status)?.[1]
    if (kb) return Math.round(Number(kb) / 1024)
  } catch {
    // not Linux
  }
  return Math.round(process.resourceUsage().maxRSS / 1024) // kilobytes on every platform
}

main().catch((err: unknown) => {
  process.stderr.write(String(err instanceof Error ? err.stack : err))
  process.exit(1)
})
