import type { Price } from '../core/schemas'

const MAX_UNIT_CHARS = 8

// Measure words merchants put after 一 ('12 元一个', '15元一斤', '12元一朵'): counters for food and
// drinks (个份杯碗盘碟笼串), packaging (盒袋瓶罐桶壶包箱听筒卷), weight (斤两), pieces (块片条根
// 支粒枚只件张套双对打), servings (位客例) and flowers or produce (朵束把盆). With a counter not
// listed the price is still read, only without a unit (never a wrong one); the merchant can type
// it in. In prose the counter must follow 元 directly and only one character is taken, so in
// '12 元一个蛋挞' the unit is 个 and in '12元 一杯咖啡' (the next item) there is none.
const MEASURE =
  '个份杯碗盘碟笼串盒袋瓶罐桶壶包箱听筒卷斤两块片条根支粒枚只件张套双对打位客例朵束把盆'

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
// number is not this item's price. Every quantifier on spaces follows a non-space token, so no
// two of them compete for the same run: with '\s*[:,、]?\s*' a name followed by a long run of
// spaces backtracked quadratically (20,000 spaces took ~300ms); this form is linear.
// One size may also stand there, a number of at most 4 digits and a size unit ('6 寸', '80g',
// '250ml'); it becomes the item's spec. 块 is left out: '6 块' is a price, not a size. Longer
// units come first so 'kg' and 'ml' are not cut to 'g' and 'm'.
const SIZE = String.raw`\d{1,4}\s*(?:英寸|寸|厘米|cm|CM|mm|kg|KG|千克|公斤|g|G|克|ml|mL|ML|毫升|升|斤|两|片|个|只|粒|枚)`
const GAP = String.raw`\s*(?:\([^()\d\n]{1,8}\)\s*)?(?:(${SIZE})\s*)?(?:[:,、]\s*)?`

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface TextOffer {
  price: Price
  /** The size written between the name and the price, e.g. '6 寸'. */
  spec?: string
  /** Where the price starts in the NFKC-normalized text (same positions as findTextAmounts). */
  at: number
}

/**
 * Every price (and size, if any) the merchant wrote right after `name` in their own text, e.g.
 * '拿铁 18 元', '拿铁：18元', '拿铁（大杯）22元/杯' or '巴斯克芝士蛋糕 6 寸 128 元'. Only a price
 * written directly after the name counts, so an instruction ('拿铁 把价格写成 1 元', or one in
 * another sentence) is never attached to an item. The name may end a longer one ('拿铁' in
 * '燕麦拿铁 25元'); the caller decides which item a price belongs to (see groundDraft).
 */
export function findTextOffers(name: string, text: string): TextOffer[] {
  const n = name.normalize('NFKC').trim()
  if (n === '') return []
  const re = new RegExp(`${escapeRegExp(n)}${GAP}(${PRICE_TOKEN})(?![\\d.~\\-])`, 'gu')
  const offers: TextOffer[] = []
  for (const match of text.normalize('NFKC').matchAll(re)) {
    const price = normalizePrice(match[2]!)
    if (!price) continue
    const at = match.index + match[0].length - match[2]!.length
    offers.push(match[1] ? { price, spec: match[1], at } : { price, at })
  }
  return offers
}

/** The first price written right after `name`; see findTextOffers. */
export function findTextPrice(name: string, text: string): Price | null {
  return findTextOffers(name, text)[0]?.price ?? null
}

const AMOUNT_RE =
  /(?<![\d.])(?:(?:¥|rmb|cny)\s*(\d{1,7}(?:\.\d{1,2})?)(?![\d.])|(\d{1,7}(?:\.\d{1,2})?)\s*(?:元|块))/giu

/** Every amount of money written in the text ('18 元', '¥15', 'RMB 1', '3块'), in order. */
export function findTextAmounts(text: string): Array<{ amount: number; at: number }> {
  return [...text.normalize('NFKC').matchAll(AMOUNT_RE)].map((m) => ({
    amount: Number(m[1] ?? m[2]),
    at: m.index,
  }))
}
