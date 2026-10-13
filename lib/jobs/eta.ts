// Wait-time estimate (module 08 §4). Pure functions: statistics in, seconds out.
import type { JobStatus } from '../core/schemas'
import type { StageLogSample } from '../db/repo/jobs'
import { STAGES, type Stage } from './stages'

export interface StageRange {
  p50Ms: number
  p90Ms: number
}
export type StageStats = Record<Stage, StageRange>

/** Below this many samples for a stage, its default range is used instead. */
export const MIN_SAMPLES = 5
/** Statistics come from at most this many recent succeeded jobs. */
export const HISTORY_LIMIT = 50

export const DEFAULT_STATS: StageStats = {
  designing: { p50Ms: 8_000, p90Ms: 20_000 },
  writing: { p50Ms: 6_000, p90Ms: 15_000 },
  guarding: { p50Ms: 6_000, p90Ms: 20_000 },
  rendering: { p50Ms: 1_000, p90Ms: 3_000 },
  checking: { p50Ms: 1_000, p90Ms: 5_000 },
}

/** Nearest-rank percentile: the smallest sample with at least p·n samples at or below it. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of no samples')
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil(p * sorted.length))
  return sorted[rank - 1]!
}

/** Per-stage durations of one job: from its start to the next stage's start (or finish). */
export function stageDurations(sample: StageLogSample): Partial<Record<Stage, number>> {
  const out: Partial<Record<Stage, number>> = {}
  STAGES.forEach((stage, i) => {
    const start = sample.stageStartedAt[stage]
    const next = STAGES[i + 1]
    const end = next ? sample.stageStartedAt[next] : sample.finishedAt
    if (!start || !end) return
    const ms = Date.parse(end) - Date.parse(start)
    if (Number.isFinite(ms) && ms >= 0) out[stage] = ms
  })
  return out
}

export function computeStageStats(samples: readonly StageLogSample[]): StageStats {
  const perStage = new Map<Stage, number[]>(STAGES.map((s) => [s, []]))
  for (const sample of samples.slice(0, HISTORY_LIMIT)) {
    for (const [stage, ms] of Object.entries(stageDurations(sample)) as Array<[Stage, number]>) {
      perStage.get(stage)!.push(ms)
    }
  }
  return Object.fromEntries(
    STAGES.map((stage) => {
      const values = perStage.get(stage)!
      return [
        stage,
        values.length < MIN_SAMPLES
          ? DEFAULT_STATS[stage]
          : { p50Ms: percentile(values, 0.5), p90Ms: percentile(values, 0.9) },
      ]
    }),
  ) as StageStats
}

/**
 * `[lo, hi]` seconds left: the P50 and P90 sums of the stages not yet finished, with the time
 * already spent in the current stage subtracted from that stage (never below 0). Terminal → [0, 0].
 */
export function estimateEtaSeconds(
  status: JobStatus,
  elapsedInStageMs: number,
  stats: StageStats,
): [number, number] {
  const from = status === 'queued' ? 0 : (STAGES as readonly string[]).indexOf(status)
  if (from < 0) return [0, 0]
  let lo = 0
  let hi = 0
  STAGES.slice(from).forEach((stage, i) => {
    const spent = i === 0 && status !== 'queued' ? Math.max(0, elapsedInStageMs) : 0
    lo += Math.max(0, stats[stage].p50Ms - spent)
    hi += Math.max(0, stats[stage].p90Ms - spent)
  })
  return [Math.round(lo / 1000), Math.round(hi / 1000)]
}
