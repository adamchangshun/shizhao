import { FontId, type DesignSpec } from '../core/schemas'

export function normalizeFontPair(pair: { heading: string; body: string }): DesignSpec['fontPair'] {
  const heading = FontId.safeParse(pair.heading)
  const body =
    pair.body === 'zcool-xiaowei'
      ? 'noto-serif-sc'
      : pair.body === 'lxgw-wenkai' || pair.body === 'noto-serif-sc'
        ? pair.body
        : 'noto-sans-sc'
  return { heading: heading.success ? heading.data : 'noto-sans-sc', body }
}
