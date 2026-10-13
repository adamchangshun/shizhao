// The three experiments as resumable parts under eval/runs/<runId>/.
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { ApiError } from '../../lib/core/errors'
import { FactSheet, Usage } from '../../lib/core/schemas'
import { JUDGE_SYSTEM } from '../../lib/copy/prompt'
import { ProviderError, type LLMProvider } from '../../lib/providers'
import { guardDocument } from '../../packages/fact-guard/src/index'
import type { Group } from './aggregate'
import { generatePageA, goldPrompt, rawPrompt } from './group-a'
import { EVAL_RULES } from './page-metrics'
import {
  confirmOrThrow,
  createProject,
  extractFromRaw,
  generateViaPipeline,
  storeConfirmedGold,
  uploadImages,
  usageOf,
} from './pipeline'
import type { Sample } from './samples'
import { runPart, type PartOutput } from './store'

export const GUARD_DIR = '_guard'
const TRANSIENT = new Set(['timeout', 'rate_limited', 'upstream_error', 'aborted'])

/** Transient provider trouble is retried on the next run (no completion marker); anything else is a recorded failure. */
function isTransient(err: unknown): boolean {
  if (err instanceof ProviderError) return TRANSIENT.has(err.code)
  if (err instanceof ApiError) return [...TRANSIENT].some((code) => err.code === `provider_${code}`)
  return false
}

const GuardStatsSchema = z.object({
  intercepted: z.number(),
  rewritten: z.number(),
  removed: z.number(),
})

export const PagePart = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  usage: z.array(Usage),
  wallMs: z.number().nonnegative(),
  guard: GuardStatsSchema.optional(),
})
export type PagePart = z.infer<typeof PagePart>

export function partDir(runDir: string, sampleId: string, group: string, n: number): string {
  return path.join(runDir, sampleId, group, String(n))
}

interface PageOutput {
  ok: boolean
  html?: string
  error?: string
  usage: Usage[]
  guard?: PagePart['guard']
  extra?: Record<string, string>
}

async function makePage(
  sample: Sample,
  group: Group,
  n: number,
  provider: LLMProvider,
  temperature: number,
): Promise<PageOutput> {
  if (group === 'A-gold' || group === 'A-raw') {
    try {
      const { html, usage } = await generatePageA(provider, {
        prompt: group === 'A-gold' ? goldPrompt(sample.gold) : rawPrompt(sample.inputText),
        images:
          group === 'A-raw'
            ? sample.images.map((i) => ({ path: i.path, mime: i.mime }))
            : undefined,
        temperature,
        seed: n,
      })
      return { ok: true, html, usage: [usage] }
    } catch (err) {
      if (isTransient(err) || !(err instanceof ProviderError)) throw err
      return { ok: false, error: `provider ${err.code}`, usage: [] }
    }
  }
  if (group === 'B-gold') {
    const projectId = createProject(sample, sample.gold.items.length)
    const ids = await uploadImages(projectId, sample)
    const revision = storeConfirmedGold(projectId, sample.gold, ids)
    const out = await generateViaPipeline(projectId, revision, n, provider)
    return { ...out, usage: usageOf(projectId) }
  }
  // B-e2e: raw material → extraction → merchant confirms without edits → generation.
  let extracted: { projectId: string; factSheet: FactSheet }
  try {
    extracted = await extractFromRaw(sample, provider)
  } catch (err) {
    if (isTransient(err) || !(err instanceof ApiError)) throw err
    return { ok: false, error: `extract ${err.code}`, usage: [] }
  }
  const { projectId, factSheet } = extracted
  const revision = confirmOrThrow(projectId, factSheet.revision)
  const out = await generateViaPipeline(projectId, revision, n, provider)
  return {
    ...out,
    usage: usageOf(projectId),
    extra: { 'facts.json': JSON.stringify(factSheet, null, 2) },
  }
}

export interface PartContext {
  runDir: string
  provider: LLMProvider
  temperature: number
  log: (line: string) => void
}

export async function runComparePart(
  ctx: PartContext,
  sample: Sample,
  group: Group,
  n: number,
): Promise<PagePart> {
  const { data } = await runPart({
    dir: partDir(ctx.runDir, sample.id, group, n),
    label: `${sample.id}/${group}/${n}`,
    schema: PagePart,
    log: ctx.log,
    work: async () => {
      const started = Date.now()
      const out = await makePage(sample, group, n, ctx.provider, ctx.temperature)
      const files: Record<string, string> = { ...out.extra }
      if (out.ok && out.html !== undefined) files['page.html'] = out.html
      return {
        files,
        data: {
          ok: out.ok,
          ...(out.error ? { error: out.error } : {}),
          usage: out.usage,
          wallMs: Date.now() - started,
          ...(out.guard ? { guard: out.guard } : {}),
        },
      }
    },
  })
  return data
}

