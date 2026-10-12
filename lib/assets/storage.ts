import fs from 'node:fs/promises'
import path from 'node:path'
import { isValidId } from '../core/ids'
import { getEnv } from '../env'
import { projectDirs } from '../files'
import type { AssetSize } from './limits'

/** Path relative to DATA_DIR, as stored in `assets.path` (display) and derived for thumb. */
export function assetRelPath(projectId: string, assetId: string, size: AssetSize): string {
  if (!isValidId(projectId) || !isValidId(assetId)) throw new Error('invalid asset path id')
  return `uploads/${projectId}/${assetId}.${size}.webp`
}

/**
 * Absolute file path, rebuilt from validated ids rather than read from the database, and checked
 * to sit directly inside DATA_DIR/uploads/<projectId>/.
 */
export function assetAbsPath(
  projectId: string,
  assetId: string,
  size: AssetSize,
  dataDir: string = getEnv().DATA_DIR,
): string {
  const [uploadDir] = projectDirs(projectId, dataDir)
  const abs = path.resolve(dataDir, assetRelPath(projectId, assetId, size))
  if (path.dirname(abs) !== uploadDir) throw new Error('asset path escapes upload dir')
  return abs
}

/** Creates DATA_DIR/uploads/<projectId>/ and refuses to write through a symlinked directory. */
export async function ensureUploadDir(
  projectId: string,
  dataDir: string = getEnv().DATA_DIR,
): Promise<void> {
  const [uploadDir] = projectDirs(projectId, dataDir)
  if (!uploadDir) throw new Error('missing upload dir')
  await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 })
  for (const dir of [path.dirname(uploadDir), uploadDir]) {
    const stat = await fs.lstat(dir)
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('upload dir is not a plain directory')
  }
}

const REMOVE_ATTEMPTS = 3

async function removeWithRetry(file: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rm(file, { force: true })
      return
    } catch (err) {
      if (attempt >= REMOVE_ATTEMPTS) throw err
      await new Promise((r) => setTimeout(r, 50 * attempt))
    }
  }
}

/** Removes every listed file (missing is fine), retrying each up to 3 times; throws if any remain. */
export async function removeFilesStrict(paths: readonly string[]): Promise<void> {
  const results = await Promise.allSettled(paths.map(removeWithRetry))
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) throw failed.reason
}

/**
 * Cleanup on an error path, where the original error must win. Files that still cannot be removed
 * are logged and later collected by sweepStaleUploads().
 */
export async function removeFiles(paths: readonly string[]): Promise<void> {
  try {
    await removeFilesStrict(paths)
  } catch (err) {
    console.error('[assets] failed to remove file; left for the stale-upload sweep', err)
  }
}

/** Anything younger may belong to an upload that is still running (20 images × 20s / 2 slots). */
export const STALE_AFTER_MS = 60 * 60 * 1000
const RENDITION_FILE = /^([A-Za-z0-9_-]{12})\.(display|thumb)\.webp$/

/**
 * Recovers from cleanup failures: removes rendition files in DATA_DIR/uploads/<projectId>/ that no
 * asset row references, and abandoned DATA_DIR/tmp/upload-* directories. Only entries older than
 * STALE_AFTER_MS are touched, so files of an in-flight upload are never swept.
 */
export async function sweepStaleUploads(
  projectId: string,
  knownAssetIds: ReadonlySet<string>,
  now: number = Date.now(),
  dataDir: string = getEnv().DATA_DIR,
): Promise<void> {
  const [uploadDir] = projectDirs(projectId, dataDir)
  const tmpRoot = path.join(dataDir, 'tmp')
  const stale: string[] = []
  for (const name of await listDir(uploadDir!)) {
    const match = RENDITION_FILE.exec(name)
    if (!match || knownAssetIds.has(match[1]!)) continue
    const file = path.join(uploadDir!, name)
    if (await isOlderThan(file, now)) stale.push(file)
  }
  await removeFiles(stale)
  for (const name of await listDir(tmpRoot)) {
    const dir = path.join(tmpRoot, name)
    if (!name.startsWith('upload-') || !(await isOlderThan(dir, now))) continue
    await fs.rm(dir, { recursive: true, force: true }).catch((err: unknown) => {
      console.error('[assets] failed to remove stale temp dir', err)
    })
  }
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

async function isOlderThan(entry: string, now: number): Promise<boolean> {
  try {
    return now - (await fs.lstat(entry)).mtimeMs > STALE_AFTER_MS
  } catch {
    return false // vanished meanwhile
  }
}
