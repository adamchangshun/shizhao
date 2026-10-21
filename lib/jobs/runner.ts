// In-process job queue, concurrency 1 (module 08 §2). Deployment is a single long-running Node
// instance (contract R3); the singleton lives on globalThis so Next.js dev hot reloads, which
// re-evaluate this module, never start a second runner.
import { clearStageLog, listNonTerminalJobs, transitionJob } from '../db/repo/jobs'
import { getEnv } from '../env'
import { removeStaging } from './files'
import { runJob, type PipelineDeps } from './pipeline'
import { TIMEOUT_MESSAGE } from './stages'

export class JobRunner {
  private readonly queue: string[] = []
  private current: string | null = null
  private loop: Promise<void> | null = null

  constructor(private readonly deps: PipelineDeps = {}) {}

  enqueue(jobId: string): void {
    if (this.current === jobId || this.queue.includes(jobId)) return
    this.queue.push(jobId)
    this.loop ??= this.drain()
  }

  /** Resolves once the queue is empty and nothing is running. */
  async idle(): Promise<void> {
    while (this.loop) await this.loop
  }

  private async drain(): Promise<void> {
    try {
      for (let id = this.queue.shift(); id !== undefined; id = this.queue.shift()) {
        this.current = id
        try {
          await runJob(id, this.deps)
        } catch (err) {
          console.error(`[jobs] runner error on job ${id}`, err)
        }
      }
    } finally {
      this.current = null
      this.loop = null
    }
  }

  /**
   * Startup scan of non-terminal jobs: running ones whose `startedAt` is older than the total
   * timeout become `timed_out`; the rest are queued again (oldest first). A `queued` job never
   * started, so its clock has not begun and it is always queued again.
   */
  async recover(now: number = Date.now()): Promise<void> {
    const totalMs = this.deps.totalTimeoutMs ?? getEnv().JOB_TOTAL_TIMEOUT_MS
    const jobs = listNonTerminalJobs().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    for (const job of jobs) {
      if (job.status !== 'queued' && now - Date.parse(job.startedAt) > totalMs) {
        transitionJob(job.id, job.status, 'timed_out', {
          stage: job.status,
          error: TIMEOUT_MESSAGE,
        })
        await removeStaging(job.projectId, job.id).catch((err: unknown) => {
          console.error(`[jobs] could not remove staging dir of job ${job.id}`, err)
        })
        continue
      }
      if (job.status !== 'queued') clearStageLog(job.id)
      this.enqueue(job.id)
    }
  }
}

const globalForRunner = globalThis as unknown as { __shizhaoJobRunner?: JobRunner }

/**
 * The process-wide runner, created (and its startup recovery run) on first call. Called from
 * instrumentation at server start and defensively by the job route.
 */
export function startJobRunner(deps?: PipelineDeps): JobRunner {
  if (!globalForRunner.__shizhaoJobRunner) {
    const runner = new JobRunner(deps)
    globalForRunner.__shizhaoJobRunner = runner
    runner.recover().catch((err: unknown) => console.error('[jobs] recovery failed', err))
  }
  return globalForRunner.__shizhaoJobRunner
}

/** Test-only: forget the process-wide runner. */
export function resetJobRunnerForTests(): void {
  globalForRunner.__shizhaoJobRunner = undefined
}
