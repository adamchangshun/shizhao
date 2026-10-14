import { and, desc, eq, isNull, notInArray } from 'drizzle-orm'
import { newId, newSlug } from '../../core/ids'
import { getDb } from '../client'
import {
  corrections,
  jobs,
  projects,
  visitEvents,
  type ProjectRow,
  PROJECT_TYPES,
  TERMINAL_JOB_STATUSES,
} from '../schema'

export type ProjectType = (typeof PROJECT_TYPES)[number]

const SLUG_ATTEMPTS = 5

export class SlugExhaustedError extends Error {
  constructor() {
    super(`Could not allocate a unique slug after ${SLUG_ATTEMPTS} attempts`)
    this.name = 'SlugExhaustedError'
  }
}

function isSlugConflict(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    err.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    err.message.includes('projects.slug')
  )
}

/** Inserts a project with a fresh slug, retrying up to 5 times on slug collision. */
export function insertProject(
  input: { type: ProjectType; title: string },
  slugGen: () => string = newSlug,
): ProjectRow {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const row: ProjectRow = {
      id: newId(),
      slug: slugGen(),
      type: input.type,
      title: input.title,
      publishedVersionId: null,
      unpublishedAt: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    }
    try {
      getDb().insert(projects).values(row).run()
      return row
    } catch (err) {
      if (!isSlugConflict(err)) throw err
    }
  }
  throw new SlugExhaustedError()
}

export function findActiveProject(id: string): ProjectRow | undefined {
  return getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .get()
}

export function listActiveProjects(): ProjectRow[] {
  return getDb()
    .select()
    .from(projects)
    .where(isNull(projects.deletedAt))
    .orderBy(desc(projects.createdAt))
    .all()
}

export type DeletionClaim = 'claimed' | 'busy' | 'missing'

/**
 * Atomically marks the project deleted unless a job is running. An already-deleted project is
 * reported as claimed too, so a DELETE whose file cleanup failed can simply be retried.
 * Job creation checks deletedAt in its own transaction, so no job can start after the claim.
 */
export function claimProjectDeletion(id: string): DeletionClaim {
  return getDb().transaction(
    (tx) => {
      const project = tx
        .select({ deletedAt: projects.deletedAt })
        .from(projects)
        .where(eq(projects.id, id))
        .get()
      if (!project) return 'missing'
      if (project.deletedAt !== null) {
        tx.delete(visitEvents).where(eq(visitEvents.projectId, id)).run()
        tx.delete(corrections).where(eq(corrections.projectId, id)).run()
        return 'claimed'
      }
      const active = tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.projectId, id), notInArray(jobs.status, TERMINAL_JOB_STATUSES)))
        .get()
      if (active) return 'busy'
      tx.update(projects)
        .set({ deletedAt: new Date().toISOString() })
        .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
        .run()
      tx.delete(visitEvents).where(eq(visitEvents.projectId, id)).run()
      tx.delete(corrections).where(eq(corrections.projectId, id)).run()
      return 'claimed'
    },
    { behavior: 'immediate' },
  )
}
