import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { Usage } from '../core/schemas'
import { createCallControl, llmEndpoint, readResponse, upstreamFailure } from './control'
import { ProviderError } from './errors'
import { extractJSON } from './json'
import type { GenerateJSONRequest, LLMProvider } from './types'

export interface AnthropicOptions {
  baseUrl: string
  textModel: string
  visionModel: string
  apiKey?: string
  inputPricePer1K?: number
  outputPricePer1K?: number
}

const TOOL = 'submit_json'
const MAX_TOKENS = 16000
// Zod 3 has no JSON Schema export; the prompt carries the shape and zod validates `result`.
const tools = [
  {
    name: TOOL,
    description: '提交最终结果。result 字段放入按要求生成的 JSON 值（对象或数组）。',
    input_schema: {
      type: 'object',
      properties: { result: { description: '符合要求的 JSON 值' } },
      required: ['result'],
    },
  },
]
type Message = { role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }
const tokenUsage = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cache_creation_input_tokens: z.number().int().nonnegative().nullish(),
  cache_read_input_tokens: z.number().int().nonnegative().nullish(),
  cache_creation: z
    .object({
      ephemeral_5m_input_tokens: z.number().int().nonnegative().nullish(),
      ephemeral_1h_input_tokens: z.number().int().nonnegative().nullish(),
    })
    .nullish(),
})
type TokenUsage = z.infer<typeof tokenUsage>
/**
 * Input tokens weighted by Anthropic's published cache multipliers (pricing page, 2026-10):
 * 5m writes 1.25x, 1h writes 2x, reads at most 0.1x (some models are lower, so 0.1x is an
 * upper bound). Writes without a TTL breakdown are billed at the 2x upper bound.
 */
function billedInput(usage: TokenUsage): number {
  const written = usage.cache_creation_input_tokens ?? 0
  const short = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0
  const long = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const unknown = Math.max(0, written - short - long)
  return (
    usage.input_tokens +
    short * 1.25 +
    (long + unknown) * 2 +
    (usage.cache_read_input_tokens ?? 0) * 0.1
  )
}
const envelopeSchema = z.object({
  content: z.array(z.object({ type: z.string() }).passthrough()).min(1),
  stop_reason: z.string().nullish(),
  usage: z.unknown().optional(),
})
// Truncated or refused turns may carry partial tool input; never accept or repair them.
const unusableStops = new Set(['max_tokens', 'model_context_window_exceeded', 'refusal'])
const toolUseSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string().min(1),
  name: z.literal(TOOL),
  input: z.record(z.unknown()),
})
const estimate = (text: string) => Math.ceil([...text].length / 1.5)
const textOf = (message: Message) =>
  typeof message.content === 'string'
    ? message.content
    : message.content
        .map((b) =>
          (b.type === 'text' || b.type === 'tool_result') &&
          typeof (b.text ?? b.content) === 'string'
            ? (b.text ?? b.content)
            : '',
        )
        .join('')

// Newer Claude models reject forced tool_choice; only then fall back to `auto`.
function rejectsForcedTool(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { error?: unknown }
    body = JSON.stringify(payload.error ?? {})
  } catch {
    /* A plain parameter rejection. */
  }
  return (
    /tool_choice/i.test(body) &&
    /not\s+support|unsupported|not\s+allowed|may\s+not|cannot|不支持|不允许/i.test(body)
  )
}

