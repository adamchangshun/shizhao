import { createCallControl } from './control'
import { ProviderError } from './errors'
import type { GenerateJSONRequest, LLMProvider } from './types'
import extract from './mock-fixtures/extract.json'
import { echoExtract } from './mock-extract'
import designs from './mock-fixtures/design.json'
import copy from './mock-fixtures/copy.json'
import judge from './mock-fixtures/guard-judge.json'
import rewrite from './mock-fixtures/guard-rewrite.json'
import { sampleExtractDraft } from './mock-samples'

/** Fixed demo data, never an inference engine. Schemas remain caller-owned. */
export class MockProvider implements LLMProvider {
  readonly name = 'mock'
  /**
   * `sampleFacts`: answer `extract` with a bundled eval sample's facts when the merchant text is
   * exactly that sample's text (see mock-samples.ts). Only the app enables it, for `pnpm demo`.
   */
  constructor(private readonly options: { delay?: boolean; sampleFacts?: boolean } = {}) {}

  async generateJSON<T>(req: GenerateJSONRequest<T>) {
    const started = performance.now()
    const control = createCallControl(req.timeoutMs, req.signal)
    try {
      control.check()
      const seed = req.seed ?? 0
      if (!Number.isSafeInteger(seed) || seed < 0) throw new ProviderError('bad_response')
      const fixtures: Record<string, unknown> = {
        extract: req.stage === 'extract' ? echoExtract(req.prompt) : extract,
        copy,
        'guard-judge': judge,
        'guard-rewrite': rewrite,
        design: { ...designs[seed % designs.length], seed },
      }
      if (!Object.hasOwn(fixtures, req.stage)) throw new ProviderError('bad_response')
      if (shouldFailOnce(req.stage, req.prompt)) throw new ProviderError('upstream_error')
      // M7 callers supply dynamic item ids and batch sizes. Reuse fixed demo strings,
      // never infer facts or make judgments from the input text.
      let input: Record<string, unknown> = {}
      try {
        const parsed: unknown = JSON.parse(req.prompt)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          input = parsed as Record<string, unknown>
      } catch {
        /* Older fixture smoke tests use non-JSON prompts. */
      }
      if (
        req.stage === 'copy' &&
        Array.isArray(input.itemIds) &&
        input.itemIds.every((id) => typeof id === 'string')
      ) {
        fixtures.copy = {
          ...copy,
          itemBlurbs: Object.fromEntries(
            input.itemIds.map((id) => [id, copy.itemBlurbs['mock-latte']]),
          ),
        }
      }
      if (req.stage === 'extract' && this.options.sampleFacts) {
        const draft = sampleExtractDraft(req.prompt)
        if (draft) fixtures.extract = draft
      }
      if (req.stage === 'guard-judge' && Array.isArray(input.sentences)) {
        fixtures['guard-judge'] = input.sentences.map(() => ({ ...judge[0] }))
      }
      if (req.stage === 'guard-rewrite' && Array.isArray(input.items)) {
        fixtures['guard-rewrite'] = input.items.map(() => rewrite[0])
      }
      if (this.options.delay !== false) await control.wait(300 + Math.floor(Math.random() * 501))
      const parsed = req.schema.safeParse(structuredClone(fixtures[req.stage]))
      if (!parsed.success) throw new ProviderError('schema_mismatch')
      control.check()
      return {
        data: parsed.data,
        usage: {
          provider: this.name,
          model: 'mock-fixtures',
          stage: req.stage,
          inputTokens: 0,
          outputTokens: 0,
          costCny: 0,
          latencyMs: Math.round(performance.now() - started),
        },
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

// Test-only failure injection for the merchant UI end-to-end test (module 11): with
// MOCK_FAIL_ONCE_MARKER set outside production, the first copy-writing call for a shop whose
// name contains the marker fails; later calls for that shop (the retry) succeed. Kept on globalThis because
// Next.js dev may load this module once per route bundle.
const failedOnce = ((
  globalThis as { __shizhaoMockFailedOnce?: Set<string> }
).__shizhaoMockFailedOnce ??= new Set<string>())

function shouldFailOnce(stage: string, prompt: string): boolean {
  const marker = process.env.MOCK_FAIL_ONCE_MARKER
  if (!marker || process.env.NODE_ENV === 'production' || stage !== 'copy') return false
  let shopName: unknown
  try {
    shopName = (JSON.parse(prompt) as { shopName?: unknown }).shopName
  } catch {
    return false
  }
  if (typeof shopName !== 'string' || !shopName.includes(marker) || failedOnce.has(shopName))
    return false
  failedOnce.add(shopName)
  return true
}
