import { desc, eq } from 'drizzle-orm'
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
