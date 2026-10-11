// Code form of docs/CONTRACT.md section 5 (+ R3, R5, R7, R8). All timestamps are ISO 8601 UTC strings.
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'
import type {
  CopyDraft,
  CopyRefs,
  DesignSpec,
  FactSheet,
  GuardResult,
  JobStatus,
  QaReport,
} from '../core/schemas'

export const PROJECT_TYPES = ['single', 'menu'] as const
export const ASSET_KINDS = ['image', 'text'] as const
export const VERSION_ORIGINS = ['generate', 'correction'] as const
export const VISIT_SOURCES = ['qr', 'link'] as const
export const VISIT_ACTIONS = ['view', 'call', 'wechat_copy', 'navigate'] as const
export const CORRECTION_STATUSES = [
  'pending',
  'processing',
  'accepted',
  'rejected',
  'spam',
] as const
export const JOB_STATUSES = [
  'queued',
  'designing',
  'writing',
  'guarding',
  'rendering',
  'checking',
  'succeeded',
  'failed',
  'timed_out',
] as const satisfies readonly JobStatus[]

/** DB-level CHECK so values outside the contract enum can never be stored. */
function oneOf(name: string, column: AnySQLiteColumn, values: readonly string[]) {
  return check(name, sql`${column} IN (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`)
}

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    type: text('type', { enum: PROJECT_TYPES }).notNull(),
    title: text('title').notNull(),
    publishedVersionId: text('published_version_id'),
    unpublishedAt: text('unpublished_at'),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [oneOf('projects_type_check', t.type, PROJECT_TYPES)],
)

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    kind: text('kind', { enum: ASSET_KINDS }).notNull(),
    // Image-only columns are nullable because text assets carry no file.
    path: text('path'),
    width: integer('width'),
    height: integer('height'),
    sha256: text('sha256'),
    bytes: integer('bytes'),
    text: text('text'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('assets_project_idx').on(t.projectId),
    oneOf('assets_kind_check', t.kind, ASSET_KINDS),
  ],
)

export const factSheets = sqliteTable(
  'fact_sheets',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    revision: integer('revision').notNull(),
    json: text('json', { mode: 'json' }).$type<FactSheet>().notNull(),
    confirmedAt: text('confirmed_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.revision] })],
)

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    factRevision: integer('fact_revision').notNull(),
    status: text('status', { enum: JOB_STATUSES }).notNull(),
    stage: text('stage').notNull(),
    seed: integer('seed').notNull(),
    error: text('error'),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('jobs_project_idx').on(t.projectId),
    oneOf('jobs_status_check', t.status, JOB_STATUSES),
    // R3: at most one non-terminal job per project.
    uniqueIndex('jobs_one_active_per_project')
      .on(t.projectId)
      .where(sql`status NOT IN ('succeeded','failed','timed_out')`),
  ],
)

export const versions = sqliteTable(
  'versions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    jobId: text('job_id').references(() => jobs.id),
    origin: text('origin', { enum: VERSION_ORIGINS }).notNull(),
    factRevision: integer('fact_revision').notNull(),
    designSpec: text('design_spec', { mode: 'json' }).$type<DesignSpec>().notNull(),
    copy: text('copy', { mode: 'json' }).$type<CopyDraft>().notNull(),
    copyRefs: text('copy_refs', { mode: 'json' }).$type<CopyRefs>().notNull(),
    guard: text('guard', { mode: 'json' }).$type<GuardResult>().notNull(),
    htmlPath: text('html_path').notNull(),
    qa: text('qa', { mode: 'json' }).$type<QaReport>(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('versions_project_idx').on(t.projectId),
    oneOf('versions_origin_check', t.origin, VERSION_ORIGINS),
  ],
)

export const usageRecords = sqliteTable(
  'usage_records',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id').references(() => jobs.id),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    stage: text('stage').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    costCny: real('cost_cny').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('usage_job_idx').on(t.jobId), index('usage_project_idx').on(t.projectId)],
)

export const visitEvents = sqliteTable(
  'visit_events',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    versionId: text('version_id')
      .notNull()
      .references(() => versions.id),
    source: text('source', { enum: VISIT_SOURCES }).notNull(),
    action: text('action', { enum: VISIT_ACTIONS }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('visit_project_created_idx').on(t.projectId, t.createdAt),
    oneOf('visit_source_check', t.source, VISIT_SOURCES),
    oneOf('visit_action_check', t.action, VISIT_ACTIONS),
  ],
)

// Holds no customer identity of any kind (contract section 5).
export const corrections = sqliteTable(
  'corrections',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    versionId: text('version_id')
      .notNull()
      .references(() => versions.id),
    field: text('field').notNull(),
    suggestedValue: text('suggested_value').notNull(),
    note: text('note'),
    status: text('status', { enum: CORRECTION_STATUSES }).notNull(),
    resultRevision: integer('result_revision'),
    createdAt: text('created_at').notNull(),
    resolvedAt: text('resolved_at'),
    processingAt: text('processing_at'),
  },
  (t) => [
    index('corrections_project_status_idx').on(t.projectId, t.status),
    oneOf('corrections_status_check', t.status, CORRECTION_STATUSES),
    check('corrections_suggested_value_len', sql`length(${t.suggestedValue}) <= 100`),
    check('corrections_note_len', sql`${t.note} IS NULL OR length(${t.note}) <= 200`),
  ],
)

export type ProjectRow = typeof projects.$inferSelect
export type AssetRow = typeof assets.$inferSelect
export type FactSheetRow = typeof factSheets.$inferSelect
export type JobRow = typeof jobs.$inferSelect
export type VersionRow = typeof versions.$inferSelect
export type UsageRecordRow = typeof usageRecords.$inferSelect
export type VisitEventRow = typeof visitEvents.$inferSelect
export type CorrectionRow = typeof corrections.$inferSelect
