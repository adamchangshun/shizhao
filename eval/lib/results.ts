// Collects completed run parts and computes every metric for the report (code only).
import fs from 'node:fs'
import path from 'node:path'
import type { Usage } from '../../lib/core/schemas'
import {
  GROUPS,
  guardRates,
  summarizeGroup,
  type GroupSummary,
  type GuardRates,
  type PageRecord,
} from './aggregate'
import { partFingerprint, runSettingsKey, type RunConfig } from './config'
import {
  compareExtraction,
  sumFieldCounts,
  type ExtractField,
  type FieldDiff,
  type FieldScore,
} from './extract-compare'
import {
  ExtractPart,
  GUARD_DIR,
  GUARD_LAYERS,
  GuardPart,
  guardCasesHash,
  PagePart,
  partDir,
  type GuardLayer,
} from './experiments'
import { pageFactErrors, unsupportedClaims, type ClaimHit } from './page-metrics'
import { visibleText } from './page-text'
import type { Sample } from './samples'
import { readPart } from './store'

export interface PageDetail extends PageRecord {
  pageFile: string | null
  error?: string
  visibleText: string
  factDetails: string[]
  unsupportedSentences: ClaimHit[]
}

export interface Results {
  runId: string
  config: RunConfig
  date: string
  commit: string
  samples: Array<{ id: string; items: number; images: number }>
  models: string[]
  mock: boolean
  extraction: {
    completed: number
    failed: Array<{ sampleId: string; error: string }>
    scores: Record<ExtractField, FieldScore>
    diffs: Array<FieldDiff & { sampleId: string }>
  }
  compare: {
    pages: PageDetail[]
    missing: string[]
    summaries: Record<string, GroupSummary>
  }
  guard: Partial<
    Record<GuardLayer, { judgeProvider: string | null; rates: GuardRates; models: string[] }>
  >
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
const modelsOf = (usage: Usage[]): string[] => usage.map((u) => `${u.provider}/${u.model}`)

export function computeResults(input: {
  runDir: string
  config: RunConfig
  samples: Sample[]
  date: string
  commit: string
}): Results {
  const { runDir, config, samples } = input
  const models = new Set<string>()
  // Parts made from other settings or other sample/case content are not counted.
  const settingsKey = runSettingsKey(config)
  const sampleFp = (sample: Sample): string => partFingerprint(settingsKey, sample.contentHash)

  const counts = []
  const diffs: Results['extraction']['diffs'] = []
  const failed: Results['extraction']['failed'] = []
  let completed = 0
  for (const sample of samples) {
    const state = readPart(partDir(runDir, sample.id, 'extract', 1), ExtractPart, sampleFp(sample))
    if (!state.ok) continue
    completed++
    modelsOf(state.data.usage).forEach((m) => models.add(m))
    if (!state.data.ok || !state.data.factSheet) {
      failed.push({ sampleId: sample.id, error: state.data.error ?? 'unknown' })
      continue
    }
    const cmp = compareExtraction(sample.gold, state.data.factSheet)
    counts.push(cmp.counts)
    diffs.push(...cmp.diffs.map((d) => ({ sampleId: sample.id, ...d })))
  }

  const pages: PageDetail[] = []
  const missing: string[] = []
  for (const sample of samples) {
    for (const group of GROUPS) {
      for (let n = 1; n <= config.n; n++) {
        const dir = partDir(runDir, sample.id, group, n)
        const state = readPart(dir, PagePart, sampleFp(sample))
        if (!state.ok) {
          missing.push(`${sample.id}/${group}/${n}`)
          continue
        }
        const part = state.data
        modelsOf(part.usage).forEach((m) => models.add(m))
        const pageFile = path.join(dir, 'page.html')
        const text = part.ok ? visibleText(fs.readFileSync(pageFile, 'utf8')) : ''
        const errors = part.ok ? pageFactErrors(text, sample.gold) : null
        const claims = part.ok ? unsupportedClaims(text, sample.gold) : null
        pages.push({
          sampleId: sample.id,
          group,
          n,
          ok: part.ok,
          ...(part.error ? { error: part.error } : {}),
          factErrors: errors?.total ?? null,
          priceNameErrors: errors?.priceNameErrors ?? null,
          unsupported: claims?.count ?? null,
          costCny: sum(part.usage.map((u) => u.costCny)),
          latencyMs: sum(part.usage.map((u) => u.latencyMs)),
          ...(part.guard ? { guard: part.guard } : {}),
          pageFile: part.ok ? path.relative(process.cwd(), pageFile) : null,
          visibleText: text,
          factDetails: errors?.details ?? [],
          unsupportedSentences: claims?.sentences ?? [],
        })
      }
    }
  }
  const summaries = Object.fromEntries(
    GROUPS.map((g) => [g, summarizeGroup(pages.filter((p) => p.group === g))]),
  )

  const guard: Results['guard'] = {}
  for (const layer of GUARD_LAYERS) {
    const state = readPart(
      partDir(runDir, GUARD_DIR, layer, 1),
      GuardPart,
      partFingerprint(settingsKey, guardCasesHash()),
    )
    if (!state.ok) continue
    const layerModels = [...new Set(modelsOf(state.data.usage))]
    layerModels.forEach((m) => models.add(m))
    guard[layer] = {
      judgeProvider: state.data.judgeProvider,
      rates: guardRates(state.data.outcomes),
      models: layerModels,
    }
  }

  const modelList = [...models].sort()
  return {
    runId: config.runId,
    config,
    date: input.date,
    commit: input.commit,
    samples: samples.map((s) => ({
      id: s.id,
      items: s.gold.items.length,
      images: s.images.length,
    })),
    models: modelList,
    mock: config.provider === 'mock' || modelList.some((m) => m.startsWith('mock/')),
    extraction: { completed, failed, scores: sumFieldCounts(counts), diffs },
    compare: { pages, missing, summaries },
    guard,
  }
}
