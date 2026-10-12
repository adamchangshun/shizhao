import { and, asc, count, eq, isNull } from 'drizzle-orm'
import { getDb, type Db } from '../client'
import { assets, projects, type AssetRow } from '../schema'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export function findFirstImageAssetId(projectId: string): string | undefined {
  return getDb()
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.kind, 'image')))
    .orderBy(asc(assets.createdAt))
    .limit(1)
    .get()?.id
}

export function listAssetsByProject(projectId: string): AssetRow[] {
  return getDb()
    .select()
    .from(assets)
    .where(eq(assets.projectId, projectId))
    .orderBy(asc(assets.createdAt), asc(assets.id))
    .all()
}

/** The asset, only while its project is not deleted. */
export function findActiveAsset(id: string): AssetRow | undefined {
  return getDb()
    .select({ asset: assets })
    .from(assets)
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .where(and(eq(assets.id, id), isNull(projects.deletedAt)))
    .get()?.asset
}

export function findImageBySha(
  projectId: string,
  sha256: string,
  db: Db | Tx = getDb(),
): AssetRow | undefined {
  return db
    .select()
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.sha256, sha256)))
    .get()
}

export function countImages(projectId: string, db: Db | Tx = getDb()): number {
  return (
    db
      .select({ n: count() })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), eq(assets.kind, 'image')))
      .get()?.n ?? 0
  )
}

export function deleteAssetRow(id: string): boolean {
  return getDb().delete(assets).where(eq(assets.id, id)).run().changes > 0
}

export type { Tx as AssetTx }
