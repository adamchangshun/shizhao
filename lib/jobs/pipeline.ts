// One generation job: designing → writing → guarding → rendering → checking → succeeded.
// Every status change goes through transitionJob() (conditional on the expected status), every
// stage runs under its own AbortController tied to the stage and total deadlines, and the version
// row, the succeeded transition and the version directory are committed together at the end.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { assetAbsPath, listProjectAssets } from '../assets'
import { generateCopy, guardCopy } from '../copy'
import { newId } from '../core/ids'
import { PIPELINE } from '../core/job-state'
import type { FactSheet, JobStatus } from '../core/schemas'
import { generateDesign } from '../design'
import { getDb } from '../db/client'
import { findFactSheet } from '../db/repo/fact-sheets'
import {
  beginJobRun,
  findJob,
  recordStageStart,
  restartJobClock,
  transitionJob,
} from '../db/repo/jobs'
import { findActiveProject } from '../db/repo/projects'
import { insertVersion, listRecentDesignSpecs } from '../db/repo/versions'
import type { JobRow, VersionRow } from '../db/schema'
import { getEnv } from '../env'
import { getProvider, recordUsage, type LLMProvider } from '../providers'
import { renderPage, type MediaRef } from '../render'
import { checkPage } from './check'
import { removeStaging, stagingDir, versionDir, versionHtmlPath } from './files'
import { STAGE_FAILURE, TIMEOUT_MESSAGE, type Stage } from './stages'

export interface PipelineDeps {
  /** Model provider; defaults to getProvider() for each job. */
  provider?: LLMProvider
  /** Renderer; defaults to renderPage (tests wrap it). */
  render?: typeof renderPage
  stageTimeoutMs?: number
  totalTimeoutMs?: number
}

/** A failure whose merchant-facing message is already known. */
class StageFailure extends Error {
  constructor(
    readonly userMessage: string,
    options?: { cause?: unknown },
  ) {
    super(userMessage, options)
    this.name = 'StageFailure'
  }
}

/** A stage or the whole job ran out of time. */
class JobTimeout extends Error {
  constructor() {
    super('job deadline exceeded')
    this.name = 'JobTimeout'
  }
}

/** Another writer moved the job (e.g. it is no longer in the expected status): stop silently. */
class Superseded extends Error {
  constructor() {
    super('job status changed elsewhere')
    this.name = 'Superseded'
  }
}

const IMAGE_MISSING = '商品图片缺失，请重新上传图片或修改商品信息后再生成'
const FACTS_UNAVAILABLE = '商品信息还没有确认，请先确认后再生成'
const GENERIC_FAILURE = '生成失败，请稍后重试'

