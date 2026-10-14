// `pnpm corrections:export`: every correction as JSONL, the labelled data on where AI-read and
// merchant-entered facts go wrong. Rows hold no customer identity (none is ever stored).
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { asc } from 'drizzle-orm'
import { closeDb, getDb } from '../db/client'
import { corrections } from '../db/schema'

export function exportCorrectionsJsonl(): string {
  const rows = getDb().select().from(corrections).orderBy(asc(corrections.createdAt)).all()
  return rows
    .map((r) =>
      JSON.stringify({
        id: r.id,
        projectId: r.projectId,
        versionId: r.versionId,
        field: r.field,
        suggestedValue: r.suggestedValue,
        note: r.note,
        status: r.status,
        resultRevision: r.resultRevision,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
      }),
    )
    .map((line) => `${line}\n`)
    .join('')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.stdout.write(exportCorrectionsJsonl())
  } catch {
    process.stderr.write(
      '导出失败，请检查本地数据库。用法：pnpm corrections:export > corrections.jsonl\n',
    )
    process.exitCode = 1
  } finally {
    closeDb()
  }
}
