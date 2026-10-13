import { createHash, createHmac, randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
import { ZodError } from 'zod'
import { safeEqual } from '../auth'
import { ApiError, toErrorResponse } from '../core/errors'
import { getDb } from '../db/client'
import { getEnv } from '../env'
import { readJsonLimited } from '../http'
import { FixedWindowLimiter } from '../rate-limit'
import { getProvider, ProviderError, type LLMProvider } from '../providers'
import { consumeDailyQuota } from './accounting'
import { checkInput, sentencesFor } from './check'
import { ModelGate, untilAborted } from './gate'
import { GuardRequest } from './schema'

interface GuardOptions {
  keys?: string[]
  dailyLimit?: number
  trustProxy?: boolean
  provider?: LLMProvider
}
const keyRequired = () => new ApiError(403, 'api_key_required', '该功能需要 API Key')
const digest = (s: string) => createHash('sha256').update(s).digest('hex')
function safeError(error: unknown): ApiError | ZodError | SyntaxError {
  if (error instanceof ApiError || error instanceof ZodError || error instanceof SyntaxError)
    return error
  // Never forward/log a raw exception: providers can include user text in error messages.
  if (error instanceof ProviderError)
    return new ApiError(
      error.code === 'timeout' ? 504 : error.code === 'rate_limited' ? 503 : 502,
      `provider_${error.code}`,
      '模型检查暂时不可用，请稍后重试',
    )
  return new ApiError(500, 'internal_error', '服务器内部错误，请稍后再试')
}

/** One handler owns all budgets for a process; dependencies are server-only boundaries. */
export function createGuardHandler(options: GuardOptions = {}) {
  const anonymous = new FixedWindowLimiter(20, 60000),
    keyed = new FixedWindowLimiter(120, 60000),
    gate = new ModelGate()
  const ipSalt = randomBytes(32)
  return async (request: Request): Promise<Response> => {
    const started = Date.now(),
      deadline = started + 30000,
      controller = new AbortController()
    const timeout = new ApiError(504, 'request_timeout', '检查超时，请稍后重试')
    const timer = setTimeout(() => controller.abort(timeout), 30000)
    const cancel = () => controller.abort(new ApiError(499, 'request_cancelled', '检查已取消'))
    request.signal.addEventListener('abort', cancel, { once: true })
    if (request.signal.aborted) cancel()
    let remaining = 0
    const headers = (response: Response) => {
      response.headers.set('X-RateLimit-Remaining', String(remaining))
      response.headers.set('Cache-Control', 'no-store')
      return response
    }
    try {
      const env = getEnv(),
        keys = options.keys ?? env.GUARD_API_KEYS
      const authorization = request.headers.get('authorization')
      const candidate = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1]
      let valid = false
      for (const key of keys) valid = safeEqual(candidate ?? '', key) || valid
      const keyHash = valid && candidate ? digest(candidate) : null
      const rawIP =
        (options.trustProxy ?? env.GUARD_TRUST_PROXY)
          ? (request.headers.get('x-real-ip') ?? '')
          : ''
      const ip =
        isIP(rawIP) === 6
          ? new URL(`http://[${rawIP}]/`).hostname
          : isIP(rawIP) === 4
            ? rawIP
            : 'unverified-peer'
      const capacity = keyHash
        ? keyed.take(keyHash)
        : anonymous.take(createHmac('sha256', ipSalt).update(ip).digest('hex'))
      if (capacity === null) throw new ApiError(429, 'rate_limited', '请求过于频繁，请稍后重试')
      remaining = capacity
      if (authorization && !keyHash) throw keyRequired()
      const work = async () => {
        const input = GuardRequest.parse(
          await readJsonLimited(request, 100 * 1024, controller.signal),
        )
        if (!keyHash && (input.mode !== 'rules' || input.industry !== 'general'))
          throw keyRequired()
        const texts = sentencesFor(input)
        let result
        if (input.mode === 'rules+judge') {
          result = await gate.run(controller.signal, async () => {
            controller.signal.throwIfAborted()
            const db = getDb()
            consumeDailyQuota(db, keyHash!, options.dailyLimit ?? env.GUARD_KEY_DAILY_LIMIT)
            return checkInput(input, texts, {
              provider: options.provider ?? getProvider(),
              db,
              signal: controller.signal,
              deadline,
            })
          })
        } else {
          controller.signal.throwIfAborted()
          if (keyHash)
            consumeDailyQuota(getDb(), keyHash, options.dailyLimit ?? env.GUARD_KEY_DAILY_LIMIT)
          result = await checkInput(input, texts)
        }
        controller.signal.throwIfAborted()
        if (Date.now() >= deadline) throw timeout
        result.meta.latencyMs = Math.max(0, Date.now() - started)
        return Response.json(result)
      }
      return headers(await untilAborted(work(), controller.signal))
    } catch (error) {
      return headers(
        toErrorResponse(safeError(controller.signal.aborted ? controller.signal.reason : error)),
      )
    } finally {
      clearTimeout(timer)
      request.signal.removeEventListener('abort', cancel)
    }
  }
}
