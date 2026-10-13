import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '../db/client'
import { visitEvents } from '../db/schema'
import { beijingDate, countActions, countSources, requireStatsProject } from './summary'

/** Daily counts for all retained events; only generated dates and integers enter the CSV. */
export function exportStatsCsv(projectId: string): string {
  requireStatsProject(projectId)
  const rows = getDb()
    .select({ date: beijingDate, ...countActions, ...countSources })
    .from(visitEvents)
    .where(eq(visitEvents.projectId, projectId))
    .groupBy(beijingDate)
    .orderBy(beijingDate)
    .all()
  return [
    'date,view,call,wechat_copy,navigate,qr,link',
    ...rows.map((r) => [r.date, r.view, r.call, r.wechat_copy, r.navigate, r.qr, r.link].join(',')),
    '',
  ].join('\r\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('usage')
    process.stdout.write(exportStatsCsv(process.argv[2]!))
  } catch {
    process.stderr.write(
      '导出失败，请检查项目编号和本地数据库。用法：pnpm stats:export <projectId>\n',
    )
    process.exitCode = 1
  } finally {
    closeDb()
  }
}
