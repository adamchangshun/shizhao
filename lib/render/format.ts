// Pure formatting and link-safety helpers shared by the renderer and its tests.
import type { Price, Shop } from '@/lib/core/schemas'

/** `¥28` for whole yuan, `¥12.50` otherwise. The unit is rendered in its own element. */
export function formatPriceAmount(price: Price): string {
  const cents = Math.round(price.amount * 100)
  const yuan = Math.floor(cents / 100)
  const rest = cents % 100
  return rest === 0 ? `¥${yuan}` : `¥${yuan}.${String(rest).padStart(2, '0')}`
}

/** `tel:` href keeping only digits, `+` and `-`; null when no digit survives. */
export function telHref(phone: string | undefined): string | null {
  if (!phone) return null
  const cleaned = phone.replace(/[^0-9+-]/g, '')
  return /[0-9]/.test(cleaned) ? `tel:${cleaned}` : null
}

/** Re-validates `mapUrl` at render time: only a well-formed `https://` URL is allowed. */
export function safeMapUrl(mapUrl: string | undefined): string | null {
  if (!mapUrl || !mapUrl.startsWith('https://')) return null
  // Control characters and whitespace have no business in a link we print.
  if (/[\u0000- \u007f-\u009f]/.test(mapUrl)) return null
  try {
    const url = new URL(mapUrl)
    return url.protocol === 'https:' && url.hostname !== '' ? url.href : null
  } catch {
    return null
  }
}

/**
 * Navigation target: the merchant's map link; an AMap search for name + address when no
 * link was given. A link that fails re-validation hides the button instead of falling back.
 */
export function navigationHref(shop: Pick<Shop, 'name' | 'address'>, mapUrl: string | undefined): string | null {
  if (mapUrl !== undefined && mapUrl !== '') return safeMapUrl(mapUrl)
  if (!shop.address) return null
  const keyword = `${shop.name} ${shop.address}`
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(keyword)}&src=shizhao&callnative=1`
}
