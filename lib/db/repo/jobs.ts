import { and, eq, notInArray } from 'drizzle-orm'
import type { JobStatus } from '../../core/schemas'
import { newId } from '../../core/ids'
import { getDb, type Db } from '../client'
import { jobs, type JobRow } from '../schema'

const TERMINAL_STATUSES: JobStatus[] = ['succeeded', 'failed', 'timed_out']

export interface NewJobInput {
  factRevision: number
  seed: number
}

function isActiveJobConflict(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    err.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    err.message.includes('jobs.project_id')
  )
}

/**
 * R3: creates a queued job unless the project already has a non-terminal one.
 * The check and insert share one IMMEDIATE transaction, and the partial unique index
 * `jobs_one_active_per_project` backs it up across connections. Returns null on conflict.
 */
export function createJobIfIdle(
  projectId: string,
  input: NewJobInput,
  db: Db = getDb(),
): JobRow | null {
  try {
    return db.transaction(
      (tx) => {
        const active = tx
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.projectId, projectId), notInArray(jobs.status, TERMINAL_STATUSES)))
          .get()
        if (active) return null
        const now = new Date().toISOString()
        const row: JobRow = {
          id: newId(),
          projectId,
          factRevision: input.factRevision,
          status: 'queued',
          stage: 'queued',
          seed: input.seed,
          error: null,
          startedAt: now,
          finishedAt: null,
          createdAt: now,
        }
        tx.insert(jobs).values(row).run()
        return row
      },
      { behavior: 'immediate' },
    )
  } catch (err) {
    if (isActiveJobConflict(err)) return null
    throw err
  }
}

export function listJobStatuses(projectId: string): JobStatus[] {
  return getDb()
    .select({ status: jobs.status })
    .from(jobs)
    .where(eq(jobs.projectId, projectId))
    .all()
    .map((r) => r.status)
}
