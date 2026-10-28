import { FactSheet, type CopyDraft, type CopyRefs } from '../core/schemas'
import {
  computeDocumentRefs,
  normalizeText,
  splitSentences,
  type FactCorpus,
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
 * Letters and digits only, after NFKC and fact-guard folding; hits and support share it.
 * `cut[k]` marks anything but spaces and zero-width characters (punctuation, symbols, folded-away
 * interference) between `text[k - 1]` and `text[k]` in the source, so checks that need adjacency
 * can still see the boundaries the canonical text drops.
 */
interface Canonical {
  text: string
  cut: boolean[]
}
function canonical(raw: string): Canonical {
  const source = raw.normalize('NFKC')
  const folded = normalizeText(source)
  let text = '',
    last = -1,
    i = 0
  const cut: boolean[] = []
  for (const char of folded.text) {
    const start = folded.starts[i]!,
      end = folded.ends[i]!
    i += char.length
    if (!/[\p{L}\p{N}]/u.test(char)) continue
    const gap = last < 0 ? '' : source.slice(last, Math.max(last, start))
    cut.push(
      /[^\s\u200b-\u200f\u2060\ufeff]/u.test(gap),
      ...Array<boolean>(char.length - 1).fill(false),
    )
    text += char
    last = Math.max(last, end)
  }
  return { text, cut }
}
/** No boundary inside `text[from, to)`. */
function joined(form: Canonical, from: number, to: number): boolean {
  return !form.cut.slice(from + 1, to).includes(true)
}
function occurrences(text: string, word: string): number[] {
  const starts: number[] = []
  for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) starts.push(i)
  return starts
}
// A negated mention ("不加糖" next to another item's "加糖") does not repeat that item's claim.
// Only spaces and zero-width characters may separate the two: "不，燕麦奶可选" affirms it.
const negations = ['不是', '并非', '不含', '没有', '非', '不', '未']
function negated(form: Canonical, start: number): boolean {
  return negations.some(
    (word) =>
      form.text.slice(0, start).endsWith(word) && joined(form, start - word.length, start + 1),
  )
}

/**
 * The other item's wording that an `itemBlurbs.<id>` sentence repeats, or undefined. Candidates
 * are every item's spec, tags and description sentences (split like the guard splits copy);
 * support is `fieldCorpus`, so only wording outside the blurb's own item, shop facts and
 * extraClaims counts, and page-level fields never hit. Mentions inside an unbroken item name are
 * exempt: a blurb may compare with another item. Checked deterministically because the live judge does
 * not honor `evidence[i]` for this (A4 W5).
 */
export function crossItemBorrowing(
  sentence: string,
  field: string,
  corpus: FactCorpus,
): string | undefined {
  if (!field.startsWith('itemBlurbs.')) return undefined
  const own = fieldCorpus(corpus, field)
  const support = [...own.facts, ...(own.spanFacts ?? [])].map(canonical)
  const text = canonical(sentence)
  const isPath = (i: number, pattern: RegExp) => pattern.test(corpus.paths?.[i] ?? '')
  const names = corpus.facts
    .filter((fact, i) => isPath(i, /^items\..+\.name$/))
    .map((name) => canonical(name).text)
    .filter(Boolean)
  // A name counts only where it is written out unbroken: "燕麦奶可选，拿铁" is no "燕麦奶可选拿铁".
  const inName = (start: number, end: number) =>
    names.some((name) =>
      occurrences(text.text, name).some(
        (left) =>
          left <= start && end <= left + name.length && joined(text, left, left + name.length),
      ),
    )
  const affirmed = (source: Canonical, word: string, exempt?: (start: number) => boolean) =>
    occurrences(source.text, word).some((start) => !negated(source, start) && !exempt?.(start))
  for (const [i, fact] of corpus.facts.entries()) {
    if (!isPath(i, /^items\..+\.(?:spec|description|tags\.\d+)$/)) continue
    for (const piece of splitSentences(fact)) {
      const word = canonical(piece).text
      // Single characters are too common to identify another item's wording.
      if (word.length < 2 || support.some((source) => affirmed(source, word))) continue
      if (affirmed(text, word, (start) => inName(start, start + word.length)))
        return piece.replace(/[。！？；!?;\s]+$/u, '').trim()
    }
  }
  return undefined
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
