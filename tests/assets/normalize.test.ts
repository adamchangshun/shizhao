import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, describe, expect, it } from 'vitest'
import * as fx from '@/lib/assets/__fixtures__/generate'
import { normalizeImage, type HeicPath } from '@/lib/assets/normalize'
import { Semaphore } from '@/lib/assets/semaphore'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shizhao-normalize-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

function save(name: string, data: Buffer) {
  const tmpPath = path.join(dir, name)
  fs.writeFileSync(tmpPath, data)
  return { name, tmpPath, bytes: data.length }
}

describe('format allow-list (magic bytes, in the processor child)', () => {
  it('accepts JPEG, PNG and WebP whatever the name, and refuses SVG, HTML, GIF, PDF and AVIF', async () => {
    const webp = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
      .webp()
      .toBuffer()
    const avif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
      .avif()
      .toBuffer()
    const accepted: Array<[string, Buffer]> = [
      ['a.bin', await fx.jpeg(4, 4, '#000')],
      ['b.jpg', await fx.png(4, 4)],
      ['c.png', webp],
    ]
    for (const [name, data] of accepted) {
      await expect(normalizeImage(save(name, data))).resolves.toMatchObject({ width: 4, height: 4 })
    }
    const refused: Array<[string, Buffer]> = [
      ['d.jpg', fx.SVG_TEXT],
      ['e.jpg', fx.HTML_TEXT],
      ['f.jpg', await fx.gif()],
      ['g.jpg', fx.PDF_HEAD],
      ['h.heic', avif],
    ]
    for (const [name, data] of refused) {
      await expect(normalizeImage(save(name, data))).rejects.toMatchObject({
        code: 'unsupported_format',
      })
    }
  }, 30_000)
})

describe('normalizeImage', () => {
  it('fails with image_timeout when processing exceeds the time limit', async () => {
    const file = save('slow.png', await fx.png(3000, 2000))
    await expect(normalizeImage(file, { timeoutMs: 1 })).rejects.toMatchObject({
      status: 400,
      code: 'image_timeout',
    })
  })

  it('refuses a 10000×10000 PNG from its header', async () => {
    const file = path.join(dir, 'bomb.png')
    await fx.writeHugePng(file)
    await expect(
      normalizeImage({ name: 'bomb.png', tmpPath: file, bytes: fs.statSync(file).size }),
    ).rejects.toMatchObject({ code: 'image_too_many_pixels' })
  }, 60_000)

  it('decodes HEIC (sharp if it can, otherwise heic-convert) and strips metadata', async () => {
    const heic = fx.heic()
    const sharpCanDecode = await sharp(heic)
      .toBuffer()
      .then(
        () => true,
        () => false,
      )
    const paths: HeicPath[] = []
    const out = await normalizeImage(save('photo.heic', heic), { onHeicPath: (p) => paths.push(p) })
    expect(paths).toEqual([sharpCanDecode ? 'sharp' : 'heic-convert'])
    expect([out.width, out.height]).toEqual([300, 200])
    const meta = await sharp(out.display).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.exif).toBeUndefined()
  }, 30_000)
})

describe('Semaphore', () => {
  it('runs at most `limit` tasks at once, in FIFO order', async () => {
    const sem = new Semaphore(2)
    const releases: Array<() => void> = []
    const started: number[] = []
    let peak = 0
    const tasks = [0, 1, 2, 3, 4].map((i) =>
      sem.run(async () => {
        started.push(i)
        peak = Math.max(peak, sem.running)
        await new Promise<void>((r) => releases.push(r))
      }),
    )
    await new Promise((r) => setImmediate(r))
    expect(started).toEqual([0, 1])
    while (releases.length > 0) {
      releases.shift()!()
      await new Promise((r) => setImmediate(r))
    }
    await Promise.all(tasks)
    expect(started).toEqual([0, 1, 2, 3, 4])
    expect(peak).toBe(2)
    expect(sem.running).toBe(0)
  })
})
