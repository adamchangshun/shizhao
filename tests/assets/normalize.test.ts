import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, describe, expect, it } from 'vitest'
import * as fx from '@/lib/assets/__fixtures__/generate'
import { normalizeImage, type HeicPath } from '@/lib/assets/normalize'
import { Semaphore } from '@/lib/assets/semaphore'
import { sniffImageFormat } from '@/lib/assets/sniff'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shizhao-normalize-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

function save(name: string, data: Buffer) {
  const tmpPath = path.join(dir, name)
  fs.writeFileSync(tmpPath, data)
  return { name, tmpPath, bytes: data.length }
}

describe('sniffImageFormat', () => {
  it('accepts JPEG, PNG and WebP by magic bytes and refuses the rest', async () => {
    const webp = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
      .webp()
      .toBuffer()
    const avif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
      .avif()
      .toBuffer()
    const cases: Array<[string, Buffer, string | null]> = [
      ['a.bin', await fx.jpeg(4, 4, '#000'), 'jpeg'],
      ['b.jpg', await fx.png(4, 4), 'png'],
      ['c.png', webp, 'webp'],
      ['d.jpg', fx.SVG_TEXT, null],
      ['e.jpg', fx.HTML_TEXT, null],
      ['f.jpg', await fx.gif(), null],
      ['g.jpg', fx.PDF_HEAD, null],
      ['h.heic', avif, null],
    ]
    for (const [name, data, expected] of cases) {
      expect(await sniffImageFormat(save(name, data).tmpPath)).toBe(expected)
    }
  })
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

  it('decodes HEIC (sharp if it can, otherwise heic-convert) and strips metadata', async (t) => {
    const heic = await fx.heicViaSips(dir)
    if (!heic) {
      t.skip() // fixture needs macOS sips; the Docker run covers Linux
      return
    }
    const paths: HeicPath[] = []
    const out = await normalizeImage(save('photo.heic', heic), { onHeicPath: (p) => paths.push(p) })
    expect([out.width, out.height]).toEqual([300, 200])
    expect(paths).toHaveLength(1)
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
