import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../client'
import { assets } from '../schema'

export function findFirstImageAssetId(projectId: string): string | undefined {
  return getDb()
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.kind, 'image')))
    .orderBy(asc(assets.createdAt))
    .limit(1)
    .get()?.id
}
