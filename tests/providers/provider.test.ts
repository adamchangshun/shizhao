import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import sharp from 'sharp'
import { CopyDraft, DesignSpec, FactSheet, Usage } from '@/lib/core/schemas'
import { getDb, runMigrations } from '@/lib/db/client'
import { insertProject } from '@/lib/db/repo/projects'
import { createJobIfIdle } from '@/lib/db/repo/jobs'
import { usageRecords } from '@/lib/db/schema'
import { parseEnv, resetEnvCache } from '@/lib/env'
import { JUDGE_SYSTEM, REWRITE_SYSTEM } from '@/lib/copy/prompt'
import {
  getProvider,
  MockProvider,
  OpenAICompatibleProvider,
  ProviderError,
  recordUsage,
} from '@/lib/providers'

const schema = z.object({ answer: z.string() })
const request = { stage: 'extract', system: 'Return JSON.', prompt: 'Describe.', schema }
type Body = {
  model: string
  messages: Array<{
    role: string
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  }>
  seed?: number
  temperature: number
  max_tokens?: number
  response_format?: unknown
}
const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function serve(
  handle: (req: IncomingMessage, res: ServerResponse, body: Body, count: number) => void,
) {
  const bodies: Body[] = []
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Body
    bodies.push(body)
    handle(req, res, body, bodies.length)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  cleanups.push(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('No port')
  return { baseUrl: `http://127.0.0.1:${addr.port}/v1/`, bodies }
}
function reply(
  res: ServerResponse,
  content: unknown = '{"answer":"ok"}',
  usage: unknown = { prompt_tokens: 1200, completion_tokens: 300 },
) {
  res.setHeader('Content-Type', 'application/json')
  res.end(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content } }],
      ...(usage === null ? {} : { usage }),
    }),
  )
}
function provider(
  baseUrl: string,
  profile: 'generic' | 'qwen' | 'glm' | 'deepseek' | 'ollama' = 'generic',
  apiKey?: string,
) {
  return new OpenAICompatibleProvider({
    baseUrl,
    profile,
    apiKey,
    textModel: 'test-text',
    visionModel: 'test-vision',
    inputPricePer1K: 0.002,
    outputPricePer1K: 0.006,
  })
}
async function image() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'provider-image-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'sample.png')
  await writeFile(file, Buffer.from([137, 80, 78, 71]))
  return { path: file, mime: 'image/png' as const }
}

