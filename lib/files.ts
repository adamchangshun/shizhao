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

export async function removeProjectFiles(projectId: string): Promise<void> {
  for (const dir of projectDirs(projectId)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
}
