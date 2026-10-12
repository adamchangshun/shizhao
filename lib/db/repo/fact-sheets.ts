import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import type { FactSheet } from '../../core/schemas'
import { getDb } from '../client'
import { factSheets, type FactSheetRow } from '../schema'

export function findLatestFactSheet(projectId: string): FactSheetRow | undefined {
  return getDb()
    .select()
    .from(factSheets)
    .where(eq(factSheets.projectId, projectId))
    .orderBy(desc(factSheets.revision))
    .limit(1)
    .get()
}

export function findFactSheet(projectId: string, revision: number): FactSheetRow | undefined {
  return getDb()
    .select()
    .from(factSheets)
    .where(and(eq(factSheets.projectId, projectId), eq(factSheets.revision, revision)))
    .get()
}

export function findLatestConfirmedFactSheet(projectId: string): FactSheetRow | undefined {
  return getDb()
    .select()
    .from(factSheets)
    .where(and(eq(factSheets.projectId, projectId), isNotNull(factSheets.confirmedAt)))
    .orderBy(desc(factSheets.revision))
    .limit(1)
    .get()
}

/**
 * Appends the next revision. Reading the latest row and inserting latest+1 happen in one
 * IMMEDIATE transaction, so concurrent saves are serialized and never reuse a revision number;
 * `build` sees exactly the revision it is based on.
 */
export function appendFactSheet(
  projectId: string,
  build: (previous: FactSheetRow | undefined, revision: number) => FactSheet,
): FactSheetRow {
  return getDb().transaction(
    (tx) => {
      const previous = tx
        .select()
        .from(factSheets)
        .where(eq(factSheets.projectId, projectId))
        .orderBy(desc(factSheets.revision))
        .limit(1)
        .get()
      const revision = (previous?.revision ?? 0) + 1
      const sheet = build(previous, revision)
      const row: FactSheetRow = {
        projectId,
        revision,
        json: sheet,
        confirmedAt: sheet.confirmedAt,
        createdAt: new Date().toISOString(),
      }
      tx.insert(factSheets).values(row).run()
      return row
    },
    { behavior: 'immediate' },
  )
}

/**
 * Confirms the latest revision. Already confirmed: returned unchanged. The conditional update
 * (confirmed_at IS NULL) keeps the first confirmation time under concurrent requests.
 */
export function confirmLatestFactSheet(
  projectId: string,
  now: string = new Date().toISOString(),
): FactSheetRow | undefined {
  return getDb().transaction(
    (tx) => {
      const latest = tx
        .select()
        .from(factSheets)
        .where(eq(factSheets.projectId, projectId))
        .orderBy(desc(factSheets.revision))
        .limit(1)
        .get()
      if (!latest || latest.confirmedAt !== null) return latest
      const json: FactSheet = { ...latest.json, confirmedAt: now }
      tx.update(factSheets)
        .set({ confirmedAt: now, json })
        .where(
          and(
            eq(factSheets.projectId, projectId),
            eq(factSheets.revision, latest.revision),
            isNull(factSheets.confirmedAt),
          ),
        )
        .run()
      return { ...latest, confirmedAt: now, json }
    },
    { behavior: 'immediate' },
  )
}
