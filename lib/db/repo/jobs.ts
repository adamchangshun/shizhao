import { and, desc, eq, isNotNull, isNull, notInArray } from 'drizzle-orm'
import type { JobStatus } from '../../core/schemas'
import { newId } from '../../core/ids'
import { isTerminal, transition } from '../../core/job-state'
import { getDb, type Db } from '../client'
import { jobs, projects, TERMINAL_JOB_STATUSES, type JobRow } from '../schema'

const TERMINAL_STATUSES = TERMINAL_JOB_STATUSES

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
 * R3: creates a queued job unless the project is deleted or already has a non-terminal job.
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
        const live = tx
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
          .get()
        if (!live) return null
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
          stageStartedAt: null,
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

export interface TransitionPatch {
  stage?: string
  error?: string | null
}

/**
 * The only sanctioned way to persist a job status change (contract section 4 + R3).
 * Validates the move with the state machine, then applies it with a conditional
 * `UPDATE ... WHERE id=? AND status=?`. Returns false if another writer got there first.
 * Throws InvalidTransitionError for illegal moves.
 */
export function transitionJob(
  id: string,
  expected: JobStatus,
  next: JobStatus,
  patch: TransitionPatch = {},
  db: Db = getDb(),
): boolean {
  transition({ status: expected }, next)
  const result = db
    .update(jobs)
    .set({
      status: next,
      stage: patch.stage ?? next,
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(isTerminal(next) ? { finishedAt: new Date().toISOString() } : {}),
    })
    .where(and(eq(jobs.id, id), eq(jobs.status, expected)))
    .run()
  return result.changes === 1
}

export function findJob(id: string, db: Db = getDb()): JobRow | undefined {
  return db.select().from(jobs).where(eq(jobs.id, id)).get()
}

/** Jobs a restarted process must either resume or time out. */
export function listNonTerminalJobs(db: Db = getDb()): JobRow[] {
  return db.select().from(jobs).where(notInArray(jobs.status, TERMINAL_STATUSES)).all()
}

/**
 * Module 08: the runner picked the job up (it is now `designing`). Restarts the total-timeout
 * clock and the per-stage timing log; a no-op if the job has moved on.
 */
export function beginJobRun(id: string, at: string, db: Db = getDb()): void {
  db.update(jobs)
    .set({ startedAt: at, stageStartedAt: { designing: at } })
    .where(and(eq(jobs.id, id), eq(jobs.status, 'designing')))
    .run()
}

/** Appends `stage`'s start time while the job is still in that stage and still timed. */
export function recordStageStart(id: string, stage: JobStatus, at: string, db: Db = getDb()): void {
  db.transaction((tx) => {
    const row = tx
      .select({ log: jobs.stageStartedAt })
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.status, stage)))
      .get()
    if (!row?.log) return
    tx.update(jobs)
      .set({ stageStartedAt: { ...row.log, [stage]: at } })
      .where(and(eq(jobs.id, id), eq(jobs.status, stage)))
      .run()
  })
}

/** A resumed job reruns stages it had already passed; its stage times are not real samples. */
export function clearStageLog(id: string, db: Db = getDb()): void {
  db.update(jobs).set({ stageStartedAt: null }).where(eq(jobs.id, id)).run()
}

export interface StageLogSample {
  stageStartedAt: Record<string, string>
  finishedAt: string
}

/** Stage logs of the most recent succeeded jobs, newest first (ETA statistics). */
export function listRecentStageLogs(limit: number, db: Db = getDb()): StageLogSample[] {
  return db
    .select({ stageStartedAt: jobs.stageStartedAt, finishedAt: jobs.finishedAt })
    .from(jobs)
    .where(and(eq(jobs.status, 'succeeded'), isNotNull(jobs.stageStartedAt)))
    .orderBy(desc(jobs.finishedAt))
    .limit(limit)
    .all()
    .flatMap((r) =>
      r.stageStartedAt && r.finishedAt
        ? [{ stageStartedAt: r.stageStartedAt, finishedAt: r.finishedAt }]
        : [],
    )
}
