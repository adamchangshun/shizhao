import fs from 'node:fs'
import { eq } from 'drizzle-orm'
import { parse } from 'node-html-parser'
import { beforeAll, describe, expect, it } from 'vitest'
import { POST as postCorrection } from '@/app/api/corrections/route'
import { POST as postAccept } from '@/app/api/corrections/[id]/accept/route'
import { POST as postReject } from '@/app/api/corrections/[id]/reject/route'
import { GET as getList } from '@/app/api/projects/[id]/corrections/route'
import { DELETE as deleteProject } from '@/app/api/projects/[id]/route'
import { computeCopyRefs } from '@/lib/copy'
import { newId } from '@/lib/core/ids'
import type { CopyDraft, FactSheet } from '@/lib/core/schemas'
import { acceptCorrection, attemptKey, PROCESSING_TIMEOUT_MS } from '@/lib/corrections/merchant'
import { getDb, runMigrations } from '@/lib/db/client'
import { appendFactSheet, findLatestFactSheet } from '@/lib/db/repo/fact-sheets'
import { insertProject, findActiveProject } from '@/lib/db/repo/projects'
import { corrections, usageRecords, versions } from '@/lib/db/schema'
import { stagingDir, versionDir, versionHtmlPath } from '@/lib/jobs/files'
import { rerenderWithFacts } from '@/lib/jobs/rerender'
import { publishVersion, unpublishProject } from '@/lib/publish'
import { generateProjectQr } from '@/lib/publish/qr'
import { servePublished } from '@/lib/stats/public-page'
import { designFor } from '../render/fixtures'

const BASE = 'http://localhost:6688'
const bearer = { authorization: 'Bearer test-admin-token-0123' }
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeAll(() => runMigrations())

// Hand-written v1 copy: the subhead and the cake's blurb cite the cake's description.
const COPY: CopyDraft = {
  headline: '甜心烘焙',
  subhead: '每天现烤。草莓蛋糕用的是新西兰黄油。',
  itemBlurbs: { cake01: '草莓蛋糕，新西兰黄油。', tart02: '蛋挞刚出炉。' },
  closing: '欢迎来店里坐坐。',
}

function sheetFor(projectId: string): FactSheet {
  return {
    projectId,
    revision: 1,
    shop: { name: '甜心烘焙', phone: '021-64881234', hours: '9:00-21:00' },
    items: [
      {
        id: 'cake01',
        name: '草莓蛋糕',
        price: { amount: 128, currency: 'CNY', unit: '个' },
        description: '新西兰黄油',
        tags: [],
        imageAssetIds: [],
        sources: { name: 'merchant_text', price: 'image_ocr' },
      },
      {
        id: 'tart02',
        name: '蛋挞',
        price: { amount: 8, currency: 'CNY' }, // merchant wrote「蛋挞 8 元」, no unit
        tags: [],
        imageAssetIds: [],
        sources: {},
      },
    ],
    extraClaims: ['每天现烤'],
    confirmedAt: new Date().toISOString(),
  }
}

/** A project whose v1 (草莓蛋糕 128 元) is rendered by the real renderer and published. */
async function published() {
  const project = insertProject({ type: 'menu', title: '甜心烘焙' })
  const row = appendFactSheet(project.id, () => sheetFor(project.id))
  const staged = await rerenderWithFacts({
    projectId: project.id,
    slug: project.slug,
    source: { designSpec: designFor('menu-board'), copy: COPY, copyRefs: {} },
    factSheet: row.json,
    correctedPath: 'none',
    stagingKey: newId(),
  })
  fs.renameSync(staged.staging, staged.finalDir)
  getDb()
    .insert(versions)
    .values({
      id: staged.versionId,
      projectId: project.id,
      jobId: null,
      origin: 'generate',
      factRevision: 1,
      designSpec: designFor('menu-board'),
      copy: COPY,
      copyRefs: computeCopyRefs(COPY, row.json),
      guard: { copy: COPY, violations: [], rewritten: 0, removed: 0 },
      htmlPath: versionHtmlPath(project.id, staged.versionId),
      qa: null,
      createdAt: new Date().toISOString(),
    })
    .run()
  publishVersion(project.id, staged.versionId)
  return { projectId: project.id, slug: project.slug, versionId: staged.versionId }
}

