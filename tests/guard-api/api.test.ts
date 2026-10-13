import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createGuardHandler } from '@/lib/guard-api/handler'
import { closeDb, getDb, runMigrations } from '@/lib/db/client'
import { guardQuota, usageRecords } from '@/lib/db/schema'
import { MockProvider, type GenerateJSONRequest, type LLMProvider } from '@/lib/providers'
import { FixedWindowLimiter } from '@/lib/rate-limit'

beforeAll(runMigrations)
afterEach(() => vi.useRealTimers())
const KEY = 'guard-test-key-not-a-secret'
function request(body: unknown, key?: string, ip = '192.0.2.1') {
  return new Request('http://localhost:6690/api/guard', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': ip,
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  })
}
class BoundaryProvider implements LLMProvider {
  readonly name = 'boundary'
  calls: GenerateJSONRequest<unknown>[] = []
  constructor(private respond: (req: GenerateJSONRequest<unknown>) => Promise<unknown>) {}
  async generateJSON<T>(req: GenerateJSONRequest<T>) {
    this.calls.push(req)
    const data = req.schema.parse(await this.respond(req))
    return {
      data,
      usage: {
        provider: this.name,
        model: 'test',
        stage: req.stage,
        inputTokens: 5,
        outputTokens: 4,
        costCny: 0,
        latencyMs: 1,
      },
    }
  }
}
const pass = async (req: GenerateJSONRequest<unknown>) =>
  (JSON.parse(req.prompt).sentences as string[]).map(() => ({ unsupported: false }))

