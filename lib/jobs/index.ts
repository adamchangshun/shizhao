// Module 08 service functions behind the job and version routes.
import { randomInt } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { ApiError, Errors } from '../core/errors'
import type { GuardViolation, JobStatus } from '../core/schemas'
import { createJobIfIdle, findJob, listRecentStageLogs } from '../db/repo/jobs'
import { findActiveProject } from '../db/repo/projects'
import { findActiveVersion, listVersionsWithCost } from '../db/repo/versions'
import { getEnv } from '../env'
import type { StyleBrief } from '../design/brief'
import { getConfirmedFactSheet } from '../extract'
import { computeStageStats, estimateEtaSeconds, HISTORY_LIMIT } from './eta'
import { versionMediaPath } from './files'
import { isStage, stageLabel } from './stages'
import { startJobRunner } from './runner'

export { JobRunner, startJobRunner } from './runner'
export type { PipelineDeps } from './pipeline'

/**
 * POST /api/projects/:id/jobs: requires confirmed facts (409 otherwise), creates a queued job
 * unless one is already running (409), and hands it to the runner without waiting for it.
 * `brief` (already validated) is stored on the job for the designing stage.
 */
export function createGenerationJob(projectId: string, brief?: StyleBrief): { jobId: string } {
  if (!findActiveProject(projectId)) throw Errors.notFound('项目')
  let sheet
  try {
    sheet = getConfirmedFactSheet(projectId)
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      throw new ApiError(409, 'facts_not_confirmed', '请先核对并确认商品信息')
    }
    throw err
  }
  const runner = startJobRunner()
  const job = createJobIfIdle(projectId, {
    factRevision: sheet.revision,
    seed: randomInt(0, 2 ** 31 - 1),
    ...(brief ? { brief } : {}),
  })
  if (!job) {
    if (!findActiveProject(projectId)) throw Errors.notFound('项目')
    throw new ApiError(409, 'job_running', '正在生成中，请稍候')
  }
  runner.enqueue(job.id)
  return { jobId: job.id }
}

export interface JobView {
  status: JobStatus
  stage: string
  stageLabel: string
  etaSeconds: [number, number]
  startedAt: string
  error?: string
}

/** GET /api/jobs/:id. Jobs of deleted projects are not found. */
export function getJobView(jobId: string, now: number = Date.now()): JobView {
  const job = findJob(jobId)
  if (!job || !findActiveProject(job.projectId)) throw Errors.notFound('任务')
  const stageStart = isStage(job.status) ? job.stageStartedAt?.[job.status] : undefined
  const elapsed = stageStart ? now - Date.parse(stageStart) : 0
  return {
    status: job.status,
    stage: job.stage,
    stageLabel: stageLabel(job.status),
    etaSeconds: estimateEtaSeconds(
      job.status,
      elapsed,
      computeStageStats(listRecentStageLogs(HISTORY_LIMIT)),
    ),
    startedAt: job.startedAt,
    ...(job.error ? { error: job.error } : {}),
  }
}

export interface VersionSummary {
  id: string
  createdAt: string
  /** The fact revision the page was built from (the merchant must re-check older ones). */
  factRevision: number
  templateId: string
  moodKeywords: string[]
  /** Background and main colour, for the merchant UI's version thumbnails. */
  palette: { bg: string; primary: string }
  guard: {
    violations: number
    rewritten: number
    removed: number
    /** The original sentences the guard flagged, so the merchant can see what was changed. */
    flagged: Array<{ field: string; sentence: string; reason: GuardViolation['reason'] }>
  }
  costCny: number
  durationMs: number | null
}

/** GET /api/projects/:id/versions, newest first. */
export function listProjectVersions(projectId: string): VersionSummary[] {
  if (!findActiveProject(projectId)) throw Errors.notFound('项目')
  return listVersionsWithCost(projectId).map(({ version, job, costCny }) => ({
    id: version.id,
    createdAt: version.createdAt,
    factRevision: version.factRevision,
    templateId: version.designSpec.templateId,
    moodKeywords: version.designSpec.moodKeywords,
    palette: { bg: version.designSpec.palette.bg, primary: version.designSpec.palette.primary },
    guard: {
      violations: version.guard.violations.length,
      rewritten: version.guard.rewritten,
      removed: version.guard.removed,
      flagged: version.guard.violations.map(({ field, sentence, reason }) => ({
        field,
        sentence,
        reason,
      })),
    },
    costCny,
    durationMs:
      job?.finishedAt != null ? Date.parse(job.finishedAt) - Date.parse(job.startedAt) : null,
  }))
}

/** The stored HTML of a version (preview); 404 when the version or its project is gone. */
export async function readVersionHtml(versionId: string): Promise<string> {
  const version = findActiveVersion(versionId)
  if (!version) throw Errors.notFound('版本')
  const file = path.resolve(getEnv().DATA_DIR, version.htmlPath)
  try {
    return await fsp.readFile(file, 'utf8')
  } catch {
    throw Errors.notFound('版本')
  }
}

/** A media file of a version (preview images); 404 for bad names or missing files. */
export async function readVersionMedia(versionId: string, file: string): Promise<Buffer> {
  const version = findActiveVersion(versionId)
  const abs = version ? versionMediaPath(version.projectId, version.id, file) : null
  if (!abs) throw Errors.notFound('图片')
  try {
    const stat = await fsp.lstat(abs)
    if (!stat.isFile()) throw new Error('not a file')
    return await fsp.readFile(abs)
  } catch {
    throw Errors.notFound('图片')
  }
}