function submit(
  body: Record<string, unknown>,
  headers: Record<string, string> = { 'content-type': 'application/json' },
) {
  return postCorrection(
    new Request(`${BASE}/api/corrections`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  )
}

async function pending(projectId: string, status = 'pending') {
  const res = await getList(
    new Request(`${BASE}/api/projects/${projectId}/corrections?status=${status}`, {
      headers: bearer,
    }),
    ctx(projectId),
  )
  expect(res.status).toBe(200)
  return (await res.json()) as {
    pendingCount: number
    corrections: Array<{
      id: string
      field: string
      fieldLabel: string
      currentValue: string | null
      suggestedValue: string
      needsValue: boolean
    }>
  }
}

function accept(id: string, body?: unknown) {
  return postAccept(
    new Request(`${BASE}/api/corrections/${id}/accept`, {
      method: 'POST',
      headers: { ...bearer, 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
    ctx(id),
  )
}

function publicPage(slug: string) {
  const res = servePublished(slug)
  return res.text().then((html) => ({ status: res.status, root: parse(html), html }))
}

async function factText(slug: string, path: string) {
  return (await publicPage(slug)).root.querySelector(`[data-fact="${path}"]`)?.text
}

async function reportAndGetId(
  p: { projectId: string; slug: string; versionId: string },
  field: string,
  value?: string,
) {
  const res = await submit({
    slug: p.slug,
    versionId: p.versionId,
    field,
    ...(value !== undefined ? { suggestedValue: value } : {}),
  })
  expect(res.status).toBe(201)
  const list = await pending(p.projectId)
  return list.corrections.find((c) => c.field === field)!.id
}

const usageCount = () => getDb().select().from(usageRecords).all().length

describe('customer correction → merchant merge', () => {
  it('accepts a price correction without calling any model; link and QR code stay the same', async () => {
    const p = await published()
    expect(await factText(p.slug, 'items.cake01.price')).toBe('¥128')
    const qrBefore = (await generateProjectQr(p.projectId, new URLSearchParams('format=svg'))).body
    const usageBefore = usageCount()

    const res = await submit({
      slug: p.slug,
      versionId: p.versionId,
      field: 'items.cake01.price',
      suggestedValue: '138元',
      note: '店里价目表写的是 138',
    })
    expect(res.status).toBe(201)
    const list = await pending(p.projectId)
    expect(list.pendingCount).toBe(1)
    expect(list.corrections[0]).toMatchObject({
      fieldLabel: '草莓蛋糕 · 价格',
      currentValue: '¥128/个',
      suggestedValue: '138元',
    })

    const ok = await accept(list.corrections[0]!.id)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ status: 'accepted', resultRevision: 2 })

    const latest = findLatestFactSheet(p.projectId)!
    expect(latest.revision).toBe(2)
    expect(latest.confirmedAt).not.toBeNull()
    expect(latest.json.items[0]!.price).toEqual({ amount: 138, currency: 'CNY', unit: '个' })
    expect(latest.json.items[0]!.sources.price).toBe('merchant_edit')
    expect(await factText(p.slug, 'items.cake01.price')).toBe('¥138')
    expect((await generateProjectQr(p.projectId, new URLSearchParams('format=svg'))).body).toBe(
      qrBefore,
    )
    expect(usageCount()).toBe(usageBefore)
    const live = findActiveProject(p.projectId)!
    const version = getDb()
      .select()
      .from(versions)
      .where(eq(versions.id, live.publishedVersionId!))
      .get()!
    expect(version).toMatchObject({ origin: 'correction', jobId: null, factRevision: 2 })
    expect((await pending(p.projectId)).pendingCount).toBe(0)
  })

  it('takes the value the merchant edited instead of the suggestion', async () => {
    const p = await published()
    const id = await reportAndGetId(p, 'items.cake01.price', '138')
    expect((await accept(id, { value: '135' })).status).toBe(200)
    expect(await factText(p.slug, 'items.cake01.price')).toBe('¥135')
  })

  it('refuses unknown fields and unpublished pages', async () => {
    const p = await published()
    expect(
      (
        await submit({
          slug: p.slug,
          versionId: p.versionId,
          field: 'items.nope.price',
          suggestedValue: '1',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await submit({
          slug: p.slug,
          versionId: p.versionId,
          field: 'shop.address',
          suggestedValue: '1',
        })
      ).status,
    ).toBe(400)
    unpublishProject(p.projectId)
    expect(
      (
        await submit({
          slug: p.slug,
          versionId: p.versionId,
          field: 'items.cake01.price',
          suggestedValue: '1元',
        })
      ).status,
    ).toBe(410)
  })

  it('limits one source to 3 reports per 10 minutes per page', async () => {
    const p = await published()
    const body = {
      slug: p.slug,
      versionId: p.versionId,
      field: 'items.tart02.price',
      suggestedValue: '9元',
    }
    for (let i = 0; i < 3; i++) expect((await submit(body)).status).toBe(201)
    expect((await submit(body)).status).toBe(429)
  })

  it('does not let invalid requests or made-up pages use up a page budget', async () => {
    const p = await published()
    const bad = {
      slug: p.slug,
      versionId: p.versionId,
      field: 'items.nope.price',
      suggestedValue: '1',
    }
    for (let i = 0; i < 5; i++) expect((await submit(bad)).status).toBe(400)
    for (let i = 0; i < 5; i++) {
      const ghost = { ...bad, slug: 'zzzzz' + 'abcdefghjk'[i] }
      expect((await submit(ghost)).status).toBe(404)
    }
    const good = {
      slug: p.slug,
      versionId: p.versionId,
      field: 'items.tart02.price',
      suggestedValue: '9元',
    }
    expect((await submit(good)).status).toBe(201)
  })

  it('stores links as spam and keeps them out of the merchant list', async () => {
    const p = await published()
    expect(
      (
        await submit({
          slug: p.slug,
          versionId: p.versionId,
          field: 'other',
          suggestedValue: '优惠看 www.example.com',
        })
      ).status,
    ).toBe(201)
    expect((await pending(p.projectId)).corrections).toEqual([])
    const stored = getDb()
      .select()
      .from(corrections)
      .where(eq(corrections.projectId, p.projectId))
      .all()
    expect(stored.map((c) => c.status)).toEqual(['spam'])
  })

  it('refuses personal information, and values for contact fields', async () => {
    const p = await published()
    const base = { slug: p.slug, versionId: p.versionId }
    const refused = [
      {
        ...base,
        field: 'items.cake01.price',
        suggestedValue: '138',
        note: '有问题打我 138 0013 8000',
      },
      {
        ...base,
        field: 'items.cake01.price',
        suggestedValue: '138',
        note: '加我微信 tianxin_88 细说',
      },
      { ...base, field: 'other', suggestedValue: '联系 someone@example.com' },
    ]
    for (const body of refused) {
      const res = await submit(body)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
        '请勿填写个人信息：提到 QQ、支付宝或微信时，不要同时写出号码、账号或 5 位以上的数字',
      )
    }
    // Each page allows 3 reports per source and 10 minutes, so the contact case uses its own page.
    const q = await published()
    const phone = await submit({
      slug: q.slug,
      versionId: q.versionId,
      field: 'shop.phone',
      suggestedValue: '021-11112222',
    })
    expect(phone.status).toBe(400)
    expect(
      (await submit({ slug: q.slug, versionId: q.versionId, field: 'shop.phone' })).status,
    ).toBe(201)
    expect((await pending(q.projectId)).corrections[0]).toMatchObject({
      field: 'shop.phone',
      needsValue: true,
      suggestedValue: '',
    })
  })
})

describe('only JSON requests from the page itself are accepted', () => {
  const json = 'application/json'

  async function report() {
    const p = await published()
    const body = {
      slug: p.slug,
      versionId: p.versionId,
      field: 'items.tart02.price',
      suggestedValue: '9元',
    }
    const stored = () =>
      getDb().select().from(corrections).where(eq(corrections.projectId, p.projectId)).all()
    return { body, stored }
  }

  it('refuses text/plain and a missing Content-Type without storing anything', async () => {
    const { body, stored } = await report()
    // What a cross-site no-cors fetch can send without a preflight.
    expect((await submit(body, { 'content-type': 'text/plain;charset=UTF-8' })).status).toBe(415)
    expect((await submit(body, {})).status).toBe(415)
    expect((await submit(body, { 'content-type': 'application/jsonx' })).status).toBe(415)
    expect(stored()).toEqual([])
  })

  it('accepts JSON with a charset parameter', async () => {
    const { body, stored } = await report()
    expect((await submit(body, { 'content-type': 'Application/JSON; charset=utf-8' })).status).toBe(
      201,
    )
    expect(stored()).toHaveLength(1)
  })

  it('refuses cross-site requests with 403', async () => {
    const { body, stored } = await report()
    const crossSite = await submit(body, { 'content-type': json, 'sec-fetch-site': 'cross-site' })
    expect(crossSite.status).toBe(403)
    expect(
      (await submit(body, { 'content-type': json, origin: 'https://evil.example' })).status,
    ).toBe(403)
    expect(
      (await submit(body, { 'content-type': json, origin: 'http://localhost:6688.evil.example' }))
        .status,
    ).toBe(403)
    expect((await submit(body, { 'content-type': json, origin: 'null' })).status).toBe(403)
    expect(stored()).toEqual([])
  })

  it('accepts the published page itself, and refused requests do not use up the budget', async () => {
    const { body, stored } = await report()
    const evil = { 'content-type': json, origin: 'https://evil.example' }
    for (let i = 0; i < 5; i++) expect((await submit(body, evil)).status).toBe(403)
    const page = {
      'content-type': json,
      origin: 'http://localhost:6688',
      'sec-fetch-site': 'same-origin',
    }
    for (let i = 0; i < 3; i++) expect((await submit(body, page)).status).toBe(201)
    expect(stored()).toHaveLength(3)
  })
})

describe('merging is atomic and idempotent', () => {
  it('accepting twice (also concurrently) creates one revision', async () => {
    const p = await published()
    const id = await reportAndGetId(p, 'items.cake01.price', '138')
    const [a, b] = await Promise.all([accept(id), accept(id)])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect((await accept(id)).status).toBe(200)
    expect(findLatestFactSheet(p.projectId)!.revision).toBe(2)
  })

  it('rejects an unreadable price with 400 and leaves the report pending', async () => {
    const p = await published()
    const id = await reportAndGetId(p, 'items.cake01.price', '一百三')
    expect((await accept(id)).status).toBe(400)
    expect((await pending(p.projectId)).pendingCount).toBe(1)
    expect(findLatestFactSheet(p.projectId)!.revision).toBe(1)
  })

  it('keeps the old page and the pending report when the final transaction fails', async () => {
    const p = await published()
    const id = await reportAndGetId(p, 'items.cake01.price', '138')
    const before = fs.readdirSync(versionDir(p.projectId, p.versionId) + '/..').sort()
    await expect(
      acceptCorrection(
        id,
        {},
        {
          inTransaction: () => {
            throw new Error('boom')
          },
        },
      ),
    ).rejects.toThrow('boom')
    expect(await factText(p.slug, 'items.cake01.price')).toBe('¥128')
    expect((await pending(p.projectId)).pendingCount).toBe(1)
    expect(findLatestFactSheet(p.projectId)!.revision).toBe(1)
    expect(fs.readdirSync(versionDir(p.projectId, p.versionId) + '/..').sort()).toEqual(before)
  })

  it('hands an interrupted claim back after 5 minutes', async () => {
    const p = await published()
    const id = await reportAndGetId(p, 'items.cake01.price', '138')
    const claimedAt = Date.now()
    // A process that died after claiming: the row stays `processing`.
    getDb()
      .update(corrections)
      .set({ status: 'processing', processingAt: new Date(claimedAt).toISOString() })
      .where(eq(corrections.id, id))
      .run()
    // ...and left a half-written staging directory behind.
    const abandoned = stagingDir(p.projectId, attemptKey(id, new Date(claimedAt).toISOString()))
    fs.mkdirSync(abandoned, { recursive: true })
    await expect(acceptCorrection(id, {}, { now: claimedAt + 1000 })).rejects.toMatchObject({
      status: 409,
    })
    const done = await acceptCorrection(id, {}, { now: claimedAt + PROCESSING_TIMEOUT_MS + 1000 })
    expect(done).toEqual({ status: 'accepted', resultRevision: 2 })
    expect(fs.existsSync(abandoned)).toBe(false)
  })

  it('reject is idempotent and cannot undo an accepted report', async () => {
    const p = await published()
    const id = await reportAndGetId(p, 'items.tart02.price', '9')
    const reject = () =>
      postReject(
        new Request(`${BASE}/api/corrections/${id}/reject`, { method: 'POST', headers: bearer }),
        ctx(id),
      )
    expect((await reject()).status).toBe(200)
    expect((await reject()).status).toBe(200)
    expect((await accept(id)).status).toBe(409)
  })
})

describe('copy after a correction', () => {
  it('drops copy that cited the corrected description', async () => {
    const p = await published()
    const id = await reportAndGetId(p, 'items.cake01.description', '法国黄油')
    expect((await accept(id)).status).toBe(200)
    const { html, root } = await publicPage(p.slug)
    expect(root.querySelector('[data-fact="items.cake01.description"]')?.text).toBe('法国黄油')
    expect(html).not.toContain('新西兰黄油')
  })

  it('keeps copyRefs in step with the copy over two corrections, without bringing cut text back', async () => {
    const p = await published()
    const first = await reportAndGetId(p, 'items.cake01.description', '法国黄油')
    expect((await accept(first)).status).toBe(200)
    const second = await reportAndGetId(p, 'items.tart02.price', '9元')
    expect((await accept(second)).status).toBe(200)
    const live = findActiveProject(p.projectId)!
    const version = getDb()
      .select()
      .from(versions)
      .where(eq(versions.id, live.publishedVersionId!))
      .get()!
    const sheet = findLatestFactSheet(p.projectId)!.json
    expect(version.copyRefs).toEqual(computeCopyRefs(version.copy, sheet))
    expect(JSON.stringify(version.copy)).not.toContain('新西兰黄油')
    expect(version.copy.itemBlurbs.tart02).toBe('')
    expect(await factText(p.slug, 'items.tart02.price')).toBe('¥9')
  })
})

describe('other corrected facts', () => {
  it('a price without a unit is shown, corrected and re-rendered without one', async () => {
    const p = await published()
    const page = await publicPage(p.slug)
    expect(page.root.querySelector('[data-fact="items.tart02.price"]')?.text).toBe('¥8')
    expect(page.root.querySelector('[data-fact="items.tart02.price.unit"]')).toBeNull()

    const id = await reportAndGetId(p, 'items.tart02.price', '9')
    const item = (await pending(p.projectId)).corrections.find((c) => c.id === id)!
    expect(item.currentValue).toBe('¥8')
    expect((await accept(id)).status).toBe(200)
    expect(findLatestFactSheet(p.projectId)!.json.items[1]!.price).toStrictEqual({
      amount: 9,
      currency: 'CNY',
    })
    const after = await publicPage(p.slug)
    expect(after.root.querySelector('[data-fact="items.tart02.price"]')?.text).toBe('¥9')
    expect(after.html).not.toContain('undefined')
  })

  it('a correction that writes a unit adds it; one without keeps the current unit', async () => {
    const p = await published()
    const tart = await reportAndGetId(p, 'items.tart02.price', '9元/个')
    expect((await accept(tart)).status).toBe(200)
    const cake = await reportAndGetId(p, 'items.cake01.price', '138')
    expect((await accept(cake)).status).toBe(200)
    const items = findLatestFactSheet(p.projectId)!.json.items
    expect(items[1]!.price).toStrictEqual({ amount: 9, currency: 'CNY', unit: '个' })
    expect(items[0]!.price).toStrictEqual({ amount: 138, currency: 'CNY', unit: '个' })
  })

  it('a new address drops the map link pinned to the old one', async () => {
    const p = await published()
    const sheet = findLatestFactSheet(p.projectId)!.json
    // The merchant had given an address and a map link.
    const withMap: FactSheet = {
      ...sheet,
      revision: 2,
      shop: {
        ...sheet.shop,
        address: '漕溪北路 88 号',
        mapUrl: 'https://uri.amap.com/marker?position=1,2',
      },
    }
    appendFactSheet(p.projectId, () => withMap)
    const pinned = await rerenderWithFacts({
      projectId: p.projectId,
      slug: p.slug,
      source: { designSpec: designFor('menu-board'), copy: COPY, copyRefs: {} },
      factSheet: withMap,
      correctedPath: 'none',
      stagingKey: newId(),
    })
    fs.renameSync(pinned.staging, pinned.finalDir)
    getDb()
      .insert(versions)
      .values({
        id: pinned.versionId,
        projectId: p.projectId,
        jobId: null,
        origin: 'correction',
        ...pinned.content,
        htmlPath: versionHtmlPath(p.projectId, pinned.versionId),
        qa: null,
        createdAt: new Date().toISOString(),
      })
      .run()
    publishVersion(p.projectId, pinned.versionId)
    expect((await publicPage(p.slug)).html).toContain('uri.amap.com/marker')

    const res = await submit({
      slug: p.slug,
      versionId: pinned.versionId,
      field: 'shop.address',
      suggestedValue: '漕溪北路 99 号',
    })
    expect(res.status).toBe(201)
    const id = (await pending(p.projectId)).corrections[0]!.id
    expect((await accept(id)).status).toBe(200)
    const after = await publicPage(p.slug)
    expect(findLatestFactSheet(p.projectId)!.json.shop.mapUrl).toBeUndefined()
    expect(after.html).not.toContain('uri.amap.com/marker')
    expect(after.root.querySelector('[data-act="navigate"]')?.getAttribute('href')).toContain(
      encodeURIComponent('漕溪北路 99 号'),
    )
  })

  it('a shop name the headline only quoted falls back to the new name', async () => {
    const p = await published()
    const id = await reportAndGetId(p, 'shop.name', '甜心烘焙坊')
    expect((await accept(id)).status).toBe(200)
    const live = findActiveProject(p.projectId)!
    const version = getDb()
      .select()
      .from(versions)
      .where(eq(versions.id, live.publishedVersionId!))
      .get()!
    expect(version.copy.headline).toBe('甜心烘焙坊')
  })
})

describe('privacy', () => {
  it('deleting the project deletes its corrections', async () => {
    const p = await published()
    await reportAndGetId(p, 'items.cake01.price', '138')
    const res = await deleteProject(
      new Request(`${BASE}/api/projects/${p.projectId}`, { method: 'DELETE', headers: bearer }),
      ctx(p.projectId),
    )
    expect(res.status).toBe(204)
    expect(
      getDb().select().from(corrections).where(eq(corrections.projectId, p.projectId)).all(),
    ).toEqual([])
  })
})
