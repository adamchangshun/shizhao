import type { DesignSpec } from '../core/schemas'
import { hexToHsl } from './color'

export function isTooSimilar(a: DesignSpec, b: DesignSpec): boolean {
  if (a.templateId !== b.templateId) return false
  const delta = Math.abs(hexToHsl(a.palette.primary).h - hexToHsl(b.palette.primary).h)
  return Math.min(delta, 360 - delta) < 30
}
