// Version directories (contract R2): DATA_DIR/pages/<projectId>/<versionId>/index.html + media/.
// A job renders into a staging directory named after the job and renames it into place only
// together with the version row, so a failed or timed-out job never leaves a version directory.
import fs from 'node:fs/promises'
import path from 'node:path'
import { isValidId } from '../core/ids'
import { getEnv } from '../env'
import { projectDirs } from '../files'

export const MEDIA_FILE = /^[a-zA-Z0-9_-]+-(display|thumb)\.webp$/

function pagesDir(projectId: string): string {
  return projectDirs(projectId)[1]!
}

function child(projectId: string, name: string): string {
  const base = pagesDir(projectId)
  const dir = path.resolve(base, name)
  if (path.dirname(dir) !== base) throw new Error('version dir escapes project pages dir')
  return dir
}

export function versionDir(projectId: string, versionId: string): string {
  if (!isValidId(versionId)) throw new Error('invalid version id')
  return child(projectId, versionId)
}

export function stagingDir(projectId: string, jobId: string): string {
  if (!isValidId(jobId)) throw new Error('invalid job id')
  return child(projectId, `.staging-${jobId}`)
}

/** `htmlPath` as stored in `versions` (relative to DATA_DIR). */
export function versionHtmlPath(projectId: string, versionId: string): string {
  return path.relative(getEnv().DATA_DIR, path.join(versionDir(projectId, versionId), 'index.html'))
}

/** Absolute path of a media file inside a version directory, or null for a bad file name. */
export function versionMediaPath(projectId: string, versionId: string, file: string): string | null {
  if (!MEDIA_FILE.test(file)) return null
  return path.join(versionDir(projectId, versionId), 'media', file)
}

export async function removeStaging(projectId: string, jobId: string): Promise<void> {
  await fs.rm(stagingDir(projectId, jobId), { recursive: true, force: true })
}
