import fs from 'node:fs'
import path from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { Errors } from '../core/errors'
import { isValidId, SLUG_PATTERN } from '../core/ids'
import { getDb, type Db } from '../db/client'
import { projects, versions, type ProjectRow, type VersionRow } from '../db/schema'
import { getEnv } from '../env'
import { versionHtmlPath } from '../jobs/files'

export type PublishTx = Parameters<Parameters<Db['transaction']>[0]>[0]

export interface PublishLinks {
  url: string
  qrPngUrl: string
  qrSvgUrl: string
}

export interface PublicationEvent {
  action: 'publish' | 'unpublish'
  projectId: string
  versionId: string | null
  at: string
}

export function publicationLinks(project: Pick<ProjectRow, 'id' | 'slug'>): PublishLinks {
  return {
    url: `${getEnv().PUBLIC_BASE_URL}/p/${project.slug}/`,
    qrPngUrl: `/api/projects/${project.id}/qr?format=png`,
    qrSvgUrl: `/api/projects/${project.id}/qr?format=svg`,
  }
}

/** Resolve only the immutable canonical file, never a DB-provided arbitrary path or symlink. */
function checkedHtmlPath(version: VersionRow): string | null {
  if (!isValidId(version.projectId) || !isValidId(version.id)) return null
  const expected = versionHtmlPath(version.projectId, version.id)
  if (version.htmlPath !== expected) return null
  const root = getEnv().DATA_DIR
  try {
    for (const dir of ['pages', path.join('pages', version.projectId), path.dirname(expected)]) {
      if (!fs.lstatSync(path.join(root, dir)).isDirectory()) return null
    }
    const file = path.join(root, expected)
    return fs.lstatSync(file).isFile() ? file : null
  } catch {
    return null
  }
}

function currentProject(tx: PublishTx, id: string): ProjectRow {
  if (!isValidId(id)) throw Errors.notFound('项目')
  const row = tx
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .get()
  if (!row) throw Errors.notFound('项目')
  return row
}

/** Compare all publication state, including NULL, and never resurrect a deleted project. */
function unchanged(project: ProjectRow) {
  return and(
    eq(projects.id, project.id),
    isNull(projects.deletedAt),
    project.publishedVersionId === null
      ? isNull(projects.publishedVersionId)
      : eq(projects.publishedVersionId, project.publishedVersionId),
    project.unpublishedAt === null
      ? isNull(projects.unpublishedAt)
      : eq(projects.unpublishedAt, project.unpublishedAt),
  )
}

/**
 * Module 15: call inside a synchronous transaction, preferably `behavior: 'immediate'`.
 * Does not start/commit a transaction, log success, or mutate any files. The caller must enforce
 * its own authorization/confirmation and call logPublication(result.event) ONLY after its outer
 * transaction commits. Returning from this function alone does not mean publication committed.
 */
export function publishVersionTx(
  tx: PublishTx,
  projectId: string,
  versionId: string,
): { links: PublishLinks; event: PublicationEvent } {
  const project = currentProject(tx, projectId)
  const version = tx
    .select()
    .from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.projectId, projectId)))
    .get()
  if (!version || !checkedHtmlPath(version)) throw Errors.notFound('版本')
  const links = publicationLinks(project)
  const result = tx
    .update(projects)
    .set({ publishedVersionId: versionId, unpublishedAt: null })
    .where(unchanged(project))
    .run()
  if (result.changes !== 1) throw Errors.conflict('发布状态已变化，请重试')
  return { links, event: { action: 'publish', projectId, versionId, at: new Date().toISOString() } }
}

/**
 * Top-level entry only; callers already inside a transaction must use publishVersionTx instead.
 * Single-process synchronous transactions contain no await; SQLite IMMEDIATE serializes writers.
 */
export function publishVersion(projectId: string, versionId: string): PublishLinks {
  const result = getDb().transaction((tx) => publishVersionTx(tx, projectId, versionId), {
    behavior: 'immediate',
  })
  logPublication(result.event)
  return result.links
}

/** Unpublishing preserves both the version pointer and all immutable version files. */
export function unpublishProject(projectId: string): void {
  const event = getDb().transaction(
    (tx): PublicationEvent | null => {
      const project = currentProject(tx, projectId)
      if (project.unpublishedAt !== null) return null
      const at = new Date().toISOString()
      const result = tx.update(projects).set({ unpublishedAt: at }).where(unchanged(project)).run()
      if (result.changes !== 1) throw Errors.conflict('发布状态已变化，请重试')
      return { action: 'unpublish', projectId, versionId: project.publishedVersionId, at }
    },
    { behavior: 'immediate' },
  )
  if (event) logPublication(event)
}

/** Best-effort server log; a logging failure must not turn a committed write into an API failure. */
export function logPublication(event: PublicationEvent): void {
  try {
    console.info('[publish]', event)
  } catch {
    /* Publication is already committed. */
  }
}

export type PublishedHtml =
  | { status: 'ok'; projectId: string; versionId: string; htmlPath: string }
  | { status: 'not_found' | 'unpublished' | 'never_published' }

/** Module 10: resolve the current pointer on every request; do not cache this result. */
export function getPublishedHtmlPath(slug: string): PublishedHtml {
  if (!SLUG_PATTERN.test(slug)) return { status: 'not_found' }
  const row = getDb()
    .select({ project: projects, version: versions })
    .from(projects)
    .leftJoin(
      versions,
      and(eq(versions.id, projects.publishedVersionId), eq(versions.projectId, projects.id)),
    )
    .where(and(eq(projects.slug, slug), isNull(projects.deletedAt)))
    .get()
  if (!row) return { status: 'not_found' }
  if (row.project.unpublishedAt !== null) return { status: 'unpublished' }
  if (row.project.publishedVersionId === null) return { status: 'never_published' }
  const htmlPath = row.version && checkedHtmlPath(row.version)
  if (!htmlPath) return { status: 'not_found' }
  return {
    status: 'ok',
    projectId: row.project.id,
    versionId: row.project.publishedVersionId,
    htmlPath,
  }
}
