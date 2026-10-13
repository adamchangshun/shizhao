// Resumable run parts: eval/runs/<runId>/<sampleId>/<group>/<n>/. A part is complete only when
// done.json exists, parses, and every file it lists still has the recorded SHA-256. done.json is
// written last (temp file + rename), so an interrupted part never looks complete. done.json also
// records the fingerprint of the inputs the part was made from (run settings + sample content);
// a part made from other inputs is neither skipped nor counted in a report.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

export const MARKER = 'done.json'

const Marker = z.object({
  fingerprint: z.string(),
  files: z.record(z.string(), z.string()),
  data: z.unknown(),
})

const sha256 = (buf: Buffer | string): string => createHash('sha256').update(buf).digest('hex')

export type PartState<T> = { ok: true; data: T } | { ok: false; reason: string }

/** Reads a completed part, or says why it is not complete. */
export function readPart<T>(
  dir: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  fingerprint: string,
): PartState<T> {
  const markerPath = path.join(dir, MARKER)
  if (!fs.existsSync(markerPath)) return { ok: false, reason: 'no completion marker' }
  let marker: z.infer<typeof Marker>
  let data: T
  try {
    marker = Marker.parse(JSON.parse(fs.readFileSync(markerPath, 'utf8')))
    data = schema.parse(marker.data)
  } catch {
    return { ok: false, reason: 'completion marker unreadable' }
  }
  if (marker.fingerprint !== fingerprint) return { ok: false, reason: 'inputs changed' }
  for (const [name, hash] of Object.entries(marker.files)) {
    const file = path.join(dir, name)
    if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== hash) {
      return { ok: false, reason: `${name} changed` }
    }
  }
  return { ok: true, data }
}

export interface PartOutput<T> {
  files: Record<string, string | Buffer>
  data: T
}

export interface RunPartOptions<T> {
  dir: string
  label: string
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
  /** Identifies the inputs (see partFingerprint); a stored part with another one is redone. */
  fingerprint: string
  log: (line: string) => void
  work: () => Promise<PartOutput<T>>
}

function writeAtomic(file: string, content: string | Buffer): void {
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, file)
}

/** Skips a completed part; otherwise clears its directory, runs `work` and completes it. */
export async function runPart<T>(opts: RunPartOptions<T>): Promise<{ data: T; skipped: boolean }> {
  const state = readPart(opts.dir, opts.schema, opts.fingerprint)
  if (state.ok) {
    opts.log(`[eval] skip   ${opts.label} (completed)`)
    return { data: state.data, skipped: true }
  }
  const fresh = state.reason === 'no completion marker' && !fs.existsSync(opts.dir)
  opts.log(fresh ? `[eval] run    ${opts.label}` : `[eval] rerun  ${opts.label} (${state.reason})`)
  fs.rmSync(opts.dir, { recursive: true, force: true })
  fs.mkdirSync(opts.dir, { recursive: true })
  const out = await opts.work()
  const data = opts.schema.parse(out.data)
  const hashes: Record<string, string> = {}
  for (const [name, content] of Object.entries(out.files)) {
    if (name === MARKER || path.basename(name) !== name)
      throw new Error(`bad part file name ${name}`)
    writeAtomic(path.join(opts.dir, name), content)
    hashes[name] = sha256(content)
  }
  writeAtomic(
    path.join(opts.dir, MARKER),
    JSON.stringify({ fingerprint: opts.fingerprint, files: hashes, data }, null, 2),
  )
  return { data, skipped: false }
}