export const ExtractPart = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  usage: z.array(Usage),
  factSheet: FactSheet.nullable(),
})
export type ExtractPart = z.infer<typeof ExtractPart>

export async function runExtractPart(ctx: PartContext, sample: Sample): Promise<ExtractPart> {
  const { data } = await runPart({
    dir: partDir(ctx.runDir, sample.id, 'extract', 1),
    label: `${sample.id}/extract/1`,
    schema: ExtractPart,
    log: ctx.log,
    work: async (): Promise<PartOutput<ExtractPart>> => {
      try {
        const { projectId, factSheet } = await extractFromRaw(sample, ctx.provider)
        return {
          files: { 'extracted.json': JSON.stringify(factSheet, null, 2) },
          data: { ok: true, usage: usageOf(projectId), factSheet },
        }
      } catch (err) {
        if (isTransient(err) || !(err instanceof ApiError)) throw err
        return { files: {}, data: { ok: false, error: err.code, usage: [], factSheet: null } }
      }
    },
  })
  return data
}

export const GuardCase = z.object({
  sentence: z.string(),
  facts: z.array(z.string()),
  expect: z.enum(['block', 'pass']),
})
export type GuardCase = z.infer<typeof GuardCase>

export const GUARD_CASES_PATH = path.resolve('packages/fact-guard/test/cases.zh.json')

export function loadGuardCases(file: string = GUARD_CASES_PATH): GuardCase[] {
  return z.array(GuardCase).parse(JSON.parse(fs.readFileSync(file, 'utf8')))
}

export const GUARD_LAYERS = ['rules', 'rules-judge'] as const
export type GuardLayer = (typeof GUARD_LAYERS)[number]

export const GuardPart = z.object({
  layer: z.enum(GUARD_LAYERS),
  judgeProvider: z.string().nullable(),
  outcomes: z.array(GuardCase.extend({ blocked: z.boolean(), reasons: z.array(z.string()) })),
  usage: z.array(Usage),
})
export type GuardPart = z.infer<typeof GuardPart>

/**
 * Runs every case through guardDocument: rule layer only, or rule layer + model judge (the
 * judge sees only sentences the rules let through, as in the pipeline). Cases sharing the same
 * facts go to the judge in one call.
 */
export async function evaluateGuard(cases: GuardCase[], layer: GuardLayer, provider: LLMProvider) {
  const usage: Usage[] = []
  const groups = new Map<string, number[]>()
  cases.forEach((c, i) => {
    const key = JSON.stringify(c.facts)
    groups.set(key, [...(groups.get(key) ?? []), i])
  })
  const outcomes: GuardPart['outcomes'] = cases.map((c) => ({ ...c, blocked: false, reasons: [] }))
  for (const [key, indexes] of groups) {
    const fields = Object.fromEntries(indexes.map((i) => [`c${i}`, cases[i]!.sentence]))
    const result = await guardDocument(
      fields,
      { facts: JSON.parse(key) as string[] },
      {
        rules: EVAL_RULES,
        judge:
          layer === 'rules'
            ? undefined
            : async (input) => {
                const { data, usage: u } = await provider.generateJSON({
                  stage: 'guard-judge',
                  system: JUDGE_SYSTEM,
                  prompt: JSON.stringify(input),
                  temperature: 0,
                  schema: z
                    .array(
                      z
                        .object({
                          unsupported: z.boolean(),
                          reason: z.string().max(200).optional(),
                        })
                        .strict(),
                    )
                    .length(input.sentences.length),
                })
                usage.push(u)
                return data
              },
      },
    )
    for (const hit of result.hits) {
      const outcome = outcomes[Number(hit.field.slice(1))]!
      outcome.blocked = true
      if (!outcome.reasons.includes(hit.reason)) outcome.reasons.push(hit.reason)
    }
  }
  return { outcomes, usage }
}

export async function runGuardPart(ctx: PartContext, layer: GuardLayer): Promise<GuardPart> {
  const { data } = await runPart({
    dir: partDir(ctx.runDir, GUARD_DIR, layer, 1),
    label: `${GUARD_DIR}/${layer}/1`,
    schema: GuardPart,
    log: ctx.log,
    work: async () => {
      const { outcomes, usage } = await evaluateGuard(loadGuardCases(), layer, ctx.provider)
      return {
        files: {},
        data: {
          layer,
          judgeProvider: layer === 'rules' ? null : ctx.provider.name,
          outcomes,
          usage,
        },
      }
    },
  })
  return data
}
