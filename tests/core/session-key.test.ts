import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadOrCreateSessionKey, SessionKeyError } from '@/lib/session-key'

const freshDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'shizhao-key-'))
const HEX64 = 'a'.repeat(64)

function writeKey(dir: string, content: string, mode = 0o600): string {
  const file = path.join(dir, 'session.key')
  fs.writeFileSync(file, content, { mode })
  fs.chmodSync(file, mode)
  return file
}

function runChild(dir: string): Promise<string> {
  const code = `import('${path.resolve('lib/session-key.ts')}').then(m => process.stdout.write(m.loadOrCreateSessionKey(process.argv[1]).toString('hex')))`
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '-e', code, dir])
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (status) => (status === 0 ? resolve(out) : reject(new Error(err))))
  })
}

describe('loadOrCreateSessionKey', () => {
  it('creates a 32-byte key with mode 0600 and returns the same key afterwards', () => {
    const dir = freshDir()
    const key = loadOrCreateSessionKey(dir)
    expect(key).toHaveLength(32)
    expect(fs.statSync(path.join(dir, 'session.key')).mode & 0o777).toBe(0o600)
    expect(loadOrCreateSessionKey(dir).equals(key)).toBe(true)
    expect(fs.readdirSync(dir)).toEqual(['session.key'])
  })

  it('gives 8 concurrent processes the same complete key', async () => {
    const dir = freshDir()
    const keys = await Promise.all(Array.from({ length: 8 }, () => runChild(dir)))
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(fs.readdirSync(dir)).toEqual(['session.key'])
  }, 30_000)

  it.each([
    ['empty', ''],
    ['too short', 'ab'.repeat(16)],
    ['trailing garbage', `${HEX64}zz`],
    ['too long', `${HEX64}00`],
  ])('refuses a %s key file', (_label, content) => {
    const dir = freshDir()
    writeKey(dir, content)
    expect(() => loadOrCreateSessionKey(dir)).toThrow(SessionKeyError)
  })

  it('refuses a key file readable by others', () => {
    const dir = freshDir()
    writeKey(dir, HEX64, 0o644)
    expect(() => loadOrCreateSessionKey(dir)).toThrow(/0600/)
  })

  it('refuses a symlinked key file', () => {
    const dir = freshDir()
    const target = writeKey(freshDir(), HEX64)
    fs.symlinkSync(target, path.join(dir, 'session.key'))
    expect(() => loadOrCreateSessionKey(dir)).toThrow()
  })
})
