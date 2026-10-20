import { extractNumbers, parseCnNumber } from './cn-number.js'
import { normalizeText, originalSpan, type NormalizedText } from './normalize.js'

type Range = [number, number]
interface ClockSpan {
  key: string
  start: number
  end: number
}
const numeral = '[0-9零〇一二两三四五六七八九十]+'
const clock = `${numeral}(?::${numeral}|[点时](?:${numeral}分?|半|整)?)`
// Decimal quantities and point-denominated rewards (8点积分) are not clock times.
const quantitySuffix =
  '小时|分钟|钟|千克|公斤|毫升|(?:会员|會員)?(?:积分|積分|积点|積点|奖励|獎勵)|会员分|會員分|福利|点数|點數|年|天|月|日|元|块|角|寸|米|种|个|份|杯|碗|口|次|人|件|倍|成|折|价|%|[a-z]'
const rewardPrefix =
  /(?:积分|積分|会员分|會員分|点数|點數|奖励|獎勵|福利)(?:为|是|共|送|赠|赠送|贈送|返|返还|返還|奖励|獎勵|到账|到賬|累计|累計)?[:：]?$/u
const clockPattern = new RegExp(
  `(?<![0-9零〇一二两三四五六七八九十])(?<![0-9]:)(${clock})(?:[-至到](${clock}))?(?![0-9零〇一二两三四五六七八九十:]|${quantitySuffix})`,
  'gu',
)

/** Display equivalence only: unlike rule matching, do not remove emoji or punctuation. */
function displayText(input: string): NormalizedText {
  const normalized: NormalizedText = { text: '', starts: [], ends: [] }
  let offset = 0
  for (const char of input) {
    const folded = normalizeText(char).text
    normalized.text += folded
    for (let i = 0; i < folded.length; i++) {
      normalized.starts.push(offset)
      normalized.ends.push(offset + char.length)
    }
    offset += char.length
  }
  let text = ''
  const starts: number[] = [],
    ends: number[] = []
  for (let i = 0; i < normalized.text.length; i++) {
    const char = normalized.text[i]!
    if (/\s/u.test(char)) {
      // Whitespace around units is formatting; inside a number it is not.
      if (!(
        /[0-9]/u.test(normalized.text[i - 1] ?? '') &&
        /^[\s]*[0-9]/u.test(normalized.text.slice(i + 1))
      ))
        continue
    }
    text += /[‐‑‒–—―−~〜～﹘﹣]/u.test(char) ? '-' : char
    starts.push(normalized.starts[i]!)
    ends.push(normalized.ends[i]!)
  }
  return { text, starts, ends }
}

function clockKey(input: string): string | undefined {
  const parts = new RegExp(
    `^(${numeral})(?::(${numeral})|[点时](?:(${numeral})分?|(半)|整)?)$`,
    'u',
  ).exec(input)
  if (!parts) return undefined
  const hour = parseCnNumber(parts[1]!)?.value
  const minute = parts[4]
    ? 30
    : parts[2] || parts[3]
      ? parseCnNumber((parts[2] ?? parts[3])!)?.value
      : 0
  if (
    hour === undefined ||
    minute === undefined ||
    hour > 24 ||
    minute > 59 ||
    (hour === 24 && minute !== 0)
  )
    return undefined
  return `${hour}:${minute}`
}

function clockSpans(input: NormalizedText): ClockSpan[] {
  return [...input.text.matchAll(clockPattern)].flatMap((match) => {
    // A reward amount can precede 点 as well as follow it (积分送8点).
    if (rewardPrefix.test(input.text.slice(Math.max(0, match.index - 20), match.index))) return []
    const start = clockKey(match[1]!)
    const end = match[2] ? clockKey(match[2]) : undefined
    if (!start || (match[2] && !end)) return []
    return [
      {
        key: end ? `${start}-${end}` : start,
        ...originalSpan(input, match.index, match.index + match[0].length),
      },
    ]
  })
}

function overlaps(start: number, end: number, spans: ClockSpan[]): boolean {
  return spans.some((span) => start < span.end && end > span.start)
}

/** Complete display-equivalent facts, mapped to original sentence offsets. */
export function displayFactRanges(sentence: string, facts: string[]): Range[] {
  const normalized = displayText(sentence)
  return facts.flatMap((fact) => {
    const display = displayText(fact)
    if (!display.text) return []
    const result: Range[] = []
    let index = normalized.text.indexOf(display.text)
    while (index !== -1) {
      const end = index + display.text.length
      // A short numeric fact must not authorize a larger adjacent number.
      if (
        !(/[0-9]/u.test(display.text[0]!) && /[0-9]/u.test(normalized.text[index - 1] ?? '')) &&
        !(/[0-9]/u.test(display.text.at(-1)!) && /[0-9]/u.test(normalized.text[end] ?? ''))
      ) {
        const span = originalSpan(normalized, index, end)
        result.push([span.start, span.end])
      }
      index = normalized.text.indexOf(display.text, index + 1)
    }
    return result
  })
}

/** Range endpoints support single clocks, but sentence ranges must match a complete range. */
export function numberEvidence(sentence: string, facts: string[], spanFacts: string[] = []) {
  const times = clockSpans(displayText(sentence))
  const evidence = facts.map((fact) => ({
    fact,
    times: clockSpans(displayText(fact)),
  }))
  const factTimes = [
    ...evidence.flatMap((entry) => entry.times),
    ...spanFacts.flatMap((fact) => clockSpans(displayText(fact))),
  ]
  const timeKeys = new Set(factTimes.flatMap((time) => [time.key, ...time.key.split('-')]))
  const groundedTimes: Range[] = times
    .filter((time) => timeKeys.has(time.key))
    .map((time) => [time.start, time.end])
  return {
    groundedFacts: displayFactRanges(sentence, [...facts, ...spanFacts]),
    groundedTimes,
    inTime: (start: number, end: number) => overlaps(start, end, times),
    factNumbers: evidence.flatMap(({ fact, times }) =>
      extractNumbers(fact).filter((number) => !overlaps(number.start, number.end, times)),
    ),
  }
}
