import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as getJobRoute } from '@/app/api/jobs/[id]/route'
import { POST as postAssets } from '@/app/api/projects/[id]/assets/route'
import { POST as postConfirm } from '@/app/api/projects/[id]/facts/confirm/route'
import { PUT as putFacts } from '@/app/api/projects/[id]/facts/route'
import { POST as postJob } from '@/app/api/projects/[id]/jobs/route'
import { GET as getVersions } from '@/app/api/projects/[id]/versions/route'
import { GET as getMedia } from '@/app/api/versions/[id]/media/[file]/route'
import { GET as getPreview } from '@/app/api/versions/[id]/preview/route'
import * as fx from '@/lib/assets/__fixtures__/generate'
import { resetAuthFailures } from '@/lib/auth'
import type { FactSheet, Usage } from '@/lib/core/schemas'
import { eq } from 'drizzle-orm'
import { getDb, runMigrations } from '@/lib/db/client'
import { jobs } from '@/lib/db/schema'
import {
  beginJobRun,
  createJobIfIdle,
  findJob,
  listJobStatuses,
  transitionJob,
} from '@/lib/db/repo/jobs'
import { insertProject } from '@/lib/db/repo/projects'
import { findActiveVersion } from '@/lib/db/repo/versions'
import { getEnv } from '@/lib/env'
import { extractFacts } from '@/lib/extract'
import { JobRunner, startJobRunner, type PipelineDeps } from '@/lib/jobs'
import { stagingDir } from '@/lib/jobs/files'
import { MockProvider, type GenerateJSONRequest, type LLMProvider } from '@/lib/providers'
import { renderPage } from '@/lib/render'

const BASE = 'http://localhost:6688'
const bearer = { authorization: 'Bearer test-admin-token-0123' }
const mock = new MockProvider({ delay: false })

beforeAll(() => {
  runMigrations()
  // The process-wide runner the job route hands work to.
  startJobRunner({ provider: mock })
})
beforeEach(() => resetAuthFailures())

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (url: string, method = 'GET') =>
  new Request(`${BASE}${url}`, { method, headers: bearer })

