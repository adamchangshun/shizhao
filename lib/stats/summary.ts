import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { Errors } from '../core/errors'
import { isValidId } from '../core/ids'
import { getDb } from '../db/client'
import { findActiveProject } from '../db/repo/projects'
import { visitEvents } from '../db/schema'

const DAY = 86_400_000
const SHANGHAI_OFFSET = 8 * 3_600_000
export const beijingDate = sql<string>`strftime('%Y-%m-%d', ${visitEvents.createdAt}, '+8 hours')`
export const countActions = {
  view: sql<number>`sum(case when ${visitEvents.action} = 'view' then 1 else 0 end)`.mapWith(
    Number,
  ),
  call: sql<number>`sum(case when ${visitEvents.action} = 'call' then 1 else 0 end)`.mapWith(
    Number,
  ),
  wechat_copy:
    sql<number>`sum(case when ${visitEvents.action} = 'wechat_copy' then 1 else 0 end)`.mapWith(
      Number,
    ),
  navigate:
    sql<number>`sum(case when ${visitEvents.action} = 'navigate' then 1 else 0 end)`.mapWith(
      Number,
    ),
}
export const countSources = {
  qr: sql<number>`sum(case when ${visitEvents.source} = 'qr' then 1 else 0 end)`.mapWith(Number),
  link: sql<number>`sum(case when ${visitEvents.source} = 'link' then 1 else 0 end)`.mapWith(
    Number,
  ),
}
const empty = () => ({ view: 0, call: 0, wechat_copy: 0, navigate: 0 })

export function requireStatsProject(projectId: string): void {
  if (!isValidId(projectId) || !findActiveProject(projectId)) throw Errors.notFound('项目')
}

/** Includes today in Asia/Shanghai and the previous days-1 dates, up to and including now. */
function period(days: number, now: number) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw Errors.invalidInput()
  const today = Math.floor((now + SHANGHAI_OFFSET) / DAY) * DAY - SHANGHAI_OFFSET
  return { start: today - (days - 1) * DAY, end: now }
}

export function getStats(projectId: string, days = 7, now = Date.now()) {
  requireStatsProject(projectId)
  const { start, end } = period(days, now)
  const rows = getDb()
    .select({ date: beijingDate, ...countActions, ...countSources })
    .from(visitEvents)
    .where(
      and(
        eq(visitEvents.projectId, projectId),
        gte(visitEvents.createdAt, new Date(start).toISOString()),
        lte(visitEvents.createdAt, new Date(end).toISOString()),
      ),
    )
    .groupBy(beijingDate)
    .orderBy(beijingDate)
    .all()
  const byDate = new Map(rows.map((row) => [row.date, row]))
  const totals = empty(),
    bySource = { qr: 0, link: 0 }
  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date(start + SHANGHAI_OFFSET + i * DAY).toISOString().slice(0, 10)
    const row = byDate.get(date)
    const counts = row
      ? { view: row.view, call: row.call, wechat_copy: row.wechat_copy, navigate: row.navigate }
      : empty()
    for (const action of ['view', 'call', 'wechat_copy', 'navigate'] as const)
      totals[action] += counts[action]
    bySource.qr += row?.qr ?? 0
    bySource.link += row?.link ?? 0
    return { date, ...counts }
  })
  return { totals, bySource, daily }
}

/** Uses the same natural-day window as the stats endpoint. */
export function views7d(projectId: string, now = Date.now()): number {
  const { start } = period(7, now)
  return getDb()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(visitEvents)
    .where(
      and(
        eq(visitEvents.projectId, projectId),
        eq(visitEvents.action, 'view'),
        gte(visitEvents.createdAt, new Date(start).toISOString()),
        lte(visitEvents.createdAt, new Date(now).toISOString()),
      ),
    )
    .get()!.count
}
