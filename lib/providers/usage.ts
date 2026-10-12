import { and, eq } from 'drizzle-orm'
import { Usage } from '../core/schemas'
import { newId } from '../core/ids'
import type { Db } from '../db/client'
import { jobs, usageRecords } from '../db/schema'
import { ProviderError } from './errors'

/** Stores validated accounting without allowing a job from another project. */
export function recordUsage(
  db: Db,
  usage: Usage,
  context: { projectId: string; jobId?: string | null },
): void {
  const parsed = Usage.safeParse(usage)
  if (!parsed.success) throw new ProviderError('bad_response')
  try {
    db.transaction((tx) => {
      if (
        context.jobId &&
        !tx
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.id, context.jobId), eq(jobs.projectId, context.projectId)))
          .get()
      )
        throw new ProviderError('bad_response')
      tx.insert(usageRecords)
        .values({
          ...parsed.data,
          id: newId(),
          projectId: context.projectId,
          jobId: context.jobId ?? null,
          createdAt: new Date().toISOString(),
        })
        .run()
    })
  } catch (error) {
    if (error instanceof ProviderError) throw error
    throw new ProviderError('bad_response')
  }
}
