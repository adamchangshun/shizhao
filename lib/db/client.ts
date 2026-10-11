import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getEnv } from '../env'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

interface DbHandle {
  db: Db
  sqlite: Database.Database
}

// Survives Next.js dev hot reloads so we never open the file twice in one process.
const globalForDb = globalThis as unknown as { __shizhaoDb?: DbHandle }

export const MIGRATIONS_DIR = path.join(process.cwd(), 'lib', 'db', 'migrations')

/** Creates DATA_DIR and its uploads/ and pages/ subdirectories if missing. */
export function ensureDataDirs(dataDir: string = getEnv().DATA_DIR): void {
  for (const sub of ['', 'uploads', 'pages']) {
    fs.mkdirSync(path.join(dataDir, sub), { recursive: true })
  }
}

function open(dataDir: string): DbHandle {
  ensureDataDirs(dataDir)
  const sqlite = new Database(path.join(dataDir, 'db.sqlite'))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  return { db: drizzle(sqlite, { schema }), sqlite }
}

export function getDb(): Db {
  globalForDb.__shizhaoDb ??= open(getEnv().DATA_DIR)
  return globalForDb.__shizhaoDb.db
}

export function runMigrations(): void {
  migrate(getDb(), { migrationsFolder: MIGRATIONS_DIR })
}

/** Closes the singleton connection (tests and CLI scripts). */
export function closeDb(): void {
  globalForDb.__shizhaoDb?.sqlite.close()
  globalForDb.__shizhaoDb = undefined
}
