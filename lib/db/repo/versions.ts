import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { DesignSpec } from '../../core/schemas'
import { getDb } from '../client'
import { jobs, projects, usageRecords, versions, type JobRow, type VersionRow } from '../schema'

/** Every version row comes from a succeeded job or an accepted correction. */
export function hasAnyVersion(projectId: string): boolean {
  const row = getDb()
    .select({ id: versions.id })
    .from(versions)
    .where(eq(versions.projectId, projectId))
    .limit(1)
    .get()
  return row !== undefined
}

/** Design specs of the project's latest `limit` versions, oldest first (input to module 05). */
export function listRecentDesignSpecs(projectId: string, limit: number): DesignSpec[] {
  return getDb()
    .select({ spec: versions.designSpec })
    .from(versions)
    .where(eq(versions.projectId, projectId))
    .orderBy(desc(versions.createdAt), desc(sql`rowid`))
    .limit(limit)
    .all()
    .map((r) => r.spec)
    .reverse()
}

export function insertVersion(row: VersionRow): void {
  getDb().insert(versions).values(row).run()
}

/** A version whose project has not been deleted. */
export function findActiveVersion(id: string): VersionRow | undefined {
  return getDb()
    .select({ version: versions })
    .from(versions)
    .innerJoin(projects, eq(projects.id, versions.projectId))
    .where(and(eq(versions.id, id), isNull(projects.deletedAt)))
    .get()?.version
}

export interface VersionWithJob {
  version: VersionRow
  job: Pick<JobRow, 'startedAt' | 'finishedAt'> | null
  costCny: number
}

/** The project's versions, newest first, with the generating job's timing and total model cost. */
export function listVersionsWithCost(projectId: string): VersionWithJob[] {
  const db = getDb()
  const rows = db
    .select({ version: versions, startedAt: jobs.startedAt, finishedAt: jobs.finishedAt })
    .from(versions)
    .leftJoin(jobs, eq(jobs.id, versions.jobId))
    .where(eq(versions.projectId, projectId))
    .orderBy(desc(versions.createdAt), desc(sql`${versions}.rowid`))
    .all()
  const jobIds = rows.flatMap((r) => (r.version.jobId ? [r.version.jobId] : []))
  const costs = new Map(
    jobIds.length === 0
      ? []
      : db
          .select({ jobId: usageRecords.jobId, total: sql<number>`sum(${usageRecords.costCny})` })
          .from(usageRecords)
          .where(inArray(usageRecords.jobId, jobIds))
          .groupBy(usageRecords.jobId)
          .all()
          .map((r) => [r.jobId, r.total] as const),
  )
  return rows.map((r) => ({
    version: r.version,
    job: r.startedAt === null ? null : { startedAt: r.startedAt, finishedAt: r.finishedAt },
    costCny: (r.version.jobId && costs.get(r.version.jobId)) || 0,
  }))
}
