// Which facts a customer can point at. The public page's form options and the submission API
// both come from this one function, so a submitted `field` is valid exactly when the page
// offered it for that version's facts.
import type { FactItem, FactSheet } from '../core/schemas'
import { formatPriceAmount } from '../render/format'

export const OTHER_FIELD = 'other'

export interface CorrectionOption {
  /** Fact path (contract section 5), e.g. `items.<id>.price`, `shop.hours`, or `other`. */
  path: string
  label: string
  /** Contact fields: the customer only reports "may be wrong", never types a value. */
  noValue: boolean
}

const SHOP_FIELDS = [
  ['name', '店名', false],
  ['phone', '电话联系不上或有误', true],
  ['wechat', '微信联系不上或有误', true],
  ['address', '地址', false],
  ['hours', '营业时间', false],
] as const

const ITEM_FIELDS = [
  ['name', '名称'],
  ['price', '价格'],
  ['spec', '规格'],
  ['description', '介绍'],
] as const

export type ItemField = (typeof ITEM_FIELDS)[number][0]
export type ShopField = (typeof SHOP_FIELDS)[number][0]

export function correctionOptions(sheet: FactSheet): CorrectionOption[] {
  const out: CorrectionOption[] = []
  for (const item of sheet.items) {
    for (const [field, name] of ITEM_FIELDS) {
      if (item[field] === undefined) continue
      out.push({
        path: `items.${item.id}.${field}`,
        label: `${item.name} · ${name}`,
        noValue: false,
      })
    }
  }
  for (const [field, label, noValue] of SHOP_FIELDS) {
    if (!sheet.shop[field]) continue
    out.push({ path: `shop.${field}`, label: field === 'name' ? '店名' : label, noValue })
  }
  out.push({ path: OTHER_FIELD, label: '其他', noValue: false })
  return out
}

export function findOption(sheet: FactSheet, path: string): CorrectionOption | undefined {
  return correctionOptions(sheet).find((o) => o.path === path)
}

export type ParsedPath =
  | { kind: 'shop'; field: ShopField }
  | { kind: 'item'; itemId: string; field: ItemField }
  | { kind: 'other' }

/** Splits a stored path; the item id is taken whole (ids never contain dots). */
export function parsePath(path: string): ParsedPath | null {
  if (path === OTHER_FIELD) return { kind: 'other' }
  const shop = /^shop\.(name|phone|wechat|address|hours)$/.exec(path)
  if (shop) return { kind: 'shop', field: shop[1] as ShopField }
  const item = /^items\.([A-Za-z0-9_-]{1,32})\.(name|price|spec|description)$/.exec(path)
  if (item) return { kind: 'item', itemId: item[1]!, field: item[2] as ItemField }
  return null
}

function itemValue(item: FactItem, field: ItemField): string | undefined {
  if (field === 'price') {
    if (!item.price) return undefined
    const amount = formatPriceAmount(item.price)
    return item.price.unit ? `${amount}/${item.price.unit}` : amount
  }
  return item[field]
}

/** The fact's display value in `sheet`, or undefined when the fact is gone or unset. */
export function currentValue(sheet: FactSheet, path: string): string | undefined {
  const parsed = parsePath(path)
  if (!parsed || parsed.kind === 'other') return undefined
  if (parsed.kind === 'shop') return sheet.shop[parsed.field]
  const item = sheet.items.find((i) => i.id === parsed.itemId)
  return item ? itemValue(item, parsed.field) : undefined
}

/** Merchant-facing label; falls back gracefully when the item has since been removed. */
export function pathLabel(sheet: FactSheet, path: string): string {
  const option = findOption(sheet, path)
  if (option) return option.noValue ? (path === 'shop.phone' ? '电话' : '微信') : option.label
  const parsed = parsePath(path)
  if (parsed?.kind === 'item') {
    const name = ITEM_FIELDS.find(([f]) => f === parsed.field)?.[1] ?? ''
    return `已删除的商品 · ${name}`
  }
  if (parsed?.kind === 'shop')
    return SHOP_FIELDS.find(([f]) => f === parsed.field)?.[1] ?? '店铺信息'
  return '其他'
}
