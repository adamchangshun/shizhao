import { FactSheet, type CopyDraft, type CopyRefs } from '../core/schemas'
import { computeDocumentRefs, type FactCorpus } from '../../packages/fact-guard/src/index'

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
      entries.push(
        [`${prefix}.price`, `${amount}元`],
        [`${prefix}.price`, `¥${amount}`],
        [`${prefix}.price`, item.price.unit],
      )
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

export function copyFields(copy: CopyDraft): Record<string, string> {
  return Object.fromEntries([
    ['headline', copy.headline],
    ['subhead', copy.subhead],
    ...Object.entries(copy.itemBlurbs).map(([id, blurb]) => [`itemBlurbs.${id}`, blurb]),
    ['closing', copy.closing],
  ])
}

/** Uses literal source occurrences, including formatted price aliases, in final copy only. */
export function computeCopyRefs(copy: CopyDraft, factSheet: FactSheet): CopyRefs {
  return computeDocumentRefs(copyFields(copy), buildFactCorpus(factSheet))
}
