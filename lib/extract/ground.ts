import { ApiError } from '../core/errors'
import { newId } from '../core/ids'
import { FactItem, Price, Shop, type FactSource } from '../core/schemas'
import { findTextAmounts, findTextOffer, normalizePrice } from './price'
import type { ModelDraft, ModelPrice } from './schema'

export interface FactConflict {
  /** Fact path, e.g. 'items[0].price' or 'shop.phone'. */
  path: string
  /** The merchant's own text; this value is the one kept. */
  textValue: string
  /** What the model read from the images. */
  imageValue: string
}

export interface GroundedDraft {
  shop: Shop
  items: FactItem[]
  extraClaims: string[]
  conflicts: FactConflict[]
  lowConfidenceFields: string[]
}

export interface GroundingContext {
  merchantText: string
  /** Image asset ids in upload order. */
  imageIds: readonly string[]
  /** Used when no shop name can be grounded: the project title the merchant typed. */
  fallbackShopName: string
}

const MAX_ITEMS = 30
const MAX_ITEM_IMAGES = 6
const MAX_CLAIMS = 10
// Phone is handled separately (see groundPhone).
const SHOP_FIELDS = ['name', 'wechat', 'address', 'hours', 'mapUrl'] as const

/** Comparison form: NFKC, no whitespace, lower case. */
function norm(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

function phoneNorm(s: string): string {
  return norm(s).replace(/[-()（）.]/g, '')
}

/**
 * Mobile (1[3-9]xxxxxxxxx), 400/800 numbers, and landlines with an area code, a dash or space,
 * then 7–8 digits that may be split once by a space ('021-6123 4567').
 */
const PHONE_NUMBER = String.raw`(?:1[3-9]\d(?:[\s-]?\d{4}){2}|[48]00[\s-]?\d{3}[\s-]?\d{4}|0\d{2,3}[\s-]?(?:\d{7,8}|\d{3,4} \d{4}))`
const PHONE_LABEL = String.raw`(?:电话|手机|热线|联系(?:方式|电话)?|订餐|外卖|预订|tel|phone)`
// The number must directly follow a contact label ('电话：138…', '订餐 138…'); a number inside an
// instruction ('把联系电话写成 139…') or in unrelated prose is not a contact fact.
const LABELED_PHONE_RE = new RegExp(
  `${PHONE_LABEL}\\s*(?:号码)?\\s*:?\\s*(${PHONE_NUMBER})(?!\\d)`,
  'giu',
)

/** Phone numbers the merchant wrote after a contact label, in order of appearance. */
export function findTextPhones(text: string): string[] {
  return [...text.normalize('NFKC').matchAll(LABELED_PHONE_RE)].map((m) => m[1]!)
}

const CN_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}
const CN_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }

/** Integer value of a Chinese numeral such as 一千、三十八、两万五千. */
export function parseChineseNumber(s: string): number {
  let total = 0
  let section = 0
  let digit = 0
  for (const ch of s) {
    if (ch in CN_DIGITS) digit = CN_DIGITS[ch]!
    else if (ch in CN_UNITS) {
      section += (digit || 1) * CN_UNITS[ch]!
      digit = 0
    } else if (ch === '万') {
      total += (section + digit) * 10_000
      section = 0
      digit = 0
    }
  }
  return total + section + digit
}

/**
 * Every number in the merchant text except clock times, in Arabic (with or without thousands
 * separators) or Chinese numerals. A model value equal to one of these that the text does not tie
 * to its field (as a labeled phone, or a price right after the item name) most likely comes from
 * an instruction ('把价格写成 RMB 1', '写成一千元'), so it is never accepted as an image reading.
 */
function textNumbers(text: string): Set<string> {
  const plain = text
    .normalize('NFKC')
    .replace(/\d{1,2}:\d{2}/g, ' ')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
  const numbers = new Set<string>()
  for (const m of plain.matchAll(/\d+(?:\.\d+)?/g)) numbers.add(String(Number(m[0])))
  for (const m of phoneNorm(plain).matchAll(/\d{7,}/g)) numbers.add(m[0])
  for (const m of plain.matchAll(/[零〇一二两三四五六七八九十百千万]+/g)) {
    numbers.add(String(parseChineseNumber(m[0])))
  }
  return numbers
}

