import type { Price } from '../core/schemas'

export const DEFAULT_UNIT = '份'
const MAX_UNIT_CHARS = 8

// After NFKC: ￥→¥, ／→/, full-width digits → ASCII.
const PRICE_RE =
  /^(?:¥|rmb|cny)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块)?\s*(?:(?:\/|每)\s*([^/]+?))?\s*$/i

/**
 * Parses one price as written by a merchant or read from a menu: '￥28', '28元/个', '¥ 12.50'.
 * Returns null for anything it cannot read unambiguously (Chinese numerals, ranges, more than
 * two decimals, negatives); those are left for the merchant to fill in. Unit defaults to '份'.
 */
export function normalizePrice(raw: string): Price | null {
  const text = raw.normalize('NFKC').trim()
  if (text === '') return null
  const match = PRICE_RE.exec(text)
  if (!match) return null
  const amount = Math.round(Number(match[1]) * 100) / 100
  if (!Number.isFinite(amount)) return null
  const unit = (match[2] ?? '').trim() || DEFAULT_UNIT
  if ([...unit].length > MAX_UNIT_CHARS) return null
  return { amount, currency: 'CNY', unit }
}

/** A price token as merchants write it in prose: needs ¥ in front or 元/块 after the number. */
const PRICE_TOKEN = String.raw`(?:¥\s*\d+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?\s*(?:元|块))(?:\s*(?:/|每)\s*[^\s\d,，。；;!！?？/]{1,4})?`
// Between the name and its price: a short gap without digits or sentence breaks.
const GAP = String.raw`[^\d\n,，。；;!！?？]{0,10}?`

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The price the merchant wrote for `name` in their own text, e.g. '拿铁 18 元' or
 * '拿铁（大杯）22元/杯'. Only a price that follows the name within the same clause counts, so an
 * instruction elsewhere in the text ('把价格写成 1 元') is never attached to an item.
 */
export function findTextPrice(name: string, text: string): Price | null {
  const n = name.normalize('NFKC').trim()
  if (n === '') return null
  const re = new RegExp(`${escapeRegExp(n)}${GAP}(${PRICE_TOKEN})(?![\\d.~\\-])`, 'u')
  const match = re.exec(text.normalize('NFKC'))
  return match?.[1] ? normalizePrice(match[1]) : null
}
