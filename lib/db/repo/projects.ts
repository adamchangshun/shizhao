import { and, desc, eq, isNull } from 'drizzle-orm'
import { newId, newSlug } from '../../core/ids'
import { getDb } from '../client'
import { projects, type ProjectRow, PROJECT_TYPES } from '../schema'

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

/** Marks the project deleted; returns false if it was missing or already deleted. */
export function softDeleteProject(id: string): boolean {
  const result = getDb()
    .update(projects)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .run()
  return result.changes === 1
}
