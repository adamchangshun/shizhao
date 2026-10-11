import { eq } from 'drizzle-orm'
import { getDb } from '../client'
import { versions } from '../schema'

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
