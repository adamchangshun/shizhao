import { getEnv, type Env } from '../env'
import { ProviderError } from './errors'
import { MockProvider } from './mock'
import { OpenAICompatibleProvider } from './openai-compatible'
import type { LLMProvider } from './types'

export { ProviderError } from './errors'
export type { ProviderErrorCode } from './errors'
export { MockProvider } from './mock'
export { OpenAICompatibleProvider } from './openai-compatible'
export type { OpenAICompatibleOptions } from './openai-compatible'
export { PROFILE_CAPABILITIES } from './profiles'
export type { LLMProfile } from './profiles'
export type { ImageInput, GenerateJSONRequest, LLMProvider } from './types'
export { recordUsage } from './usage'

/** Stateless providers: no singleton retaining stale env, keys or cancellation state. */
export function getProvider(env: Env = getEnv()): LLMProvider {
  if (env.PROVIDER === 'mock') return new MockProvider()
  if (!env.LLM_BASE_URL || !env.LLM_MODEL_TEXT || !env.LLM_MODEL_VISION)
    throw new ProviderError('bad_response')
  return new OpenAICompatibleProvider({
    baseUrl: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
    textModel: env.LLM_MODEL_TEXT,
    visionModel: env.LLM_MODEL_VISION,
    profile: env.LLM_PROFILE ?? 'generic',
    inputPricePer1K: env.LLM_PRICE_INPUT_PER_1K,
    outputPricePer1K: env.LLM_PRICE_OUTPUT_PER_1K,
  })
}
