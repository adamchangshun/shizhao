import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { ID_PATTERN, SLUG_PATTERN, newId } from '../core/ids'
import { getDb } from '../db/client'
import { projects, versions, visitEvents } from '../db/schema'
import { readJsonLimited } from '../http'
import { clientHash, TrackingLimiter } from './limiter'

const EventBody = z
  .object({
    slug: z.string().regex(SLUG_PATTERN),
    versionId: z.string().regex(ID_PATTERN),
    source: z.enum(['qr', 'link']),
    action: z.enum(['view', 'call', 'wechat_copy', 'navigate']),
  })
  .strict()

const limiter = new TrackingLimiter()

export async function track(request: Request): Promise<void> {
  const event = EventBody.parse(await readJsonLimited(request, 1024))
  const hash = clientHash(request)
  // Validate after awaiting the body; one synchronous IMMEDIATE transaction holds the pointer
  // stable through insertion, including against other SQLite connections.
  getDb().transaction(
    (tx) => {
      const project = tx
        .select({ id: projects.id })
        .from(projects)
        .innerJoin(
          versions,
          and(eq(versions.id, projects.publishedVersionId), eq(versions.projectId, projects.id)),
        )
        .where(
          and(
            eq(projects.slug, event.slug),
            eq(projects.publishedVersionId, event.versionId),
            isNull(projects.deletedAt),
            isNull(projects.unpublishedAt),
          ),
        )
        .get()
      if (!project || !limiter.accept(`${hash}:${event.slug}:${event.action}`)) return
      tx.insert(visitEvents)
        .values({
          id: newId(),
          projectId: project.id,
          versionId: event.versionId,
          source: event.source,
          action: event.action,
          createdAt: new Date().toISOString(),
        })
        .run()
    },
    { behavior: 'immediate' },
  )
}
