import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Usage } from '@/lib/core/schemas'
import { parseEnv } from '@/lib/env'
import { AnthropicProvider, getProvider } from '@/lib/providers'

const schema = z.object({ answer: z.string() })
const request = { stage: 'extract', system: 'Return JSON.', prompt: 'Describe.', schema }
type Block = Record<string, unknown> & { type: string }
type Body = {
  model: string
  max_tokens: number
  system: string
  messages: Array<{ role: string; content: string | Block[] }>
  tools: Array<{ name: string }>
  tool_choice: { type: string; name?: string; disable_parallel_tool_use?: boolean }
  temperature?: number
  seed?: number
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
  const requests: IncomingMessage[] = []
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Body
    bodies.push(body)
    requests.push(req)
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
  return { baseUrl: `http://127.0.0.1:${addr.port}/v1/`, bodies, requests }
}
const toolUse = (input: unknown, id = 'toolu_1') => ({
  type: 'tool_use',
  id,
  name: 'submit_json',
  input,
})
function reply(
  res: ServerResponse,
  content: unknown[] = [toolUse({ result: { answer: 'ok' } })],
  usage: unknown = { input_tokens: 1000, output_tokens: 300, cache_read_input_tokens: 200 },
) {
  res.setHeader('Content-Type', 'application/json')
  res.end(
    JSON.stringify({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      content,
      stop_reason: 'tool_use',
      ...(usage === null ? {} : { usage }),
    }),
  )
}
function fail(res: ServerResponse, status: number, message: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } }))
}
function provider(baseUrl: string, apiKey?: string) {
  return new AnthropicProvider({
    baseUrl,
    apiKey,
    textModel: 'test-text',
    visionModel: 'test-vision',
    inputPricePer1K: 0.002,
    outputPricePer1K: 0.006,
  })
}
async function image(bytes: Buffer) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'anthropic-image-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'sample.webp')
  await writeFile(file, bytes)
  return { path: file, mime: 'image/webp' as const }
}

