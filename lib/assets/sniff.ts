import { fileTypeFromFile } from 'file-type'

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'heif'

// Only these MIME types (from magic bytes) are accepted. AVIF, HEIC sequences, GIF, SVG, PDF and
// everything else are refused. Extension and client Content-Type are never consulted.
const ACCEPTED: Record<string, ImageFormat> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heif',
  'image/heif': 'heif',
}

/** Detects the format from the file header; null for anything outside the allow-list. */
export async function sniffImageFormat(filePath: string): Promise<ImageFormat | null> {
  const type = await fileTypeFromFile(filePath)
  return (type && ACCEPTED[type.mime]) ?? null
}