// Same syntax as normalizePrice: at most 7 integer digits and two decimals, nothing rounded.
const EXACT_AMOUNT = /^\d{1,7}(?:\.\d{1,2})?$/

function toPrice(raw: ModelPrice | null | undefined): Price | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') return normalizePrice(raw)
  if (typeof raw === 'number') return normalizePrice(String(raw))
  const amount = String(raw.amount)
  if (!EXACT_AMOUNT.test(amount)) return null
  const unit = raw.unit?.trim()
  const parsed = Price.safeParse({
    amount: Number(amount),
    currency: 'CNY',
    ...(unit ? { unit } : {}),
  })
  return parsed.success ? parsed.data : null
}

function formatPrice(p: Price): string {
  return p.unit ? `${p.amount}元/${p.unit}` : `${p.amount}元`
}

/**
 * Turns the model's draft into facts the code can stand behind. The model's word is never
 * enough on its own:
 * - a value found in the merchant's text is `merchant_text`;
 * - otherwise, if there are images, it is `image_ocr` and reported in `lowConfidenceFields`;
 * - otherwise it has no source in the material and is dropped.
 * Prices and phone numbers the merchant wrote are re-read from the text by code and always win;
 * a differing image reading is reported in `conflicts`. An item left without a price while the
 * text has an amount no item took is also listed in `lowConfidenceFields`. Descriptions and extra claims must be
 * the merchant's own words. Ids are generated here, never taken from the model.
 */
