import fs from 'node:fs'
import path from 'node:path'
import { newId } from '@/lib/core/ids'
import { insertVersion } from '@/lib/db/repo/versions'
import { versionDir, versionHtmlPath } from '@/lib/jobs/files'
import { designFor, singleCopy } from '../render/fixtures'

export function seedVersion(projectId: string, html: string) {
  const id = newId()
  const dir = versionDir(projectId, id)
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), html)
  fs.writeFileSync(path.join(dir, 'media', 'fixture-display.webp'), 'fixed media bytes')
  insertVersion({
    id,
    projectId,
    jobId: null,
    origin: 'correction',
    factRevision: 1,
    designSpec: designFor('poster'),
    copy: singleCopy,
    copyRefs: {},
    guard: { copy: singleCopy, violations: [], rewritten: 0, removed: 0 },
    htmlPath: versionHtmlPath(projectId, id),
    qa: null,
    createdAt: new Date().toISOString(),
  })
  return id
}
