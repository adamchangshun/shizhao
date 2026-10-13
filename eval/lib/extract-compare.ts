// Experiment 1: field-level comparison of an extracted FactSheet against the gold sheet.
// Items are matched by name (whitespace removed, exact); price and spec are only credited on
// matched items. Shop phone compares digits, address compares text without whitespace.
import { normalizePhone } from './page-facts'
import type { GoldSheet } from './samples'

export const EXTRACT_FIELDS = ['name', 'price', 'spec', 'phone', 'address'] as const
export type ExtractField = (typeof EXTRACT_FIELDS)[number]

export interface FieldCount {
  gold: number
  predicted: number
  correct: number
}

export interface FieldDiff {
  field: ExtractField
  item?: string
  gold: string | null
  predicted: string | null
}

export interface ExtractionComparison {
  counts: Record<ExtractField, FieldCount>
  diffs: FieldDiff[]
}

type Sheet = Pick<GoldSheet, 'shop' | 'items'>
const compact = (text: string): string => text.normalize('NFKC').replace(/\s+/g, '')
const priceText = (p: { amount: number } | undefined): string | null =>
  p ? String(p.amount) : null
const cents = (amount: number): number => Math.round(amount * 100)

function shopField(
  field: 'phone' | 'address',
  gold: string | undefined,
  predicted: string | undefined,
  norm: (s: string) => string,
  diffs: FieldDiff[],
): FieldCount {
  const correct = gold !== undefined && predicted !== undefined && norm(gold) === norm(predicted)
  if (!correct && (gold !== undefined || predicted !== undefined)) {
    diffs.push({ field, gold: gold ?? null, predicted: predicted ?? null })
  }
  return { gold: gold ? 1 : 0, predicted: predicted ? 1 : 0, correct: correct ? 1 : 0 }
}

export function compareExtraction(gold: Sheet, extracted: Sheet): ExtractionComparison {
  const diffs: FieldDiff[] = []
  const unmatched = [...extracted.items]
  const pairs: Array<[Sheet['items'][number], Sheet['items'][number]]> = []
  for (const g of gold.items) {
    const i = unmatched.findIndex((e) => compact(e.name) === compact(g.name))
    if (i === -1) {
      diffs.push({ field: 'name', gold: g.name, predicted: null })
      continue
    }
    pairs.push([g, unmatched[i]!])
    unmatched.splice(i, 1)
  }
  for (const e of unmatched) diffs.push({ field: 'name', gold: null, predicted: e.name })

  let priceCorrect = 0
  let specCorrect = 0
  for (const [g, e] of pairs) {
    if (g.price && e.price && cents(g.price.amount) === cents(e.price.amount)) priceCorrect++
    else if (g.price || e.price) {
      diffs.push({
        field: 'price',
        item: g.name,
        gold: priceText(g.price),
        predicted: priceText(e.price),
      })
    }
    if (g.spec && e.spec && compact(g.spec) === compact(e.spec)) specCorrect++
    else if (g.spec || e.spec) {
      diffs.push({ field: 'spec', item: g.name, gold: g.spec ?? null, predicted: e.spec ?? null })
    }
  }
  const count = (items: Sheet['items'], has: (i: Sheet['items'][number]) => boolean): number =>
    items.filter(has).length

  const phone = shopField('phone', gold.shop.phone, extracted.shop.phone, normalizePhone, diffs)
  const address = shopField('address', gold.shop.address, extracted.shop.address, compact, diffs)
  return {
    counts: {
      name: { gold: gold.items.length, predicted: extracted.items.length, correct: pairs.length },
      price: {
        gold: count(gold.items, (i) => !!i.price),
        predicted: count(extracted.items, (i) => !!i.price),
        correct: priceCorrect,
      },
      spec: {
        gold: count(gold.items, (i) => !!i.spec),
        predicted: count(extracted.items, (i) => !!i.spec),
        correct: specCorrect,
      },
      phone,
      address,
    },
    diffs,
  }
}

export interface FieldScore extends FieldCount {
  /** correct / predicted; null when nothing was predicted. */
  precision: number | null
  /** correct / gold; null when the gold sheets have no such field. */
  recall: number | null
}

/** Micro-averaged precision and recall over all samples. */
export function sumFieldCounts(
  all: Array<Record<ExtractField, FieldCount>>,
): Record<ExtractField, FieldScore> {
  const out = {} as Record<ExtractField, FieldScore>
  for (const field of EXTRACT_FIELDS) {
    const sum = all.reduce(
      (acc, c) => ({
        gold: acc.gold + c[field].gold,
        predicted: acc.predicted + c[field].predicted,
        correct: acc.correct + c[field].correct,
      }),
      { gold: 0, predicted: 0, correct: 0 },
    )
    out[field] = {
      ...sum,
      precision: sum.predicted === 0 ? null : sum.correct / sum.predicted,
      recall: sum.gold === 0 ? null : sum.correct / sum.gold,
    }
  }
  return out
}
