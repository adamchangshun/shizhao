import { createCallControl } from './control'
import { ProviderError } from './errors'
import type { GenerateJSONRequest, LLMProvider } from './types'
import extract from './mock-fixtures/extract.json'
import designs from './mock-fixtures/design.json'
import copy from './mock-fixtures/copy.json'
import judge from './mock-fixtures/guard-judge.json'
import rewrite from './mock-fixtures/guard-rewrite.json'

/** Fixed demo data, never an inference engine. Schemas remain caller-owned. */
export class MockProvider implements LLMProvider {
  readonly name = 'mock'
  constructor(private readonly options: { delay?: boolean } = {}) {}

  async generateJSON<T>(req: GenerateJSONRequest<T>) {
    const started = performance.now()
    const control = createCallControl(req.timeoutMs, req.signal)
    try {
      control.check()
      const seed = req.seed ?? 0
      if (!Number.isSafeInteger(seed) || seed < 0) throw new ProviderError('bad_response')
      const fixtures: Record<string, unknown> = {
        extract,
        copy,
        'guard-judge': judge,
        'guard-rewrite': rewrite,
        design: { ...designs[seed % designs.length], seed },
      }
      if (!Object.hasOwn(fixtures, req.stage)) throw new ProviderError('bad_response')
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
