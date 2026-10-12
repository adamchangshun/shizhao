import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DELETE as deleteAssetRoute } from '@/app/api/assets/[id]/route'
import { GET as getAssetFile } from '@/app/api/assets/[id]/[size]/route'
import { GET as listAssets, POST as postAssets } from '@/app/api/projects/[id]/assets/route'
import { listProjectAssets } from '@/lib/assets'
import { processingSlots } from '@/lib/assets/upload'
import * as fx from '@/lib/assets/__fixtures__/generate'
import { resetAuthFailures } from '@/lib/auth'
import { runMigrations } from '@/lib/db/client'
import { insertProject } from '@/lib/db/repo/projects'
import { getEnv } from '@/lib/env'

const BASE = 'http://localhost:6688'
const bearer = { authorization: 'Bearer test-admin-token-0123' }
const MB = 1024 * 1024

beforeAll(() => runMigrations())
beforeEach(() => resetAuthFailures())

interface Part {
  name: string
  data: Buffer
  type?: string
}

interface AssetJson {
  id: string
  kind: 'image' | 'text'
  width?: number
  height?: number
  thumbUrl?: string
}

function newProject(): string {
  return insertProject({ type: 'single', title: '测试小店' }).id
}

/**
 * Multipart request with a pre-serialized body (like a socket-backed request in production). A
 * streamed FormData body would make undici throw "ReadableStream is already closed" after we
 * cancel the upload early.
 */
async function uploadRequest(
  projectId: string,
  parts: Part[],
  text?: string,
  headers: Record<string, string> = bearer,
): Promise<Request> {
  const form = new FormData()
  for (const p of parts)
    form.append(
      'images',
      new File([new Uint8Array(p.data)], p.name, { type: p.type ?? 'image/jpeg' }),
    )
  if (text !== undefined) form.append('text', text)
  const encoded = new Response(form)
  return new Request(`${BASE}/api/projects/${projectId}/assets`, {
    method: 'POST',
    headers: { ...headers, 'content-type': encoded.headers.get('content-type')! },
    body: await encoded.arrayBuffer(),
  })
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) })

async function upload(projectId: string, parts: Part[], text?: string) {
  const res = await postAssets(await uploadRequest(projectId, parts, text), ctx({ id: projectId }))
  const body = (await res.json()) as {
    assets: AssetJson[]
    error?: { code: string; message: string }
  }
  return { res, body }
}

function uploadDir(projectId: string): string {
  return path.join(getEnv().DATA_DIR, 'uploads', projectId)
}

function filesIn(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []
}

async function readRendition(projectId: string, assetId: string, size: 'display' | 'thumb') {
  return sharp(path.join(uploadDir(projectId), `${assetId}.${size}.webp`)).metadata()
}

