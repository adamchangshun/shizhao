// Merchant side of customer corrections: list, accept (merge), reject.
//
// Accepting follows the contract's three steps (module 15, second-round revision):
//   1. claim: pending → processing with a conditional update (one winner, stale claims expire);
//   2. outside any transaction, render a new immutable version directory with the corrected
//      facts and the reused design and copy, and pass it through the DOM fact check;
//   3. in ONE transaction: new confirmed FactSheet revision, version row, directory rename,
//      publishVersionTx (same link and QR code), correction → accepted.
// Any failure puts the correction back to pending and removes the files of step 2; the public
// page only follows the database pointer, so it keeps showing the old version.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import { z } from 'zod'
import { ApiError, Errors } from '../core/errors'
import { isValidId } from '../core/ids'
import type { FactSheet } from '../core/schemas'
import { getDb } from '../db/client'
import { findLatestConfirmedFactSheet } from '../db/repo/fact-sheets'
import { findActiveProject } from '../db/repo/projects'
import { corrections, factSheets, projects, versions, type CorrectionRow } from '../db/schema'
import { stagingDir, versionHtmlPath } from '../jobs/files'
import { rerenderWithFacts } from '../jobs/rerender'
import { logPublication, publishVersionTx, type PublicationEvent } from '../publish'
import { applyCorrection } from './apply'
import { currentValue, findOption, OTHER_FIELD, pathLabel } from './options'

export const PROCESSING_TIMEOUT_MS = 5 * 60_000

/** Claims older than the timeout belong to an interrupted process: hand them back. */
export function recoverStaleClaims(now: number = Date.now()): void {
  const stale = and(
    eq(corrections.status, 'processing'),
    lt(corrections.processingAt, new Date(now - PROCESSING_TIMEOUT_MS).toISOString()),
  )
  // The interrupted attempt may have left its staging directory behind; its name is derived
  // from the claim, so it can be found and removed (a still-running attempt fails its
  // ownership check in the final transaction and cleans up after itself anyway).
  for (const row of getDb().select().from(corrections).where(stale).all()) {
    try {
      fs.rmSync(stagingDir(row.projectId, attemptKey(row.id, row.processingAt!)), {
        recursive: true,
        force: true,
      })
    } catch (err) {
      console.error('[corrections] could not remove an abandoned staging directory', err)
    }
  }
  getDb().update(corrections).set({ status: 'pending', processingAt: null }).where(stale).run()
}

/** Staging key of one claim: unique per (correction, claim time), shaped like a newId(). */
export function attemptKey(correctionId: string, claimedAt: string): string {
  return createHash('sha256')
    .update(`${correctionId}\u0000${claimedAt}`)
    .digest('base64url')
    .slice(0, 12)
}

export interface CorrectionView {
  id: string
  field: string
  fieldLabel: string
  /** The fact's value in the latest confirmed facts; null when unset or gone. */
  currentValue: string | null
  suggestedValue: string
  note: string | null
  /** Contact facts: the customer only said "may be wrong"; the merchant must type the value. */
  needsValue: boolean
  /** `other`: cannot be merged automatically. */
  manual: boolean
  status: CorrectionRow['status']
  createdAt: string
  resolvedAt: string | null
}

const ListQuery = z.enum(['pending', 'handled']).default('pending')

