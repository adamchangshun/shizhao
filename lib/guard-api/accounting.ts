import { sql } from 'drizzle-orm'
import { Usage } from '../core/schemas'
import { newId } from '../core/ids'
import { ApiError } from '../core/errors'
import type { Db } from '../db/client'
import { guardQuota, usageRecords } from '../db/schema'

export function consumeDailyQuota(db: Db, keyHash: string, limit: number, now = Date.now()): void {
  const day = new Date(now).toISOString().slice(0, 10)
  db.transaction((tx) => {
    tx.insert(guardQuota).values({ keyHash, day, count: 0 }).onConflictDoNothing().run()
    const result = tx.run(
      sql`UPDATE guard_quota SET count = count + 1 WHERE key_hash = ${keyHash} AND day = ${day} AND count < ${limit}`,
    )
    if (result.changes !== 1)
      throw new ApiError(429, 'daily_quota_exceeded', '今日检查额度已用完，请明天再试')
  })
}
export function recordGuardUsage(db: Db, input: Usage): void {
  const usage = Usage.parse(input)
  db.insert(usageRecords)
    .values({
      ...usage,
      id: newId(),
      projectId: null,
      jobId: null,
      stage: 'api-guard',
      createdAt: new Date().toISOString(),
    })
    .run()
}
