import fs from 'node:fs/promises'
import path from 'node:path'
import { isValidId } from './core/ids'
import { getEnv } from './env'

const PROJECT_ROOTS = ['uploads', 'pages'] as const

/**
 * Directories owned by one project. Rejects anything that is not a newId()-shaped id and
 * re-checks that each resolved path is a direct child of its root, so a crafted id can
 * never point outside DATA_DIR/<root>/.
 */
export function projectDirs(projectId: string, dataDir: string = getEnv().DATA_DIR): string[] {
  if (!isValidId(projectId)) throw new Error('invalid project id')
  return PROJECT_ROOTS.map((root) => {
    const base = path.resolve(dataDir, root)
    const dir = path.resolve(base, projectId)
    if (path.dirname(dir) !== base || path.basename(dir) !== projectId) {
      throw new Error('project dir escapes data root')
    }
    return dir
  })
}

async function lstatOrNull(p: string): Promise<import('node:fs').Stats | null> {
  try {
    return await fs.lstat(p)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/**
 * Removes the project's directories. Refuses to follow symlinks at the root or project level,
 * so a planted link can never redirect the recursive delete outside DATA_DIR.
 */
export async function removeProjectFiles(
  projectId: string,
  dataDir: string = getEnv().DATA_DIR,
): Promise<void> {
  const realData = await fs.realpath(dataDir)
  for (const dir of projectDirs(projectId, dataDir)) {
    const root = path.dirname(dir)
    const rootStat = await lstatOrNull(root)
    if (rootStat === null) continue
    if (!rootStat.isDirectory()) throw new Error('data root is not a plain directory')
    if (path.dirname(await fs.realpath(root)) !== realData)
      throw new Error('data root escapes DATA_DIR')
    const dirStat = await lstatOrNull(dir)
    if (dirStat === null) continue
    if (dirStat.isSymbolicLink()) {
      await fs.unlink(dir) // drop the link itself, never its target
      continue
    }
    await fs.rm(dir, { recursive: true, force: true })
  }
}
