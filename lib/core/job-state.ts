import type { JobStatus } from './schemas'

export const PIPELINE: readonly JobStatus[] = [
  'queued',
  'designing',
  'writing',
  'guarding',
  'rendering',
  'checking',
  'succeeded',
]

const TERMINAL: ReadonlySet<JobStatus> = new Set<JobStatus>(['succeeded', 'failed', 'timed_out'])

export class InvalidTransitionError extends Error {
  readonly from: JobStatus
  readonly to: JobStatus

  constructor(from: JobStatus, to: JobStatus) {
    super(`Invalid job transition: ${from} -> ${to}`)
    this.name = 'InvalidTransitionError'
    this.from = from
    this.to = to
  }
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.has(status)
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (isTerminal(from)) return false
  if (to === 'failed' || to === 'timed_out') return true
  const i = PIPELINE.indexOf(from)
  return i >= 0 && PIPELINE[i + 1] === to
}

/** Returns a copy of `job` in state `next`; throws InvalidTransitionError on any illegal move. */
export function transition<T extends { status: JobStatus }>(job: T, next: JobStatus): T {
  if (!canTransition(job.status, next)) throw new InvalidTransitionError(job.status, next)
  return { ...job, status: next }
}

export type ProjectState = 'generating' | 'previewable' | 'live'

export interface ProjectStateInput {
  jobStatuses: readonly JobStatus[]
  hasSucceededVersion: boolean
  publishedVersionId: string | null
  unpublishedAt: string | null
}

/**
 * Display state derived from data (contract section 4). Checked in table order:
 * a running job wins over live. Returns null for a project with nothing to show yet
 * (no running job, no successful version).
 */
export function deriveProjectState(input: ProjectStateInput): ProjectState | null {
  if (input.jobStatuses.some((s) => !isTerminal(s))) return 'generating'
  if (input.publishedVersionId !== null && input.unpublishedAt === null) return 'live'
  if (input.hasSucceededVersion) return 'previewable'
  return null
}
