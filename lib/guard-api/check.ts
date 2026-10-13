import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  checkSentence,
  defaultRules,
  mergeRules,
  rulePacks,
  splitSentences,
} from '../../packages/fact-guard/src/index'
import manifest from '../../packages/fact-guard/package.json'
import { ApiError } from '../core/errors'
import type { Db } from '../db/client'
import type { LLMProvider, GenerateJSONRequest } from '../providers'
import { JUDGE_SYSTEM, REWRITE_SYSTEM } from '../copy/prompt'
import { recordGuardUsage } from './accounting'
import type { GuardInput, GuardResponse, GuardSentence } from './schema'

const versions = new Map<string, string>()
function rulesVersion(industry: GuardInput['industry']): string {
  const known = versions.get(industry)
  if (known) return known
  const hash = createHash('sha256')
  for (const name of industry === 'food' ? ['base', 'food'] : ['base'])
    hash.update(readFileSync(path.join(process.cwd(), `rules/packs/${name}.zh.yaml`)))
  const version = `${manifest.version}+${hash.digest('hex').slice(0, 8)}`
  versions.set(industry, version)
  return version
}
export function sentencesFor(input: GuardInput): string[] {
  const sentences = splitSentences(input.text)
  if (sentences.length > 80)
    throw new ApiError(413, 'too_many_sentences', '一次最多检查 80 句，请分段提交')
  return sentences
}
export async function checkInput(
  input: GuardInput,
  texts: string[],
  model?: { provider: LLMProvider; db: Db; signal: AbortSignal; deadline: number },
): Promise<GuardResponse> {
  const start = performance.now(),
    corpus = { facts: input.facts }
  const rules = input.industry === 'food' ? mergeRules(defaultRules, rulePacks.food) : defaultRules
  const sentences: GuardSentence[] = texts.map((text) => {
    const hits = checkSentence(text, corpus, rules).map(({ reason, evidence, start, end }) => ({
      reason,
      evidence,
      start,
      end,
    }))
    return { text, hits, status: hits.length ? 'blocked' : 'ok' }
  })
  if (model) {
    async function call<T>(stage: string, prompt: unknown, schema: z.ZodType<T>): Promise<T> {
      model!.signal.throwIfAborted()
      const req: GenerateJSONRequest<T> = {
        stage,
        system: stage === 'guard-judge' ? JUDGE_SYSTEM : REWRITE_SYSTEM,
        prompt: JSON.stringify(prompt),
        schema,
        temperature: 0,
        signal: model!.signal,
        timeoutMs: Math.max(1, model!.deadline - Date.now()),
      }
      const result = await model!.provider.generateJSON(req)
      recordGuardUsage(model!.db, result.usage)
      model!.signal.throwIfAborted()
      return schema.parse(result.data)
    }
    const pending = sentences.filter((s) => s.status === 'ok')
    if (pending.length) {
      const judgments = await call(
        'guard-judge',
        { sentences: pending.map((s) => s.text), facts: input.facts },
        z
          .array(
            z.object({ unsupported: z.boolean(), reason: z.string().max(200).optional() }).strict(),
          )
          .length(pending.length),
      )
      judgments.forEach((result, i) => {
        if (result.unsupported) {
          const sentence = pending[i]!
          sentence.status = 'blocked'
          sentence.hits.push({
            reason: 'llm_flagged',
            evidence: result.reason ?? '无事实依据',
            start: 0,
            end: sentence.text.length,
          })
        }
      })
    }
    const blocked = sentences.filter((s) => s.status === 'blocked').slice(0, 10)
    if (input.rewrite && blocked.length) {
      const rewrites = await call(
        'guard-rewrite',
        {
          items: blocked.map((s) => ({
            sentence: s.text,
            problems: s.hits.map((h) => `${h.reason}: ${h.evidence}`),
          })),
          facts: input.facts,
        },
        z.array(z.string().max(500)).length(blocked.length),
      )
      rewrites.forEach((text, i) => {
        const parts = splitSentences(text)
        // M19 budget permits one judge only. A rewrite is a rule-rechecked suggestion,
        // never a claim that a second semantic judgment has been performed.
        if (
          parts.length &&
          parts.length <= 80 &&
          parts.every((part) => checkSentence(part, corpus, rules).length === 0)
        ) {
          blocked[i]!.status = 'rewritten'
          blocked[i]!.rewrite = text
        }
      })
    }
  }
  const stats = {
    total: sentences.length,
    blocked: sentences.filter((s) => s.status === 'blocked').length,
    rewritten: sentences.filter((s) => s.status === 'rewritten').length,
  }
  // passed refers to the original text; a suggestion does not certify the original.
  return {
    passed: sentences.every((s) => s.status === 'ok'),
    sentences,
    stats,
    meta: {
      mode: input.mode,
      industry: input.industry,
      rulesVersion: rulesVersion(input.industry),
      latencyMs: Math.ceil(performance.now() - start),
    },
  }
}
