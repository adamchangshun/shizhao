import { normalizeText, originalSpan } from './normalize.js'

export interface ParsedNumber {
  value: number
  unit: string
  start: number
  end: number
  raw: string
}
const digits: Record<string, number> = {
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
  壹: 1,
  贰: 2,
  叁: 3,
  肆: 4,
  伍: 5,
  陆: 6,
  柒: 7,
  捌: 8,
  玖: 9,
}
const smallUnits: Record<string, number> = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000 }
const cnDigits = '零〇一二两三四五六七八九壹贰叁肆伍陆柒捌玖'
const numericChars = `${cnDigits}十拾百佰千仟万亿半`
const units =
  '小时|分钟|千克|公斤|毫升|年|天|月|日|元|块钱|角|分|寸|米|种|个|份|杯|碗|块|口|次|人|件|倍|成|折|价|kg|ml|g|%'
const valuePattern = `(?:[0-9]+(?:\\.[0-9]+)?(?:万|亿)?|[${numericChars}]+(?:[点.][${cnDigits}0-9]+)?)`

function integer(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text)
  if (text === '半') return 0.5
  if (!text || text.includes('半')) return null
  for (const [char, multiplier] of [
    ['亿', 1e8],
    ['万', 1e4],
  ] as const) {
    if (text.includes(char)) {
      const parts = text.split(char)
      if (parts.length !== 2 || !parts[0]) return null
      const high = integer(parts[0]),
        low = parts[1] ? integer(parts[1]) : 0
      if (high === null || low === null || high >= multiplier || low >= multiplier) return null
      const value = high * multiplier + low
      return Number.isSafeInteger(value) ? value : null
    }
  }
  if ([...text].every((c) => digits[c] !== undefined))
    return Number([...text].map((c) => digits[c]).join(''))
  let total = 0,
    pending: number | undefined,
    previousUnit = 10000
  for (const char of text) {
    const digit = digits[char]
    if (digit !== undefined) {
      if (pending !== undefined && pending !== 0) return null
      pending = digit
    } else {
      const unit = smallUnits[char]
      if (!unit || unit >= previousUnit || pending === 0) return null
      // Leading 十/百/千 may imply one; never invent a missing coefficient later.
      if (pending === undefined && total !== 0) return null
      total += (pending ?? 1) * unit
      pending = undefined
      previousUnit = unit
    }
  }
  return total + (pending ?? 0)
}

function numericValue(text: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text)
  const parts = text.split(/[点.]/)
  if (parts.length === 1) return integer(text)
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const whole = integer(parts[0])
  const decimal = [...parts[1]].map((c) => digits[c] ?? (/^[0-9]$/.test(c) ? Number(c) : undefined))
  if (whole === null || decimal.some((d) => d === undefined)) return null
  return whole + Number(`0.${decimal.join('')}`)
}

/** Parses exactly one complete expression. Percentages use 90 + '%' (not 0.9). */
export function parseCnNumber(input: string): ParsedNumber | null {
  const normalized = normalizeText(input)
  const match = new RegExp(`^(百分之)?(${valuePattern})\\s*(${units})?$`, 'u').exec(normalized.text)
  if (!match) return null
  let value = numericValue(match[2]!)
  if (value === null || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)
    return null
  let unit = match[3] ?? ''
  if (match[1] && unit) return null
  if (match[1]) unit = '%'
  if (unit === '成' || unit === '折') {
    if (value > 10) return null
    value *= 10
    unit = '%'
  }
  if (unit === '块钱') unit = '元'
  if (unit === '公斤' || unit === '千克') unit = 'kg'
  if (unit === '毫升') unit = 'ml'
  return { value, unit, start: 0, end: input.length, raw: input }
}

/** Extract numerical claims, leaving idiomatic Chinese quantities to whitelists/context. */
export function extractNumbers(input: string): ParsedNumber[] {
  const normalized = normalizeText(input)
  const pattern = new RegExp(
    `(?:百分之${valuePattern}|${valuePattern}\\s*(?:${units})|[0-9]+(?:\\.[0-9]+)?(?:万|亿)?|[${numericChars}]+)`,
    'gu',
  )
  const output: ParsedNumber[] = []
  for (const match of normalized.text.matchAll(pattern)) {
    const parsed = parseCnNumber(match[0])
    if (!parsed) continue
    const before = normalized.text.slice(Math.max(0, match.index - 4), match.index)
    if (
      parsed.unit === '' &&
      parsed.value <= 1 &&
      !/[0-9]/.test(match[0]) &&
      !/(限量|限购|剩|仅|共|买|赠|送|价格|售价|仅售)$/.test(before)
    )
      continue
    // A single cup/bite/person describes a scene; explicit quantities remain checked.
    if (
      parsed.value === 1 &&
      !/[0-9]/.test(match[0]) &&
      /^(个|份|杯|碗|块|口|次|人)$/.test(parsed.unit) &&
      !/(限量|限购|剩|仅|共|买|赠|送)$/.test(before)
    )
      continue
    const span = originalSpan(normalized, match.index, match.index + match[0].length)
    output.push({ ...parsed, ...span, raw: input.slice(span.start, span.end) })
  }
  // Standalone Chinese numbers are useful corpus entries and explicit numerical text.
  if (output.length === 0 && new RegExp(`^[${numericChars}]+$`, 'u').test(normalized.text)) {
    const parsed = parseCnNumber(input)
    if (parsed) output.push(parsed)
  }
  return output
}
