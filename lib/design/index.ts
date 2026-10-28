import { z } from 'zod'
import { DesignSpec, TemplateId, type FactSheet, type Usage } from '../core/schemas'
import { getProvider, type ImageInput, type LLMProvider } from '../providers'
import { MoodKeywords, type StyleBrief } from './brief'
import { ensureContrast, PaletteContrastError } from './contrast'
import { hexToHsl, hslToHex } from './color'
import { normalizeFontPair } from './fonts'
import { isTooSimilar } from './similarity'
import { buildDesignPrompt, DESIGN_SYSTEM_PROMPT } from './prompt'
export { contrastRatio, hexToHsl, hslToHex, relativeLuminance } from './color'
export { ensureContrast, PaletteContrastError } from './contrast'
export { normalizeFontPair } from './fonts'
export { isTooSimilar } from './similarity'
export { MOOD_KEYWORD, parseStyleBrief, StyleBrief } from './brief'
export type GenerateDesignInput = {
  factSheet: FactSheet
  previousSpecs: DesignSpec[]
  seed: number
  heroImage?: ImageInput
  /** Merchant preferences; whatever it sets wins over the model's choice. */
  brief?: StyleBrief
}
export type GenerateDesignOptions = {
  provider?: LLMProvider
  signal?: AbortSignal
  timeoutMs?: number
}

// Keep the shared enum/hex constraints, but make the seed exclusively caller-owned.
const ModelDesignSpec = DesignSpec.omit({ seed: true }).extend({ moodKeywords: MoodKeywords })

/** Only used after exhausting the shared model retry budget. */
function recoverContrast(palette: DesignSpec['palette']): ReturnType<typeof ensureContrast> {
  try {
    // Keep the surface's hue/saturation while moving it beside the background.
    const surface = hslToHex({ ...hexToHsl(palette.surface), l: hexToHsl(palette.bg).l })
    return ensureContrast({ ...palette, surface })
  } catch (error) {
    if (!(error instanceof PaletteContrastError)) throw error
    // Equal surfaces always admit black or white text. This is the final fallback.
    return ensureContrast({ ...palette, surface: palette.bg })
  }
}

export async function generateDesign(
  input: GenerateDesignInput,
  options: GenerateDesignOptions = {},
): Promise<{ spec: DesignSpec; usage: Usage[]; onPrimary: string }> {
  const seed = z.number().int().nonnegative().safe().parse(input.seed)
  const provider = options.provider ?? getProvider()
  const previous = input.previousSpecs.at(-1)
  const brief = input.brief ?? {}
  // With both fixed, a retry can change neither of the two things similarity compares.
  const locked = brief.templateId !== undefined && brief.primary !== undefined
  const usage: Usage[] = []
  let requestSeed = seed
  for (let attempt = 0; attempt <= 2; attempt++) {
    const currentSeed = requestSeed
    requestSeed = requestSeed === Number.MAX_SAFE_INTEGER ? 0 : requestSeed + 1
    const result = await provider.generateJSON({
      stage: 'design',
      system: DESIGN_SYSTEM_PROMPT,
      prompt: buildDesignPrompt(input.factSheet, previous, input.brief),
      schema: ModelDesignSpec,
      seed: currentSeed,
      temperature: 0.9,
      ...(input.heroImage ? { images: [input.heroImage] } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    })
    usage.push(result.usage)
    // The merchant's primary replaces the model's before the text contrast is repaired.
    const modelPalette = brief.primary
      ? { ...result.data.palette, primary: brief.primary }
      : result.data.palette
    let readable: ReturnType<typeof ensureContrast>
    try {
      readable = ensureContrast(modelPalette)
    } catch (error) {
      if (!(error instanceof PaletteContrastError)) throw error
      if (attempt < 2) continue
      readable = recoverContrast(modelPalette)
    }
    const { palette, onPrimary } = readable
    const spec = DesignSpec.parse({
      ...result.data,
      ...(brief.templateId ? { templateId: brief.templateId } : {}),
      ...(brief.moodKeywords ? { moodKeywords: brief.moodKeywords } : {}),
      palette: {
        bg: palette.bg.toLowerCase(),
        surface: palette.surface.toLowerCase(),
        primary: palette.primary.toLowerCase(),
        accent: palette.accent.toLowerCase(),
        text: palette.text.toLowerCase(),
      },
      fontPair: normalizeFontPair(result.data.fontPair),
      seed,
    })
    if (!previous || locked || !isTooSimilar(spec, previous)) return { spec, usage, onPrimary }
    if (attempt === 2) {
      // A merchant-chosen template is never switched away from.
      if (brief.templateId) return { spec, usage, onPrimary }
      const index = TemplateId.options.indexOf(spec.templateId)
      const templateId = TemplateId.options[(index + 1) % TemplateId.options.length]!
      return { spec: { ...spec, templateId }, usage, onPrimary }
    }
  }
  throw new Error('风格生成未完成')
}
