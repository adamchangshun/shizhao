import { describe, expect, it } from 'vitest'
import { guardRates, selectForReview, summarizeGroup, type PageRecord } from '@/eval/lib/aggregate'

const page = (over: Partial<PageRecord>): PageRecord => ({
  sampleId: 's1',
  group: 'B-gold',
  n: 1,
  ok: true,
  factErrors: 0,
  priceNameErrors: 0,
  unsupported: 0,
  costCny: 0,
  latencyMs: 0,
  ...over,
})

describe('summarizeGroup', () => {
  it('averages page metrics over generated pages and cost/latency over all attempts', () => {
    const s = summarizeGroup([
      page({
        n: 1,
        factErrors: 3,
        priceNameErrors: 2,
        unsupported: 1,
        costCny: 0.03,
        latencyMs: 1000,
        guard: { intercepted: 2, rewritten: 1, removed: 1 },
      }),
      page({
        n: 2,
        factErrors: 0,
        priceNameErrors: 0,
        unsupported: 2,
        costCny: 0.06,
        latencyMs: 3000,
        guard: { intercepted: 1, rewritten: 0, removed: 1 },
      }),
      page({
        n: 3,
        ok: false,
        factErrors: null,
        priceNameErrors: null,
        unsupported: null,
        costCny: 0.03,
        latencyMs: 500,
      }),
    ])
    // Hand-computed: pages with output 2 → fact errors (3+0)/2 = 1.5, price/name (2+0)/2 = 1,
    // unsupported (1+2)/2 = 1.5; attempts 3 → cost 0.12/3 = 0.04, latency 4500/3 = 1500.
    expect(s).toMatchObject({
      attempts: 3,
      pages: 2,
      failed: 1,
      totalFactErrors: 3,
      meanFactErrors: 1.5,
      meanPriceNameErrors: 1,
      totalUnsupported: 3,
      meanUnsupported: 1.5,
      meanLatencyMs: 1500,
      guard: { intercepted: 3, rewritten: 1, removed: 2 },
    })
    expect(s.meanCostCny).toBeCloseTo(0.04, 10)
  })

  it('reports null means when no page was generated', () => {
    const s = summarizeGroup([
      page({ ok: false, factErrors: null, priceNameErrors: null, unsupported: null }),
    ])
    expect(s).toMatchObject({
      pages: 0,
      failed: 1,
      meanFactErrors: null,
      meanUnsupported: null,
      guard: null,
    })
  })
})

describe('guardRates', () => {
  it('computes block rate on block cases and false-positive rate on pass cases', () => {
    const r = guardRates([
      { expect: 'block', blocked: true },
      { expect: 'block', blocked: true },
      { expect: 'block', blocked: false },
      { expect: 'pass', blocked: false },
      { expect: 'pass', blocked: true },
    ])
    expect(r).toEqual({
      blockCases: 3,
      detected: 2,
      passCases: 2,
      falsePositives: 1,
      blockRate: 2 / 3,
      falsePositiveRate: 0.5,
    })
  })
})

describe('selectForReview', () => {
  it('takes every page when there are at most 60', () => {
    const pages = [page({ n: 1 }), page({ n: 2, group: 'A-gold' })]
    expect(selectForReview(pages)).toHaveLength(2)
  })

  it('takes at least 30% of each sample × group stratum above 60 pages', () => {
    const pages = [
      ...Array.from({ length: 31 }, (_, i) => page({ sampleId: 'a', group: 'A-gold', n: i + 1 })),
      ...Array.from({ length: 31 }, (_, i) => page({ sampleId: 'b', group: 'B-gold', n: i + 1 })),
    ]
    const chosen = selectForReview(pages)
    // ceil(31 × 0.3) = 10 per stratum
    expect(chosen.filter((p) => p.sampleId === 'a')).toHaveLength(10)
    expect(chosen.filter((p) => p.sampleId === 'b')).toHaveLength(10)
  })
})
