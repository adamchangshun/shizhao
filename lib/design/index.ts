import { z } from 'zod'
import { DesignSpec, TemplateId, type FactSheet, type Usage } from '../core/schemas'
import { getProvider, type ImageInput, type LLMProvider } from '../providers'
import { ensureContrast, PaletteContrastError } from './contrast'
import { hexToHsl, hslToHex } from './color'
import { normalizeFontPair } from './fonts'
import { isTooSimilar } from './similarity'
import { buildDesignPrompt, DESIGN_SYSTEM_PROMPT } from './prompt'
export { contrastRatio, hexToHsl, hslToHex, relativeLuminance } from './color'
export { ensureContrast, PaletteContrastError } from './contrast'
export { normalizeFontPair } from './fonts'
export { isTooSimilar } from './similarity'
export type GenerateDesignInput = {
  factSheet: FactSheet
  previousSpecs: DesignSpec[]
  seed: number
  heroImage?: ImageInput
}
export type GenerateDesignOptions = {
  provider?: LLMProvider
  signal?: AbortSignal
  timeoutMs?: number
}

// Keep the shared enum/hex constraints, but make the seed exclusively caller-owned.
const ModelDesignSpec = DesignSpec.omit({ seed: true }).extend({
  moodKeywords: z
    .array(z.string().regex(/^[\p{Script=Han}]{1,6}$/u, '请提供简体中文风格词'))
    .min(1)
    .max(4),
})

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
  const usage: Usage[] = []
  let requestSeed = seed
  for (let attempt = 0; attempt <= 2; attempt++) {
    const currentSeed = requestSeed
    requestSeed = requestSeed === Number.MAX_SAFE_INTEGER ? 0 : requestSeed + 1
    const result = await provider.generateJSON({
      stage: 'design',
      system: DESIGN_SYSTEM_PROMPT,
      prompt: buildDesignPrompt(input.factSheet, previous),
      schema: ModelDesignSpec,
      seed: currentSeed,
      temperature: 0.9,
      ...(input.heroImage ? { images: [input.heroImage] } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    })
    usage.push(result.usage)
    let readable: ReturnType<typeof ensureContrast>
    try {
      readable = ensureContrast(result.data.palette)
    } catch (error) {
      if (!(error instanceof PaletteContrastError)) throw error
      if (attempt < 2) continue
      readable = recoverContrast(result.data.palette)
    }
    const { palette, onPrimary } = readable
    const spec = DesignSpec.parse({
      ...result.data,
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
    if (!previous || !isTooSimilar(spec, previous)) return { spec, usage, onPrimary }
    if (attempt === 2) {
      const index = TemplateId.options.indexOf(spec.templateId)
      const templateId = TemplateId.options[(index + 1) % TemplateId.options.length]!
      return { spec: { ...spec, templateId }, usage, onPrimary }
    }
  }
  throw new Error('风格生成未完成')
}