export function listCorrections(
  projectId: string,
  status: string | null,
  now: number = Date.now(),
): { corrections: CorrectionView[]; pendingCount: number } {
  if (!isValidId(projectId) || !findActiveProject(projectId)) throw Errors.notFound('项目')
  const which = ListQuery.parse(status ?? undefined)
  recoverStaleClaims(now)
  const statuses: CorrectionRow['status'][] =
    which === 'pending' ? ['pending', 'processing'] : ['accepted', 'rejected']
  const rows = getDb()
    .select()
    .from(corrections)
    .where(and(eq(corrections.projectId, projectId), inArray(corrections.status, statuses)))
    .orderBy(desc(corrections.createdAt))
    .limit(200)
    .all()
  const pendingCount = getDb()
    .select({ id: corrections.id })
    .from(corrections)
    .where(and(eq(corrections.projectId, projectId), eq(corrections.status, 'pending')))
    .all().length
  const sheet = findLatestConfirmedFactSheet(projectId)?.json
  return {
    pendingCount,
    corrections: rows.map((row) => {
      const option = sheet ? findOption(sheet, row.field) : undefined
      return {
        id: row.id,
        field: row.field,
        fieldLabel: sheet ? pathLabel(sheet, row.field) : '信息',
        currentValue: (sheet && currentValue(sheet, row.field)) ?? null,
        suggestedValue: row.suggestedValue,
        note: row.note,
        needsValue: option?.noValue ?? false,
        manual: row.field === OTHER_FIELD,
        status: row.status,
        createdAt: row.createdAt,
        resolvedAt: row.resolvedAt,
      }
    }),
  }
}

/** A visible correction (spam stays hidden) of a project that still exists. */
function findCorrection(id: string): CorrectionRow {
  if (!isValidId(id)) throw Errors.notFound('纠错')
  const row = getDb().select().from(corrections).where(eq(corrections.id, id)).get()
  if (!row || row.status === 'spam' || !findActiveProject(row.projectId)) {
    throw Errors.notFound('纠错')
  }
  return row
}

export interface AcceptResult {
  status: 'accepted'
  resultRevision: number
}

function settled(row: CorrectionRow): AcceptResult {
  if (row.status === 'accepted' && row.resultRevision !== null) {
    return { status: 'accepted', resultRevision: row.resultRevision }
  }
  if (row.status === 'processing') throw new ApiError(409, 'processing', '正在处理，请稍候')
  if (row.status === 'rejected') throw new ApiError(409, 'rejected', '这条纠错已经忽略')
  throw Errors.notFound('纠错')
}

export const AcceptBody = z.object({ value: z.string().max(100).optional() }).strict()

export interface AcceptOptions {
  now?: number
  render?: Parameters<typeof rerenderWithFacts>[0]['render']
  /** Test seam: runs inside the final transaction, after the directory rename. */
  inTransaction?: () => void
}

