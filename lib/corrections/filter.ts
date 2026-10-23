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
// QQ numbers and Alipay accounts are also only recognisable next to a cue word (spaces inside
// the cue are allowed: "Q Q", "支 付 宝"). Either a 5–20 digit number follows the cue directly
// ("QQ：12345678", "支付宝账号 2088…", even with 元 after it), or the same clause carries a number
// that is not an amount, or an id-shaped token ("我的QQ是这个 123456789", "支付宝账号：tian_88abc").
// "支付宝付了 12800 元", "QQ糖" and "QQ音乐" are not accounts, nor is a number in another clause
// unless that clause says it is one ("支付宝收款，账号写在这里 2088…").
const ACCOUNT_SERVICE = String.raw`(?:q\s?q(?!\s?(?:糖|音乐))|扣\s?扣|企鹅号|q号|支\s?付\s?宝|alipay|zfb)`
const ACCOUNT_WORD = String.raw`(?:号码|号|账号|帐号|账户|id)`
const ACCOUNT_CUE = `${ACCOUNT_SERVICE}${ACCOUNT_WORD}?`
const ACCOUNT_DIRECT = new RegExp(`${ACCOUNT_CUE}[\\s:=是为]{0,3}[1-9]\\d{4,19}(?!\\d)`, 'i')
const ACCOUNT_NUMBER = String.raw`(?<!\d)[1-9]\d{4,19}(?!\d)`
// After a cue that names an account ("QQ账号", "支付宝账户"), a number in the same clause is the
// account even when written like an amount ("我的QQ账号是这个 12345元旦后停用"), so this rule
// runs on the text before amounts are set aside.
const ACCOUNT_WORDED = new RegExp(
  `${ACCOUNT_SERVICE}${ACCOUNT_WORD}[^,.;!?\\n。、]{0,20}?${ACCOUNT_NUMBER}`,
  'i',
)
const ACCOUNT_NEARBY = new RegExp(
  `${ACCOUNT_CUE}[^,.;!?\\n。、]{0,20}?(?:${ACCOUNT_NUMBER}|${ID_TOKEN.source})`,
  'i',
)
const ACCOUNT_NEXT_CLAUSE = new RegExp(
  `${ACCOUNT_CUE}[^,.;!?\\n。、]{0,20}[,.;!?\\n。、][^,.;!?\\n。、]{0,10}?(?:账号|帐号|账户|号码)[^,.;!?\\n。、]{0,10}?(?:${ACCOUNT_NUMBER}|${ID_TOKEN.source})`,
  'i',
)
// Amounts, with any spaces around the number: "¥ 12800", "RMB  12800", "CNY12800", "12800 人民币".
// An amount never starts or ends inside an id ("RMB123abc", "abc123元旦" stay ids). The number may
// only start where a run of digits starts, so a failed match is not retried from every digit.
const AMOUNT =
  /(?<![-_a-z0-9])(?:¥|rmb|cny)\s*\d+(?![-_a-z0-9])|(?<![-_a-z0-9])\d+\s*(?:元|块|人民币)/gi

// "支付宝账号 tian 88abc", "QQ：t i a n x 8": an id split by spaces. After every cue, the words
// that follow are joined one at a time (up to 20 characters, the longest id), and the text is
// refused as soon as the joined words have the shape of an id, whatever follows them
// ("QQ：tian 88 abc please confirm"). After a bare service name ("QQ login option 2 is broken")
// that only counts when one of the words mixes letters with digits, "_" or "-" ("QQ tian 88abc").
const CUE_SCAN = new RegExp(`(${ACCOUNT_SERVICE})(${ACCOUNT_WORD})?([\\s:=是为]{0,3})`, 'gi')
const FIRST_WORD = /[-_a-z0-9]+/iy
const NEXT_WORD = /\s+([-_a-z0-9]+)/iy
const WHOLE_ID = new RegExp(`^(?:[1-9]\\d{4,19}|${ID_TOKEN.source})$`, 'i')
const MIXED = /(?=.*[a-z])(?=.*[-_\d])/i

function spacedAccount(text: string): boolean {
  for (const cue of text.matchAll(CUE_SCAN)) {
    const strong = cue[2] !== undefined || /[:=是为]/.test(cue[3]!) || cue[1]!.includes('号')
    FIRST_WORD.lastIndex = cue.index + cue[0].length
    let word = FIRST_WORD.exec(text)?.[0]
    let joined = ''
    let words = 0
    let mixed = false
    while (word !== undefined) {
      joined += word
      words += 1
      mixed ||= MIXED.test(word)
      if (joined.length > 20) break
      if (words > 1 && (strong || mixed) && WHOLE_ID.test(joined)) return true
      NEXT_WORD.lastIndex = FIRST_WORD.lastIndex
      word = NEXT_WORD.exec(text)?.[1]
      FIRST_WORD.lastIndex = NEXT_WORD.lastIndex
    }
  }
  return false
}

/** True when the text carries a phone number, e-mail, WeChat, QQ or Alipay id, or ID card number. */
export function containsPersonalInfo(text: string): boolean {
  const n = text.normalize('NFKC')
  // Digits split by any run of separators that are neither letters nor digits
  // ("138 0013 8000", "138/0013/8000", "138----0013----8000", "(021)64881234") still count.
  const digits = n.replace(/(?<=\d)[^\p{L}\p{N}]+(?=\d)/gu, '')
  // "tian _ 88abc": spaces around "_" and "-" inside an account id. Each run of spaces is
  // matched from its first space only, so a long run cannot make this quadratic.
  const ids = digits.replace(/(?<!\s)\s+(?=[-_])|(?<=[-_])\s+/g, '')
  // Only a number written right after the cue is an account even as an amount ("QQ账号 12345678元");
  // elsewhere amounts are set aside first ("支付宝付了 ¥ 12800").
  const noAmounts = ids.replace(AMOUNT, ' 金额 ')
  // "someone @ example . com"
  const compact = n.replace(/\s*([@.])\s*/g, '$1')
  return (
    MOBILE.test(digits) ||
    LANDLINE.test(digits) ||
    ID_CARD.test(digits) ||
    EMAIL.test(compact) ||
    WECHAT_DIRECT.test(n) ||
    (WECHAT_CUE.test(n) && ID_TOKEN.test(n)) ||
    ACCOUNT_DIRECT.test(ids) ||
    ACCOUNT_WORDED.test(ids) ||
    ACCOUNT_NEARBY.test(noAmounts) ||
    ACCOUNT_NEXT_CLAUSE.test(noAmounts) ||
    spacedAccount(noAmounts)
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