/** Resolves with `work`'s result, or rejects with JobTimeout as soon as `signal` aborts. */
async function underDeadline<T>(signal: AbortSignal, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (signal.aborted) throw new JobTimeout()
  let onAbort = (): void => {}
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new JobTimeout())
    signal.addEventListener('abort', onAbort, { once: true })
  })
  const running = work(signal)
  // A late result or error after the deadline is irrelevant; keep it from going unhandled.
  running.catch(() => {})
  try {
    return await Promise.race([running, aborted])
  } catch (err) {
    if (signal.aborted) throw new JobTimeout()
    throw err
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

function order(status: JobStatus): number {
  return PIPELINE.indexOf(status)
}

export async function runJob(jobId: string, deps: PipelineDeps = {}): Promise<void> {
  const env = getEnv()
  const stageMs = deps.stageTimeoutMs ?? env.JOB_STAGE_TIMEOUT_MS
  const totalMs = deps.totalTimeoutMs ?? env.JOB_TOTAL_TIMEOUT_MS
  const job = findJob(jobId)
  if (!job || !PIPELINE.includes(job.status) || job.status === 'succeeded') return
  // A job found past `queued` was interrupted by a restart: it reruns from the start, and
  // transitions only once it gets past the stage it had reached.
  const resumed = job.status !== 'queued'
  let current: JobStatus = job.status

  const advance = (next: Stage): void => {
    if (order(current) >= order(next)) return
    if (!transitionJob(jobId, current, next)) throw new Superseded()
    current = next
    const at = new Date().toISOString()
    if (next === 'designing') beginJobRun(jobId, at)
    else if (!resumed) recordStageStart(jobId, next, at)
  }

  const total = new AbortController()
  let totalTimer: NodeJS.Timeout | undefined
  const armTotal = (startedAt: string): void => {
    const left = totalMs - (Date.now() - Date.parse(startedAt))
    totalTimer = setTimeout(() => total.abort(), Math.max(0, left))
  }

  const stage = async <T>(name: Stage, work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    advance(name)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), stageMs)
    try {
      return await underDeadline(AbortSignal.any([ctrl.signal, total.signal]), work)
    } catch (err) {
      if (err instanceof JobTimeout || err instanceof StageFailure || err instanceof Superseded) throw err
      throw new StageFailure(STAGE_FAILURE[name], { cause: err })
    } finally {
      clearTimeout(timer)
      ctrl.abort() // tell anything still running for this stage to stop
    }
  }

  try {
    const project = findActiveProject(job.projectId)
    const sheet = findFactSheet(job.projectId, job.factRevision)
    if (!project || !sheet || sheet.confirmedAt === null) throw new StageFailure(FACTS_UNAVAILABLE)
    const factSheet: FactSheet = sheet.json

    if (resumed) {
      // The rerun starts over, so it gets a full total budget, not what the old run left.
      const at = new Date().toISOString()
      if (!restartJobClock(jobId, current, at)) throw new Superseded()
      armTotal(at)
    }
    advance('designing')
    if (!resumed) armTotal(findJob(jobId)?.startedAt ?? new Date().toISOString())
    const provider = deps.provider
    const resolveProvider = (): LLMProvider => provider ?? getProvider()

    const design = await stage('designing', async (signal) => {
      const result = await generateDesign(
        {
          factSheet,
          previousSpecs: listRecentDesignSpecs(job.projectId, 3),
          seed: job.seed,
        },
        { provider: resolveProvider(), signal },
      )
      for (const usage of result.usage) {
        recordUsage(getDb(), usage, { projectId: job.projectId, jobId })
      }
      return result.spec
    })

    const draft = await stage('writing', (signal) =>
      generateCopy({ factSheet, design }, { provider: resolveProvider(), jobId, signal }),
    )

    // guardCopy bounds its own model calls (judge ×2 + rewrite ×1); nothing is added here.
    const { copyRefs, ...guard } = await stage('guarding', (signal) =>
      guardCopy({ copy: draft, factSheet }, { provider: resolveProvider(), jobId, signal }),
    )

    const versionId = newId()
    const staging = stagingDir(job.projectId, jobId)
    const media = await stage('rendering', async (signal) => {
      const result = await (deps.render ?? renderPage)({
        factSheet,
        design,
        copy: guard.copy,
        versionId,
        slug: project.slug,
        trackingBase: '/api/track',
        pageUrl: `${env.PUBLIC_BASE_URL}/p/${project.slug}/`,
      })
      await writeStaging(job, staging, result.html, result.media, signal)
      return result.media
    })

    await stage('checking', async () => {
      const html = await fsp.readFile(path.join(staging, 'index.html'), 'utf8')
      await checkPage(html, factSheet, path.join(staging, 'media'), media)
    })

    if (total.signal.aborted) throw new JobTimeout()
    commit(job, versionId, staging, {
      factRevision: job.factRevision,
      designSpec: design,
      copy: guard.copy,
      copyRefs,
      guard,
    })
  } catch (err) {
    if (err instanceof Superseded) return
    const timedOut = err instanceof JobTimeout
    const message = timedOut ? TIMEOUT_MESSAGE : err instanceof StageFailure ? err.userMessage : GENERIC_FAILURE
    // Technical detail (including any provider/upstream cause) stays in the server log.
    console.error(`[jobs] job ${jobId} ${timedOut ? 'timed out' : 'failed'} in ${current}`, err)
    transitionJob(jobId, current, timedOut ? 'timed_out' : 'failed', { stage: current, error: message })
  } finally {
    clearTimeout(totalTimer)
    total.abort()
    await removeStaging(job.projectId, jobId).catch((err: unknown) => {
      console.error(`[jobs] could not remove staging dir of job ${jobId}`, err)
    })
  }
}

async function writeStaging(
  job: JobRow,
  staging: string,
  html: string,
  media: readonly MediaRef[],
  signal: AbortSignal,
): Promise<void> {
  // A render that returns after the deadline must not create files: runJob's cleanup has
  // already run by then, so a late writer removes whatever it wrote itself.
  const checkDeadline = async (): Promise<void> => {
    if (!signal.aborted) return
    await fsp.rm(staging, { recursive: true, force: true })
    throw new JobTimeout()
  }
  if (signal.aborted) throw new JobTimeout()
  const own = new Set(
    listProjectAssets(job.projectId)
      .filter((a) => a.kind === 'image')
      .map((a) => a.id),
  )
  await fsp.rm(staging, { recursive: true, force: true })
  await fsp.mkdir(path.join(staging, 'media'), { recursive: true })
  for (const ref of media) {
    await checkDeadline()
    if (!own.has(ref.assetId)) throw new StageFailure(IMAGE_MISSING)
    try {
      await fsp.copyFile(
        assetAbsPath(job.projectId, ref.assetId, ref.size),
        path.join(staging, 'media', ref.file),
      )
    } catch (err) {
      throw new StageFailure(IMAGE_MISSING, { cause: err })
    }
  }
  await checkDeadline()
  await fsp.writeFile(path.join(staging, 'index.html'), html, 'utf8')
  await checkDeadline()
}

type VersionContent = Pick<VersionRow, 'factRevision' | 'designSpec' | 'copy' | 'copyRefs' | 'guard'>

/**
 * checking → succeeded, the version row and the version directory, all or nothing: the rename
 * runs inside the transaction, so a failed rename rolls the row back, and a failed commit
 * removes the directory again.
 */
function commit(job: JobRow, versionId: string, staging: string, content: VersionContent): void {
  const finalDir = versionDir(job.projectId, versionId)
  let renamed = false
  try {
    const won = getDb().transaction(
      () => {
        if (!transitionJob(job.id, 'checking', 'succeeded')) return false
        insertVersion({
          id: versionId,
          projectId: job.projectId,
          jobId: job.id,
          origin: 'generate',
          ...content,
          htmlPath: versionHtmlPath(job.projectId, versionId),
          qa: { passed: true, issues: [], screenshots: [] },
          createdAt: new Date().toISOString(),
        })
        fs.renameSync(staging, finalDir)
        renamed = true
        return true
      },
      { behavior: 'immediate' },
    )
    if (!won) throw new Superseded()
  } catch (err) {
    if (renamed) fs.rmSync(finalDir, { recursive: true, force: true })
    throw err
  }
}
