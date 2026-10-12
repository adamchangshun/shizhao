import type { DesignSpec } from '../core/schemas'
import { contrastRatio, hexToHsl, hslToHex } from './color'

/** A valid palette with no readable text on both surfaces; not a malformed color. */
export class PaletteContrastError extends RangeError {
  readonly code = 'unreadable_palette'

  constructor() {
    super('无法仅调整文字明度使两个背景的对比度同时达到 4.5:1')
    this.name = 'PaletteContrastError'
  }
}

export function ensureContrast(palette: DesignSpec['palette']): {
  palette: DesignSpec['palette']
  onPrimary: string
} {
  const onPrimary =
    contrastRatio('#ffffff', palette.primary) >= contrastRatio('#000000', palette.primary)
      ? '#ffffff'
      : '#000000'
  const readable = (text: string) =>
    contrastRatio(text, palette.bg) >= 4.5 && contrastRatio(text, palette.surface) >= 4.5
  if (readable(palette.text)) return { palette: { ...palette }, onPrimary }
  const original = hexToHsl(palette.text)
  // Both directions matter: two opposite backgrounds can require intermediate gray.
  // 0.01% steps are finer than a single 8-bit channel step. The loop always terminates.
  for (let step = 1; step <= 10000; step++) {
    for (const l of [original.l - step / 10000, original.l + step / 10000]) {
      if (l < 0 || l > 1) continue
      const text = hslToHex({ ...original, l })
      if (readable(text)) return { palette: { ...palette, text }, onPrimary }
    }
  }
  // Endpoints can fall between grid steps when the initial lightness is fractional.
  for (const l of [0, 1]) {
    const text = hslToHex({ ...original, l })
    if (readable(text)) return { palette: { ...palette, text }, onPrimary }
  }
  throw new PaletteContrastError()
}
