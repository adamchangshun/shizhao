import type { DesignSpec } from '../core/schemas'
import { hexToHsl } from './color'

export function isTooSimilar(a: DesignSpec, b: DesignSpec): boolean {
  if (a.templateId !== b.templateId) return false
  const first = hexToHsl(a.palette.primary)
  const second = hexToHsl(b.palette.primary)
  // Hue is unstable for near-gray colors: compare achromatic colors as one class.
  if (first.s < 0.1 || second.s < 0.1) return first.s < 0.1 && second.s < 0.1
  const delta = Math.abs(first.h - second.h)
  return Math.min(delta, 360 - delta) < 30
}
