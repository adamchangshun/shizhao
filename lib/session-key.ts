import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const KEY_FILE = 'session.key'
const KEY_HEX = /^[0-9a-f]{64}$/

export class SessionKeyError extends Error {
  constructor(reason: string) {
    super(`${KEY_FILE} 不可用（${reason}），请删除该文件后重启服务`)
    this.name = 'SessionKeyError'
  }
}

/** Publishes a fresh key atomically: fsynced 0600 temp file, then a no-overwrite hard link. */
function createKeyFile(dir: string, file: string): void {
  const tmp = path.join(dir, `.${KEY_FILE}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
  const fd = fs.openSync(tmp, 'wx', 0o600)
  try {
    fs.writeSync(fd, randomBytes(32).toString('hex'))
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  try {
    fs.linkSync(tmp, file) // fails with EEXIST if another process won the race
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
  } finally {
    fs.unlinkSync(tmp)
  }
}

/** Reads the key without following symlinks and refuses files others could read or plant. */
function readTrustedKey(file: string): Buffer {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const st = fs.fstatSync(fd)
    if (!st.isFile()) throw new SessionKeyError('不是普通文件')
    if ((st.mode & 0o077) !== 0) throw new SessionKeyError('权限必须是 0600')
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) {
      throw new SessionKeyError('文件属主不是当前用户')
    }
    const hex = fs.readFileSync(fd, 'utf8').trim()
    if (!KEY_HEX.test(hex)) throw new SessionKeyError('内容损坏')
    return Buffer.from(hex, 'hex')
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * Loads DATA_DIR/session.key, creating it on first use. Safe across concurrent processes:
 * readers only ever see a complete, fsynced file. Fails closed on anything suspicious.
 */
export function loadOrCreateSessionKey(dir: string): Buffer {
  const file = path.join(dir, KEY_FILE)
  fs.mkdirSync(dir, { recursive: true })
  try {
    fs.lstatSync(file)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    createKeyFile(dir, file)
  }
  return readTrustedKey(file)
}
