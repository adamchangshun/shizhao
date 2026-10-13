// Pure extractors for the facts a page states in its visible text: prices and phone numbers.
// Used on pages from both groups, so they make no assumption about how a page is formatted.

/** NFKC folds full-width digits and the full-width yen sign (￥) into their ASCII forms. */
function fold(text: string): string {
  return text.normalize('NFKC')
}

const NUM = String.raw`\d+(?:\.\d+)?`
// Either a yen mark before the number (an optional 元 after it belongs to the same price), or
// 元 after a number that is not the tail of a longer number. 元旦 / 元宵 / 元气 / 元素 are words.
const PRICE = new RegExp(
  String.raw`¥\s*(${NUM})(?:\s*元(?![旦宵气素]))?|(?<![\d.])(${NUM})\s*元(?![旦宵气素])`,
  'gu',
)

/** Every price written on the page, in reading order (duplicates kept). */
export function extractPagePrices(text: string): number[] {
  const out: number[] = []
  for (const m of fold(text).matchAll(PRICE)) {
    const value = Number(m[1] ?? m[2])
    if (Number.isFinite(value)) out.push(value)
  }
  return out
}

// Mainland mobile (11 digits, optional +86), 400 service numbers, and landlines with an area code.
const PHONE =
  /(?<![\d.])(?:\+?86[\s-]?)?(1[3-9]\d(?:[\s-]?\d{4}){2})(?![\d.])|(?<![\d.])(400[\s-]?\d{3}[\s-]?\d{4})(?![\d.])|(?<![\d.])(0\d{2,3}[\s-]?\d{3,4}[\s-]?\d{4})(?![\d.])/gu

/** Digits only, without a leading 86 country code. */
export function normalizePhone(phone: string): string {
  const digits = fold(phone).replace(/\D/g, '')
  return digits.length === 13 && digits.startsWith('86') ? digits.slice(2) : digits
}

/**
 * `text` (as written; full-width digits are not matched) with each phone number replaced by `replace(digits)`; a null return keeps
 * the number as written.
 */
export function replacePhones(text: string, replace: (digits: string) => string | null): string {
  return text.replace(PHONE, (match, a?: string, b?: string, c?: string) => {
    const raw = a ?? b ?? c
    return (raw && replace(normalizePhone(raw))) ?? match
  })
}

/** Phone numbers on the page as digit strings, in reading order. */
export function extractPhones(text: string): string[] {
  const out: string[] = []
  for (const m of fold(text).matchAll(PHONE)) {
    const raw = m[1] ?? m[2] ?? m[3]
    if (raw) out.push(normalizePhone(raw))
  }
  return out
}
