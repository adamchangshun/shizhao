import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { z } from 'zod'
import type { Usage } from '../core/schemas'
import { createCallControl } from './control'
import { ProviderError } from './errors'
import { extractJSON } from './json'
import { PROFILE_CAPABILITIES, type LLMProfile } from './profiles'
import type { GenerateJSONRequest, LLMProvider } from './types'

export interface OpenAICompatibleOptions {
  baseUrl: string
  textModel: string
  visionModel: string
  apiKey?: string
  profile?: LLMProfile
  inputPricePer1K?: number
  outputPricePer1K?: number
}

type ContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
type Message = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }
const tokenUsage = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
})
const envelopeSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.union([
            z.string(),
            z.array(z.object({ type: z.literal('text'), text: z.string() })),
          ]),
        }),
      }),
    )
    .min(1),
  usage: z.unknown().optional(),
})
const estimate = (text: string) => Math.ceil([...text].length / 1.5)
const textOf = (message: Message) =>
  typeof message.content === 'string'
    ? message.content
    : message.content
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('')

/** Redact before truncating; an upstream may reflect the entire request in its error. */
function safeExcerpt(body: string, secrets: string[]): string {
  let safe = body
  try {
    safe = JSON.stringify(JSON.parse(body))
  } catch {
    /* Plain error text. */
  }
  // Plain-text error pages may embed slash-escaped JSON without being JSON.
  // Normalize those escapes before matching exact secrets and image data URLs.
  safe = safe.replace(/\\+\//g, '/')
  for (const secret of secrets) if (secret) safe = safe.split(secret).join('[redacted]')
  safe = safe
    .replace(/data:image\/[^\s"'<>]+/gi, '[image redacted]')
    .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [redacted]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
  return safe.slice(0, 200)
}

// Never downgrade for generic validation or authentication errors.
function rejectsResponseFormat(body: string): boolean {
  // Some services echo the full request beside the actual error. Inspect only
  // the error payload so an unsupported model cannot trigger format fallback.
  try {
    const payload = JSON.parse(body) as { error?: unknown }
    body = JSON.stringify(payload.error ?? {})
  } catch {
    /* A plain parameter rejection. */
  }
  return (
    /response_format/i.test(body) &&
    /not\s+support|unsupported|not\s+allowed|unknown\s+(?:parameter|field)|unrecognized|unexpected\s+(?:keyword|parameter)|不支持|不允许|未知参数/i.test(
      body,
    )
  )
}

/** Bound memory while reading, rather than trusting Content-Length. */
async function readResponse(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 2 * 1024 * 1024) {
        await reader.cancel()
        throw new ProviderError('bad_response')
      }
      chunks.push(next.value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally {
    reader.releaseLock()
  }
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible'
  readonly profile: LLMProfile
  readonly etaMultiplier: number
  private readonly endpoint: string
  private readonly options: OpenAICompatibleOptions

  constructor(options: OpenAICompatibleOptions) {
    this.options = { ...options }
    this.profile = options.profile ?? 'generic'
    const capabilities = PROFILE_CAPABILITIES[this.profile]
    if (!capabilities) throw new ProviderError('bad_response')
    this.etaMultiplier = capabilities.etaMultiplier
    try {
      const base = new URL(options.baseUrl)
      if (
        !['http:', 'https:'].includes(base.protocol) ||
        base.username ||
        base.password ||
        base.search ||
        base.hash
      )
        throw new Error('Invalid URL')
      base.pathname = `${base.pathname.replace(/\/+$/, '')}/chat/completions`
      this.endpoint = base.toString()
    } catch {
      throw new ProviderError('bad_response')
    }
    if (
      !options.textModel?.trim() ||
      !options.visionModel?.trim() ||
      [options.inputPricePer1K ?? 0, options.outputPricePer1K ?? 0].some(
        (p) => !Number.isFinite(p) || p < 0,
      )
    )
      throw new ProviderError('bad_response')
  }

  async generateJSON<T>(req: GenerateJSONRequest<T>): Promise<{ data: T; usage: Usage }> {
    const started = performance.now()
    const control = createCallControl(req.timeoutMs, req.signal)
    const secrets = [this.options.apiKey ?? '']
    try {
      control.check()
      const hasImages = (req.images?.length ?? 0) > 0
      const capabilities = PROFILE_CAPABILITIES[this.profile]
      if (hasImages && !capabilities.vision)
        throw new ProviderError(
          'bad_response',
          '当前配置不支持图片输入，请改用 qwen、glm 或支持视觉模型的 ollama 配置',
        )
      if (
        (req.temperature !== undefined &&
          (!Number.isFinite(req.temperature) || req.temperature < 0 || req.temperature > 2)) ||
        (req.seed !== undefined && (!Number.isSafeInteger(req.seed) || req.seed < 0))
      )
        throw new ProviderError('bad_response')
      if (this.profile === 'qwen' && req.seed !== undefined && req.seed > 2147483647) {
        throw new ProviderError('bad_response')
      }
      const parts: ContentPart[] = [{ type: 'text', text: req.prompt }]
      for (const image of req.images ?? []) {
        if (!['image/webp', 'image/jpeg', 'image/png'].includes(image.mime))
          throw new ProviderError('bad_response')
        let bytes: Buffer
        let mime = image.mime
        try {
          bytes = await readFile(image.path, { signal: control.signal })
          control.check()
          // Uploads use WebP display renditions; Ollama's image decoder needs PNG/JPEG.
          // Convert in memory so stored assets and other profiles keep their original format.
          if (this.profile === 'ollama' && mime === 'image/webp') {
            bytes = await sharp(bytes).png().toBuffer()
            mime = 'image/png'
          }
          control.check()
        } catch {
          control.check()
          throw new ProviderError('bad_response')
        }
        const encoded = bytes.toString('base64')
        secrets.push(encoded)
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${encoded}` },
        })
      }
      const model = hasImages ? this.options.visionModel : this.options.textModel
      const messages: Message[] = [
        { role: 'system', content: `${req.system}\n只输出 JSON。` },
        { role: 'user', content: hasImages ? parts : req.prompt },
      ]
      let format = capabilities.jsonMode,
        repaired = false,
        retries = 0,
        inputTokens = 0,
        outputTokens = 0,
        estimated = false
      while (true) {
        control.check()
        const body = {
          model,
          messages,
          temperature: req.temperature ?? 0.7,
          stream: false,
          ...(capabilities.seed && req.seed !== undefined ? { seed: req.seed } : {}),
          ...(format ? { response_format: { type: 'json_object' } } : {}),
        }
        let response: Response, raw: string
        try {
          response = await fetch(this.endpoint, {
            method: 'POST',
            redirect: 'error',
            signal: control.signal,
            headers: {
              'Content-Type': 'application/json',
              ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}),
            },
            body: JSON.stringify(body),
          })
          raw = await readResponse(response)
        } catch (error) {
          control.check()
          if (error instanceof ProviderError) throw error
          if (retries >= 3) throw new ProviderError('upstream_error')
          await control.wait(1000 * 2 ** retries++ + Math.floor(Math.random() * 301))
          continue
        }
        control.check()
        if (!response.ok) {
          console.warn('Provider request failed', {
            status: response.status,
            body: safeExcerpt(raw, secrets),
          })
          if ([400, 422].includes(response.status) && format && rejectsResponseFormat(raw)) {
            format = false
            continue
          }
          const retryable = response.status === 429 || response.status >= 500
          if (retryable && retries < 3) {
            await control.wait(1000 * 2 ** retries++ + Math.floor(Math.random() * 301))
            continue
          }
          throw new ProviderError(
            response.status === 429 ? 'rate_limited' : 'upstream_error',
            undefined,
            response.status,
          )
        }
        let envelope: z.infer<typeof envelopeSchema>
        try {
          envelope = envelopeSchema.parse(JSON.parse(raw))
        } catch {
          throw new ProviderError('bad_response')
        }
        const content = envelope.choices[0]!.message.content
        const text = typeof content === 'string' ? content : content.map((p) => p.text).join('')
        const reported = tokenUsage.safeParse(envelope.usage)
        inputTokens += reported.success
          ? reported.data.prompt_tokens
          : estimate(messages.map(textOf).join(''))
        outputTokens += reported.success ? reported.data.completion_tokens : estimate(text)
        estimated ||= !reported.success
        let json: unknown
        let extractionError: ProviderError | undefined
        try {
          json = extractJSON(text)
        } catch (error) {
          if (!(error instanceof ProviderError) || error.code !== 'bad_response') throw error
          extractionError = error
        }
        const parsed = extractionError ? undefined : req.schema.safeParse(json)
        control.check()
        if (parsed?.success) {
          const cost =
            (inputTokens / 1000) * (this.options.inputPricePer1K ?? 0) +
            (outputTokens / 1000) * (this.options.outputPricePer1K ?? 0)
          return {
            data: parsed.data,
            usage: {
              provider: this.name,
              model: `${model}${estimated ? '~est' : ''}`,
              stage: req.stage,
              inputTokens,
              outputTokens,
              costCny: Number(cost.toFixed(4)),
              latencyMs: Math.round(performance.now() - started),
            },
          }
        }
        if (repaired) throw extractionError ?? new ProviderError('schema_mismatch')
        repaired = true
        // Custom Zod messages may reflect input. Send issue path/code, never values.
        const correction =
          parsed && !parsed.success
            ? `请修正 JSON，使其符合要求。校验错误：${parsed.error.issues
                .slice(0, 12)
                .map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`)
                .join('; ')}`
            : capabilities.jsonMode
              ? '请只输出符合要求的 JSON 对象，不要包含解释或 Markdown。'
              : '请只输出符合要求的 JSON，不要包含解释或 Markdown。'
        messages.push({ role: 'assistant', content: text }, { role: 'user', content: correction })
      }
    } catch (error) {
      control.check()
      if (error instanceof ProviderError) throw error
      throw new ProviderError('bad_response')
    } finally {
      control.close()
    }
  }
}
