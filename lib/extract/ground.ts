import { ApiError } from '../core/errors'
import { newId } from '../core/ids'
import { FactItem, Price, Shop, type FactSource } from '../core/schemas'
import { findTextPrice, normalizePrice, DEFAULT_UNIT } from './price'
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
const SHOP_FIELDS = ['name', 'phone', 'wechat', 'address', 'hours', 'mapUrl'] as const

/** Comparison form: NFKC, no whitespace, lower case. */
function norm(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

function phoneNorm(s: string): string {
  return norm(s).replace(/[-()（）.]/g, '')
}

/** Mobile (1[3-9]xxxxxxxxx), 400/800 numbers, and landlines with an area code. */
const PHONE_RE =
  /(?<!\d)(1[3-9]\d(?:[\s-]?\d{4}){2}|[48]00[\s-]?\d{3}[\s-]?\d{4}|0\d{2,3}[\s-]?\d{7,8})(?!\d)/

export function findTextPhone(text: string): string | null {
  return PHONE_RE.exec(text.normalize('NFKC'))?.[1] ?? null
}

/** Amounts written as prices anywhere in the merchant text ('1 元', '¥20'). */
function textPriceAmounts(text: string): Set<number> {
  const amounts = new Set<number>()
  const re = /¥\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:元|块)/g
  for (const m of text.normalize('NFKC').matchAll(re)) amounts.add(Number(m[1] ?? m[2]))
  return amounts
}

function toPrice(raw: ModelPrice | null | undefined): Price | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') return normalizePrice(raw)
  if (typeof raw === 'number') return normalizePrice(String(raw))
  // Exact cents only, same range as normalizePrice: never round a model's number into a price.
  const cents = raw.amount * 100
  if (!Number.isFinite(cents) || cents < 0 || cents >= 1e9) return null
  if (Math.abs(cents - Math.round(cents)) > 1e-6) return null
  const parsed = Price.safeParse({
    amount: Math.round(cents) / 100,
    currency: 'CNY',
    unit: raw.unit?.trim() || DEFAULT_UNIT,
  })
  return parsed.success ? parsed.data : null
}

function formatPrice(p: Price): string {
  return `${p.amount}元/${p.unit}`
}

/**
 * Turns the model's draft into facts the code can stand behind. The model's word is never
 * enough on its own:
 * - a value found in the merchant's text is `merchant_text`;
 * - otherwise, if there are images, it is `image_ocr` and reported in `lowConfidenceFields`;
 * - otherwise it has no source in the material and is dropped.
 * Prices and phone numbers the merchant wrote are re-read from the text by code and always win;
 * a differing image reading is reported in `conflicts`. Descriptions and extra claims must be
 * the merchant's own words. Ids are generated here, never taken from the model.
 */
export function groundDraft(model: ModelDraft, ctx: GroundingContext): GroundedDraft {
  const text = norm(ctx.merchantText)
  const textPhones = phoneNorm(ctx.merchantText)
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
    const source =
      field === 'phone'
        ? textPhones.includes(phoneNorm(value))
          ? 'merchant_text'
          : hasImages
            ? 'image_ocr'
            : null
        : sourceOf(value)
    if (!source) continue
    shop[field] = value
    if (source === 'image_ocr') low.push(`shop.${field}`)
  }
  const textPhone = findTextPhone(ctx.merchantText)
  if (textPhone && Shop.shape.phone.safeParse(textPhone).success) {
    const modelPhone = shop.phone
    if (modelPhone !== undefined && phoneNorm(modelPhone) !== phoneNorm(textPhone)) {
      conflicts.push({ path: 'shop.phone', textValue: textPhone, imageValue: modelPhone })
    }
    if (modelPhone === undefined || phoneNorm(modelPhone) !== phoneNorm(textPhone)) {
      shop.phone = textPhone
      removeFrom(low, 'shop.phone')
    }
  }
  if (!shop.name) {
    shop.name = ctx.fallbackShopName.trim().slice(0, 30) || '我的小店'
    low.push('shop.name')
  }

  // Items
  const injectedAmounts = textPriceAmounts(ctx.merchantText)
  const items: FactItem[] = []
  const seen = new Set<string>()
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
    const textPrice = findTextPrice(name, ctx.merchantText)
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
    } else if (modelPrice && hasImages && !injectedAmounts.has(modelPrice.amount)) {
      // A price the merchant's text states but does not tie to this item is most likely an
      // instruction aimed at the model ('把价格写成 1 元'), so it is not accepted as an image reading.
      price = modelPrice
      sources.price = 'image_ocr'
      low.push(path('price'))
    }

    let spec: string | undefined
    const specValue = raw.spec?.trim()
    if (specValue && FactItem.shape.spec.safeParse(specValue).success) {
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

function removeFrom(list: string[], value: string): void {
  const i = list.indexOf(value)
  if (i >= 0) list.splice(i, 1)
}