function jsonReq(url: string, method: string, body: unknown): Request {
  return new Request(`${BASE}${url}`, {
    method,
    headers: { ...bearer, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

interface Prepared {
  projectId: string
  imageId: string
  sheet: FactSheet
}

/** Upload one image, extract (mock), attach the image and a claim as the merchant, optionally confirm. */
async function prepareProject(confirm = true): Promise<Prepared> {
  const projectId = insertProject({ type: 'single', title: '午后小店' }).id
  const form = new FormData()
  form.append('images', new File([new Uint8Array(await fx.jpeg(120, 90, '#a07040'))], 'a.jpg'))
  form.append('text', '拿铁 20元一杯')
  const encoded = new Response(form)
  const up = await postAssets(
    new Request(`${BASE}/api/projects/${projectId}/assets`, {
      method: 'POST',
      headers: { ...bearer, 'content-type': encoded.headers.get('content-type')! },
      body: await encoded.arrayBuffer(),
    }),
    ctx(projectId),
  )
  expect(up.status).toBe(201)
  const { assets } = (await up.json()) as { assets: Array<{ id: string; kind: string }> }
  const imageId = assets.find((a) => a.kind === 'image')!.id

  const extracted = await extractFacts(projectId, { provider: mock })
  const base = extracted.factSheet
  const put = await putFacts(
    jsonReq(`/api/projects/${projectId}/facts`, 'PUT', {
      baseRevision: base.revision,
      shop: base.shop,
      // Fixed by the merchant here, so the expected page text and copyRefs are known by hand.
      items: base.items.map((i) => ({
        ...i,
        price: { amount: 20, currency: 'CNY', unit: '杯' },
        imageAssetIds: [imageId],
      })),
      extraClaims: ['午后'],
    }),
    ctx(projectId),
  )
  expect(put.status).toBe(200)
  let { factSheet: sheet } = (await put.json()) as { factSheet: FactSheet }
  if (confirm) {
    const res = await postConfirm(
      jsonReq(`/api/projects/${projectId}/facts/confirm`, 'POST', { revision: sheet.revision }),
      ctx(projectId),
    )
    expect(res.status).toBe(200)
    sheet = ((await res.json()) as { factSheet: FactSheet }).factSheet
  }
  return { projectId, imageId, sheet }
}

async function jobView(jobId: string) {
  const res = await getJobRoute(req(`/api/jobs/${jobId}`), ctx(jobId))
  expect(res.status).toBe(200)
  return (await res.json()) as {
    status: string
    stage: string
    stageLabel: string
    etaSeconds: [number, number]
    error?: string
  }
}

async function versionsOf(projectId: string) {
  const res = await getVersions(req(`/api/projects/${projectId}/versions`), ctx(projectId))
  expect(res.status).toBe(200)
  return ((await res.json()) as { versions: Array<Record<string, unknown>> }).versions
}

function pagesEntries(projectId: string): string[] {
  const dir = path.join(getEnv().DATA_DIR, 'pages', projectId)
  return fs.existsSync(dir) ? fs.readdirSync(dir) : []
}

/** Runs one job for `projectId` on a dedicated runner with the given boundary replacements. */
async function runWith(projectId: string, deps: PipelineDeps, revision: number): Promise<string> {
  const job = createJobIfIdle(projectId, { factRevision: revision, seed: 7 })!
  const runner = new JobRunner(deps)
  runner.enqueue(job.id)
  await runner.idle()
  return job.id
}

/** MockProvider, except `failStage` calls throw an upstream-looking error. */
function failingAt(...failStages: string[]): LLMProvider {
  return {
    name: 'mock-failing',
    generateJSON<T>(r: GenerateJSONRequest<T>): Promise<{ data: T; usage: Usage }> {
      if (failStages.includes(r.stage)) {
        return Promise.reject(new Error('connect ECONNREFUSED 10.0.0.8:443 at Socket.<anonymous>'))
      }
      return mock.generateJSON(r)
    },
  }
}

describe('POST /api/projects/:id/jobs → full mock pipeline', () => {
  it('upload → confirm → generate yields one previewable version with copyRefs', async () => {
    const { projectId, imageId, sheet } = await prepareProject()
    const res = await postJob(req(`/api/projects/${projectId}/jobs`, 'POST'), ctx(projectId))
    expect(res.status).toBe(202)
    const { jobId } = (await res.json()) as { jobId: string }
    await startJobRunner().idle()

    expect(await jobView(jobId)).toEqual({
      status: 'succeeded',
      stage: 'succeeded',
      stageLabel: '已生成',
      etaSeconds: [0, 0],
      startedAt: expect.any(String),
    })
    // Every working stage was entered, in order.
    expect(Object.keys(findJob(jobId)!.stageStartedAt!)).toEqual([
      'designing',
      'writing',
      'guarding',
      'rendering',
      'checking',
    ])

    const list = await versionsOf(projectId)
    expect(list).toHaveLength(1)
    const summary = list[0]!
    expect(typeof summary.durationMs).toBe('number')
    const version = findActiveVersion(summary.id as string)!
    // The only flagged sentence is the mock subhead; it was rewritten, nothing removed.
    expect(version.guard.violations.length).toBeGreaterThan(0)
    for (const v of version.guard.violations) {
      expect(v).toMatchObject({ field: 'subhead', sentence: '零糖配方，全城销量第一。' })
    }
    expect(summary).toMatchObject({
      costCny: 0,
      guard: { violations: version.guard.violations.length, rewritten: 1, removed: 0 },
    })

    expect(version).toMatchObject({ jobId, origin: 'generate', factRevision: sheet.revision })
    const itemId = sheet.items[0]!.id
    // Mock copy after the guard (the ad-law subhead rewritten by the rewrite fixture).
    expect(version.copy).toEqual({
      headline: '给午后一点温暖',
      subhead: '适合午后的一点美好。',
      itemBlurbs: { [itemId]: '适合午后的一杯暖意。' },
      closing: '来小店坐坐。',
    })
    // R7, by hand: 「午后」 is extraClaims.0; 「杯」 is the price unit of the item.
    expect(version.copyRefs).toEqual({
      headline: [{ sentence: '给午后一点温暖', refs: ['extraClaims.0'] }],
      subhead: [{ sentence: '适合午后的一点美好。', refs: ['extraClaims.0'] }],
      [`itemBlurbs.${itemId}`]: [
        { sentence: '适合午后的一杯暖意。', refs: [`items.${itemId}.price`, 'extraClaims.0'] },
      ],
      closing: [{ sentence: '来小店坐坐。', refs: [] }],
    })

    // R2 layout: self-contained directory, no staging leftovers.
    expect(pagesEntries(projectId)).toEqual([version.id])
    const dir = path.join(getEnv().DATA_DIR, 'pages', projectId, version.id)
    expect(fs.readdirSync(path.join(dir, 'media'))).toEqual([`${imageId}-display.webp`])
    expect(version.htmlPath).toBe(`pages/${projectId}/${version.id}/index.html`)

    const preview = await getPreview(req(`/api/versions/${version.id}/preview`), ctx(version.id))
    expect(preview.status).toBe(200)
    expect(preview.headers.get('content-security-policy')).toMatch(/script-src( 'sha256-[^']+')+(;|$)/)
    const html = await preview.text()
    expect(html).toContain('data-fact="items.' + itemId + '.price">¥20<')
    expect(html).toContain(`src="media/${imageId}-display.webp"`)

    const media = await getMedia(req(`/api/versions/${version.id}/media/${imageId}-display.webp`), {
      params: Promise.resolve({ id: version.id, file: `${imageId}-display.webp` }),
    })
    expect(media.status).toBe(200)
    expect(media.headers.get('content-type')).toBe('image/webp')
    const bytes = Buffer.from(await media.arrayBuffer())
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP')
  })

  it('rejects generation before the facts are confirmed (409) and creates no job', async () => {
    const { projectId } = await prepareProject(false)
    const res = await postJob(req(`/api/projects/${projectId}/jobs`, 'POST'), ctx(projectId))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: { code: 'facts_not_confirmed', message: '请先核对并确认商品信息' },
    })
    expect(listJobStatuses(projectId)).toEqual([])
  })

  it('requires the admin token', async () => {
    const { projectId } = await prepareProject()
    const res = await postJob(
      new Request(`${BASE}/api/projects/${projectId}/jobs`, { method: 'POST' }),
      ctx(projectId),
    )
    expect(res.status).toBe(401)
    expect(listJobStatuses(projectId)).toEqual([])
  })

  it('5 concurrent requests create exactly one job; the others get 409', async () => {
    const { projectId } = await prepareProject()
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        postJob(req(`/api/projects/${projectId}/jobs`, 'POST'), ctx(projectId)),
      ),
    )
    expect(responses.map((r) => r.status).sort()).toEqual([202, 409, 409, 409, 409])
    const conflict = await responses.find((r) => r.status === 409)!.json()
    expect(conflict).toEqual({ error: { code: 'job_running', message: '正在生成中，请稍候' } })
    await startJobRunner().idle()
    expect(listJobStatuses(projectId)).toEqual(['succeeded'])
    expect(await versionsOf(projectId)).toHaveLength(1)
  })
})

describe('failures', () => {
  const tamper: typeof renderPage = async (input) => {
    const out = await renderPage(input)
    return { ...out, html: out.html.replace('>¥20<', '>¥2<') }
  }
  const crash: typeof renderPage = () => Promise.reject(new Error('EACCES /srv/fonts'))

  it.each([
    ['designing', { provider: failingAt('design') }, '风格生成服务暂时不可用，请稍后重试'],
    ['writing', { provider: failingAt('copy') }, '文案生成服务暂时不可用，请稍后重试'],
    [
      'guarding',
      { provider: failingAt('guard-judge', 'guard-rewrite') },
      '文案事实核对服务暂时不可用，请稍后重试',
    ],
    ['rendering', { provider: mock, render: crash }, '页面生成失败，请稍后重试'],
    ['checking', { provider: mock, render: tamper }, '页面信息核对未通过'],
  ] as const)(
    'a failure in %s → failed with a Chinese message, no version, no files',
    async (stage, deps, message) => {
      const { projectId, sheet } = await prepareProject()
      const jobId = await runWith(projectId, deps, sheet.revision)
      const view = await jobView(jobId)
      expect(view).toMatchObject({ status: 'failed', stage, stageLabel: '生成失败', error: message })
      expect(view.error).not.toMatch(/ECONN|EACCES|Error|at /)
      expect(await versionsOf(projectId)).toEqual([])
      expect(pagesEntries(projectId)).toEqual([])
    },
  )

  it('fails when a referenced image no longer exists', async () => {
    const { projectId, imageId, sheet } = await prepareProject()
    fs.rmSync(path.join(getEnv().DATA_DIR, 'uploads', projectId, `${imageId}.display.webp`))
    const jobId = await runWith(projectId, { provider: mock }, sheet.revision)
    expect(await jobView(jobId)).toMatchObject({
      status: 'failed',
      stage: 'rendering',
      error: '商品图片缺失，请重新上传图片或修改商品信息后再生成',
    })
    expect(pagesEntries(projectId)).toEqual([])
  })
})

describe('timeouts', () => {
  it('a designing call that never returns times out after the stage limit and is aborted', async () => {
    const { projectId, sheet } = await prepareProject()
    let seen: AbortSignal | undefined
    const hanging: LLMProvider = {
      name: 'hanging',
      generateJSON<T>(r: GenerateJSONRequest<T>): Promise<{ data: T; usage: Usage }> {
        if (r.stage !== 'design') return mock.generateJSON(r)
        seen = r.signal
        return new Promise(() => {})
      },
    }
    const started = Date.now()
    const jobId = await runWith(projectId, { provider: hanging, stageTimeoutMs: 200 }, sheet.revision)
    expect(Date.now() - started).toBeLessThan(3000)
    expect(await jobView(jobId)).toMatchObject({
      status: 'timed_out',
      stage: 'designing',
      stageLabel: '生成超时',
      error: '生成超时，请稍后重试',
    })
    expect(seen?.aborted).toBe(true)
    expect(await versionsOf(projectId)).toEqual([])
  })

  it('the total limit also times out a job', async () => {
    const { projectId, sheet } = await prepareProject()
    const slow: LLMProvider = {
      name: 'slow',
      generateJSON: (r) => new Promise(() => void r),
    }
    const jobId = await runWith(
      projectId,
      { provider: slow, stageTimeoutMs: 10_000, totalTimeoutMs: 200 },
      sheet.revision,
    )
    expect((await jobView(jobId)).status).toBe('timed_out')
  })

  it('a call that ignores the abort and returns late writes no version', async () => {
    const { projectId, sheet } = await prepareProject()
    const late: LLMProvider = {
      name: 'late',
      async generateJSON<T>(r: GenerateJSONRequest<T>): Promise<{ data: T; usage: Usage }> {
        if (r.stage === 'copy') await new Promise((done) => setTimeout(done, 400))
        return mock.generateJSON({ ...r, signal: undefined })
      },
    }
    const jobId = await runWith(projectId, { provider: late, stageTimeoutMs: 150 }, sheet.revision)
    await new Promise((done) => setTimeout(done, 500)) // let the late call finish
    expect(await jobView(jobId)).toMatchObject({ status: 'timed_out', stage: 'writing' })
    expect(await versionsOf(projectId)).toEqual([])
    expect(pagesEntries(projectId)).toEqual([])
  })
})

describe('late render after a timeout', () => {
  it('leaves no staging or version directory behind', async () => {
    const { projectId, sheet } = await prepareProject()
    const lateRender: typeof renderPage = async (input) => {
      await new Promise((done) => setTimeout(done, 300))
      return renderPage(input)
    }
    const jobId = await runWith(
      projectId,
      { provider: mock, render: lateRender, stageTimeoutMs: 150 },
      sheet.revision,
    )
    await new Promise((done) => setTimeout(done, 500)) // let the late render finish
    expect(await jobView(jobId)).toMatchObject({ status: 'timed_out', stage: 'rendering' })
    expect(pagesEntries(projectId)).toEqual([])
  })
})

describe('restart recovery', () => {
  it('times out a designing job that started 10 minutes ago and removes its staging dir', async () => {
    const { projectId, sheet } = await prepareProject()
    const job = createJobIfIdle(projectId, { factRevision: sheet.revision, seed: 1 })!
    expect(transitionJob(job.id, 'queued', 'designing')).toBe(true)
    beginJobRun(job.id, new Date(Date.now() - 10 * 60_000).toISOString())
    fs.mkdirSync(stagingDir(projectId, job.id), { recursive: true })

    const runner = new JobRunner({ provider: mock })
    await runner.recover()
    await runner.idle()
    expect(await jobView(job.id)).toMatchObject({ status: 'timed_out', error: '生成超时，请稍后重试' })
    expect(pagesEntries(projectId)).toEqual([])
  })

  it('requeues an interrupted job that is still within the total limit and finishes it', async () => {
    const { projectId, sheet } = await prepareProject()
    const job = createJobIfIdle(projectId, { factRevision: sheet.revision, seed: 1 })!
    expect(transitionJob(job.id, 'queued', 'designing')).toBe(true)
    expect(transitionJob(job.id, 'designing', 'writing')).toBe(true)
    beginJobRun(job.id, new Date(Date.now() - 5_000).toISOString())

    const runner = new JobRunner({ provider: mock })
    await runner.recover()
    await runner.idle()
    expect((await jobView(job.id)).status).toBe('succeeded')
    expect(await versionsOf(projectId)).toHaveLength(1)
    // Stage times of a rerun are not ETA samples.
    expect(findJob(job.id)!.stageStartedAt).toBeNull()
  })

  it('requeues a queued job created long ago instead of timing it out', async () => {
    const { projectId, sheet } = await prepareProject()
    const job = createJobIfIdle(projectId, { factRevision: sheet.revision, seed: 1 })!
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString()
    getDb()
      .update(jobs)
      .set({ startedAt: tenMinutesAgo, createdAt: tenMinutesAgo })
      .where(eq(jobs.id, job.id))
      .run()

    const runner = new JobRunner({ provider: mock })
    await runner.recover()
    await runner.idle()
    expect((await jobView(job.id)).status).toBe('succeeded')
  })

  it('gives a resumed job a fresh total deadline for its rerun', async () => {
    const { projectId, sheet } = await prepareProject()
    const job = createJobIfIdle(projectId, { factRevision: sheet.revision, seed: 1 })!
    expect(transitionJob(job.id, 'queued', 'designing')).toBe(true)
    // 300 ms of a 600 ms budget already spent before the restart.
    beginJobRun(job.id, new Date(Date.now() - 300).toISOString())
    const slow: LLMProvider = {
      name: 'mock-slow',
      async generateJSON<T>(r: GenerateJSONRequest<T>): Promise<{ data: T; usage: Usage }> {
        await new Promise((done) => setTimeout(done, 80))
        return mock.generateJSON(r)
      },
    }

    const runner = new JobRunner({ provider: slow, totalTimeoutMs: 600 })
    await runner.recover()
    await runner.idle()
    expect((await jobView(job.id)).status).toBe('succeeded')
  })
})

describe('runner singleton', () => {
  it('survives module re-evaluation (dev hot reload) as the same instance', async () => {
    const first = startJobRunner()
    const { vi } = await import('vitest')
    vi.resetModules()
    const reloaded = await import('@/lib/jobs/runner')
    expect(reloaded.startJobRunner()).toBe(first)
  })
})
