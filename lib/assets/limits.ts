export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export const MAX_REQUEST_BYTES = 100 * 1024 * 1024
export const MAX_IMAGES_PER_PROJECT = 20
export const MAX_TEXT_CHARS = 2000
/** About 40 megapixels; checked from the header before any full decode. */
export const MAX_INPUT_PIXELS = 40_000_000
export const PROCESS_TIMEOUT_MS = 20_000
export const PROCESS_CONCURRENCY = 2

export const SIZES = {
  display: { longEdge: 1600, quality: 82 },
  thumb: { longEdge: 480, quality: 75 },
} as const

export type AssetSize = keyof typeof SIZES

export function isAssetSize(value: string): value is AssetSize {
  return value === 'display' || value === 'thumb'
}
