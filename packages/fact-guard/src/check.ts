import { extractNumbers } from './cn-number.js'
import { numberEvidence } from './grounding.js'
import { normalizeText, originalSpan } from './normalize.js'
import { defaultRules } from './rules/index.js'
import type { FactCorpus, RuleHit, RuleSet } from './types.js'

function literalRanges(text: string, words: string[]): Array<[number, number]> {
  return words.flatMap((word) => {
    if (!word) return []
    const matches: Array<[number, number]> = []
    let index = text.indexOf(word)
    while (index !== -1) {
      matches.push([index, index + word.length])
      index = text.indexOf(word, index + 1)
    }
    return matches
  })
}
function ranges(text: string, words: string[]): Array<[number, number]> {
  return literalRanges(
    text,
    words.map((word) => normalizeText(word).text),
  )
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
  const factSpans = literalRanges(sentence, corpus.facts)
  const hits: RuleHit[] = []
  if (rules.numbers) {
    const evidence = numberEvidence(sentence, corpus.facts)
    const allowed = ranges(normalized.text, rules.numberWhitelist ?? []).map(([start, end]) =>
      originalSpan(normalized, start, end),
    )
    for (const number of extractNumbers(sentence)) {
      if (allowed.some((range) => number.start >= range.start && number.end <= range.end)) continue
      const supported = evidence.inTime(number.start, number.end)
        ? covered(number.start, number.end, evidence.groundedTimes)
        : covered(number.start, number.end, evidence.groundedFacts) ||
          evidence.factNumbers.some(
            (fact) => fact.value === number.value && fact.unit === number.unit,
          )
      if (!supported) {
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
    ].filter(([start, end]) => {
      const span = originalSpan(normalized, start, end)
      // Normalization may reveal a violation, but must not manufacture an exemption.
      return span.end - span.start === end - start
    })
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
      const span = originalSpan(normalized, evidenceStart, evidenceEnd)
      const supported =
        rule.evidenceScope === 'fact-span'
          ? covered(span.start, span.end, factSpans)
          : supportedClaim(evidence, facts)
      if (!rule.always && supported) continue
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
