import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DELETE as deleteAssetRoute } from '@/app/api/assets/[id]/route'
import { POST as postAssets } from '@/app/api/projects/[id]/assets/route'
import { listProjectAssets } from '@/lib/assets'
import * as fx from '@/lib/assets/__fixtures__/generate'
import { heicToJpeg } from '@/lib/assets/heic'
import { normalizeImage } from '@/lib/assets/normalize'
import {
  activeTempDirs,
  ensureTmpRoot,
  STALE_AFTER_MS,
  sweepProjectUploads,
  sweepTempDirs,
} from '@/lib/assets/storage'
import { sweepAllStaleUploads } from '@/lib/assets/sweep'
import { runMigrations } from '@/lib/db/client'
import { insertProject } from '@/lib/db/repo/projects'
import { getEnv } from '@/lib/env'

const BASE = 'http://localhost:6688'
const bearer = { authorization: 'Bearer test-admin-token-0123' }
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'shizhao-robust-'))
const isRoot = process.getuid?.() === 0

beforeAll(() => runMigrations())
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }))

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

async function upload(projectId: string, data: Buffer | null, name = 'a.jpg', text?: string) {
  const form = new FormData()
  if (data) form.append('images', new File([new Uint8Array(data)], name))
  if (text !== undefined) form.append('text', text)
  const encoded = new Response(form)
  const res = await postAssets(
    new Request(`${BASE}/api/projects/${projectId}/assets`, {
      method: 'POST',
      headers: { ...bearer, 'content-type': encoded.headers.get('content-type')! },
      body: await encoded.arrayBuffer(),
    }),
    ctx(projectId),
  )
  return { res, body: (await res.json()) as { assets: Array<{ id: string }> } }
}

function uploadDir(projectId: string): string {
  return path.join(getEnv().DATA_DIR, 'uploads', projectId)
}

describe('timeouts', () => {
  it('leaves no sharp work running once a timed-out image is rejected', async () => {
    const file = path.join(scratch, 'big.png')
    fs.writeFileSync(file, await fx.png(6000, 6000))
    await expect(
      normalizeImage({ name: 'big.png', tmpPath: file, bytes: 0 }, { timeoutMs: 30 }),
    ).rejects.toMatchObject({ code: 'image_timeout' })
    expect(sharp.counters()).toEqual({ queue: 0, process: 0 })
  }, 30_000)
})

describe('HEIC worker', () => {
  it('refuses before decoding when the image heic-convert would decode is over the cap', async () => {
    const heic = fx.heic()
    const input = path.join(scratch, 'cap.heic')
    const output = path.join(scratch, 'cap.jpg')
    fs.writeFileSync(input, heic)
    // The 300×200 fixture is 60000 pixels: a cap of 59999 must refuse it without writing output.
    expect(await heicToJpeg(input, output, 59_999, new AbortController().signal)).toBe(
      'too_many_pixels',
    )
    expect(fs.existsSync(output)).toBe(false)
    expect(await heicToJpeg(input, output, 60_000, new AbortController().signal)).toBe('converted')
    expect((await sharp(output).metadata()).format).toBe('jpeg')
  }, 30_000)
})

describe('DELETE /api/assets/:id when the files cannot be removed', () => {
  it.skipIf(isRoot)('reports the failure, keeps the row, and succeeds on retry', async () => {
    const projectId = insertProject({ type: 'single', title: '删除测试' }).id
    const { body } = await upload(projectId, await fx.jpeg(100, 100, '#336699'))
    const assetId = body.assets[0]!.id
    const del = () =>
      deleteAssetRoute(
        new Request(`${BASE}/api/assets/${assetId}`, { method: 'DELETE', headers: bearer }),
        ctx(assetId),
      )

    fs.chmodSync(uploadDir(projectId), 0o500) // files can no longer be unlinked
    try {
      expect((await del()).status).toBe(500)
      expect(listProjectAssets(projectId).map((a) => a.id)).toEqual([assetId])
    } finally {
      fs.chmodSync(uploadDir(projectId), 0o700)
    }
    expect((await del()).status).toBe(204)
    expect(fs.readdirSync(uploadDir(projectId))).toEqual([])
    expect(listProjectAssets(projectId)).toEqual([])
  })
})

