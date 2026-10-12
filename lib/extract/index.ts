export { extractFacts, providerFailure, type ExtractResult, type ExtractOptions } from './extract'
export {
  confirmFacts,
  factsNotConfirmed,
  FactSheetEdit,
  getConfirmedFactSheet,
  getLatestFactSheet,
  saveMerchantEdit,
} from './facts'
export type { FactConflict } from './ground'
export { normalizePrice } from './price'
