import path from 'node:path'
import { z } from 'zod'
import { HTTPS_REQUIRED_MESSAGE, isLocalHost } from './net'
import { llmEndpoint } from './providers/control'

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()))

const price = z.coerce
  .number({ invalid_type_error: '必须是数字' })
  .nonnegative('不能为负数')
  .default(0)

const bool = z
  .enum(['true', 'false', '1', '0'], { errorMap: () => ({ message: '只能是 true 或 false' }) })
  .default('false')
  .transform((v) => v === 'true' || v === '1')

export { HTTPS_REQUIRED_MESSAGE, isLocalHost }

const EnvSchema = z
  .object({
    PROVIDER: z
      .enum(['mock', 'openai-compatible', 'anthropic'], {
        errorMap: () => ({ message: '只能是 mock、openai-compatible 或 anthropic' }),
      })
      .default('mock'),
    LLM_PROFILE: z
      .enum(['qwen', 'glm', 'deepseek', 'ollama', 'generic'], {
        errorMap: () => ({ message: '只能是 qwen / glm / deepseek / ollama / generic' }),
      })
      .optional(),
    LLM_BASE_URL: optionalString,
    LLM_API_KEY: optionalString,
    LLM_MODEL_TEXT: optionalString,
    LLM_MODEL_VISION: optionalString,
    LLM_PRICE_INPUT_PER_1K: price,
    LLM_PRICE_OUTPUT_PER_1K: price,
    PUBLIC_BASE_URL: z
      .string({ required_error: '缺少必需变量' })
      .url('必须是完整网址，例如 http://localhost:6688')
      .refine((u) => /^https?:\/\//.test(u), '只允许 http 或 https')
      .transform((u) => u.replace(/\/+$/, '')),
    ADMIN_TOKEN: z.string({ required_error: '缺少必需变量' }).min(12, '管理口令至少 12 个字符'),
    DATA_DIR: z
      .string()
      .default('./data')
      .transform((d) => path.resolve(d)),
    GUARD_API_KEYS: z
      .string()
      .default('')
      .transform((s) =>
        s
          .split(',')
          .map((k) => k.trim())
          .filter((k) => k.length > 0),
      ),
    GUARD_KEY_DAILY_LIMIT: z.coerce.number().int().positive('必须是正整数').default(2000),
    GUARD_TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    LONG_IMAGE_ENABLED: bool,
    TRACK_TRUST_PROXY: bool,
    JOB_STAGE_TIMEOUT_MS: z.coerce.number().int().positive('必须是正整数').default(60_000),
    JOB_TOTAL_TIMEOUT_MS: z.coerce.number().int().positive('必须是正整数').default(180_000),
  })
  .superRefine((env, ctx) => {
    const base = new URL(env.PUBLIC_BASE_URL)
    if (base.protocol !== 'https:' && !isLocalHost(base.hostname)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PUBLIC_BASE_URL'],
        message: HTTPS_REQUIRED_MESSAGE,
      })
    }
    if (env.PROVIDER === 'mock') return
    if (env.LLM_BASE_URL) {
      try {
        llmEndpoint(env.LLM_BASE_URL, '')
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LLM_BASE_URL'],
          message: error instanceof Error ? error.message : '必须是完整网址',
        })
      }
    }
    for (const key of ['LLM_BASE_URL', 'LLM_MODEL_TEXT', 'LLM_MODEL_VISION'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `PROVIDER=${env.PROVIDER} 时必需`,
        })
      }
    }
  })

export type Env = z.infer<typeof EnvSchema>

export class EnvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvError'
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Empty strings from .env files count as "not set" so defaults apply.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''))
  const result = EnvSchema.safeParse(cleaned)
  if (result.success) return result.data
  const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || '(根)'}：${i.message}`)
  throw new EnvError(`环境变量配置有误，请对照 .env.example 检查：\n${lines.join('\n')}`)
}

let cached: Env | undefined

export function getEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}

/** Test-only: drop the cached env so the next getEnv() re-reads process.env. */
export function resetEnvCache(): void {
  cached = undefined
}
