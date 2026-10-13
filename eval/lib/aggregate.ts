// Metric aggregation over per-page records and guard cases. Pure functions.

export const GROUPS = ['A-gold', 'A-raw', 'B-gold', 'B-e2e'] as const
export type Group = (typeof GROUPS)[number]

export interface GuardStats {
  /** Sentences the fact guard flagged in the first draft. */
  intercepted: number
  rewritten: number
  removed: number
}

export interface PageRecord {
  sampleId: string
  group: Group
  n: number
  /** False when no page came out (generation failed); page metrics are then null. */
  ok: boolean
  factErrors: number | null
  priceNameErrors: number | null
  unsupported: number | null
  costCny: number
  latencyMs: number
  guard?: GuardStats
}

export interface GroupSummary {
  attempts: number
  pages: number
  failed: number
  totalFactErrors: number
  meanFactErrors: number | null
  totalPriceNameErrors: number
  meanPriceNameErrors: number | null
  totalUnsupported: number
  meanUnsupported: number | null
  meanCostCny: number | null
  meanLatencyMs: number | null
  guard: GuardStats | null
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
const mean = (xs: number[]): number | null => (xs.length === 0 ? null : sum(xs) / xs.length)

/** Page metrics average over generated pages; cost and latency over every attempt. */
export function summarizeGroup(records: PageRecord[]): GroupSummary {
  const ok = records.filter((r) => r.ok)
  const pick = (f: (r: PageRecord) => number | null): number[] => ok.map((r) => f(r) ?? 0)
  const guarded = ok.filter((r) => r.guard)
  return {
    attempts: records.length,
    pages: ok.length,
    failed: records.length - ok.length,
    totalFactErrors: sum(pick((r) => r.factErrors)),
    meanFactErrors: mean(pick((r) => r.factErrors)),
    totalPriceNameErrors: sum(pick((r) => r.priceNameErrors)),
    meanPriceNameErrors: mean(pick((r) => r.priceNameErrors)),
    totalUnsupported: sum(pick((r) => r.unsupported)),
    meanUnsupported: mean(pick((r) => r.unsupported)),
    meanCostCny: mean(records.map((r) => r.costCny)),
    meanLatencyMs: mean(records.map((r) => r.latencyMs)),
    guard:
      guarded.length === 0
        ? null
        : {
            intercepted: sum(guarded.map((r) => r.guard!.intercepted)),
            rewritten: sum(guarded.map((r) => r.guard!.rewritten)),
            removed: sum(guarded.map((r) => r.guard!.removed)),
          },
  }
}

export interface GuardCaseOutcome {
  expect: 'block' | 'pass'
  blocked: boolean
}

export interface GuardRates {
  blockCases: number
  detected: number
  passCases: number
  falsePositives: number
  /** detected / blockCases (拦截率). */
  blockRate: number | null
  /** falsePositives / passCases (误伤率). */
  falsePositiveRate: number | null
}

export function guardRates(outcomes: GuardCaseOutcome[]): GuardRates {
  const block = outcomes.filter((o) => o.expect === 'block')
  const pass = outcomes.filter((o) => o.expect === 'pass')
  const detected = block.filter((o) => o.blocked).length
  const falsePositives = pass.filter((o) => o.blocked).length
  return {
    blockCases: block.length,
    detected,
    passCases: pass.length,
    falsePositives,
    blockRate: block.length === 0 ? null : detected / block.length,
    falsePositiveRate: pass.length === 0 ? null : falsePositives / pass.length,
  }
}

export const FULL_REVIEW_LIMIT = 60
export const REVIEW_RATIO = 0.3

/**
 * Pages for the independent review of 无依据说法: all of them up to 60 pages; above that the
 * first ceil(30%) pages (by run number) of every sample × group stratum.
 */
export function selectForReview<T extends Pick<PageRecord, 'sampleId' | 'group' | 'n'>>(
  pages: T[],
): T[] {
  if (pages.length <= FULL_REVIEW_LIMIT) return [...pages]
  const strata = new Map<string, T[]>()
  for (const p of pages) {
    const key = `${p.sampleId}\u0000${p.group}`
    strata.set(key, [...(strata.get(key) ?? []), p])
  }
  return [...strata.values()].flatMap((list) =>
    [...list].sort((a, b) => a.n - b.n).slice(0, Math.ceil(list.length * REVIEW_RATIO)),
  )
}
