import { FactSheet, type CopyDraft, type CopyRefs } from '../core/schemas'
import {
  computeDocumentRefs,
  normalizeText,
  type FactCorpus,
  type Rule,
} from '../../packages/fact-guard/src/index'

export interface CopyCorpus extends FactCorpus {
  shopName?: string
}

/** Keep text/path pairs together, so formatted aliases still reference their original field. */
export function buildFactCorpus(input: FactSheet): CopyCorpus {
  const sheet = FactSheet.parse(input)
  const entries: Array<[string, string]> = [['shop.name', sheet.shop.name]]
  const spanEntries: Array<[string, string]> = []
  if (sheet.shop.hours) spanEntries.push(['shop.hours', sheet.shop.hours])
  if (sheet.shop.address) spanEntries.push(['shop.address', sheet.shop.address])
  // The contract permits shop names up to 30 chars, but headlines only 20.
  if (sheet.shop.name.length > 20) entries.push(['shop.name', sheet.shop.name.slice(0, 20)])
  for (const item of sheet.items) {
    const prefix = `items.${item.id}`
    entries.push([`${prefix}.name`, item.name])
    if (item.spec) entries.push([`${prefix}.spec`, item.spec])
    if (item.description) entries.push([`${prefix}.description`, item.description])
    if (item.price) {
      const amount = String(item.price.amount)
      entries.push([`${prefix}.price`, `${amount}元`], [`${prefix}.price`, `¥${amount}`])
      if (item.price.unit) entries.push([`${prefix}.price`, item.price.unit])
    }
    for (const [i, tag] of item.tags.entries()) if (tag) entries.push([`${prefix}.tags.${i}`, tag])
  }
  for (const [i, claim] of sheet.extraClaims.entries())
    if (claim) entries.push([`extraClaims.${i}`, claim])
  return {
    facts: entries.map(([, text]) => text),
    paths: entries.map(([path]) => path),
    spanFacts: spanEntries.map(([, text]) => text),
    spanPaths: spanEntries.map(([path]) => path),
    shopName: sheet.shop.name,
  }
}

/**
 * Evidence for one copy field. `itemBlurbs.<id>` rests only on that item's facts plus shop facts
 * and extraClaims, so a blurb cannot borrow another item's price or spec. Other fields describe
 * the whole page and keep the full corpus. Fails closed: a blurb never rests on a fact whose path
 * is missing, so a corpus without paths gives item blurbs no ordinary facts at all.
 */
export function fieldCorpus<T extends FactCorpus>(corpus: T, field: string): T {
  if (!field.startsWith('itemBlurbs.')) return corpus
  const own = `items.${field.slice('itemBlurbs.'.length)}.`
  // Exact suffixes: with ids "a" and "a.b", "items.a.b.price" must not count as item "a".
  const usable = (path: string | undefined) =>
    path !== undefined &&
    (!path.startsWith('items.') ||
      (path.startsWith(own) &&
        /^(?:name|spec|description|price|tags\.\d+)$/.test(path.slice(own.length))))
  const kept = corpus.facts.flatMap((fact, i) => {
    const path = corpus.paths?.[i]
    return usable(path) ? [[fact, path!] as const] : []
  })
  return { ...corpus, facts: kept.map(([fact]) => fact), paths: kept.map(([, path]) => path) }
}

/**
 * Rule against an item blurb repeating another item's spec, description or tag, with or without
 * numbers. Every item's wording is a term; guards resolve support from `fieldCorpus`, so only
 * wording outside the blurb's own item, shop facts and extraClaims is a hit, and page-level
 * fields (full corpus) never hit. Item names are exempt: a blurb may compare with another item.
 * Terms match normalized text with any whitespace between characters.
 */
export function crossItemRule(corpus: FactCorpus): Rule {
  const texts = (pattern: RegExp) =>
    corpus.facts.filter((fact, i) => fact && pattern.test(corpus.paths?.[i] ?? ''))
  // A negated mention ("不加糖" next to another item's "加糖") does not repeat that item's claim.
  const patterns = new Set(
    texts(/^items\..+\.(?:spec|description|tags\.\d+)$/).flatMap((fact) => {
      const chars = [...normalizeText(fact).text.replace(/\s/gu, '')]
      if (chars.length === 0) return []
      const body = chars.map((char) => char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('\\s*')
      return [`(?<!(?:不是|并非|不含|没有|非|不|未)\\s*)${body}`]
    }),
  )
  return {
    id: 'cross-item',
    reason: 'unsupported_claim',
    patterns: [...patterns],
    whitelist: texts(/^items\..+\.name$/),
  }
}

export function copyFields(copy: CopyDraft): Record<string, string> {
  return Object.fromEntries([
    ['headline', copy.headline],
    ['subhead', copy.subhead],
    ...Object.entries(copy.itemBlurbs).map(([id, blurb]) => [`itemBlurbs.${id}`, blurb]),
    ['closing', copy.closing],
  ])
}

/**
 * Uses literal source occurrences, including formatted price aliases, in final copy only.
 * References span the whole sheet (R7), so correcting item A still prunes a blurb that quotes A.
 */
export function computeCopyRefs(copy: CopyDraft, factSheet: FactSheet): CopyRefs {
  return computeDocumentRefs(copyFields(copy), buildFactCorpus(factSheet))
}
