// Group B (the shizhao pipeline) and experiment 1 helpers. Everything goes through the app's own
// functions (upload → extract → confirm → job), inside the run's isolated DATA_DIR.
import fs from 'node:fs'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import { uploadAssets } from '../../lib/assets'
import { FactSheet, type GuardResult, type Usage } from '../../lib/core/schemas'
import { getDb } from '../../lib/db/client'
import { appendFactSheet, confirmLatestFactSheet } from '../../lib/db/repo/fact-sheets'
import { createJobIfIdle, findJob } from '../../lib/db/repo/jobs'
import { insertProject } from '../../lib/db/repo/projects'
import { usageRecords, versions } from '../../lib/db/schema'
import { getEnv } from '../../lib/env'
import { extractFacts } from '../../lib/extract'
import { runJob } from '../../lib/jobs/pipeline'
import { getProvider, type LLMProvider } from '../../lib/providers'
import type { GuardStats } from './aggregate'
import { MockPageProvider } from './group-a'
import type { GoldSheet, Sample } from './samples'

/** The provider every group uses: the app's provider, or the mock extended with `page-html`. */
export function evalProvider(): LLMProvider {
  return getEnv().PROVIDER === 'mock' ? new MockPageProvider() : getProvider()
}

export function createProject(sample: Sample, items: number): string {
  return insertProject({ type: items > 1 ? 'menu' : 'single', title: sample.gold.shop.name }).id
}

async function upload(
  projectId: string,
  form: FormData,
): Promise<Array<{ id: string; kind: string }>> {
  const request = new Request('http://eval.local/upload', { method: 'POST', body: form })
  return uploadAssets(projectId, request)
}

/** Uploads each image on its own, so file name → asset id is unambiguous. */
export async function uploadImages(
  projectId: string,
  sample: Sample,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  for (const image of sample.images) {
    const form = new FormData()
    const bytes = new Uint8Array(fs.readFileSync(image.path))
    form.append('images', new File([bytes], image.file, { type: image.mime }))
    const [asset] = await upload(projectId, form)
    if (!asset) throw new Error(`upload of ${image.file} returned nothing`)
    ids.set(image.file, asset.id)
  }
  return ids
}

export async function uploadText(projectId: string, text: string): Promise<void> {
  const form = new FormData()
  form.append('text', text)
  await upload(projectId, form)
}

export function usageOf(projectId: string): Usage[] {
  return getDb()
    .select()
    .from(usageRecords)
    .where(eq(usageRecords.projectId, projectId))
    .all()
    .map((r) => ({
      provider: r.provider,
      model: r.model,
      stage: r.stage,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costCny: r.costCny,
      latencyMs: r.latencyMs,
    }))
}

/** Gold sheet with image file names mapped to the uploaded asset ids; stored and confirmed. */
export function storeConfirmedGold(
  projectId: string,
  gold: GoldSheet,
  ids: Map<string, string>,
): number {
  const row = appendFactSheet(projectId, (_prev, revision) =>
    FactSheet.parse({
      ...gold,
      items: gold.items.map((item) => ({
        ...item,
        imageAssetIds: item.imageAssetIds.map((file) => ids.get(file)!),
      })),
      projectId,
      revision,
      confirmedAt: null,
    }),
  )
  return confirmOrThrow(projectId, row.revision)
}

export function confirmOrThrow(projectId: string, revision: number): number {
  const outcome = confirmLatestFactSheet(projectId, revision)
  if (outcome.status !== 'confirmed') throw new Error(`could not confirm revision ${revision}`)
  return revision
}

export interface PipelineOutcome {
  ok: boolean
  html?: string
  guard?: GuardStats
  error?: string
}

export function guardStats(guard: GuardResult): GuardStats {
  const sentences = new Set(guard.violations.map((v) => `${v.field}\u0000${v.sentence}`))
  return { intercepted: sentences.size, rewritten: guard.rewritten, removed: guard.removed }
}

/** design → copy → guard → render → check via the real job pipeline; reads the version's HTML. */
export async function generateViaPipeline(
  projectId: string,
  revision: number,
  seed: number,
  provider: LLMProvider,
): Promise<PipelineOutcome> {
  const job = createJobIfIdle(projectId, { factRevision: revision, seed })
  if (!job) throw new Error('a job is already running for this project')
  await runJob(job.id, { provider })
  const done = findJob(job.id)
  if (done?.status !== 'succeeded') {
    return { ok: false, error: `${done?.status ?? 'missing'}: ${done?.error ?? ''}`.trim() }
  }
  const version = getDb()
    .select()
    .from(versions)
    .where(and(eq(versions.projectId, projectId), eq(versions.jobId, job.id)))
    .get()
  if (!version) return { ok: false, error: 'succeeded job without a version' }
  const html = fs.readFileSync(path.resolve(getEnv().DATA_DIR, version.htmlPath), 'utf8')
  return { ok: true, html, guard: guardStats(version.guard) }
}

/** Experiment 1 and group B-e2e: raw images and text → extractFacts (temperature 0 in code). */
export async function extractFromRaw(
  sample: Sample,
  provider: LLMProvider,
): Promise<{ projectId: string; factSheet: FactSheet }> {
  const projectId = createProject(sample, sample.gold.items.length)
  await uploadImages(projectId, sample)
  if (sample.inputText) await uploadText(projectId, sample.inputText)
  const { factSheet } = await extractFacts(projectId, { provider })
  return { projectId, factSheet }
}