describe('OpenAI compatible provider HTTP boundary', () => {
  it.each([
    ['generic', 'extract', 8192],
    ['qwen', 'design', 1024],
    ['glm', 'copy', 4096],
    ['deepseek', 'guard-judge', 8192],
    ['generic', 'guard-rewrite', 4096],
    ['ollama', 'extract', 4096],
    ['generic', 'unknown', 2048],
    ['generic', 'toString', 2048],
  ] as const)(
    '%s caps %s output at %i on format fallback and JSON repair',
    async (profile, stage, limit) => {
      const server = await serve((_, res, __, count) => {
        if (profile !== 'ollama' && count === 1) {
          res.statusCode = 400
          res.end('response_format unsupported')
        } else reply(res, count === (profile === 'ollama' ? 1 : 2) ? '{}' : '{"answer":"ok"}')
      })
      const result = await provider(server.baseUrl, profile).generateJSON({ ...request, stage })
      expect(result.data.answer).toBe('ok')
      expect(server.bodies).toHaveLength(profile === 'ollama' ? 2 : 3)
      expect(server.bodies.map((body) => body.max_tokens)).toEqual(
        Array(profile === 'ollama' ? 2 : 3).fill(limit),
      )
    },
  )

  it.each(['ollama', 'qwen', 'glm'] as const)(
    '%s sends decodable image bytes with the correct MIME without changing the source',
    async (profile) => {
      const img = await image()
      const original = await sharp({
        create: { width: 12, height: 8, channels: 4, background: '#a0704080' },
      })
        .webp()
        .toBuffer()
      await writeFile(img.path, original)
      const server = await serve((_, res) => reply(res))
      await provider(server.baseUrl, profile).generateJSON({
        ...request,
        images: [{ ...img, mime: 'image/webp' }],
      })
      const parts = server.bodies[0]!.messages[1]!.content as Array<{ image_url?: { url: string } }>
      const url = parts[1]!.image_url!.url
      const bytes = Buffer.from(url.split(',')[1]!, 'base64')
      expect(url.startsWith(`data:image/${profile === 'ollama' ? 'png' : 'webp'};base64,`)).toBe(
        true,
      )
      expect(await sharp(bytes).metadata()).toMatchObject({
        format: profile === 'ollama' ? 'png' : 'webp',
        width: 12,
        height: 8,
      })
      expect(await sharp(bytes).raw().toBuffer()).toEqual(await sharp(original).raw().toBuffer())
      expect(await readFile(img.path)).toEqual(original)
    },
  )
  it('rejects corrupt Ollama WebP before sending', async () => {
    const img = await image()
    const server = await serve((_, res) => reply(res))
    await expect(
      provider(server.baseUrl, 'ollama').generateJSON({
        ...request,
        images: [{ ...img, mime: 'image/webp' }],
      }),
    ).rejects.toMatchObject({ code: 'bad_response' })
    expect(server.bodies).toHaveLength(0)
  })
  it.each(['ollama', 'qwen', 'glm', 'deepseek', 'generic'] as const)(
    '%s follows profile JSON mode through schema repair',
    async (profile) => {
      const server = await serve((_, res, __, count) =>
        reply(res, count === 1 ? '{}' : '```json\n{"answer":"fixed"}\n```'),
      )
      const result = await provider(server.baseUrl, profile).generateJSON(request)
      expect(result.data.answer).toBe('fixed')
      expect(server.bodies).toHaveLength(2)
      for (const body of server.bodies) {
        if (profile === 'ollama') {
          expect(body).not.toHaveProperty('response_format')
          expect(body.messages[0]!.content).toMatch(/只输出 JSON。$/)
        } else expect(body.response_format).toEqual({ type: 'json_object' })
      }
    },
  )
  it('allows the Ollama guard-judge array schema without an object-only system suffix', async () => {
    const server = await serve((_, res) => reply(res, '[{"unsupported":false}]'))
    const result = await provider(server.baseUrl, 'ollama').generateJSON({
      ...request,
      stage: 'guard-judge',
      system: JUDGE_SYSTEM,
      prompt: JSON.stringify({ sentences: ['温暖日常'], facts: [] }),
      schema: z.array(z.object({ unsupported: z.boolean() })),
      temperature: 0,
    })
    expect(result.data).toEqual([{ unsupported: false }])
    expect(server.bodies).toHaveLength(1)
    expect(server.bodies[0]).not.toHaveProperty('response_format')
    expect(server.bodies[0]!.messages[0]!.content).toBe(`${JUDGE_SYSTEM}\n只输出 JSON。`)
  })
  it('keeps Ollama guard-rewrite array instructions through one malformed-JSON repair', async () => {
    const server = await serve((_, res, __, count) =>
      reply(res, count === 1 ? '请稍候' : '["温暖日常"]'),
    )
    const result = await provider(server.baseUrl, 'ollama').generateJSON({
      ...request,
      stage: 'guard-rewrite',
      system: REWRITE_SYSTEM,
      prompt: JSON.stringify({ items: ['全城第一'], problems: ['ad_law_absolute'], facts: [] }),
      schema: z.array(z.string()),
      temperature: 0,
    })
    expect(result.data).toEqual(['温暖日常'])
    expect(server.bodies).toHaveLength(2)
    for (const body of server.bodies) {
      expect(body).not.toHaveProperty('response_format')
      expect(body.messages[0]!.content).toBe(`${REWRITE_SYSTEM}\n只输出 JSON。`)
    }
    expect(server.bodies[1]!.messages[3]!.content).not.toContain('JSON 对象')
    expect(result.usage.inputTokens).toBe(2400)
  })
  it('extracts a bare JSON object after Chinese prose with Ollama without a repair', async () => {
    const server = await serve((_, res) => reply(res, '好的，我先思考一下。\n{"answer":"x"}'))
    const result = await provider(server.baseUrl, 'ollama').generateJSON(request)
    expect(result.data).toEqual({ answer: 'x' })
    expect(server.bodies).toHaveLength(1)
    expect(server.bodies[0]).not.toHaveProperty('response_format')
    expect(result.usage.inputTokens).toBe(1200)
  })
  it('does not retry an Ollama response_format rejection when format was never sent', async () => {
    const server = await serve((_, res) => {
      res.statusCode = 400
      res.end('response_format unsupported')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(provider(server.baseUrl, 'ollama').generateJSON(request)).rejects.toMatchObject({
      code: 'upstream_error',
    })
    expect(server.bodies).toHaveLength(1)
    expect(server.bodies[0]).not.toHaveProperty('response_format')
  })
  it('never logs non-JSON error bodies, only status and content type', async () => {
    const img = await image()
    await writeFile(img.path, Buffer.from([255, 255, 255, 251]))
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const server = await serve((_, res, body) => {
      const parts = body.messages[1]!.content as Array<{ image_url?: { url: string } }>
      const echoed = JSON.stringify({
        image: parts[1]!.image_url!.url,
        raw: '////+w==',
      }).replaceAll('/', '\\/')
      res.statusCode = 400
      res.end(`Upstream rejected request: ${echoed}`)
    })
    await expect(
      provider(server.baseUrl, 'qwen').generateJSON({ ...request, images: [img] }),
    ).rejects.toMatchObject({ code: 'upstream_error', status: 400 })
    expect(log.mock.calls[0]![1]).toEqual({ status: 400, contentType: '' })
    expect(server.bodies).toHaveLength(1)
  })
  it('repairs unparseable JSON once and accumulates usage for both replies', async () => {
    const server = await serve((_, res, __, count) =>
      reply(res, count === 1 ? 'Here is an explanation, without JSON.' : '{"answer":"fixed"}'),
    )
    const result = await provider(server.baseUrl).generateJSON(request)
    expect(result.data).toEqual({ answer: 'fixed' })
    expect(result.usage).toMatchObject({ inputTokens: 2400, outputTokens: 600, costCny: 0.0084 })
    expect(server.bodies).toHaveLength(2)
    expect(server.bodies[1]!.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ])
    expect(server.bodies[1]!.messages[3]!.content).toContain('请只输出符合要求的 JSON 对象')
  })
  it.each([
    ['not JSON', '{"answer":123}', 'schema_mismatch'],
    ['{"answer":123}', 'not JSON', 'bad_response'],
  ])(
    'shares one correction between parse and schema errors: %s then %s',
    async (first, second, code) => {
      const server = await serve((_, res, __, count) => reply(res, count === 1 ? first : second))
      await expect(provider(server.baseUrl).generateJSON(request)).rejects.toMatchObject({ code })
      expect(server.bodies).toHaveLength(2)
    },
  )
  it('does not downgrade when response_format is only in an echoed request', async () => {
    const server = await serve((_, res, body) => {
      res.statusCode = 400
      res.end(JSON.stringify({ error: { message: 'unsupported model' }, request: body }))
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(provider(server.baseUrl).generateJSON(request)).rejects.toMatchObject({
      code: 'upstream_error',
    })
    expect(server.bodies).toHaveLength(1)
  })
  it('bounds upstream reply size and aborts its connection without retrying', async () => {
    let closed = false
    const server = await serve((_, res) => {
      res.on('close', () => {
        closed = true
      })
      res.write('x'.repeat(2 * 1024 * 1024 + 1))
    })
    await expect(
      provider(server.baseUrl).generateJSON({ ...request, timeoutMs: 600 }),
    ).rejects.toMatchObject({ code: 'bad_response' })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(closed).toBe(true)
    expect(server.bodies).toHaveLength(1)
  })
  it('rejects qwen seeds outside its documented 31-bit range before sending', async () => {
    const server = await serve((_, res) => reply(res))
    await expect(
      provider(server.baseUrl, 'qwen').generateJSON({ ...request, seed: 2147483648 }),
    ).rejects.toMatchObject({ code: 'bad_response' })
    expect(server.bodies).toHaveLength(0)
  })
  it('shares transport retries across format fallback and schema repair', async () => {
    const server = await serve((_, res, body, count) => {
      if (count === 1) {
        res.statusCode = 500
        res.end('temporary')
      } else if (body.response_format) {
        res.statusCode = 400
        res.end('response_format unsupported')
      } else if (count === 3) reply(res, '{"answer":123}')
      else reply(res)
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await provider(server.baseUrl).generateJSON(request)
    expect(result.data.answer).toBe('ok')
    expect(server.bodies).toHaveLength(4)
    expect(server.bodies[3]!.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ])
    expect(result.usage.costCny).toBe(0.0084)
  }, 5000)
  it.each([{}, { choices: [] }, { choices: [{ message: { content: null } }] }])(
    'rejects invalid response envelopes',
    async (envelope) => {
      const server = await serve((_, res) => res.end(JSON.stringify(envelope)))
      await expect(provider(server.baseUrl).generateJSON(request)).rejects.toMatchObject({
        code: 'bad_response',
      })
      expect(server.bodies).toHaveLength(1)
    },
  )
  it('redacts unicode-escaped keys and base64 in structured upstream errors', async () => {
    const key = 'test-key-placeholder'
    const img = await image()
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const server = await serve((_, res) => {
      res.statusCode = 400
      res.end('{"error":"\\u0074est-key-placeholder \\u0069VBORw=="}')
    })
    await expect(
      provider(server.baseUrl, 'qwen', key).generateJSON({ ...request, images: [img] }),
    ).rejects.toMatchObject({ code: 'upstream_error' })
    expect(JSON.stringify(log.mock.calls)).not.toContain(key)
    expect(JSON.stringify(log.mock.calls)).not.toContain('iVBORw==')
  })
  it('uses the completion endpoint, defaults and hand-calculated cost', async () => {
    let url = ''
    let authorization: string | undefined
    const server = await serve((req, res) => {
      url = req.url!
      authorization = req.headers.authorization
      reply(res)
    })
    const result = await provider(server.baseUrl, 'generic', 'test-key-placeholder').generateJSON(
      request,
    )
    expect(result.data).toEqual({ answer: 'ok' })
    expect(result.usage).toMatchObject({
      provider: 'openai-compatible',
      model: 'test-text',
      stage: 'extract',
      inputTokens: 1200,
      outputTokens: 300,
      costCny: 0.0042,
    })
    expect(Usage.safeParse(result.usage).success).toBe(true)
    expect(url).toBe('/v1/chat/completions')
    expect(authorization).toBe('Bearer test-key-placeholder')
    expect(server.bodies[0]).toMatchObject({
      temperature: 0.7,
      model: 'test-text',
      response_format: { type: 'json_object' },
    })
  })
  it.each([
    ['json fence', 'Prose\n```json\n{"answer":"fenced"}\n```', 'fenced'],
    [
      'balanced braces',
      'Here: {"answer":"a } and \\" quoted", "nested":{"x":{}}} done',
      'a } and " quoted',
    ],
    ['plain fence', '```\n{"answer":"plain"}\n```', 'plain'],
    ['JSON array', '[{"answer":"array"}]', 'array'],
  ])('extracts %s safely', async (name, content, answer) => {
    const server = await serve((_, res) => reply(res, content))
    const requestedSchema = name === 'JSON array' ? z.array(schema) : schema
    const result = await provider(server.baseUrl).generateJSON({
      ...request,
      schema: requestedSchema as z.ZodType<unknown>,
    })
    expect(result.data).toEqual(name === 'JSON array' ? [{ answer }] : { answer })
  })
  it('repairs the schema once with conversation history and accumulates both usages', async () => {
    const server = await serve((_, res, __, count) =>
      reply(res, count === 1 ? '{"answer":123}' : '{"answer":"fixed"}'),
    )
    const result = await provider(server.baseUrl).generateJSON(request)
    expect(result.data).toEqual({ answer: 'fixed' })
    expect(server.bodies).toHaveLength(2)
    expect(server.bodies[1]!.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ])
    expect(server.bodies[1]!.messages[3]!.content).toContain('answer')
    expect(result.usage).toMatchObject({ inputTokens: 2400, outputTokens: 600, costCny: 0.0084 })
  })
  it('fails after exactly two schema mismatches', async () => {
    const server = await serve((_, res) => reply(res, '{"answer":123}'))
    await expect(provider(server.baseUrl).generateJSON(request)).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'schema_mismatch',
    })
    expect(server.bodies).toHaveLength(2)
  })
  it('backs off on two 500 responses then succeeds on request three', async () => {
    const times: number[] = []
    const server = await serve((_, res, __, count) => {
      times.push(performance.now())
      if (count < 3) {
        res.statusCode = 500
        res.end('temporary')
      } else reply(res)
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await provider(server.baseUrl).generateJSON(request)
    expect(result.data.answer).toBe('ok')
    expect(server.bodies).toHaveLength(3)
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(990)
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(1990)
  }, 10000)
  it.each([400, 401, 403, 404])('never retries ordinary HTTP %s', async (status) => {
    const server = await serve((_, res) => {
      res.statusCode = status
      res.end('invalid')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(provider(server.baseUrl).generateJSON(request)).rejects.toMatchObject({
      code: 'upstream_error',
      status,
    })
    expect(server.bodies).toHaveLength(1)
  })
  it('caps 429 retries at three with 1/2/4 second backoff', async () => {
    const times: number[] = []
    const server = await serve((_, res) => {
      times.push(performance.now())
      res.statusCode = 429
      res.end('limited')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      provider(server.baseUrl).generateJSON({ ...request, timeoutMs: 15000 }),
    ).rejects.toMatchObject({ code: 'rate_limited' })
    expect(server.bodies).toHaveLength(4)
    expect(times[3]! - times[2]!).toBeGreaterThanOrEqual(3990)
  }, 15000)
  it('retries dropped network connections', async () => {
    const server = await serve((req, res, _, count) => {
      if (count === 1) req.socket.destroy()
      else reply(res)
    })
    expect((await provider(server.baseUrl).generateJSON(request)).data.answer).toBe('ok')
    expect(server.bodies).toHaveLength(2)
  }, 5000)
  it('removes unsupported response_format exactly once, preserving explicit JSON instruction', async () => {
    const server = await serve((_, res, body) => {
      if (body.response_format) {
        res.statusCode = 400
        res.end('response_format is not supported')
      } else reply(res)
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await provider(server.baseUrl).generateJSON(request)).data.answer).toBe('ok')
    expect(server.bodies).toHaveLength(2)
    expect(server.bodies[1]).not.toHaveProperty('response_format')
    expect(server.bodies[1]!.messages[0]!.content).toContain('只输出 JSON')
  })
  it('does not loop on repeated response_format rejection', async () => {
    const server = await serve((_, res) => {
      res.statusCode = 400
      res.end('unsupported parameter: response_format')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(provider(server.baseUrl).generateJSON(request)).rejects.toMatchObject({
      code: 'upstream_error',
    })
    expect(server.bodies).toHaveLength(2)
  })
  it('does not mistake other response_format validation errors for unsupported parameters', async () => {
    const server = await serve((_, res) => {
      res.statusCode = 400
      res.end('response_format requires json in messages')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(provider(server.baseUrl).generateJSON(request)).rejects.toMatchObject({
      code: 'upstream_error',
    })
    expect(server.bodies).toHaveLength(1)
  })
  it.each(['headers', 'body'])(
    'times out and closes a hanging connection during %s',
    async (phase) => {
      let closed = false
      const server = await serve((_, res) => {
        res.on('close', () => {
          closed = true
        })
        if (phase === 'body') {
          res.writeHead(200)
          res.write('{')
        }
      })
      const start = performance.now()
      await expect(
        provider(server.baseUrl).generateJSON({ ...request, timeoutMs: 100 }),
      ).rejects.toMatchObject({ code: 'timeout' })
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(closed).toBe(true)
      expect(server.bodies).toHaveLength(1)
      expect(performance.now() - start).toBeLessThan(800)
    },
  )
  it('aborts an in-flight request without retrying', async () => {
    const controller = new AbortController()
    let closed = false
    const server = await serve((_, res) => {
      res.on('close', () => {
        closed = true
      })
      controller.abort()
    })
    await expect(
      provider(server.baseUrl).generateJSON({ ...request, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'aborted' })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(closed).toBe(true)
    expect(server.bodies).toHaveLength(1)
  })
  it('honors pre-aborted requests without network traffic', async () => {
    const server = await serve((_, res) => reply(res))
    const controller = new AbortController()
    controller.abort()
    await expect(
      provider(server.baseUrl).generateJSON({ ...request, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'aborted' })
    expect(server.bodies).toHaveLength(0)
  })
  it('cancels backoff instead of issuing another request', async () => {
    const controller = new AbortController()
    const server = await serve((_, res) => {
      res.statusCode = 500
      res.end('temporary')
      setTimeout(() => controller.abort(), 50)
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      provider(server.baseUrl).generateJSON({ ...request, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'aborted' })
    expect(server.bodies).toHaveLength(1)
  })
  it('uses a single timeout budget including backoff', async () => {
    const server = await serve((_, res) => {
      res.statusCode = 500
      res.end('temporary')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      provider(server.baseUrl).generateJSON({ ...request, timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: 'timeout' })
    expect(server.bodies).toHaveLength(1)
  })
  it.each([null, { prompt_tokens: -1, completion_tokens: 0 }])(
    'marks missing or invalid usage as an estimate',
    async (usage) => {
      const server = await serve((_, res) => reply(res, '{"answer":"ok"}', usage))
      const result = await provider(server.baseUrl).generateJSON({
        ...request,
        system: '',
        prompt: '123456',
      })
      expect(result.usage.model).toBe('test-text~est')
      expect(result.usage.outputTokens).toBe(10)
      expect(Usage.safeParse(result.usage).success).toBe(true)
    },
  )
  it('rejects unparseable JSON after exactly one correction', async () => {
    const server = await serve((_, res) => reply(res, 'no json here'))
    await expect(provider(server.baseUrl).generateJSON(request)).rejects.toMatchObject({
      code: 'bad_response',
    })
    expect(server.bodies).toHaveLength(2)
  })
  it('redacts reflected API keys and image base64 from bounded logs and errors', async () => {
    const key = 'test-secret-DO-NOT-PRINT'
    const img = await image()
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const server = await serve((_, res, body) => {
      const content = body.messages[1]!.content as Array<{ image_url?: { url: string } }>
      res.statusCode = 400
      res.end(
        JSON.stringify({
          error: `Bearer ${key} image ${content[1]!.image_url!.url} raw iVBORw== ${'x'.repeat(300)}`,
        }),
      )
    })
    let error: unknown
    try {
      await provider(server.baseUrl, 'qwen', key).generateJSON({ ...request, images: [img] })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(ProviderError)
    const logs = JSON.stringify(log.mock.calls)
    expect(logs).not.toContain(key)
    expect(logs).not.toContain('iVBORw==')
    expect(logs).not.toContain('data:image')
    expect(log.mock.calls[0]![1]).toMatchObject({ status: 400 })
    expect((log.mock.calls[0]![1] as { message: string }).message.length).toBeLessThanOrEqual(200)
    expect(JSON.stringify(error)).not.toContain(key)
  })
  it.each(['qwen', 'glm', 'ollama'] as const)(
    '%s selects the vision model and sends base64 image parts',
    async (profile) => {
      const img = await image()
      let auth: string | undefined
      const server = await serve((req, res) => {
        auth = req.headers.authorization
        reply(res, [
          { type: 'text', text: '{"answer":' },
          { type: 'text', text: '"ok"}' },
        ])
      })
      const result = await provider(server.baseUrl, profile).generateJSON({
        ...request,
        images: [img],
        seed: 12,
      })
      expect(result.data.answer).toBe('ok')
      expect(result.usage.model).toBe('test-vision')
      expect(auth).toBeUndefined()
      expect(server.bodies[0]!.messages[1]!.content).toEqual([
        { type: 'text', text: 'Describe.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw==' } },
      ])
      expect(server.bodies[0]!.model).toBe('test-vision')
      if (profile === 'glm') expect(server.bodies[0]).not.toHaveProperty('seed')
      else expect(server.bodies[0]!.seed).toBe(12)
    },
  )
  it.each(['deepseek', 'generic'] as const)(
    '%s supports text but rejects images before reading or sending',
    async (profile) => {
      const server = await serve((_, res) => reply(res))
      expect(
        (await provider(server.baseUrl, profile).generateJSON({ ...request, seed: 12 })).data
          .answer,
      ).toBe('ok')
      expect(server.bodies[0]).not.toHaveProperty('seed')
      await expect(
        provider(server.baseUrl, profile).generateJSON({
          ...request,
          images: [{ path: '/missing.png', mime: 'image/png' }],
        }),
      ).rejects.toMatchObject({ code: 'bad_response' })
      expect(server.bodies).toHaveLength(1)
    },
  )
  it('logs only OpenAI error code and message with prompts redacted', async () => {
    const system = 'MERCHANT-SYSTEM-PROMPT 老王面馆'
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const server = await serve((_, res, body) => {
      res.statusCode = 400
      res.end(
        JSON.stringify({
          error: { code: 'invalid_parameter', message: `bad: ${system}` },
          echoed: body.messages,
        }),
      )
    })
    await expect(
      provider(server.baseUrl).generateJSON({ ...request, system }),
    ).rejects.toMatchObject({ code: 'upstream_error', status: 400 })
    expect(log.mock.calls[0]![1]).toEqual({
      status: 400,
      type: 'invalid_parameter',
      message: 'bad: [redacted]',
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('老王面馆')
  })
  it('rejects a public plain-http endpoint but keeps LAN and loopback http', () => {
    expect(() => provider('http://api.example.com/v1')).toThrow(
      expect.objectContaining({ code: 'bad_response', message: expect.stringContaining('https') }),
    )
    expect(provider('http://10.0.0.5:11434/v1')).toBeInstanceOf(OpenAICompatibleProvider)
    expect(provider('http://host.docker.internal:11434/v1')).toBeInstanceOf(
      OpenAICompatibleProvider,
    )
  })
  it('wraps local image read failures and invalid endpoint configuration', async () => {
    const server = await serve((_, res) => reply(res))
    await expect(
      provider(server.baseUrl, 'qwen').generateJSON({
        ...request,
        images: [{ path: '/missing.png', mime: 'image/png' }],
      }),
    ).rejects.toMatchObject({ code: 'bad_response' })
    expect(() => provider('file:///etc/passwd')).toThrow(ProviderError)
    expect(server.bodies).toHaveLength(0)
  })
})

describe('MockProvider and usage persistence', () => {
  beforeAll(() => runMigrations())
  it('provides all five stages with independently specified schemas offline', async () => {
    const mock = new MockProvider({ delay: false })
    for (const [stage, expectedSchema] of [
      ['extract', FactSheet],
      ['design', DesignSpec],
      ['copy', CopyDraft],
      [
        'guard-judge',
        z.array(z.object({ unsupported: z.boolean(), reason: z.string().optional() })),
      ],
      ['guard-rewrite', z.array(z.string())],
    ] as const) {
      const result = await mock.generateJSON({
        ...request,
        stage,
        schema: expectedSchema as z.ZodType<unknown>,
      })
      expect(expectedSchema.safeParse(result.data).success).toBe(true)
      expect(result.usage.provider).toBe('mock')
      expect(result.usage.costCny).toBe(0)
    }
    const copy = await mock.generateJSON({ ...request, stage: 'copy', schema: CopyDraft })
    expect(JSON.stringify(copy.data)).toContain('零糖配方，全城销量第一')
  })
  it('rotates six visible style combinations deterministically and preserves the seed', async () => {
    const mock = new MockProvider({ delay: false })
    const designs = []
    for (let seed = 0; seed < 6; seed++)
      designs.push(
        (await mock.generateJSON({ ...request, stage: 'design', seed, schema: DesignSpec })).data,
      )
    expect(new Set(designs.map((d) => `${d.templateId}:${d.palette.primary}`)).size).toBe(6)
    expect(designs.map((d) => d.seed)).toEqual([0, 1, 2, 3, 4, 5])
    expect(
      (await mock.generateJSON({ ...request, stage: 'design', seed: 6, schema: DesignSpec })).data
        .palette,
    ).toEqual(designs[0]!.palette)
  })
  it('reports unsupported stages and mismatched schema without leaking Zod messages', async () => {
    const mock = new MockProvider({ delay: false })
    await expect(mock.generateJSON({ ...request, stage: 'unknown' })).rejects.toMatchObject({
      code: 'bad_response',
    })
    await expect(mock.generateJSON({ ...request, stage: 'copy' })).rejects.toMatchObject({
      code: 'schema_mismatch',
    })
  })
  it('simulates delay and respects timeout and cancellation', async () => {
    const mock = new MockProvider()
    const start = performance.now()
    await mock.generateJSON({ ...request, stage: 'copy', schema: CopyDraft })
    expect(performance.now() - start).toBeGreaterThanOrEqual(295)
    await expect(
      mock.generateJSON({ ...request, stage: 'copy', schema: CopyDraft, timeoutMs: 10 }),
    ).rejects.toMatchObject({ code: 'timeout' })
    const controller = new AbortController()
    controller.abort()
    await expect(
      mock.generateJSON({
        ...request,
        stage: 'copy',
        schema: CopyDraft,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'aborted' })
  })
  it('selects mock by default and reads compatible configuration through the env parser', async () => {
    resetEnvCache()
    expect(getProvider()).toBeInstanceOf(MockProvider)
    const env = parseEnv({
      PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://127.0.0.1:1234/v1',
      LLM_MODEL_TEXT: 'configured-text',
      LLM_MODEL_VISION: 'configured-vision',
      ADMIN_TOKEN: 'test-admin-012345',
      PUBLIC_BASE_URL: 'http://localhost:6690',
    })
    expect(getProvider(env)).toBeInstanceOf(OpenAICompatibleProvider)
  })
  it('persists usage against real projects and jobs, with UTC timestamps and nullable jobs', () => {
    const project = insertProject({ type: 'single', title: '成本记录' })
    const job = createJobIfIdle(project.id, { factRevision: 1, seed: 0 })!
    const usage = {
      provider: 'openai-compatible',
      model: 'text-test',
      stage: 'extract',
      inputTokens: 1200,
      outputTokens: 300,
      costCny: 0.0042,
      latencyMs: 123,
    }
    recordUsage(getDb(), usage, { projectId: project.id, jobId: job.id })
    recordUsage(getDb(), usage, { projectId: project.id, jobId: null })
    const rows = getDb().select().from(usageRecords).all()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ ...usage, projectId: project.id, jobId: job.id })
    expect(rows[1]!.jobId).toBeNull()
    expect(rows[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
    expect(() =>
      recordUsage(getDb(), { ...usage, costCny: -1 }, { projectId: project.id, jobId: null }),
    ).toThrow(ProviderError)
  })
})
