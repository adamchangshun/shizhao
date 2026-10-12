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

/** Removes every listed file; missing files are fine. Failures are logged, never thrown. */
export async function removeFiles(paths: readonly string[]): Promise<void> {
  const results = await Promise.allSettled(paths.map((p) => fs.rm(p, { force: true })))
  for (const r of results) {
    if (r.status === 'rejected') console.error('[assets] failed to remove file', r.reason)
  }
}
