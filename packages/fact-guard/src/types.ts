export type Reason = 'unsupported_number' | 'unsupported_claim' | 'ad_law_absolute' | 'llm_flagged'
export interface FactCorpus {
  facts: string[]
  /** Optional paths parallel to facts, used for document source references. */
  paths?: string[]
  /** Whole-span evidence only; its words and numbers cannot support unrelated claims. */
  spanFacts?: string[]
  /** Optional paths parallel to spanFacts. References still require literal occurrences. */
  spanPaths?: string[]
}
export interface Rule {
  id: string
  reason: Exclude<Reason, 'unsupported_number' | 'llm_flagged'>
  terms?: string[]
  /** RegExp sources, run globally on normalized text. */
  patterns?: string[]
  whitelist?: string[]
  /** RegExp whitelist sources; exemptions also require a contiguous original span. */
  whitelistPatterns?: string[]
  /** fact-span requires the hit to be covered by a complete literal fact occurrence. */
  evidenceScope?: 'match' | 'phrase' | 'fact-span'
  /** Absolute and inducement rules ignore merchant evidence. */
  always?: boolean
}
export interface RuleSet {
  numbers?: boolean
  numberWhitelist?: string[]
  rules: Rule[]
}
export interface RuleHit {
  reason: Reason
  ruleId: string
  evidence: string
  /** Half-open UTF-16 offsets into the original sentence. */
  start: number
  end: number
}
export type Judge = (input: {
  sentences: string[]
  facts: string[]
  /** Span-only context, kept separate from general facts; honor the FactCorpus restrictions. */
  spanFacts?: string[]
}) => Promise<Array<{ unsupported: boolean; reason?: string }>>
export type Rewriter = (input: {
  items: Array<{ sentence: string; problems: string[] }>
  facts: string[]
  /** Span-only context; all rewrites are checked again against the original corpus. */
  spanFacts?: string[]
}) => Promise<string[]>
export interface GuardOptions {
  judge?: Judge
  rewriter?: Rewriter
  rules?: RuleSet
  /** Optional consumer contract limits. Oversized replacements are deleted, never truncated. */
  maxFieldLengths?: Record<string, number>
}
export type CopyRefs = Record<string, Array<{ sentence: string; refs: string[] }>>
export interface DocumentResult {
  fields: Record<string, string>
  hits: Array<RuleHit & { sentence: string; field: string; phase: 'original' | 'rewrite' }>
  copyRefs: CopyRefs
  rewritten: number
  removed: number
}
