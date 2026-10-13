// Per-page metrics, computed by code only (no model judgement).
import { buildFactCorpus } from '../../lib/copy/facts'
import {
  checkSentence,
  defaultRules,
  mergeRules,
  rulePacks,
  splitSentences,
  type Reason,
} from '../../packages/fact-guard/src/index'
import { extractPagePrices, extractPhones, normalizePhone, replacePhones } from './page-facts'
import { asFactSheet, type GoldSheet } from './samples'

/** The rule set the pipeline guards copy with (base + food pack). */
export const EVAL_RULES = mergeRules(defaultRules, rulePacks.food)

export interface FactErrors {
  /** Price occurrences on the page whose value is no gold price. */
  fabricatedPrices: number
  /** Gold items with a price whose value appears nowhere on the page. */
  missingPrices: number
  /**
   * Gold items whose price value is on the page but never shown after the item's name, where
   * another item's gold price is shown there instead (e.g. two prices swapped). See
   * wrongPriceItems.
   */
  wrongPrices: number
  /** Gold item names absent from the page (whitespace ignored). */
  missingNames: number
  /** 1 when the gold sheet has a phone and the page does not show it. */
  missingPhone: number
  /** Distinct phone numbers on the page other than the gold phone. */
  wrongPhones: number
  priceNameErrors: number
  total: number
  details: string[]
}

const cents = (amount: number): number => Math.round(amount * 100)
const compact = (text: string): string => text.normalize('NFKC').replace(/\s+/g, '')

/** How far after an item name (whitespace removed) its own price is looked for. */
const PRICE_WINDOW = 40

/** Every occurrence of every gold item name in the (whitespace-free) page. */
function nameOccurrences(page: string, names: string[]): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  for (const name of names) {
    for (let at = page.indexOf(name); at >= 0; at = page.indexOf(name, at + 1)) {
      out.push({ start: at, end: at + name.length })
    }
  }
  return out
}

/**
 * Items whose gold price is on the page, yet no mention of the item's name is followed by it and
 * some mention is followed by another item's gold price (e.g. two prices swapped). A price
 * "follows" a name when it is the first price after it, before the next name mention and within
 * PRICE_WINDOW characters. Invented prices are left to fabricatedPrices, so nothing counts twice.
 */
function wrongPriceItems(page: string, gold: GoldSheet, pageCents: Set<number>): string[] {
  const goldCents = new Set(gold.items.flatMap((i) => (i.price ? [cents(i.price.amount)] : [])))
  const all = nameOccurrences(
    page,
    gold.items.map((i) => compact(i.name)),
  )
  const details: string[] = []
  for (const item of gold.items) {
    if (!item.price || !pageCents.has(cents(item.price.amount))) continue // counted as missing
    const own = cents(item.price.amount)
    const following: number[] = []
    for (const { end } of nameOccurrences(page, [compact(item.name)])) {
      const nextName = Math.min(
        ...all.filter((o) => o.start >= end).map((o) => o.start),
        page.length,
      )
      const price = extractPagePrices(page.slice(end, Math.min(nextName, end + PRICE_WINDOW)))[0]
      if (price !== undefined) following.push(price)
    }
    if (following.some((p) => cents(p) === own)) continue
    const swapped = following.find((p) => goldCents.has(cents(p)))
    if (swapped !== undefined) {
      details.push(`「${item.name}」旁的价格是 ${swapped}，事实表为 ${item.price.amount}`)
    }
  }
  return details
}

export function pageFactErrors(text: string, gold: GoldSheet): FactErrors {
  const details: string[] = []
  const goldCents = new Set(gold.items.flatMap((i) => (i.price ? [cents(i.price.amount)] : [])))
  const pagePrices = extractPagePrices(text)
  const pageCents = new Set(pagePrices.map(cents))

  const fabricated = pagePrices.filter((p) => !goldCents.has(cents(p)))
  for (const p of fabricated) details.push(`页面价格 ${p} 不在事实表中`)
  let missingPrices = 0
  for (const item of gold.items) {
    if (item.price && !pageCents.has(cents(item.price.amount))) {
      missingPrices++
      details.push(`缺少「${item.name}」的价格 ${item.price.amount}`)
    }
  }
  const page = compact(text)
  const wrong = wrongPriceItems(page, gold, pageCents)
  details.push(...wrong)
  let missingNames = 0
  for (const item of gold.items) {
    if (!page.includes(compact(item.name))) {
      missingNames++
      details.push(`缺少商品名「${item.name}」`)
    }
  }
  const goldPhone = gold.shop.phone ? normalizePhone(gold.shop.phone) : undefined
  const pagePhones = new Set(extractPhones(text))
  const missingPhone = goldPhone && !pagePhones.has(goldPhone) ? 1 : 0
  if (missingPhone) details.push(`缺少电话 ${gold.shop.phone}`)
  const wrongPhones = [...pagePhones].filter((p) => p !== goldPhone)
  for (const p of wrongPhones) details.push(`页面电话 ${p} 不在事实表中`)

  const priceNameErrors = fabricated.length + missingPrices + wrong.length + missingNames
  return {
    fabricatedPrices: fabricated.length,
    missingPrices,
    wrongPrices: wrong.length,
    missingNames,
    missingPhone,
    wrongPhones: wrongPhones.length,
    priceNameErrors,
    total: priceNameErrors + missingPhone + wrongPhones.length,
    details,
  }
}

/** Literal gold fact texts, removed from the page before the rule layer reads it. */
function goldTexts(gold: GoldSheet): string[] {
  const { shop } = gold
  return [
    shop.name,
    shop.phone,
    shop.wechat,
    shop.address,
    shop.hours,
    ...gold.items.flatMap((i) => [i.name, i.spec, i.description, ...i.tags]),
    ...gold.extraClaims,
  ]
    .filter((t): t is string => !!t && t.trim() !== '')
    .sort((a, b) => b.length - a.length) // longer facts first, so a name inside a claim stays intact
}

export interface ClaimHit {
  sentence: string
  reasons: Reason[]
  evidence: string[]
}

/**
 * 无依据说法 (rule layer only): the page text minus the gold fact texts, split into sentences,
 * each checked by the fact-guard rule layer with the gold fact corpus as evidence. A sentence
 * with one or more hits counts once.
 */
export function unsupportedClaims(
  text: string,
  gold: GoldSheet,
): { count: number; sentences: ClaimHit[] } {
  const goldPhone = gold.shop.phone ? normalizePhone(gold.shop.phone) : undefined
  let rest = replacePhones(text, (digits) => (digits === goldPhone ? ' ' : null))
  for (const fact of goldTexts(gold)) rest = rest.split(fact).join(' ')
  const corpus = buildFactCorpus(asFactSheet(gold))
  const sentences: ClaimHit[] = []
  for (const line of rest.split('\n')) {
    for (const raw of splitSentences(line)) {
      const sentence = raw.trim()
      if (!sentence) continue
      const hits = checkSentence(sentence, corpus, EVAL_RULES)
      if (hits.length > 0) {
        sentences.push({
          sentence,
          reasons: [...new Set(hits.map((h) => h.reason))],
          evidence: [...new Set(hits.map((h) => h.evidence))],
        })
      }
    }
  }
  return { count: sentences.length, sentences }
}
