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
 * are logged and later collected by the stale-upload sweep (lib/assets/sweep.ts).
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
 * DATA_DIR/tmp, created if missing. Refuses a symlink or anything that does not resolve to a
 * direct child of the real DATA_DIR, so uploads can never be staged (or swept) elsewhere.
 */
export async function ensureTmpRoot(dataDir: string = getEnv().DATA_DIR): Promise<string> {
  const root = path.join(dataDir, 'tmp')
  await fs.mkdir(root, { recursive: true, mode: 0o700 })
  const stat = await fs.lstat(root)
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw new Error('temp root is not a plain directory')
  if ((await fs.realpath(root)) !== path.join(await fs.realpath(dataDir), 'tmp')) {
    throw new Error('temp root escapes DATA_DIR')
  }
  return root
}

/** Removes a directory tree, retrying up to 3 times; throws if it remains. */
export async function removeDirStrict(dir: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rm(dir, { recursive: true, force: true })
      return
    } catch (err) {
      if (attempt >= REMOVE_ATTEMPTS) throw err
      await new Promise((r) => setTimeout(r, 50 * attempt))
    }
  }
}

/**
 * Recovers from cleanup failures: removes rendition files in DATA_DIR/uploads/<projectId>/ that no
 * asset row references. Only files older than STALE_AFTER_MS are touched, so files of an
 * in-flight upload are never swept.
 */
export async function sweepProjectUploads(
  projectId: string,
  knownAssetIds: ReadonlySet<string>,
  now: number = Date.now(),
  dataDir: string = getEnv().DATA_DIR,
): Promise<void> {
  const [uploadDir] = projectDirs(projectId, dataDir)
  const stale: string[] = []
  for (const name of await listDir(uploadDir!)) {
    const match = RENDITION_FILE.exec(name)
    if (!match || knownAssetIds.has(match[1]!)) continue
    const file = path.join(uploadDir!, name)
    if (await isOlderThan(file, now)) stale.push(file)
  }
  await removeFiles(stale)
}

/** Removes abandoned DATA_DIR/tmp/upload-* directories older than STALE_AFTER_MS. */
export async function sweepTempDirs(
  now: number = Date.now(),
  dataDir: string = getEnv().DATA_DIR,
): Promise<void> {
  const root = await ensureTmpRoot(dataDir)
  for (const name of await listDir(root)) {
    const dir = path.join(root, name)
    if (!name.startsWith('upload-') || !(await isOlderThan(dir, now))) continue
    await removeDirStrict(dir).catch((err: unknown) => {
      console.error('[assets] failed to remove stale temp dir', err)
    })
  }
}

export async function listDir(dir: string): Promise<string[]> {
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
