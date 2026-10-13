import { beforeAll, describe, expect, it } from 'vitest'
import { GET as getJob } from '@/app/api/jobs/[id]/route'
import { runMigrations } from '@/lib/db/client'
import { createJobIfIdle } from '@/lib/db/repo/jobs'
import { insertProject } from '@/lib/db/repo/projects'
import type { StageLogSample } from '@/lib/db/repo/jobs'
import { computeStageStats, estimateEtaSeconds, percentile } from '@/lib/jobs/eta'

beforeAll(() => runMigrations())

const STAGE_ORDER = ['designing', 'writing', 'guarding', 'rendering', 'checking'] as const

/** One succeeded job whose five stages took the given whole seconds, back to back. */
function sample(seconds: [number, number, number, number, number], startMs = 0): StageLogSample {
  const stageStartedAt: Record<string, string> = {}
  let t = Date.UTC(2026, 9, 1) + startMs
  STAGE_ORDER.forEach((stage, i) => {
    stageStartedAt[stage] = new Date(t).toISOString()
    t += seconds[i]! * 1000
  })
  return { stageStartedAt, finishedAt: new Date(t).toISOString() }
}

// Six hand-written jobs (seconds per stage: designing, writing, guarding, rendering, checking).
const SIX: StageLogSample[] = [
  sample([10, 5, 4, 1, 1]),
  sample([12, 7, 4, 1, 1]),
  sample([9, 6, 5, 1, 2]),
  sample([15, 8, 6, 2, 2]),
  sample([11, 9, 7, 2, 2]),
  sample([30, 20, 10, 3, 4]),
]
// Sorted per stage, nearest rank: P50 = 3rd of 6, P90 = 6th of 6.
//   designing 9 10 11 12 15 30 → 11 / 30
//   writing   5 6 7 8 9 20     → 7 / 20
//   guarding  4 4 5 6 7 10     → 5 / 10
//   rendering 1 1 1 2 2 3      → 1 / 3
//   checking  1 1 2 2 2 4      → 2 / 4

describe('ETA', () => {
  it('uses nearest-rank percentiles', () => {
    expect(percentile([30, 9, 12, 10, 15, 11], 0.5)).toBe(11)
    expect(percentile([30, 9, 12, 10, 15, 11], 0.9)).toBe(30)
  })

  it('sums P50/P90 of all stages for a queued job', () => {
    // lo 11+7+5+1+2 = 26, hi 30+20+10+3+4 = 67
    expect(estimateEtaSeconds('queued', 0, computeStageStats(SIX))).toEqual([26, 67])
  })

  it('subtracts the time already spent in the current stage', () => {
    // writing, 3 s in: lo (7-3)+5+1+2 = 12, hi (20-3)+10+3+4 = 34
    expect(estimateEtaSeconds('writing', 3000, computeStageStats(SIX))).toEqual([12, 34])
  })

  it('never lets the current stage go below zero', () => {
    // writing, 25 s in: lo 0+5+1+2 = 8, hi 0+10+3+4 = 17
    expect(estimateEtaSeconds('writing', 25_000, computeStageStats(SIX))).toEqual([8, 17])
  })

  it('falls back to the default ranges with fewer than 5 samples', () => {
    // defaults: lo 8+6+6+1+1 = 22, hi 20+15+20+3+5 = 63
    expect(estimateEtaSeconds('queued', 0, computeStageStats(SIX.slice(0, 4)))).toEqual([22, 63])
    // checking only, 2 s in: lo max(0,1-2) = 0, hi 5-2 = 3
    expect(estimateEtaSeconds('checking', 2000, computeStageStats([]))).toEqual([0, 3])
  })

  it('is [0, 0] for a finished job', () => {
    expect(estimateEtaSeconds('succeeded', 0, computeStageStats(SIX))).toEqual([0, 0])
    expect(estimateEtaSeconds('failed', 0, computeStageStats(SIX))).toEqual([0, 0])
  })

  it('GET /api/jobs/:id reports a queued job with default ETA and a Chinese label', async () => {
    const projectId = insertProject({ type: 'single', title: '排队小店' }).id
    const job = createJobIfIdle(projectId, { factRevision: 1, seed: 1 })!
    const res = await getJob(
      new Request(`http://localhost:6688/api/jobs/${job.id}`, {
        headers: { authorization: 'Bearer test-admin-token-0123' },
      }),
      { params: Promise.resolve({ id: job.id }) },
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'queued',
      stage: 'queued',
      stageLabel: '排队中',
      etaSeconds: [22, 63],
      startedAt: job.startedAt,
    })
  })
})