describe('POST /api/projects/:id/assets', () => {
  it('returns 401 without the admin token', async () => {
    const id = newProject()
    const res = await postAssets(
      await uploadRequest(id, [{ name: 'a.png', data: await fx.png(10, 10) }], undefined, {}),
      ctx({ id }),
    )
    expect(res.status).toBe(401)
    expect(filesIn(uploadDir(id))).toEqual([])
  })

  it('returns 404 for an unknown project', async () => {
    const res = await postAssets(
      await uploadRequest('zzzzzzzzzzzz', [{ name: 'a.png', data: await fx.png(10, 10) }]),
      ctx({ id: 'zzzzzzzzzzzz' }),
    )
    expect(res.status).toBe(404)
  })

  it('strips EXIF and GPS from a JPEG that carries them', async () => {
    const input = await fx.jpegWithGps()
    const inMeta = await sharp(input).metadata()
    expect(inMeta.exif).toBeDefined() // the fixture really has EXIF (with a GPS IFD)
    expect(inMeta.exif!.includes(Buffer.from('FixtureCam'))).toBe(true)

    const id = newProject()
    const { res, body } = await upload(id, [{ name: 'gps.jpg', data: input }])
    expect(res.status).toBe(201)
    const assetId = body.assets[0]!.id
    for (const size of ['display', 'thumb'] as const) {
      const meta = await readRendition(id, assetId, size)
      expect(meta.format).toBe('webp')
      expect(meta.exif).toBeUndefined()
      expect(meta.xmp).toBeUndefined()
      expect(meta.iptc).toBeUndefined()
      expect(meta.orientation).toBeUndefined()
    }
    const raw = fs.readFileSync(path.join(uploadDir(id), `${assetId}.display.webp`))
    expect(raw.includes(Buffer.from('FixtureCam'))).toBe(false)
    expect(raw.includes(Buffer.from('Exif'))).toBe(false)
  })

  it('applies EXIF orientation 6: a 600×400 image becomes 400×600 (thumb 320×480)', async () => {
    const id = newProject()
    const { res, body } = await upload(id, [{ name: 'rot.jpg', data: await fx.jpegOrientation6() }])
    expect(res.status).toBe(201)
    expect(body.assets[0]).toMatchObject({ kind: 'image', width: 400, height: 600 })
    const display = await readRendition(id, body.assets[0]!.id, 'display')
    expect([display.width, display.height]).toEqual([400, 600])
    const thumb = await readRendition(id, body.assets[0]!.id, 'thumb')
    expect([thumb.width, thumb.height]).toEqual([320, 480])
  })

  it('scales a 3000×2000 PNG to display 1600×1067 and thumb 480×320, keeping no original', async () => {
    const id = newProject()
    const { res, body } = await upload(id, [
      { name: 'big.png', data: await fx.png(3000, 2000), type: 'image/png' },
    ])
    expect(res.status).toBe(201)
    const assetId = body.assets[0]!.id
    expect(body.assets[0]).toEqual({
      id: assetId,
      kind: 'image',
      width: 1600,
      height: 1067,
      thumbUrl: `/api/assets/${assetId}/thumb`,
    })
    const thumb = await readRendition(id, assetId, 'thumb')
    expect([thumb.width, thumb.height]).toEqual([480, 320])
    expect(filesIn(uploadDir(id))).toEqual([`${assetId}.display.webp`, `${assetId}.thumb.webp`])
  })

  it('rejects SVG text named .jpg with 400 「不支持的图片格式」', async () => {
    const id = newProject()
    const { res, body } = await upload(id, [
      { name: 'evil.jpg', data: fx.SVG_TEXT, type: 'image/jpeg' },
    ])
    expect(res.status).toBe(400)
    expect(body.error!.message).toContain('不支持的图片格式')
    expect(body.error!.message).toContain('evil.jpg')
    expect(filesIn(uploadDir(id))).toEqual([])
  })

  it('rejects HTML, GIF and PDF content whatever the extension', async () => {
    const id = newProject()
    for (const data of [fx.HTML_TEXT, await fx.gif(), fx.PDF_HEAD]) {
      const { res, body } = await upload(id, [{ name: 'photo.png', data, type: 'image/png' }])
      expect(res.status).toBe(400)
      expect(body.error!.message).toContain('不支持的图片格式')
    }
    expect(listProjectAssets(id)).toEqual([])
  })

  it('returns the same asset id for the same image uploaded twice, storing one copy', async () => {
    const id = newProject()
    const data = await fx.jpeg(200, 100, '#123456')
    const first = await upload(id, [{ name: 'a.jpg', data }])
    const second = await upload(id, [{ name: 'again.jpg', data }])
    expect(second.res.status).toBe(201)
    expect(second.body.assets[0]!.id).toBe(first.body.assets[0]!.id)
    expect(filesIn(uploadDir(id))).toHaveLength(2) // one display + one thumb
    expect(listProjectAssets(id)).toHaveLength(1)
  })

  it('stores a duplicate within one batch once', async () => {
    const id = newProject()
    const data = await fx.jpeg(120, 80, '#654321')
    const { body } = await upload(id, [
      { name: 'x.jpg', data },
      { name: 'y.jpg', data },
    ])
    expect(body.assets[0]!.id).toBe(body.assets[1]!.id)
    expect(filesIn(uploadDir(id))).toHaveLength(2)
  })

  it('rejects the 21st image of a project', async () => {
    const id = newProject()
    const twenty = await Promise.all(
      Array.from({ length: 20 }, async (_, i) => ({
        name: `p${i}.jpg`,
        data: await fx.jpeg(32, 32, `#${(i * 12 + 16).toString(16).padStart(2, '0')}4080`),
      })),
    )
    const ok = await upload(id, twenty)
    expect(ok.res.status).toBe(201)
    expect(new Set(ok.body.assets.map((a) => a.id)).size).toBe(20)

    const extra = await upload(id, [{ name: 'p21.jpg', data: await fx.jpeg(32, 32, '#ffffff') }])
    expect(extra.res.status).toBe(400)
    expect(extra.body.error!.message).toContain('最多 20 张')
    expect(listProjectAssets(id)).toHaveLength(20)
    expect(filesIn(uploadDir(id))).toHaveLength(40)
  })

  it('rejects 21 images in a single request', async () => {
    const id = newProject()
    const data = await fx.jpeg(8, 8, '#000000')
    const parts = Array.from({ length: 21 }, (_, i) => ({ name: `q${i}.jpg`, data }))
    const { res } = await upload(id, parts)
    expect(res.status).toBe(400)
    expect(listProjectAssets(id)).toEqual([])
  })

  it('rejects a 16MB file with 413', async () => {
    const id = newProject()
    const { res, body } = await upload(id, [{ name: 'huge.jpg', data: fx.oversizeJpeg(16 * MB) }])
    expect(res.status).toBe(413)
    expect(body.error!.message).toContain('huge.jpg')
    expect(body.error!.message).toContain('15MB')
    expect(filesIn(uploadDir(id))).toEqual([])
  })

  it('rejects a request whose body exceeds 100MB with 413', async () => {
    const id = newProject()
    const parts = Array.from({ length: 7 }, (_, i) => ({
      name: `f${i}.jpg`,
      data: fx.oversizeJpeg(15 * MB - 1024 * i),
    }))
    const { res, body } = await upload(id, parts)
    expect(res.status).toBe(413)
    expect(body.error!.code).toBe('payload_too_large')
    expect(filesIn(uploadDir(id))).toEqual([])
    expect(filesIn(path.join(getEnv().DATA_DIR, 'tmp'))).toEqual([])
  }, 30_000)

  it('fails the whole batch when the 2nd of 3 images is corrupt, leaving no files', async () => {
    const id = newProject()
    const { res, body } = await upload(id, [
      { name: 'one.jpg', data: await fx.jpeg(300, 200, '#aa0000') },
      { name: 'two.jpg', data: fx.corruptJpeg() },
      { name: 'three.jpg', data: await fx.jpeg(300, 200, '#0000aa') },
    ])
    expect(res.status).toBe(400)
    expect(body.error!.message).toContain('two.jpg')
    expect(body.error!.message).toContain('已损坏')
    expect(filesIn(uploadDir(id))).toEqual([])
    expect(filesIn(path.join(getEnv().DATA_DIR, 'tmp'))).toEqual([])
    expect(listProjectAssets(id)).toEqual([])
  })

  it('stores text as a kind=text asset and enforces 2000 characters', async () => {
    const id = newProject()
    const { res, body } = await upload(id, [], '招牌牛肉面 18 元一碗')
    expect(res.status).toBe(201)
    expect(body.assets).toEqual([{ id: body.assets[0]!.id, kind: 'text' }])
    expect(listProjectAssets(id)[0]).toMatchObject({
      kind: 'text',
      text: '招牌牛肉面 18 元一碗',
      path: null,
    })

    const ok = await upload(id, [], '面'.repeat(2000))
    expect(ok.res.status).toBe(201)
    const tooLong = await upload(id, [], '面'.repeat(2001))
    expect(tooLong.res.status).toBe(400)
    expect(tooLong.body.error!.message).toContain('2000')
  })

  it('rejects an empty upload and a non-multipart body', async () => {
    const id = newProject()
    expect((await upload(id, [])).res.status).toBe(400)
    const res = await postAssets(
      new Request(`${BASE}/api/projects/${id}/assets`, {
        method: 'POST',
        headers: { ...bearer, 'content-type': 'application/json' },
        body: '{}',
      }),
      ctx({ id }),
    )
    expect(res.status).toBe(400)
  })

  it('never runs more than 2 images through sharp at once', async () => {
    const id = newProject()
    const parts = await Promise.all(
      ['#111111', '#222222', '#333333', '#444444', '#555555'].map(async (c, i) => ({
        name: `c${i}.png`,
        data: await fx.png(2400, 1600, c),
        type: 'image/png',
      })),
    )
    let peak = 0
    const sampler = setInterval(() => {
      peak = Math.max(peak, processingSlots.running)
    }, 1)
    const { res } = await upload(id, parts)
    clearInterval(sampler)
    expect(res.status).toBe(201)
    expect(peak).toBe(2)
  })
})

