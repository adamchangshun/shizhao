import type { Env } from '../env'

export type LLMProfile = NonNullable<Env['LLM_PROFILE']>
const DEFAULT_OUTPUT_TOKENS = {
  extract: 8192,
  design: 1024,
  copy: 4096,
  'guard-judge': 8192,
  'guard-rewrite': 4096,
} as const
export type OutputStage = keyof typeof DEFAULT_OUTPUT_TOKENS

/** Unknown stages keep a finite budget; profile overrides are trusted configuration. */
export function outputTokenLimit(profile: LLMProfile, stage: string): number {
  if (!Object.hasOwn(DEFAULT_OUTPUT_TOKENS, stage)) return 2048
  const key = stage as OutputStage
  return PROFILE_CAPABILITIES[profile].maxOutputTokens?.[key] ?? DEFAULT_OUTPUT_TOKENS[key]
}

export interface ProfileCapabilities {
  vision: boolean
  seed: boolean
  jsonMode: boolean
  /** Downstream orchestration can multiply its default ETA, without changing timeouts. */
  maxOutputTokens?: Partial<Record<OutputStage, number>>
  etaMultiplier: number
}

/** Conservative contract: deepseek/generic stay text-only even if a model evolves. */
export const PROFILE_CAPABILITIES: Readonly<Record<LLMProfile, ProfileCapabilities>> = {
  qwen: { vision: true, seed: true, jsonMode: true, etaMultiplier: 1 },
  glm: { vision: true, seed: false, jsonMode: true, etaMultiplier: 1 },
  deepseek: { vision: false, seed: false, jsonMode: true, etaMultiplier: 1 },
  ollama: {
    vision: true,
    seed: true,
    jsonMode: false,
    etaMultiplier: 3,
    maxOutputTokens: { extract: 4096 },
  },
  generic: { vision: false, seed: false, jsonMode: true, etaMultiplier: 1 },
}
