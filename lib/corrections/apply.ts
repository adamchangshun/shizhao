// Applying one accepted correction to a FactSheet: only the corrected fact changes, and it is
// marked as the merchant's own edit (the merchant is the one accepting it).
import { ApiError } from '../core/errors'
import { FactSheet, type FactItem, type Price } from '../core/schemas'
import { DEFAULT_UNIT, normalizePrice } from '../extract/price'
import { parsePath } from './options'

const invalid = (message: string) => new ApiError(400, 'invalid_value', message)

const PHONE = /^[0-9+\-\s()（）]{5,20}$/

function price(value: string, current: Price | undefined): Price {
  const parsed = normalizePrice(value)
  if (!parsed) throw invalid('价格格式不对，请填写数字，例如 138 或 138元/个')
  // "138" or "138元" keeps the unit the page already shows; only an explicit "/个" changes it.
  const explicitUnit = /[/／每]/.test(value)
  if (!explicitUnit && parsed.unit === DEFAULT_UNIT && current)
    return { ...parsed, unit: current.unit }
  return parsed
}

/**
 * The sheet with `path` set to `value` (unconfirmed, same projectId/revision as `sheet`;
 * the caller assigns the new revision). Throws a 400 ApiError with a Chinese message for values
 * the merchant has to fix, and 409 when the fact no longer exists.
 */
export function applyCorrection(sheet: FactSheet, path: string, rawValue: string): FactSheet {
  const parsed = parsePath(path)
  if (!parsed || parsed.kind === 'other') {
    throw new ApiError(
      400,
      'not_applicable',
      '这条建议没有指明具体信息，请到「核对信息」里手动修改',
    )
  }
  const value = rawValue.trim()
  if (value === '') throw invalid('请填写正确的内容')

  let next: FactSheet
  if (parsed.kind === 'shop') {
    if (parsed.field === 'phone' && !PHONE.test(value)) throw invalid('电话格式不对，请只填写号码')
    next = { ...sheet, shop: { ...sheet.shop, [parsed.field]: value } }
    // A map link pinned to the old address would send customers there; without it the page
    // falls back to a map search for the new address.
    if (parsed.field === 'address') delete next.shop.mapUrl
  } else {
    const index = sheet.items.findIndex((i) => i.id === parsed.itemId)
    const item = sheet.items[index]
    if (!item) throw new ApiError(409, 'fact_gone', '这件商品已经不在商品信息里了')
    const updated: FactItem = {
      ...item,
      ...(parsed.field === 'price'
        ? { price: price(value, item.price) }
        : { [parsed.field]: value }),
      sources: { ...item.sources, [parsed.field]: 'merchant_edit' },
    }
    next = { ...sheet, items: sheet.items.map((it, i) => (i === index ? updated : it)) }
  }
  const checked = FactSheet.safeParse({ ...next, confirmedAt: null })
  if (!checked.success) throw invalid('修改后的内容太长或格式不符合要求，请调整后再采纳')
  return checked.data
}
