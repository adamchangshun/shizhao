export { checkSentence } from './check.js'
export { splitSentences, guardDocument, guardText, computeDocumentRefs } from './document.js'
export { parseCnNumber, extractNumbers } from './cn-number.js'
export type { ParsedNumber } from './cn-number.js'
export { normalizeText } from './normalize.js'
export { defaultRules, rulePacks, mergeRules } from './rules/index.js'
export type {
  FactCorpus,
  Rule,
  RuleSet,
  RuleHit,
  Reason,
  Judge,
  Rewriter,
  GuardOptions,
  CopyRefs,
  DocumentResult,
} from './types.js'
