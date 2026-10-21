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
// WeChat ids are only recognisable next to a cue word: either the id follows the cue directly
// ("微信号：abc123"), or the text names WeChat and also carries an id-shaped token, i.e.
// 6–20 characters starting with a letter and containing a digit, "_" or "-" ("我的微信号是这个
// abc12345"). Plain words ("微信上把 Americano 改成 Latte") are not ids.
const WECHAT_CUE = /微信|威信|薇信|徽信|weixin|wechat|vx|wx|v信|加v|加微/i
const WECHAT_DIRECT = new RegExp(
  `(?:${WECHAT_CUE.source})(?:号|id|账号)?[\\s:：=是为]{0,3}[a-z][-_a-z0-9]{5,19}`,
  'i',
)
const ID_TOKEN = /(?<![a-z0-9_-])(?=[a-z][-_a-z0-9]{5,19}(?![a-z0-9_-]))[a-z]*[-_0-9][-_a-z0-9]*/i
// QQ numbers and Alipay accounts are also only recognisable next to a cue word: a text that names
// the service and carries a 5–20 digit number or an id-shaped token ("QQ：12345678", "我的QQ是这个
// 123456789", "支付宝账号 tian_88abc"). An amount ("支付宝付了 12800 元") is not an account.
const ACCOUNT_CUE = /qq|扣扣|企鹅号|q号|支付宝|alipay|zfb/i
const ACCOUNT_NUMBER = /(?<!\d)[1-9]\d{4,19}(?!\d|\s?(?:元|块))/

/** True when the text carries a phone number, e-mail, WeChat, QQ or Alipay id, or ID card number. */
export function containsPersonalInfo(text: string): boolean {
  const n = text.normalize('NFKC')
  // Digits split by any run of separators that are neither letters nor digits
  // ("138 0013 8000", "138/0013/8000", "138----0013----8000", "(021)64881234") still count.
  const digits = n.replace(/(?<=\d)[^\p{L}\p{N}]+(?=\d)/gu, '')
  // "someone @ example . com"
  const compact = n.replace(/\s*([@.])\s*/g, '$1')
  return (
    MOBILE.test(digits) ||
    LANDLINE.test(digits) ||
    ID_CARD.test(digits) ||
    EMAIL.test(compact) ||
    WECHAT_DIRECT.test(n) ||
    (WECHAT_CUE.test(n) && ID_TOKEN.test(n)) ||
    (ACCOUNT_CUE.test(n) && (ACCOUNT_NUMBER.test(digits) || ID_TOKEN.test(n)))
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