describe('Anthropic Messages provider HTTP boundary', () => {
  it('forces the submit_json tool and bills the hand-calculated usage', async () => {
    const server = await serve((_, res) => reply(res))
    const result = await provider(server.baseUrl, 'test-key').generateJSON({
      ...request,
      temperature: 0.6,
      seed: 7,
    })
    expect(result.data).toEqual({ answer: 'ok' })
    const req = server.requests[0]!
    expect(req.url).toBe('/v1/messages')
    expect(req.headers['x-api-key']).toBe('test-key')
    expect(req.headers['anthropic-version']).toBe('2023-06-01')
    expect(req.headers.authorization).toBeUndefined()
    const body = server.bodies[0]!
    expect(body).toMatchObject({
      model: 'test-text',
      max_tokens: 16000,
      messages: [{ role: 'user', content: 'Describe.' }],
      tool_choice: { type: 'tool', name: 'submit_json', disable_parallel_tool_use: true },
    })
    expect(body.tools.map((t) => t.name)).toEqual(['submit_json'])
    expect(body.system.startsWith('Return JSON.\n只输出 JSON')).toBe(true)
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('seed')
    // (1000 + 200 cached) / 1000 * 0.002 + 300 / 1000 * 0.006 = 0.0024 + 0.0018
    expect(result.usage).toMatchObject({
      provider: 'anthropic',
      model: 'test-text',
      inputTokens: 1200,
      outputTokens: 300,
      costCny: 0.0042,
    })
    expect(Usage.safeParse(result.usage).success).toBe(true)
  })
  it('omits x-api-key when no key is configured and parses a stringified result', async () => {
    const server = await serve((_, res) => reply(res, [toolUse({ result: '{"answer":"ok"}' })]))
    const result = await provider(server.baseUrl).generateJSON(request)
    expect(result.data).toEqual({ answer: 'ok' })
    expect(server.requests[0]!.headers['x-api-key']).toBeUndefined()
  })
  it('falls back to auto tool_choice once when the model rejects forced tool use', async () => {
    const server = await serve((_, res, body) => {
      if (body.tool_choice.type === 'tool')
        fail(res, 400, 'tool_choice: type "tool" and "any" are not supported for this model.')
      else
        reply(res, [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: '结果：{"answer":"ok"}' },
        ])
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await provider(server.baseUrl).generateJSON(request)
    expect(result.data).toEqual({ answer: 'ok' })
    expect(server.bodies.map((b) => b.tool_choice.type)).toEqual(['tool', 'auto'])
    expect(server.bodies[1]!.tool_choice.disable_parallel_tool_use).toBe(true)
  })
  it('does not loop on repeated forced-tool rejection', async () => {
    const server = await serve((_, res) =>
      fail(res, 400, 'tool_choice: type "tool" and "any" are not supported for this model.'),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(provider(server.baseUrl).generateJSON(request)).rejects.toMatchObject({
      code: 'upstream_error',
      status: 400,
    })
    expect(server.bodies).toHaveLength(2)
  })
  it('does not downgrade on unrelated 400 errors', async () => {
    const server = await serve((_, res) => fail(res, 400, 'messages: model not found'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(provider(server.baseUrl).generateJSON(request)).rejects.toMatchObject({
      code: 'upstream_error',
    })
    expect(server.bodies).toHaveLength(1)
  })
  it('repairs a schema mismatch with an is_error tool_result and accumulates usage', async () => {
    const thinking = { type: 'thinking', thinking: '', signature: 'sig' }
    const server = await serve((_, res, __, count) =>
      count === 1
        ? reply(res, [thinking, toolUse({ result: { answer: 42 } }, 'toolu_a')])
        : reply(res, [toolUse({ result: { answer: 'ok' } }, 'toolu_b')]),
    )
    const result = await provider(server.baseUrl).generateJSON(request)
    expect(result.data).toEqual({ answer: 'ok' })
    expect(result.usage).toMatchObject({ inputTokens: 2400, outputTokens: 600, costCny: 0.0084 })
    const [, assistant, user] = server.bodies[1]!.messages
    expect(assistant).toEqual({
      role: 'assistant',
      content: [thinking, toolUse({ result: { answer: 42 } }, 'toolu_a')],
    })
    const results = user!.content as Block[]
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_a',
      is_error: true,
    })
    expect(results[0]!.content).toContain('answer: invalid_type')
    expect(results[0]!.content).not.toContain('42')
  })
  it('fails after exactly two schema mismatches', async () => {
    const server = await serve((_, res) => reply(res, [toolUse({ result: { answer: 1 } })]))
    await expect(provider(server.baseUrl).generateJSON(request)).rejects.toMatchObject({
      code: 'schema_mismatch',
    })
    expect(server.bodies).toHaveLength(2)
  })
  it('repairs unparseable text with a plain user correction', async () => {
    const server = await serve((_, res, __, count) =>
      count === 1
        ? reply(res, [{ type: 'text', text: 'no json here' }])
        : reply(res, [{ type: 'text', text: '{"answer":"ok"}' }]),
    )
    expect((await provider(server.baseUrl).generateJSON(request)).data.answer).toBe('ok')
    const messages = server.bodies[1]!.messages
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'no json here' }],
    })
    expect(typeof messages[2]!.content).toBe('string')
  })
  it('sends images as base64 blocks before the text with the vision model', async () => {
    const bytes = Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 sample')
    const img = await image(bytes)
    const server = await serve((_, res) => reply(res))
    await provider(server.baseUrl).generateJSON({ ...request, images: [img] })
    const body = server.bodies[0]!
    expect(body.model).toBe('test-vision')
    expect(body.messages[0]!.content).toEqual([
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/webp', data: bytes.toString('base64') },
      },
      { type: 'text', text: 'Describe.' },
    ])
  })
  it('estimates missing usage from characters and marks the model', async () => {
    const server = await serve((_, res) =>
      reply(res, [{ type: 'text', text: '{"answer":"ok"}' }], null),
    )
    const result = await provider(server.baseUrl).generateJSON({
      ...request,
      system: '',
      prompt: '123456',
    })
    // System suffix "\n只输出 JSON：调用 submit_json 工具，把结果放在 result 字段。" is 44
    // characters; +6 prompt = 50 / 1.5 → 34. Output "{"answer":"ok"}" 15 / 1.5 → 10.
    expect(result.usage).toMatchObject({
      model: 'test-text~est',
      inputTokens: 34,
      outputTokens: 10,
    })
    expect(Usage.safeParse(result.usage).success).toBe(true)
  })
  it('retries 429 with backoff then succeeds', async () => {
    const times: number[] = []
    const server = await serve((_, res, __, count) => {
      times.push(performance.now())
      if (count === 1) fail(res, 429, 'rate limited')
      else reply(res)
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await provider(server.baseUrl).generateJSON({ ...request, timeoutMs: 5000 })
    expect(result.data.answer).toBe('ok')
    expect(server.bodies).toHaveLength(2)
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(990)
  }, 5000)
  it('caps 429 retries at three and reports rate_limited', async () => {
    const server = await serve((_, res) => fail(res, 429, 'rate limited'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      provider(server.baseUrl).generateJSON({ ...request, timeoutMs: 15000 }),
    ).rejects.toMatchObject({ code: 'rate_limited' })
    expect(server.bodies).toHaveLength(4)
  }, 15000)
  it('times out a hanging request and closes its connection', async () => {
    let closed = false
    const server = await serve((_, res) => {
      res.on('close', () => {
        closed = true
      })
    })
    await expect(
      provider(server.baseUrl).generateJSON({ ...request, timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: 'timeout' })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(closed).toBe(true)
    expect(server.bodies).toHaveLength(1)
  })
  it('never follows redirects to another host', async () => {
    const target = await serve((_, res) => reply(res))
    const server = await serve((_, res) => {
      res.statusCode = 307
      res.setHeader('Location', `${target.baseUrl}messages`)
      res.end()
    })
    await expect(
      provider(server.baseUrl, 'test-key').generateJSON({ ...request, timeoutMs: 300 }),
    ).rejects.toMatchObject({ code: 'timeout' })
    expect(target.bodies).toHaveLength(0)
  })
  it('bounds reply size without retrying', async () => {
    const server = await serve((_, res) => res.write('x'.repeat(2 * 1024 * 1024 + 1)))
    await expect(
      provider(server.baseUrl).generateJSON({ ...request, timeoutMs: 600 }),
    ).rejects.toMatchObject({ code: 'bad_response' })
    expect(server.bodies).toHaveLength(1)
  })
  it('redacts the API key and image base64 from logs and errors', async () => {
    const key = 'test-secret-DO-NOT-PRINT'
    const bytes = Buffer.from('distinctive-image-bytes-for-redaction')
    const img = await image(bytes)
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const server = await serve((req, res, body) => {
      const blocks = body.messages[0]!.content as Block[]
      const data = (blocks[0]!.source as { data: string }).data
      fail(res, 401, `bad key ${String(req.headers['x-api-key'])} image ${data}`)
    })
    const error = await provider(server.baseUrl, key)
      .generateJSON({ ...request, images: [img] })
      .catch((e: unknown) => e as Error)
    const logged = JSON.stringify(log.mock.calls)
    expect(logged).toContain('[redacted]')
    expect(logged).not.toContain(key)
    expect(logged).not.toContain(bytes.toString('base64'))
    expect((error as Error).message).not.toContain(key)
  })
  it('is selected by PROVIDER=anthropic and requires the LLM settings', () => {
    const base = { ADMIN_TOKEN: 'test-admin-012345', PUBLIC_BASE_URL: 'http://localhost:6690' }
    expect(() => parseEnv({ ...base, PROVIDER: 'anthropic' })).toThrow(/LLM_BASE_URL/)
    const env = parseEnv({
      ...base,
      PROVIDER: 'anthropic',
      LLM_BASE_URL: 'https://api.anthropic.com/v1',
      LLM_MODEL_TEXT: 'configured-text',
      LLM_MODEL_VISION: 'configured-vision',
    })
    expect(getProvider(env)).toBeInstanceOf(AnthropicProvider)
  })
})