/** Tool input may wrap the value, return it bare, or stringify it. */
function unwrap(input: Record<string, unknown>): unknown {
  const value = 'result' in input ? input.result : input
  return typeof value === 'string' ? extractJSON(value) : value
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic'
  readonly etaMultiplier = 1
  private readonly endpoint: string
  private readonly options: AnthropicOptions

  constructor(options: AnthropicOptions) {
    this.options = { ...options }
    this.endpoint = llmEndpoint(options.baseUrl, 'messages')
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
    try {
      control.check()
      const hasImages = (req.images?.length ?? 0) > 0
      // Current Claude models reject sampling parameters, and Messages has no seed:
      // temperature and seed are accepted for interface parity but never sent.
      const blocks: Array<Record<string, unknown>> = []
      for (const image of req.images ?? []) {
        if (!['image/webp', 'image/jpeg', 'image/png'].includes(image.mime))
          throw new ProviderError('bad_response')
        let bytes: Buffer
        try {
          bytes = await readFile(image.path, { signal: control.signal })
          control.check()
        } catch {
          control.check()
          throw new ProviderError('bad_response')
        }
        const encoded = bytes.toString('base64')
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: image.mime, data: encoded },
        })
      }
      blocks.push({ type: 'text', text: req.prompt })
      const model = hasImages ? this.options.visionModel : this.options.textModel
      const system = `${req.system}\n只输出 JSON：调用 ${TOOL} 工具，把结果放在 result 字段。`
      const messages: Message[] = [{ role: 'user', content: hasImages ? blocks : req.prompt }]
      let forced = true,
        repaired = false,
        retries = 0,
        inputTokens = 0,
        billedInputTokens = 0,
        outputTokens = 0,
        estimated = false
      while (true) {
        control.check()
        const body = {
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages,
          tools,
          tool_choice: forced
            ? { type: 'tool', name: TOOL, disable_parallel_tool_use: true }
            : { type: 'auto', disable_parallel_tool_use: true },
        }
        let response: Response, raw: string
        try {
          response = await fetch(this.endpoint, {
            method: 'POST',
            redirect: 'error',
            signal: control.signal,
            headers: {
              'Content-Type': 'application/json',
              'anthropic-version': '2023-06-01',
              ...(this.options.apiKey ? { 'x-api-key': this.options.apiKey } : {}),
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
          console.warn('Provider request failed', upstreamFailure(response, raw))
          if (response.status === 400 && forced && rejectsForcedTool(raw)) {
            forced = false
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
        if (unusableStops.has(envelope.stop_reason ?? '')) throw new ProviderError('bad_response')
        const text = envelope.content
          .map((b) => (b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
          .join('')
        const toolUse = envelope.content
          .map((b) => toolUseSchema.safeParse(b))
          .find((r) => r.success)?.data
        const reported = tokenUsage.safeParse(envelope.usage)
        const estimatedInput = reported.success
          ? 0
          : estimate(system + messages.map(textOf).join(''))
        inputTokens += reported.success
          ? reported.data.input_tokens +
            (reported.data.cache_creation_input_tokens ?? 0) +
            (reported.data.cache_read_input_tokens ?? 0)
          : estimatedInput
        billedInputTokens += reported.success ? billedInput(reported.data) : estimatedInput
        outputTokens += reported.success
          ? reported.data.output_tokens
          : estimate(text + (toolUse ? JSON.stringify(toolUse.input) : ''))
        estimated ||= !reported.success
        let json: unknown
        let extractionError: ProviderError | undefined
        try {
          json = toolUse ? unwrap(toolUse.input) : extractJSON(text)
        } catch (error) {
          if (!(error instanceof ProviderError) || error.code !== 'bad_response') throw error
          extractionError = error
        }
        const parsed = extractionError ? undefined : req.schema.safeParse(json)
        control.check()
        if (parsed?.success) {
          const cost =
            (billedInputTokens / 1000) * (this.options.inputPricePer1K ?? 0) +
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
            : `请只输出符合要求的 JSON：调用 ${TOOL} 工具，result 字段不要包含解释或 Markdown。`
        // Echo the assistant turn unchanged (thinking blocks included); a tool_use
        // must be answered by its tool_result in the next user turn.
        messages.push(
          { role: 'assistant', content: envelope.content },
          {
            role: 'user',
            content: toolUse
              ? [
                  {
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    is_error: true,
                    content: correction,
                  },
                ]
              : correction,
          },
        )
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
