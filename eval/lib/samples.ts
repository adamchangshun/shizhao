// Evaluation samples: eval/samples/<sampleId>/{images/, LICENSE.txt, input.txt, gold.json}.
// gold.json is a hand-labelled FactSheet without projectId, revision and confirmedAt; its
// imageAssetIds name files in images/ and are mapped to uploaded asset ids at run time.
import fs from 'node:fs'
import path from 'node:path'
import type { z } from 'zod'
import { FactSheet } from '../../lib/core/schemas'

export const GoldSheet = FactSheet.omit({
  projectId: true,
  revision: true,
  confirmedAt: true,
}).strict()
export type GoldSheet = z.infer<typeof GoldSheet>

export const SAMPLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
} as const

export interface SampleImage {
  file: string
  path: string
  mime: (typeof IMAGE_MIME)[keyof typeof IMAGE_MIME]
}

export interface Sample {
  id: string
  dir: string
  inputText: string
  gold: GoldSheet
  images: SampleImage[]
}

export class SampleError extends Error {
  constructor(sampleId: string, message: string) {
    super(`sample ${sampleId}: ${message}`)
    this.name = 'SampleError'
  }
}

/** A complete FactSheet for code that needs one (fact corpus, rendering). */
export function asFactSheet(gold: GoldSheet, projectId = 'eval'): FactSheet {
  return FactSheet.parse({ ...gold, projectId, revision: 1, confirmedAt: null })
}

export function loadSample(dir: string): Sample {
  const id = path.basename(dir)
  if (!SAMPLE_ID.test(id)) throw new SampleError(id, 'directory name must match [a-z0-9-]')
  for (const required of ['LICENSE.txt', 'input.txt', 'gold.json']) {
    if (!fs.existsSync(path.join(dir, required))) throw new SampleError(id, `missing ${required}`)
  }
  const parsed = GoldSheet.safeParse(
    JSON.parse(fs.readFileSync(path.join(dir, 'gold.json'), 'utf8')),
  )
  if (!parsed.success) throw new SampleError(id, `gold.json invalid: ${parsed.error.message}`)
  const imageDir = path.join(dir, 'images')
  const files = fs.existsSync(imageDir) ? fs.readdirSync(imageDir).sort() : []
  const images: SampleImage[] = []
  for (const file of files) {
    const mime = IMAGE_MIME[path.extname(file).toLowerCase() as keyof typeof IMAGE_MIME]
    if (mime) images.push({ file, path: path.join(imageDir, file), mime })
  }
  const known = new Set(images.map((i) => i.file))
  for (const item of parsed.data.items) {
    for (const ref of item.imageAssetIds) {
      if (!known.has(ref))
        throw new SampleError(id, `item ${item.id} references missing image ${ref}`)
    }
  }
  return {
    id,
    dir,
    inputText: fs.readFileSync(path.join(dir, 'input.txt'), 'utf8').trim(),
    gold: parsed.data,
    images,
  }
}

/** Every sample directory (one containing gold.json), sorted by id; no fixed count. */
export function loadSamples(samplesDir: string): Sample[] {
  if (!fs.existsSync(samplesDir)) return []
  return fs
    .readdirSync(samplesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .filter((d) => fs.existsSync(path.join(samplesDir, d.name, 'gold.json')))
    .map((d) => loadSample(path.join(samplesDir, d.name)))
    .sort((a, b) => a.id.localeCompare(b.id))
}
