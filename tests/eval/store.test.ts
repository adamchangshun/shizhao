import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { runPart } from '@/eval/lib/store'

const Data = z.object({ value: z.number() })

let root: string
let lines: string[]
let calls: number

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-store-'))
  lines = []
  calls = 0
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

const dirOf = (n: number) => path.join(root, 'sample-a', 'A-gold', String(n))

function run(n: number) {
  return runPart({
    dir: dirOf(n),
    label: `sample-a/A-gold/${n}`,
    schema: Data,
    log: (line) => lines.push(line),
    work: async () => {
      calls++
      return { files: { 'page.html': `<p>page ${n}</p>` }, data: { value: n } }
    },
  })
}

describe('runPart (resume)', () => {
  it('runs a missing part, then skips it once completed', async () => {
    expect(await run(1)).toEqual({ data: { value: 1 }, skipped: false })
    expect(await run(1)).toEqual({ data: { value: 1 }, skipped: true })
    expect(calls).toBe(1)
    expect(lines).toEqual([
      '[eval] run    sample-a/A-gold/1',
      '[eval] skip   sample-a/A-gold/1 (completed)',
    ])
  })

  it('reruns only the part whose directory was deleted', async () => {
    await run(1)
    await run(2)
    fs.rmSync(dirOf(2), { recursive: true })
    lines = []
    await run(1)
    await run(2)
    expect(calls).toBe(3)
    expect(lines).toEqual([
      '[eval] skip   sample-a/A-gold/1 (completed)',
      '[eval] run    sample-a/A-gold/2',
    ])
  })

  it('reruns a part whose output file was truncated after completion', async () => {
    await run(1)
    fs.writeFileSync(path.join(dirOf(1), 'page.html'), '<p>pa')
    lines = []
    await run(1)
    expect(calls).toBe(2)
    expect(lines[0]).toBe('[eval] rerun  sample-a/A-gold/1 (page.html changed)')
    expect(fs.readFileSync(path.join(dirOf(1), 'page.html'), 'utf8')).toBe('<p>page 1</p>')
  })

  it('reruns a part with a corrupted or missing completion marker', async () => {
    await run(1)
    fs.writeFileSync(path.join(dirOf(1), 'done.json'), '{"files":')
    await run(1)
    fs.rmSync(path.join(dirOf(1), 'done.json'))
    await run(1)
    expect(calls).toBe(3)
    expect(lines.slice(1)).toEqual([
      '[eval] rerun  sample-a/A-gold/1 (completion marker unreadable)',
      '[eval] rerun  sample-a/A-gold/1 (no completion marker)',
    ])
  })

  it('leaves no completion marker when the work fails, so the next run retries', async () => {
    await expect(
      runPart({
        dir: dirOf(1),
        label: 'x',
        schema: Data,
        log: () => {},
        work: async () => {
          throw new Error('provider down')
        },
      }),
    ).rejects.toThrow('provider down')
    expect(fs.existsSync(path.join(dirOf(1), 'done.json'))).toBe(false)
    await run(1)
    expect(calls).toBe(1)
  })
})
