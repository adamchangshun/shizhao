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
// the cue are allowed: "Q Q", "支 付 宝"). Anywhere in the cue's clause, a 5–20 digit number or an
// id-shaped token is refused, amounts included: "支付宝付了 12800 元" has to be rewritten without
// the number, since no rule tells amounts from accounts reliably. So is one in the next clause
// when that clause says it is an account ("支付宝收款，账号写在这里 2088…"). "QQ糖" and "QQ音乐" are
// not cues.
const ACCOUNT_SERVICE = String.raw`(?:q\s?q(?!\s?(?:糖|音乐))|扣\s?扣|企鹅号|q\s{0,3}号|支\s?付\s?宝|alipay|zfb)`
const ACCOUNT_WORD = String.raw`(?:号码|号|账号|帐号|账户|id)`
const ACCOUNT_CUE = `${ACCOUNT_SERVICE}${ACCOUNT_WORD}?`
const ACCOUNT_DIRECT = new RegExp(`${ACCOUNT_CUE}[\\s:=是为]{0,3}\\d{5,20}(?!\\d)`, 'i')
const ACCOUNT_ID = String.raw`(?:(?<!\d)\d{5,20}(?!\d)|${ID_TOKEN.source})`
const CLAUSE = String.raw`[^,.;!?\n。、]*`
const ACCOUNT_NEARBY = new RegExp(`${ACCOUNT_CUE}${CLAUSE}?${ACCOUNT_ID}`, 'i')
const ACCOUNT_LABEL = String.raw`(?:账号|帐号|账户|号码)`
const ACCOUNT_NEXT_CLAUSE = new RegExp(
  `${ACCOUNT_CUE}${CLAUSE}[,.;!?\\n。、]${CLAUSE}?${ACCOUNT_LABEL}${CLAUSE}?${ACCOUNT_ID}`,
  'i',
)

// "支付宝账号 tian 88abc", "QQ：t i a n x 8": an id split by spaces. In the rest of the cue's
// clause, words separated only by spaces are joined one at a time (up to 20 characters, the
// longest id), and the text is refused as soon as the joined words have the shape of an id,
// whatever follows them ("QQ：tian 88 abc please confirm"). Words right after a cue that names
// an account ("QQ：", "支付宝账号") always count; elsewhere ("QQ login option 2 is broken") only
// when one of them mixes letters with digits, "_" or "-" ("QQ 支付异常 tian 88abc"). In a next
// clause that says it is an account ("支付宝收款，账号 tian 888") the words after that label count.
const CUE_SCAN = new RegExp(`(${ACCOUNT_SERVICE})(${ACCOUNT_WORD})?([\\s:=是为]{0,3})`, 'gi')
const CLAUSE_SEP = /[,.;!?\n。、]/g
const LABEL = new RegExp(ACCOUNT_LABEL)
const WORD = /[-_a-z0-9]+/gi
const WHOLE_ID = new RegExp(`^(?:\\d{5,20}|${ID_TOKEN.source})$`, 'i')
const MIXED = /(?=.*[a-z])(?=.*[-_\d])/i

function clauseEnd(text: string, from: number): number {
  CLAUSE_SEP.lastIndex = from
  return CLAUSE_SEP.exec(text)?.index ?? text.length
}

/** Whether words in text[from, end) with only spaces between them join into an id. */
function joinsToId(
  text: string,
  from: number,
  end: number,
  counts: (at: number) => boolean,
): boolean {
  const words = [...text.slice(from, end).matchAll(WORD)].map((m) => ({
    word: m[0],
    at: from + m.index,
  }))
  for (let i = 0; i < words.length; i++) {
    let joined = words[i]!.word
    // Length first: MIXED is quadratic in the word's length.
    let mixed = joined.length <= 20 && MIXED.test(joined)
    for (let j = i + 1; j < words.length; j++) {
      const prev = words[j - 1]!
      if (!/^\s+$/.test(text.slice(prev.at + prev.word.length, words[j]!.at))) break
      joined += words[j]!.word
      if (joined.length > 20) break
      mixed ||= MIXED.test(words[j]!.word)
      if ((mixed || counts(words[i]!.at)) && WHOLE_ID.test(joined)) return true
    }
  }
  return false
}

function spacedAccount(text: string): boolean {
  const cues = [...text.matchAll(CUE_SCAN)]
  const strong = new Set(
    cues
      .filter((c) => c[2] !== undefined || /[:=是为]/.test(c[3]!) || c[1]!.includes('号'))
      .map((c) => c.index + c[0].length),
  )
  // Each clause is scanned from its first cue only, and at most once more as a next clause.
  let scanned = -1
  for (const cue of cues) {
    const from = cue.index + cue[0].length
    if (from <= scanned) continue
    const end = clauseEnd(text, from)
    scanned = end
    if (joinsToId(text, from, end, (at) => strong.has(at))) return true
    if (end >= text.length) continue
    const nextEnd = clauseEnd(text, end + 1)
    const label = LABEL.exec(text.slice(end + 1, nextEnd))
    const after = end + 1 + (label ? label.index + label[0].length : 0)
    if (label && joinsToId(text, after, nextEnd, () => true)) return true
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
    ACCOUNT_NEARBY.test(ids) ||
    ACCOUNT_NEXT_CLAUSE.test(ids) ||
    spacedAccount(ids)
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
