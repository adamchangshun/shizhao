// Content rules for anonymous correction text: clean it, refuse personal data, flag spam.
// Matching runs on an NFKC-normalized copy so full-width digits and letters are caught too.

/** Strips HTML tags and control characters (newlines in notes become spaces), then trims. */
export function sanitizeText(raw: string): string {
  return raw
    .replace(/<[^>]*>?/g, '')
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

const MOBILE = /(?<!\d)(?:\+?86)?1[3-9]\d{9}(?!\d)/
const LANDLINE = /(?<!\d)0\d{2,3}\d{7,8}(?!\d)/
const ID_CARD = /(?<!\d)(?:\d{17}[\dx]|\d{15})(?![\dx])/i
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i
// A WeChat id is only recognisable next to a cue word; bare words would catch dish names.
const WECHAT =
  /(?:微信|威信|薇信|徽信|weixin|wechat|vx|wx|v信|加v|加微)\s*(?:号|id)?\s*[:：是为]?\s*[a-z][-_a-z0-9]{5,19}/i

/** True when the text carries a phone number, e-mail, WeChat id or ID card number. */
export function containsPersonalInfo(text: string): boolean {
  const n = text.normalize('NFKC')
  // Digits split by spaces, dashes or dots ("138 0013 8000") still count.
  const digits = n.replace(/(?<=\d)[\s.\-–—]+(?=\d)/g, '')
  return (
    MOBILE.test(digits) ||
    LANDLINE.test(digits) ||
    ID_CARD.test(digits) ||
    EMAIL.test(n) ||
    WECHAT.test(n)
  )
}

const LINK =
  /(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|cn|net|org|top|xyz|cc|vip|shop|club|site|io)\b)/i
const AD_WORDS =
  /加盟|代理|招商|兼职|刷单|贷款|网贷|博彩|彩票|返利|返现|优惠券|领券|扫码领|免费领|推广|引流|代运营|涨粉|私聊|加群/

/** Links or obvious advertising: still stored (as spam) but never shown to the merchant. */
export function looksLikeSpam(text: string): boolean {
  const n = text.normalize('NFKC')
  return LINK.test(n) || AD_WORDS.test(n)
}