export async function acceptCorrection(
  id: string,
  input: unknown,
  opts: AcceptOptions = {},
): Promise<AcceptResult> {
  const now = opts.now ?? Date.now()
  recoverStaleClaims(now)
  const body = AcceptBody.parse(input ?? {})
  const row = findCorrection(id)
  if (row.status !== 'pending') return settled(row)

  // Everything the merchant can fix is checked before claiming, so a bad value never blocks.
  const project = findActiveProject(row.projectId)!
  const sourceId = project.publishedVersionId
  if (sourceId === null || project.unpublishedAt !== null) {
    throw new ApiError(409, 'not_live', '宣传页目前没有上线，请先重新发布后再采纳')
  }
  const base = findLatestConfirmedFactSheet(project.id)
  const latest = getDb()
    .select({ revision: factSheets.revision })
    .from(factSheets)
    .where(eq(factSheets.projectId, project.id))
    .orderBy(desc(factSheets.revision))
    .limit(1)
    .get()
  if (!base || latest?.revision !== base.revision) {
    throw new ApiError(409, 'facts_unconfirmed', '商品信息有还没确认的修改，请先到「核对信息」确认')
  }
  const value = body.value ?? row.suggestedValue
  const edited = applyCorrection(base.json, row.field, value)
  const at = new Date(now).toISOString()
  const factSheet: FactSheet = { ...edited, revision: base.revision + 1, confirmedAt: at }
  const source = getDb().select().from(versions).where(eq(versions.id, sourceId)).get()
  if (!source) throw Errors.notFound('版本')

  const claimed = getDb()
    .update(corrections)
    .set({ status: 'processing', processingAt: at })
    .where(and(eq(corrections.id, id), eq(corrections.status, 'pending')))
    .run()
  if (claimed.changes !== 1) return settled(findCorrection(id))

  let renamed = false
  let staged: Awaited<ReturnType<typeof rerenderWithFacts>> | undefined
  try {
    staged = await rerenderWithFacts({
      projectId: project.id,
      slug: project.slug,
      source,
      factSheet,
      correctedPath: row.field,
      // Unique per claim: a claim that expired while its render still runs never shares files.
      stagingKey: attemptKey(id, at),
      render: opts.render,
    })
    const done = staged
    const event: PublicationEvent = getDb().transaction(
      (tx) => {
        const mine = tx
          .select({ id: corrections.id })
          .from(corrections)
          .where(
            and(
              eq(corrections.id, id),
              eq(corrections.status, 'processing'),
              eq(corrections.processingAt, at),
            ),
          )
          .get()
        if (!mine) throw new ApiError(409, 'processing', '正在处理，请稍候')
        const head = tx
          .select({ revision: factSheets.revision })
          .from(factSheets)
          .where(eq(factSheets.projectId, project.id))
          .orderBy(desc(factSheets.revision))
          .limit(1)
          .get()
        const live = tx.select().from(projects).where(eq(projects.id, project.id)).get()
        if (
          head?.revision !== base.revision ||
          !live ||
          live.deletedAt !== null ||
          live.unpublishedAt !== null ||
          live.publishedVersionId !== sourceId
        ) {
          throw Errors.conflict('页面或商品信息刚刚有变化，请刷新后再试')
        }
        tx.insert(factSheets)
          .values({
            projectId: project.id,
            revision: factSheet.revision,
            json: factSheet,
            confirmedAt: at,
            createdAt: at,
          })
          .run()
        tx.insert(versions)
          .values({
            id: done.versionId,
            projectId: project.id,
            jobId: null,
            origin: 'correction',
            ...done.content,
            htmlPath: versionHtmlPath(project.id, done.versionId),
            qa: { passed: true, issues: [], screenshots: [] },
            createdAt: at,
          })
          .run()
        fs.renameSync(done.staging, done.finalDir)
        renamed = true
        opts.inTransaction?.()
        const { event } = publishVersionTx(tx, project.id, done.versionId)
        tx.update(corrections)
          .set({
            status: 'accepted',
            resultRevision: factSheet.revision,
            resolvedAt: at,
            processingAt: null,
          })
          .where(eq(corrections.id, id))
          .run()
        return event
      },
      { behavior: 'immediate' },
    )
    logPublication(event)
    return { status: 'accepted', resultRevision: factSheet.revision }
  } catch (err) {
    if (staged) {
      if (renamed) fs.rmSync(staged.finalDir, { recursive: true, force: true })
      fs.rmSync(staged.staging, { recursive: true, force: true })
    }
    getDb()
      .update(corrections)
      .set({ status: 'pending', processingAt: null })
      .where(
        and(
          eq(corrections.id, id),
          eq(corrections.status, 'processing'),
          eq(corrections.processingAt, at),
        ),
      )
      .run()
    throw err
  }
}

export function rejectCorrection(id: string, now: number = Date.now()): void {
  recoverStaleClaims(now)
  findCorrection(id)
  const done = getDb()
    .update(corrections)
    .set({ status: 'rejected', resolvedAt: new Date(now).toISOString() })
    .where(and(eq(corrections.id, id), eq(corrections.status, 'pending')))
    .run()
  if (done.changes === 1) return
  const row = findCorrection(id)
  if (row.status === 'rejected') return
  if (row.status === 'accepted') throw new ApiError(409, 'accepted', '这条纠错已经采纳，不能再忽略')
  throw new ApiError(409, 'processing', '正在处理，请稍候')
}
