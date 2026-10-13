import { z } from 'zod'
import type { Reason } from '../../packages/fact-guard/src/index'

export const GuardRequest = z
  .object({
    text: z
      .string()
      .min(1)
      .max(5000)
      .refine((s) => s.trim().length > 0),
    facts: z.array(z.string().max(100)).max(100).default([]),
    industry: z.enum(['general', 'food']).default('general'),
    mode: z.enum(['rules', 'rules+judge']).default('rules'),
    rewrite: z.boolean().default(false),
  })
  .strict()
  .refine((input) => !input.rewrite || input.mode === 'rules+judge')
export type GuardInput = z.infer<typeof GuardRequest>
export interface GuardHit {
  reason: Reason
  evidence: string
  start: number
  end: number
}
export interface GuardSentence {
  text: string
  status: 'ok' | 'blocked' | 'rewritten'
  hits: GuardHit[]
  rewrite?: string
}
export interface GuardResponse {
  passed: boolean
  sentences: GuardSentence[]
  stats: { total: number; blocked: number; rewritten: number }
  meta: {
    mode: GuardInput['mode']
    industry: GuardInput['industry']
    rulesVersion: string
    latencyMs: number
  }
}
