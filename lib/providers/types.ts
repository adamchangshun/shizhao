import type { z } from 'zod'
import type { Usage } from '../core/schemas'

export type ImageInput = { path: string; mime: 'image/webp' | 'image/jpeg' | 'image/png' }

export interface GenerateJSONRequest<T> {
  stage: string
  system: string
  prompt: string
  images?: ImageInput[]
  schema: z.ZodType<T>
  temperature?: number
  seed?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface LLMProvider {
  readonly name: string
  generateJSON<T>(req: GenerateJSONRequest<T>): Promise<{ data: T; usage: Usage }>
}
