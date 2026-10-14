import type { Env } from '../env'

export type LLMProfile = NonNullable<Env['LLM_PROFILE']>
export interface ProfileCapabilities {
  vision: boolean
  seed: boolean
  jsonMode: boolean
  /** Downstream orchestration can multiply its default ETA, without changing timeouts. */
  etaMultiplier: number
}

/** Conservative contract: deepseek/generic stay text-only even if a model evolves. */
export const PROFILE_CAPABILITIES: Readonly<Record<LLMProfile, ProfileCapabilities>> = {
  qwen: { vision: true, seed: true, jsonMode: true, etaMultiplier: 1 },
  glm: { vision: true, seed: false, jsonMode: true, etaMultiplier: 1 },
  deepseek: { vision: false, seed: false, jsonMode: true, etaMultiplier: 1 },
  ollama: { vision: true, seed: true, jsonMode: false, etaMultiplier: 3 },
  generic: { vision: false, seed: false, jsonMode: true, etaMultiplier: 1 },
}
