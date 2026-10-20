import { checkSentence } from './check.js'
import type { CopyRefs, DocumentResult, FactCorpus, GuardOptions, RuleHit } from './types.js'

/** Punctuation belongs to the preceding sentence. A trailing line break is preserved too. */
export function splitSentences(text: string): string[] {
  const sentences: string[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (!/[。！？；!?;\r\n]/u.test(text[i]!)) continue
    while (i + 1 < text.length && /[。！？；!?;\r\n]/u.test(text[i + 1]!)) i++
    const sentence = text.slice(start, i + 1)
    if (sentence.trim()) sentences.push(sentence)
    start = i + 1
  }
  const tail = text.slice(start)
  if (tail.trim()) sentences.push(tail)
  return sentences
}

export function computeDocumentRefs(fields: Record<string, string>, corpus: FactCorpus): CopyRefs {
  return Object.fromEntries(
    Object.entries(fields).map(([field, text]) => [
      field,
      splitSentences(text).map((sentence) => ({
        sentence,
        refs: [
          ...new Set([
            ...corpus.facts.flatMap((fact, i) =>
              fact && sentence.includes(fact) ? [corpus.paths?.[i] ?? `facts.${i}`] : [],
            ),
            ...(corpus.spanFacts ?? []).flatMap((fact, i) =>
              fact && sentence.includes(fact) ? [corpus.spanPaths?.[i] ?? `spanFacts.${i}`] : [],
            ),
          ]),
        ],
      })),
    ]),
  )
}

function copyCorpus(corpus: FactCorpus): FactCorpus {
  return {
    facts: [...corpus.facts],
    ...(corpus.paths ? { paths: [...corpus.paths] } : {}),
    ...(corpus.spanFacts ? { spanFacts: [...corpus.spanFacts] } : {}),
    ...(corpus.spanPaths ? { spanPaths: [...corpus.spanPaths] } : {}),
  }
}

interface Entry {
  field: string
  sentence: string
  hits: RuleHit[]
  output: string
}
function validateArray(
  value: unknown,
  length: number,
  valid: (item: unknown) => boolean,
): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length !== length || !value.every(valid))
    throw new Error('Invalid fact-guard callback result')
}

/** All fields share the same bounded judge/rewrite budget. Errors fail closed by throwing. */
export async function guardDocument(
  fields: Record<string, string>,
  corpus: FactCorpus,
  opts: GuardOptions = {},
): Promise<DocumentResult> {
  const check = (sentence: string, field: string) =>
    checkSentence(sentence, opts.corpusFor?.(field) ?? corpus, opts.rules)
  const entries: Entry[] = Object.entries(fields).flatMap(([field, text]) =>
    splitSentences(text).map((sentence) => ({
      field,
      sentence,
      hits: check(sentence, field),
      output: sentence,
    })),
  )
  async function judge(entriesToJudge: Entry[]) {
    if (!opts.judge || entriesToJudge.length === 0) return
    const results = await opts.judge({
      sentences: entriesToJudge.map((entry) => entry.sentence),
      facts: [...corpus.facts],
      ...(corpus.spanFacts ? { spanFacts: [...corpus.spanFacts] } : {}),
      // Scoped documents tell the judge which field each sentence is in and where each fact is from.
      ...(opts.corpusFor
        ? {
            fields: entriesToJudge.map((entry) => entry.field),
            ...(corpus.paths ? { paths: [...corpus.paths] } : {}),
            ...(corpus.spanPaths ? { spanPaths: [...corpus.spanPaths] } : {}),
            evidence: entriesToJudge.map((entry) => {
              const scoped = opts.corpusFor!(entry.field)
              return scoped === corpus ? null : copyCorpus(scoped)
            }),
          }
        : {}),
    })
    validateArray(
      results,
      entriesToJudge.length,
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { unsupported?: unknown }).unsupported === 'boolean' &&
        ((item as { reason?: unknown }).reason === undefined ||
          typeof (item as { reason?: unknown }).reason === 'string'),
    )
    entriesToJudge.forEach((entry, i) => {
      const result = results[i]!
      if (result.unsupported)
        entry.hits.push({
          reason: 'llm_flagged',
          ruleId: 'judge',
          evidence: result.reason ?? '无事实依据',
          start: 0,
          end: entry.sentence.length,
        })
    })
  }
  await judge(entries.filter((entry) => entry.hits.length === 0))
  const hits: DocumentResult['hits'] = entries.flatMap((entry) =>
    entry.hits.map((hit) => ({
      ...hit,
      sentence: entry.sentence,
      field: entry.field,
      phase: 'original' as const,
    })),
  )
  const bad = entries.filter((entry) => entry.hits.length > 0)
  for (const entry of bad) entry.output = ''
  let rewritten = 0
  if (opts.rewriter && bad.length > 0) {
    const selected = bad.slice(0, 10)
    const results = await opts.rewriter({
      items: selected.map((entry) => ({
        sentence: entry.sentence,
        problems: entry.hits.map((hit) => `${hit.reason}: ${hit.evidence}`),
      })),
      facts: [...corpus.facts],
      ...(corpus.spanFacts ? { spanFacts: [...corpus.spanFacts] } : {}),
    })
    validateArray(results, selected.length, (item) => typeof item === 'string')
    // A rewrite may introduce multiple sentences. Every one must pass; no unchecked tails.
    const replacementEntries = results.map((text, i) =>
      splitSentences(text).map((sentence) => ({
        field: selected[i]!.field,
        sentence,
        hits: check(sentence, selected[i]!.field),
        output: sentence,
      })),
    )
    await judge(replacementEntries.flat().filter((entry) => entry.hits.length === 0))
    replacementEntries.forEach((replacement, i) => {
      for (const entry of replacement)
        hits.push(
          ...entry.hits.map((hit) => ({
            ...hit,
            sentence: entry.sentence,
            field: entry.field,
            phase: 'rewrite' as const,
          })),
        )
      const candidate = replacement.map((entry) => entry.sentence).join('')
      const field = selected[i]!.field
      const existingLength = entries
        .filter((entry) => entry.field === field)
        .reduce((total, entry) => total + entry.output.length, 0)
      const limit = opts.maxFieldLengths?.[field] ?? Infinity
      if (
        replacement.length > 0 &&
        replacement.every((entry) => entry.hits.length === 0) &&
        existingLength + candidate.length <= limit
      ) {
        selected[i]!.output = candidate
        rewritten++
      }
    })
  }
  const cleaned = Object.fromEntries(
    Object.keys(fields).map((field) => [
      field,
      entries
        .filter((entry) => entry.field === field)
        .map((entry) => entry.output)
        .join(''),
    ]),
  )
  return {
    fields: cleaned,
    hits,
    rewritten,
    removed: bad.length - rewritten,
    copyRefs: computeDocumentRefs(cleaned, corpus),
  }
}

export async function guardText(text: string, corpus: FactCorpus, opts: GuardOptions = {}) {
  const result = await guardDocument({ text }, corpus, opts)
  return {
    text: result.fields.text ?? '',
    hits: result.hits,
    rewritten: result.rewritten,
    removed: result.removed,
  }
}