describe('public guard API', () => {
  it('preserves real engine hits and original UTF-16 spans without a key', async () => {
    const res = await createGuardHandler()(request({ text: '🍰零糖配方，全城销量第一' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('19')
    const body = await res.json()
    expect(body.passed).toBe(false)
    expect(body.sentences[0].hits).toEqual(
      expect.arrayContaining([
        { reason: 'unsupported_claim', evidence: '零糖', start: 2, end: 4 },
        { reason: 'ad_law_absolute', evidence: '第一', start: 11, end: 13 },
      ]),
    )
    for (const hit of body.sentences[0].hits)
      expect(body.sentences[0].text.slice(hit.start, hit.end)).toBe(hit.evidence)
    expect(body.meta.rulesVersion).toMatch(/^0\.1\.0\+[a-f0-9]{8}$/)
  })
  it('allows grounded numbers and only enables food rules with a valid key', async () => {
    const handle = createGuardHandler({ keys: [KEY] })
    expect(
      (
        await (
          await handle(
            request({ text: '当天现烤，6 寸只要 128 元', facts: ['当天现烤', '6寸', '128元'] }),
          )
        ).json()
      ).passed,
    ).toBe(true)
    expect((await handle(request({ text: '当天现烤', industry: 'food' }))).status).toBe(403)
    const result = await handle(request({ text: '当天现烤', industry: 'food' }, KEY))
    expect(result.status).toBe(200)
    expect((await result.json()).passed).toBe(false)
  })
  it.each([undefined, 'wrong-key'])('denies unauthorized model use (%s)', async (key) => {
    const provider = new BoundaryProvider(pass),
      handle = createGuardHandler({ keys: [KEY], provider })
    const res = await handle(request({ text: '暖意。', mode: 'rules+judge' }, key))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: { code: 'api_key_required', message: '该功能需要 API Key' },
    })
    expect(provider.calls).toHaveLength(0)
  })
  it('calls the real MockProvider and stores anonymous usage only', async () => {
    const handle = createGuardHandler({ keys: [KEY], provider: new MockProvider({ delay: false }) })
    const res = await handle(request({ text: '暖意。', mode: 'rules+judge' }, KEY))
    expect(res.status).toBe(200)
    const rows = getDb()
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.stage, 'api-guard'))
      .all()
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.at(-1)).toMatchObject({
      projectId: null,
      jobId: null,
      stage: 'api-guard',
      provider: 'mock',
    })
    expect(JSON.stringify(rows)).not.toContain('暖意')
    expect(JSON.stringify(getDb().select().from(guardQuota).all())).not.toContain(KEY)
  })
  it('limits anonymous requests to 20/min and ignores spoofed forwarding headers by default', async () => {
    const handle = createGuardHandler()
    for (let i = 0; i < 20; i++)
      expect((await handle(request({ text: '暖意' }, undefined, `192.0.2.${i}`))).status).toBe(200)
    const res = await handle(request({ text: '暖意' }, undefined, '198.51.100.1'))
    expect(res.status).toBe(429)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('0')
  })
  it('uses separate validated IP buckets only when the trusted proxy is explicitly enabled', async () => {
    const handle = createGuardHandler({ trustProxy: true })
    for (let i = 0; i < 20; i++) await handle(request({ text: '暖意' }))
    expect((await handle(request({ text: '暖意' }))).status).toBe(429)
    expect((await handle(request({ text: '暖意' }, undefined, '192.0.2.2'))).status).toBe(200)
  })
  it('limits a key to 120/min across IPs', async () => {
    const handle = createGuardHandler({ keys: ['minute-key'], dailyLimit: 500 })
    for (let i = 0; i < 120; i++)
      expect((await handle(request({ text: '暖意' }, 'minute-key', `192.0.2.${i}`))).status).toBe(
        200,
      )
    expect((await handle(request({ text: '暖意' }, 'minute-key'))).status).toBe(429)
  })
  it.each([
    [{ text: '字'.repeat(5001) }, 400],
    [{ text: '暖。'.repeat(81) }, 413],
    [{ text: '暖', facts: Array(101).fill('事实') }, 400],
    [{ text: '暖', facts: ['字'.repeat(101)] }, 400],
    [{ text: '暖', rewrite: true }, 400],
    [{ text: '' }, 400],
    [{ text: '暖', mode: 'unknown' }, 400],
  ])('enforces request bounds', async (body, status) =>
    expect((await createGuardHandler()(request(body))).status).toBe(status),
  )
  it('caps bytes even without a truthful content-length', async () => {
    const req = request({ text: 'x'.repeat(110000) })
    req.headers.set('content-length', '2')
    expect((await createGuardHandler()(req)).status).toBe(413)
  })
  it('serializes daily quota atomically: only one of five remaining-budget requests calls a model', async () => {
    const provider = new BoundaryProvider(pass),
      handle = createGuardHandler({ keys: ['quota-key'], dailyLimit: 1, provider })
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        handle(request({ text: '暖意。', mode: 'rules+judge' }, 'quota-key')),
      ),
    )
    expect(results.map((r) => r.status).sort()).toEqual([200, 429, 429, 429, 429])
    expect(provider.calls).toHaveLength(1)
    closeDb()
    expect(
      (
        await createGuardHandler({ keys: ['quota-key'], dailyLimit: 1, provider })(
          request({ text: '暖意。', mode: 'rules+judge' }, 'quota-key'),
        )
      ).status,
    ).toBe(429)
  })
  it('uses one judge and at most ten rewrites, rechecking every returned sentence with rules', async () => {
    const provider = new BoundaryProvider(async (req) => {
      const input = JSON.parse(req.prompt)
      if (req.stage === 'guard-judge')
        return input.sentences.map(() => ({ unsupported: true, reason: '无依据' }))
      return input.items.map((_: unknown, i: number) =>
        i === 0 ? '暖意。全城第一。' : '午后暖意。',
      )
    })
    const res = await createGuardHandler({ keys: ['batch-key'], provider })(
      request({ text: '陌生说法。'.repeat(12), mode: 'rules+judge', rewrite: true }, 'batch-key'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stats).toEqual({ total: 12, blocked: 3, rewritten: 9 })
    expect(body.passed).toBe(false)
    expect(provider.calls.map((r) => r.stage)).toEqual(['guard-judge', 'guard-rewrite'])
    expect(JSON.parse(provider.calls[1]!.prompt).items).toHaveLength(10)
  })
  it('bounds concurrency to two and cancels queued work after ten seconds without spending its quota', async () => {
    vi.useFakeTimers()
    const release: Array<(value: unknown) => void> = []
    const provider = new BoundaryProvider(() => new Promise((resolve) => release.push(resolve)))
    const handle = createGuardHandler({ keys: ['queue-key'], provider })
    const a = handle(request({ text: '暖意', mode: 'rules+judge' }, 'queue-key'))
    const b = handle(request({ text: '暖意', mode: 'rules+judge' }, 'queue-key'))
    await vi.advanceTimersByTimeAsync(1)
    const c = handle(request({ text: '暖意', mode: 'rules+judge' }, 'queue-key'))
    await vi.advanceTimersByTimeAsync(10001)
    expect((await c).status).toBe(429)
    expect(provider.calls).toHaveLength(2)
    release.forEach((resolve) => resolve([{ unsupported: false }]))
    expect((await a).status).toBe(200)
    expect((await b).status).toBe(200)
  })
  it('times out a slow request body and cancels the stream', async () => {
    vi.useFakeTimers()
    let canceled = false
    const req = new Request('http://localhost:6690/api/guard', {
      method: 'POST',
      body: new ReadableStream({
        cancel() {
          canceled = true
        },
      }),
      duplex: 'half',
    } as RequestInit)
    const response = createGuardHandler()(req)
    await vi.advanceTimersByTimeAsync(30001)
    expect((await response).status).toBe(504)
    expect(canceled).toBe(true)
  })
  it('does not release model slots when an uncooperative provider outlives the HTTP deadline', async () => {
    vi.useFakeTimers()
    const release: Array<(value: unknown) => void> = []
    const provider = new BoundaryProvider(() => new Promise((resolve) => release.push(resolve)))
    const handle = createGuardHandler({ keys: ['slow-key'], provider })
    const a = handle(request({ text: '暖意', mode: 'rules+judge' }, 'slow-key')),
      b = handle(request({ text: '暖意', mode: 'rules+judge' }, 'slow-key'))
    await vi.advanceTimersByTimeAsync(30001)
    expect((await a).status).toBe(504)
    expect((await b).status).toBe(504)
    const c = handle(request({ text: '暖意', mode: 'rules+judge' }, 'slow-key'))
    await vi.advanceTimersByTimeAsync(10001)
    expect((await c).status).toBe(429)
    expect(provider.calls).toHaveLength(2)
    release.forEach((resolve) => resolve([{ unsupported: false }]))
    await vi.advanceTimersByTimeAsync(1)
  })
  it('never logs or reflects raw provider errors or submitted text', async () => {
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const provider = new BoundaryProvider(async () => {
        throw new Error('private-original-and-key')
      })
      const res = await createGuardHandler({ keys: ['privacy-key'], provider })(
        request({ text: 'private-original-and-key', mode: 'rules+judge' }, 'privacy-key'),
      )
      expect(res.status).toBe(500)
      expect(await res.text()).not.toContain('private-original-and-key')
      expect(logging).not.toHaveBeenCalled()
    } finally {
      logging.mockRestore()
    }
  })
})

it('fixed-window take returns remaining counts and refuses to evict an active budget', () => {
  const limiter = new FixedWindowLimiter(2, 60000, 1)
  expect(limiter.take('a', 0)).toBe(1)
  expect(limiter.take('a', 0)).toBe(0)
  expect(limiter.take('a', 0)).toBeNull()
  expect(limiter.take('b', 0)).toBeNull()
  expect(limiter.take('b', 60000)).toBe(1)
})
