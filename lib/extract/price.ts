import type { Price } from '../core/schemas'

const MAX_UNIT_CHARS = 8

// Measure words merchants put after 一 ('12 元一个', '15元一斤', '12元一朵'): counters for food and
// drinks (个份杯碗盘碟笼串), packaging (盒袋瓶罐桶壶包箱听筒卷), weight (斤两), pieces (块片条根
// 支粒枚只件张套双对打), servings (位客例) and flowers or produce (朵束把盆). With a counter not
// listed the price is still read, only without a unit (never a wrong one); the merchant can type
// it in. In prose the counter must follow 元 directly and only one character is taken, so in
// '12 元一个蛋挞' the unit is 个 and in '12元 一杯咖啡' (the next item) there is none.
const MEASURE = '个份杯碗盘碟笼串盒袋瓶罐桶壶包箱听筒卷斤两块片条根支粒枚只件张套双对打位客例朵束把盆'

// After NFKC: ￥→¥, ／→/, full-width digits → ASCII.
// At most 7 integer digits (under ten million yuan) so amounts stay exact as integer cents.
const PRICE_RE = new RegExp(
  String.raw`^(?:¥|rmb|cny)?\s*(\d{1,7})(?:\.(\d{1,2}))?\s*(?:元|块)?\s*(?:(?:\/|每)\s*([^/]+?)|一\s*([${MEASURE}]))?\s*$`,
  'i',
)

/**
 * Parses one price as written by a merchant or read from a menu: '￥28', '28元/个', '¥ 12.50'.
 * Returns null for anything it cannot read unambiguously (Chinese numerals, ranges, more than
 * two decimals, negatives); those are left for the merchant to fill in. The unit is only ever
 * the one written ('/杯', '每份', '一个'); with none written the price has no unit, never a default.
 */
export function normalizePrice(raw: string): Price | null {
  const text = raw.normalize('NFKC').trim()
  if (text === '') return null
  const match = PRICE_RE.exec(text)
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  const amount = cents / 100
  const unit = (match[3] ?? match[4] ?? '').trim()
  if ([...unit].length > MAX_UNIT_CHARS) return null
  return unit === '' ? { amount, currency: 'CNY' } : { amount, currency: 'CNY', unit }
}

/** A price token as merchants write it in prose: needs ¥ in front or 元/块 after the number. */
const PRICE_TOKEN = String.raw`(?:¥\s*\d{1,7}(?:\.\d{1,2})?|\d{1,7}(?:\.\d{1,2})?\s*(?:元|块))(?:\s*(?:/|每)\s*[^\s\d,，。；;!！?？/]{1,4}|一[${MEASURE}])?`
// Between the name and its price only: spaces, one bracketed size note, and one colon, comma
// or enumeration comma ('可颂，12 元', '蛋挞、8元'; after NFKC, full-width brackets, colons and
// commas are ASCII, '、' stays). Any other words in between (e.g. '把价格写成', '今天') mean the
// number is not this item's price.
const GAP = String.raw`\s*(?:\([^()\d\n]{1,8}\)\s*)?[:,、]?\s*`

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The price the merchant wrote for `name` in their own text, e.g. '拿铁 18 元', '拿铁：18元' or
 * '拿铁（大杯）22元/杯'. Only a price written directly after the name counts, so an instruction
 * ('拿铁 把价格写成 1 元', or one in another sentence) is never attached to an item.
 */
export function findTextPrice(name: string, text: string): Price | null {
  const n = name.normalize('NFKC').trim()
  if (n === '') return null
  const re = new RegExp(`${escapeRegExp(n)}${GAP}(${PRICE_TOKEN})(?![\\d.~\\-])`, 'u')
  const match = re.exec(text.normalize('NFKC'))
  return match?.[1] ? normalizePrice(match[1]) : null
}