describe('stale-upload sweep', () => {
  it('removes old unreferenced renditions and temp dirs, keeping recent ones and real assets', async () => {
    const projectId = insertProject({ type: 'single', title: '清扫测试' }).id
    const { body } = await upload(projectId, await fx.jpeg(80, 80, '#993366'))
    const keptId = body.assets[0]!.id
    const dir = uploadDir(projectId)
    const tmpRoot = path.join(getEnv().DATA_DIR, 'tmp')
    const old = new Date(Date.now() - STALE_AFTER_MS - 60_000)

    const orphanOld = path.join(dir, 'AAAAAAAAAAAA.display.webp')
    const orphanNew = path.join(dir, 'BBBBBBBBBBBB.display.webp')
    const staleTmp = path.join(tmpRoot, 'upload-stale1')
    fs.writeFileSync(orphanOld, 'x')
    fs.writeFileSync(orphanNew, 'x')
    fs.mkdirSync(staleTmp, { recursive: true })
    fs.writeFileSync(path.join(staleTmp, '0.upload'), 'x')
    for (const p of [orphanOld, staleTmp, path.join(dir, `${keptId}.display.webp`)]) {
      fs.utimesSync(p, old, old)
    }

    await upload(projectId, await fx.jpeg(80, 80, '#336699'), 'b.jpg')

    expect(fs.existsSync(orphanOld)).toBe(false)
    expect(fs.existsSync(orphanNew)).toBe(true) // may belong to an upload still in flight
    expect(fs.existsSync(staleTmp)).toBe(false)
    expect(fs.existsSync(path.join(dir, `${keptId}.display.webp`))).toBe(true)
  })
})

describe('limits are inclusive', () => {
  it('accepts an image of exactly 15MB and 2000 four-byte characters of text', async () => {
    const projectId = insertProject({ type: 'single', title: '边界测试' }).id
    const jpeg = await fx.jpeg(64, 64, '#224466')
    // Bytes after the JPEG end-of-image marker are ignored by decoders.
    const exact = Buffer.concat([jpeg, Buffer.alloc(15 * 1024 * 1024 - jpeg.length)])
    expect(exact.length).toBe(15 * 1024 * 1024)
    const img = await upload(projectId, exact, 'exact.jpg')
    expect(img.res.status).toBe(201)
    const txt = await upload(projectId, null, 'x', '😀'.repeat(2000))
    expect(txt.res.status).toBe(201)
    expect(listProjectAssets(projectId).find((a) => a.kind === 'text')!.text).toBe(
      '😀'.repeat(2000),
    )
  }, 30_000)
})

describe('sweepAllStaleUploads (server start and hourly)', () => {
  it('cleans every project without needing a new upload', async () => {
    const projectId = insertProject({ type: 'single', title: '启动清扫' }).id
    const dir = uploadDir(projectId)
    fs.mkdirSync(dir, { recursive: true })
    const orphan = path.join(dir, 'CCCCCCCCCCCC.thumb.webp')
    fs.writeFileSync(orphan, 'x')
    const old = new Date(Date.now() - STALE_AFTER_MS - 60_000)
    fs.utimesSync(orphan, old, old)
    await sweepAllStaleUploads()
    expect(fs.existsSync(orphan)).toBe(false)
  })
})

describe('temp root', () => {
  it('refuses a DATA_DIR/tmp that is a symlink', async () => {
    const dataDir = fs.mkdtempSync(path.join(scratch, 'data-'))
    const outside = fs.mkdtempSync(path.join(scratch, 'outside-'))
    fs.symlinkSync(outside, path.join(dataDir, 'tmp'))
    await expect(ensureTmpRoot(dataDir)).rejects.toThrow('temp root is not a plain directory')
  })
})

describe('sweep safety', () => {
  it('never sweeps the temp dir of an upload still in progress, however old', async () => {
    const root = await ensureTmpRoot()
    const dir = fs.mkdtempSync(path.join(root, 'upload-'))
    const old = new Date(Date.now() - STALE_AFTER_MS - 60_000)
    fs.utimesSync(dir, old, old)
    activeTempDirs.add(dir)
    try {
      await sweepTempDirs()
      expect(fs.existsSync(dir)).toBe(true)
    } finally {
      activeTempDirs.delete(dir)
    }
    await sweepTempDirs()
    expect(fs.existsSync(dir)).toBe(false)
  })

  it('refuses to sweep through a symlinked project upload dir', async () => {
    const projectId = insertProject({ type: 'single', title: '链接测试' }).id
    const outside = fs.mkdtempSync(path.join(scratch, 'outside-'))
    const victim = path.join(outside, 'DDDDDDDDDDDD.display.webp')
    fs.writeFileSync(victim, 'keep')
    const old = new Date(Date.now() - STALE_AFTER_MS - 60_000)
    fs.utimesSync(victim, old, old)
    fs.mkdirSync(path.join(getEnv().DATA_DIR, 'uploads'), { recursive: true })
    fs.symlinkSync(outside, uploadDir(projectId))
    await expect(sweepProjectUploads(projectId, new Set())).rejects.toThrow('not a plain directory')
    expect(fs.readFileSync(victim, 'utf8')).toBe('keep')
    fs.unlinkSync(uploadDir(projectId))
  })
})