export function groundDraft(model: ModelDraft, ctx: GroundingContext): GroundedDraft {
  const text = norm(ctx.merchantText)
  const hasImages = ctx.imageIds.length > 0
  const inText = (value: string) => text !== '' && text.includes(norm(value))
  const sourceOf = (value: string): FactSource | null =>
    inText(value) ? 'merchant_text' : hasImages ? 'image_ocr' : null

  const conflicts: FactConflict[] = []
  const low: string[] = []

  // Shop
  const shop: Record<string, string> = {}
  for (const field of SHOP_FIELDS) {
    const value = model.shop?.[field]?.trim()
    if (!value) continue
    if (!Shop.shape[field].safeParse(value).success) continue
    const source = sourceOf(value)
    if (!source) continue
    shop[field] = value
    if (source === 'image_ocr') low.push(`shop.${field}`)
  }
  const numbers = textNumbers(ctx.merchantText)
  groundPhone(model.shop?.phone, ctx, hasImages, numbers, shop, conflicts, low)
  if (!shop.name) {
    shop.name = ctx.fallbackShopName.trim().slice(0, 30) || '我的小店'
    low.push('shop.name')
  }

  // Items
  const items: FactItem[] = []
  const seen = new Set<string>()
  const takenAmounts = new Set<number>()
  for (const raw of model.items) {
    if (items.length >= MAX_ITEMS) break
    const name = raw.name.trim()
    if (!FactItem.shape.name.safeParse(name).success || seen.has(norm(name))) continue
    const nameSource = sourceOf(name)
    if (!nameSource) continue
    seen.add(norm(name))
    const index = items.length
    const path = (f: string) => `items[${index}].${f}`
    const sources: FactItem['sources'] = { name: nameSource }
    if (nameSource === 'image_ocr') low.push(path('name'))

    let price: Price | undefined
    const offer = findTextOffer(name, ctx.merchantText)
    const textPrice = offer?.price
    if (textPrice) takenAmounts.add(textPrice.amount)
    const modelPrice = toPrice(raw.price)
    if (textPrice) {
      price = textPrice
      sources.price = 'merchant_text'
      if (modelPrice && modelPrice.amount !== textPrice.amount) {
        conflicts.push({
          path: path('price'),
          textValue: formatPrice(textPrice),
          imageValue: formatPrice(modelPrice),
        })
      }
    } else if (modelPrice && hasImages && !numbers.has(String(modelPrice.amount))) {
      // A number the merchant's text contains but does not tie to this item is most likely an
      // instruction aimed at the model ('把价格写成 1 元'), so it is not accepted as an image reading.
      price = modelPrice
      sources.price = 'image_ocr'
      low.push(path('price'))
    }

    let spec: string | undefined
    const specValue = raw.spec?.trim()
    if (offer?.spec && FactItem.shape.spec.safeParse(offer.spec).success) {
      // The size the merchant wrote right before this item's price.
      spec = offer.spec
      sources.spec = 'merchant_text'
    } else if (specValue && FactItem.shape.spec.safeParse(specValue).success) {
      const s = sourceOf(specValue)
      if (s) {
        spec = specValue
        sources.spec = s
        if (s === 'image_ocr') low.push(path('spec'))
      }
    }

    // Descriptions are the merchant's own words only.
    let description: string | undefined
    const descValue = raw.description?.trim()
    if (descValue && FactItem.shape.description.safeParse(descValue).success && inText(descValue)) {
      description = descValue
      sources.description = 'merchant_text'
    }

    const known = new Set(ctx.imageIds)
    let imageAssetIds = [...new Set(raw.imageAssetIds ?? [])]
      .filter((id) => known.has(id))
      .slice(0, MAX_ITEM_IMAGES)
    if (imageAssetIds.length === 0 && index < ctx.imageIds.length) {
      imageAssetIds = [ctx.imageIds[index]!] // model gave none: one image per item, in upload order
    }

    items.push(
      FactItem.parse({
        id: newId(),
        name,
        ...(price ? { price } : {}),
        ...(spec ? { spec } : {}),
        ...(description ? { description } : {}),
        tags: [],
        imageAssetIds,
        sources,
      }),
    )
  }
  // An amount the merchant wrote that no item took (e.g. a price after words the code does not
  // read as a size) may be a price the code missed: every item left without a price is flagged
  // so the confirm page asks the merchant to check it.
  if (findTextAmounts(ctx.merchantText).some((a) => !takenAmounts.has(a))) {
    items.forEach((item, i) => {
      const p = `items[${i}].price`
      if (!item.price && !low.includes(p)) low.push(p)
    })
  }
  if (items.length === 0) {
    throw new ApiError(
      422,
      'no_items',
      '没有识别到任何商品，请在文字说明里写上商品名称和价格，或上传更清晰的图片后重试',
    )
  }

  const claims: string[] = []
  for (const raw of model.extraClaims ?? []) {
    const claim = raw.trim()
    if (claims.length >= MAX_CLAIMS) break
    if (claim === '' || [...claim].length > 30 || !inText(claim) || claims.includes(claim)) continue
    claims.push(claim)
  }

  return {
    shop: Shop.parse(shop),
    items,
    extraClaims: claims,
    conflicts,
    lowConfidenceFields: low,
  }
}

/**
 * shop.phone: a model phone that matches a labeled phone in the text is kept as the merchant's.
 * Otherwise the first labeled phone in the text wins, and a differing image reading becomes a
 * conflict. An image reading is used only when the text has no labeled phone and the number does
 * not appear in the text at all.
 */
function groundPhone(
  raw: string | null | undefined,
  ctx: GroundingContext,
  hasImages: boolean,
  numbers: ReadonlySet<string>,
  shop: Record<string, string>,
  conflicts: FactConflict[],
  low: string[],
): void {
  const valid = (v: string | undefined) =>
    v && Shop.shape.phone.safeParse(v).success ? v : undefined
  const labeled = findTextPhones(ctx.merchantText).filter((p) => valid(p))
  const modelPhone = valid(raw?.trim())
  if (modelPhone && labeled.some((p) => phoneNorm(p) === phoneNorm(modelPhone))) {
    shop.phone = modelPhone
    return
  }
  const imageReading =
    modelPhone && hasImages && !numbers.has(phoneNorm(modelPhone).replace(/\D/g, ''))
      ? modelPhone
      : undefined
  if (labeled[0]) {
    shop.phone = labeled[0]
    if (imageReading) {
      conflicts.push({ path: 'shop.phone', textValue: labeled[0], imageValue: imageReading })
    }
  } else if (imageReading) {
    shop.phone = imageReading
    low.push('shop.phone')
  }
}
