import { z } from 'zod'
import {
  checkSentence,
  computeDocumentRefs,
  defaultRules,
  guardDocument,
  mergeRules,
  rulePacks,
  splitSentences,
  type DocumentResult,
  type FactCorpus,
  type RuleSet,
} from '../../packages/fact-guard/src/index'
import { CopyDraft, DesignSpec, FactSheet, GuardResult, type CopyRefs } from '../core/schemas'
import { getDb } from '../db/client'
import { getProvider, recordUsage, type GenerateJSONRequest, type LLMProvider } from '../providers'
import { buildFactCorpus, copyFields, crossItemRule, fieldCorpus, type CopyCorpus } from './facts'
import { COPY_SYSTEM, JUDGE_SYSTEM, REWRITE_SYSTEM } from './prompt'

export { buildFactCorpus, computeCopyRefs, crossItemRule, fieldCorpus } from './facts'
export type { CopyCorpus } from './facts'
export interface CopyOptions {
  provider?: LLMProvider
  jobId?: string | null
  signal?: AbortSignal
}
export type CopyGuardResult = GuardResult & { copyRefs: CopyRefs }
const foodRules = mergeRules(defaultRules, rulePacks.food)
/** Cross-item wording depends on the sheet, so it joins whatever rule set a guard runs. */
const withCrossItem = (rules: RuleSet, corpus: FactCorpus) =>
  mergeRules(rules, { rules: [crossItemRule(corpus)] })

function schemaFor(sheet: FactSheet) {
  return CopyDraft.extend({
    itemBlurbs: z
      .object(Object.fromEntries(sheet.items.map((item) => [item.id, z.string().max(60)])))
      .strict(),
  }).strict()
}
function caller(sheet: FactSheet, opts: CopyOptions) {
  const provider = opts.provider ?? getProvider()
  return async <T>(request: Omit<GenerateJSONRequest<T>, 'signal'>) => {
    const { data, usage } = await provider.generateJSON({ ...request, signal: opts.signal })
    recordUsage(getDb(), usage, { projectId: sheet.projectId, jobId: opts.jobId ?? null })
    return request.schema.parse(data)
  }
}

export async function generateCopy(
  input: { factSheet: FactSheet; design: DesignSpec },
  opts: CopyOptions = {},
): Promise<CopyDraft> {
  const sheet = FactSheet.parse(input.factSheet),
    design = DesignSpec.parse(input.design)
  return caller(
    sheet,
    opts,
  )({
    stage: 'copy',
    system: COPY_SYSTEM,
    schema: schemaFor(sheet),
    temperature: 0.6,
    seed: design.seed,
    prompt: JSON.stringify({
      shopName: sheet.shop.name,
      items: sheet.items.map((item) => ({ id: item.id, name: item.name })),
      itemIds: sheet.items.map((item) => item.id),
      moodKeywords: design.moodKeywords,
    }),
  })
}

function finish(
  copy: CopyDraft,
  fields: Record<string, string>,
  corpus: CopyCorpus,
  hits: DocumentResult['hits'],
  rewritten: number,
  removed: number,
  rules: RuleSet = foodRules,
): CopyGuardResult {
  const name = (corpus.shopName ?? corpus.facts[0] ?? '欢迎光临').slice(0, 20) || '欢迎光临'
  // A fallback is newly introduced text too; merchant identity cannot bypass absolute rules.
  const fallback = checkSentence(name, corpus, rules).length === 0 ? name : '欢迎光临'
  const cleaned = CopyDraft.parse({
    headline: fields.headline || fallback,
    subhead: fields.subhead ?? '',
    itemBlurbs: Object.fromEntries(
      Object.keys(copy.itemBlurbs).map((id) => [id, fields[`itemBlurbs.${id}`] ?? '']),
    ),
    closing: fields.closing ?? '',
  })
  const result = GuardResult.parse({
    copy: cleaned,
    violations: hits
      .filter((hit) => hit.phase === 'original')
      .map((hit) => ({
        field: hit.field,
        sentence: hit.sentence,
        reason: hit.reason,
        evidence: hit.evidence,
      })),
    rewritten,
    removed,
  })
  return { ...result, copyRefs: computeDocumentRefs(copyFields(cleaned), corpus) }
}

export async function guardCopy(
  input: { copy: CopyDraft; factSheet: FactSheet },
  opts: CopyOptions = {},
): Promise<CopyGuardResult> {
  const sheet = FactSheet.parse(input.factSheet),
    copy = schemaFor(sheet).parse(input.copy),
    corpus = buildFactCorpus(sheet)
  const call = caller(sheet, opts),
    fields = copyFields(copy),
    rules = withCrossItem(foodRules, corpus)
  const result = await guardDocument(fields, corpus, {
    rules,
    corpusFor: (field) => fieldCorpus(corpus, field),
    maxFieldLengths: Object.fromEntries(
      Object.keys(fields).map((field) => [
        field,
        field === 'headline' ? 20 : field.startsWith('itemBlurbs.') ? 60 : 40,
      ]),
    ),
    judge: async (input) =>
      call({
        stage: 'guard-judge',
        system: JUDGE_SYSTEM,
        prompt: JSON.stringify(input),
        temperature: 0,
        schema: z
          .array(
            z.object({ unsupported: z.boolean(), reason: z.string().max(200).optional() }).strict(),
          )
          .length(input.sentences.length),
      }),
    rewriter: async (input) =>
      call({
        stage: 'guard-rewrite',
        system: REWRITE_SYSTEM,
        prompt: JSON.stringify(input),
        temperature: 0,
        schema: z.array(z.string().max(60)).length(input.items.length),
      }),
  })
  return finish(copy, result.fields, corpus, result.hits, result.rewritten, result.removed, rules)
}

/** Synchronous, deterministic correction-time recheck. Never opens a database or provider. */
export function guardWithRulesOnly(
  input: CopyDraft,
  corpus: FactCorpus & { shopName?: string },
  rules: RuleSet = foodRules,
): CopyGuardResult {
  const copy = CopyDraft.parse(input),
    fields = copyFields(copy),
    checked = withCrossItem(rules, corpus),
    hits: DocumentResult['hits'] = []
  let removed = 0
  const cleaned = Object.fromEntries(
    Object.entries(fields).map(([field, text]) => [
      field,
      splitSentences(text)
        .filter((sentence) => {
          const sentenceHits = checkSentence(sentence, fieldCorpus(corpus, field), checked)
          if (sentenceHits.length === 0) return true
          hits.push(
            ...sentenceHits.map((hit) => ({ ...hit, field, sentence, phase: 'original' as const })),
          )
          removed++
          return false
        })
        .join(''),
    ]),
  )
  return finish(copy, cleaned, corpus, hits, 0, removed, checked)
}
