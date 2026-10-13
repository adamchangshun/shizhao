import { extractNumbers } from './cn-number.js'
import { normalizeText, originalSpan } from './normalize.js'
import { defaultRules } from './rules/index.js'
import type { FactCorpus, RuleHit, RuleSet } from './types.js'

function ranges(text: string, words: string[]): Array<[number, number]> {
  return words.flatMap((word) => {
    const normalized = normalizeText(word).text
    if (!normalized) return []
    const matches: Array<[number, number]> = []
    let index = text.indexOf(normalized)
    while (index !== -1) {
      matches.push([index, index + normalized.length])
      index = text.indexOf(normalized, index + 1)
    }
    return matches
  })
}
function covered(start: number, end: number, allow: Array<[number, number]>): boolean {
  return allow.some(([left, right]) => start >= left && end <= right)
}
function patternRanges(text: string, patterns: string[]): Array<[number, number]> {
  return patterns.flatMap((source) =>
    [...text.matchAll(new RegExp(source, 'gu'))]
      .filter((match) => match[0].length > 0)
      .map((match) => [match.index, match.index + match[0].length] as [number, number]),
  )
}
function phraseRange(text: string, start: number, end: number): [number, number] {
  const boundary = /[，。！？；、,.!?;：:\r\n]/u
  while (start > 0 && !boundary.test(text[start - 1]!)) start--
  while (end < text.length && !boundary.test(text[end]!)) end++
  while (start < end && /\s/u.test(text[start]!)) start++
  while (end > start && /\s/u.test(text[end - 1]!)) end--
  return [start, end]
}
function supportedClaim(evidence: string, facts: string[]): boolean {
  return facts.some((fact) => {
    for (const [start] of ranges(fact, [evidence])) {
      if (!/(?:不是|并非|不含|没有|非|不|未)$/.test(fact.slice(Math.max(0, start - 3), start)))
        return true
    }
    return false
  })
}

export function checkSentence(
  sentence: string,
  corpus: FactCorpus,
  rules: RuleSet = defaultRules,
): RuleHit[] {
  const normalized = normalizeText(sentence)
  const facts = corpus.facts.map((fact) => normalizeText(fact).text)
  const hits: RuleHit[] = []
  if (rules.numbers) {
    const factNumbers = corpus.facts.flatMap(extractNumbers)
    const allowed = ranges(normalized.text, rules.numberWhitelist ?? []).map(([start, end]) =>
      originalSpan(normalized, start, end),
    )
    for (const number of extractNumbers(sentence)) {
      if (allowed.some((range) => number.start >= range.start && number.end <= range.end)) continue
      if (!factNumbers.some((fact) => fact.value === number.value && fact.unit === number.unit)) {
        hits.push({
          reason: 'unsupported_number',
          ruleId: 'numbers',
          evidence: number.raw,
          start: number.start,
          end: number.end,
        })
      }
    }
  }
  for (const rule of rules.rules) {
    const allowed = [
      ...ranges(normalized.text, rule.whitelist ?? []),
      ...patternRanges(normalized.text, rule.whitelistPatterns ?? []),
    ]
    const matches = ranges(normalized.text, rule.terms ?? [])
    for (const source of rule.patterns ?? [])
      for (const match of normalized.text.matchAll(new RegExp(source, 'gu'))) {
        if (match[0]) matches.push([match.index, match.index + match[0].length])
      }
    const seen = new Set<string>()
    for (const [start, end] of matches) {
      if (covered(start, end, allowed)) continue
      const [evidenceStart, evidenceEnd] =
        rule.evidenceScope === 'phrase' ? phraseRange(normalized.text, start, end) : [start, end]
      const evidence = normalized.text.slice(evidenceStart, evidenceEnd)
      if (!rule.always && supportedClaim(evidence, facts)) continue
      const span = originalSpan(normalized, evidenceStart, evidenceEnd)
      const key = `${span.start}:${span.end}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({
        reason: rule.reason,
        ruleId: rule.id,
        evidence: sentence.slice(span.start, span.end),
        ...span,
      })
    }
  }
  return hits.sort((a, b) => a.start - b.start || a.end - b.end)
}