describe('GET /api/projects/:id/assets, GET /api/assets/:id/:size, DELETE /api/assets/:id', () => {
  it('lists, serves and deletes an image', async () => {
    const id = newProject()
    const { body } = await upload(
      id,
      [{ name: 'a.jpg', data: await fx.jpeg(640, 480, '#00aa55') }],
      '说明',
    )
    const imageId = body.assets[0]!.id

    const list = await listAssets(
      new Request(`${BASE}/api/projects/${id}/assets`, { headers: bearer }),
      ctx({ id }),
    )
    const listed = ((await list.json()) as { assets: Array<AssetJson & { text?: string }> }).assets
    expect(listed.map((a) => a.kind).sort()).toEqual(['image', 'text'])
    expect(listed.find((a) => a.kind === 'text')!.text).toBe('说明')

    const noAuth = await getAssetFile(
      new Request(`${BASE}/api/assets/${imageId}/thumb`),
      ctx({ id: imageId, size: 'thumb' }),
    )
    expect(noAuth.status).toBe(401)

    const thumb = await getAssetFile(
      new Request(`${BASE}/api/assets/${imageId}/thumb`, { headers: bearer }),
      ctx({ id: imageId, size: 'thumb' }),
    )
    expect(thumb.status).toBe(200)
    expect(thumb.headers.get('content-type')).toBe('image/webp')
    expect(thumb.headers.get('x-content-type-options')).toBe('nosniff')
    const meta = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata()
    expect([meta.width, meta.height]).toEqual([480, 360])

    const badSize = await getAssetFile(
      new Request(`${BASE}/api/assets/${imageId}/original`, { headers: bearer }),
      ctx({ id: imageId, size: 'original' }),
    )
    expect(badSize.status).toBe(404)
    const traversal = await getAssetFile(
      new Request(`${BASE}/api/assets/x/thumb`, { headers: bearer }),
      ctx({ id: '../../db.sqlite', size: 'thumb' }),
    )
    expect(traversal.status).toBe(404)

    const del = await deleteAssetRoute(
      new Request(`${BASE}/api/assets/${imageId}`, { method: 'DELETE', headers: bearer }),
      ctx({ id: imageId }),
    )
    expect(del.status).toBe(204)
    expect(filesIn(uploadDir(id))).toEqual([])
    expect(listProjectAssets(id).map((a) => a.kind)).toEqual(['text'])
    const again = await deleteAssetRoute(
      new Request(`${BASE}/api/assets/${imageId}`, { method: 'DELETE', headers: bearer }),
      ctx({ id: imageId }),
    )
    expect(again.status).toBe(404)
  })
})

describe('decompression bomb', () => {
  it('rejects a 10000×10000 PNG while the process stays under 500MB peak RSS', async () => {
    const dir = fs.mkdtempSync(path.join(getEnv().DATA_DIR, 'bomb-'))
    const file = path.join(dir, 'bomb.png')
    await fx.writeHugePng(file)
    const probeData = path.join(dir, 'data')
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'lib/assets/__fixtures__/memory-probe.ts', file],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATA_DIR: probeData,
          ADMIN_TOKEN: 'test-admin-token-0123',
          PUBLIC_BASE_URL: 'http://localhost:6688',
        },
      },
    )
    const result = JSON.parse(stdout) as {
      ok: boolean
      status?: number
      code?: string
      maxRssMb: number
    }
    expect(result).toMatchObject({ ok: false, status: 400, code: 'image_too_many_pixels' })
    expect(result.maxRssMb).toBeLessThan(500)
    expect(filesIn(path.join(probeData, 'tmp'))).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  }, 60_000)
})
