import path from 'node:path'
import { isValidId } from '../core/ids'
import { listAssetsByProject } from '../db/repo/assets'
import { getEnv } from '../env'
import { listDir, STALE_AFTER_MS, sweepProjectUploads, sweepTempDirs } from './storage'

/** Sweeps every project's upload dir and the temp root (see sweepProjectUploads/sweepTempDirs). */
export async function sweepAllStaleUploads(now: number = Date.now()): Promise<void> {
  const dataDir = getEnv().DATA_DIR
  for (const projectId of await listDir(path.join(dataDir, 'uploads'))) {
    if (!isValidId(projectId)) continue
    const known = new Set(listAssetsByProject(projectId).map((a) => a.id))
    await sweepProjectUploads(projectId, known, now, dataDir)
  }
  await sweepTempDirs(now, dataDir)
}

let timer: NodeJS.Timeout | undefined

/**
 * Runs the sweep at server start and then hourly, so files left by a failed cleanup or a crash
 * (temp uploads still carry the original EXIF/GPS) do not wait for the next upload to that project.
 */
export function startUploadSweeper(intervalMs: number = STALE_AFTER_MS): void {
  if (timer) return
  const run = () => {
    sweepAllStaleUploads().catch((err: unknown) => {
      console.error('[assets] stale-upload sweep failed', err)
    })
  }
  run()
  timer = setInterval(run, intervalMs)
  timer.unref()
}
