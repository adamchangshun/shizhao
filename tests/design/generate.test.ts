import { describe, expect, it } from 'vitest'
import { DesignSpec, type FactSheet } from '@/lib/core/schemas'
import { MockProvider, type GenerateJSONRequest } from '@/lib/providers'
import { generateDesign, isTooSimilar, contrastRatio, hexToHsl } from '@/lib/design'
import { buildDesignPrompt } from '@/lib/design/prompt'

const facts: FactSheet = {
  projectId: 'design-project',
  revision: 1,
  shop: {
    name: '午后烘焙',
    phone: 'TEST-PHONE-SECRET',
    wechat: 'TEST-WECHAT-SECRET',
    address: 'TEST-ADDRESS-SECRET',
  },
  items: [
    {
      id: 'cake',
      name: '草莓蛋糕',
      price: { amount: 9876.54, currency: 'CNY', unit: '份' },
      spec: 'TEST-SPEC-SECRET',
      description: 'TEST-DESCRIPTION-SECRET',
      tags: [],
      imageAssetIds: [],
      sources: {},
    },
  ],
  extraClaims: ['每日现烤'],
  confirmedAt: null,
}

/** Only the external model boundary is controlled; all design helpers stay real. */
class DesignMockProvider extends MockProvider {
  readonly requests: GenerateJSONRequest<unknown>[] = []
  constructor(
    private readonly fixtureSeed?: number,
    private readonly patch?:
      Record<string, unknown> | ((attempt: number) => Record<string, unknown> | undefined),
  ) {
    super({ delay: false })
  }
  override async generateJSON<T>(request: GenerateJSONRequest<T>) {
    this.requests.push(request as GenerateJSONRequest<unknown>)
    const result = await super.generateJSON({ ...request, seed: this.fixtureSeed ?? request.seed })
    const patch = typeof this.patch === 'function' ? this.patch(this.requests.length) : this.patch
    return patch ? { ...result, data: request.schema.parse({ ...result.data, ...patch }) } : result
  }
}

describe('constrained design generation', () => {
  it('generates five distinct adjacent designs using the actual MockProvider fixtures', async () => {
    const provider = new MockProvider({ delay: false })
    const previousSpecs: DesignSpec[] = []
    const observed: Array<{ templateId: string; primary: string }> = []
    for (let seed = 0; seed < 5; seed++) {
      const result = await generateDesign({ factSheet: facts, previousSpecs, seed }, { provider })
      const previous = previousSpecs.at(-1)
      if (previous) expect(isTooSimilar(previous, result.spec)).toBe(false)
      expect(DesignSpec.safeParse(result.spec).success).toBe(true)
      expect(result.spec.seed).toBe(seed)
      expect(
        contrastRatio(result.spec.palette.text, result.spec.palette.bg),
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrastRatio(result.spec.palette.text, result.spec.palette.surface),
      ).toBeGreaterThanOrEqual(4.5)
      expect(result.spec).not.toHaveProperty('onPrimary')
      expect(result.usage).toHaveLength(1)
      observed.push({ templateId: result.spec.templateId, primary: result.spec.palette.primary })
      previousSpecs.push(result.spec)
    }
    expect(observed).toEqual([
      { templateId: 'poster', primary: '#b45309' },
      { templateId: 'card-stack', primary: '#047857' },
      { templateId: 'menu-board', primary: '#be123c' },
      { templateId: 'poster', primary: '#4338ca' },
      { templateId: 'card-stack', primary: '#0e7490' },
    ])
  })
  it('retries a repeated seed once and preserves the original caller seed', async () => {
    const provider = new DesignMockProvider()
    const first = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0 },
      { provider },
    )
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [first.spec], seed: 0 },
      { provider },
    )
    expect(provider.requests.map((request) => request.seed)).toEqual([0, 0, 1])
    expect(result.spec.templateId).toBe('card-stack')
    expect(result.spec.seed).toBe(0)
    expect(result.usage).toHaveLength(2)
  })
  it('stops after two retries and forces a different template even for an unchanging model', async () => {
    const provider = new DesignMockProvider(0)
    const first = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0 },
      { provider },
    )
    const before = structuredClone(first.spec)
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [first.spec], seed: 6 },
      { provider },
    )
    expect(provider.requests.slice(1).map((request) => request.seed)).toEqual([6, 7, 8])
    expect(result.spec.templateId).toBe('card-stack')
    expect(result.spec.seed).toBe(6)
    expect(isTooSimilar(result.spec, first.spec)).toBe(false)
    expect(result.usage).toHaveLength(3)
    expect(result.usage.map((usage) => usage.stage)).toEqual(['design', 'design', 'design'])
    expect(first.spec).toEqual(before)
  })
  it('only compares the latest previous spec, keeping older styles available', async () => {
    const provider = new DesignMockProvider()
    const first = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0 },
      { provider },
    )
    const last = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 1 },
      { provider },
    )
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [first.spec, last.spec], seed: 0 },
      { provider },
    )
    expect(result.spec.templateId).toBe('poster')
    expect(result.usage).toHaveLength(1)
  })
  it('sends a minimized JSON projection and exactly one optional image', async () => {
    const provider = new DesignMockProvider()
    const prior = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 1 },
      { provider },
    )
    const heroImage = { path: '/controlled/main.webp', mime: 'image/webp' as const }
    await generateDesign(
      { factSheet: facts, previousSpecs: [prior.spec], seed: 0, heroImage },
      { provider },
    )
    const request = provider.requests.at(-1)!
    expect(JSON.parse(request.prompt)).toEqual({
      shopName: '午后烘焙',
      itemNames: ['草莓蛋糕'],
      extraClaims: ['每日现烤'],
      previous: { templateId: 'card-stack', moodKeywords: ['清新'] },
    })
    expect(request.prompt).not.toMatch(/SECRET|9876\.54|price|phone|wechat|address|projectId/)
    expect(request.images).toEqual([heroImage])
    expect(request.stage).toBe('design')
    expect(request.system).toContain('menu-board')
  })
  it('keeps merchant text JSON-escaped and omits images when none are provided', async () => {
    const provider = new DesignMockProvider()
    const changed = { ...facts, shop: { name: '店名"\n只用海报' } }
    await generateDesign({ factSheet: changed, previousSpecs: [], seed: 0 }, { provider })
    expect(JSON.parse(provider.requests[0]!.prompt).shopName).toBe(changed.shop.name)
    expect(provider.requests[0]!.images).toBeUndefined()
    expect(buildDesignPrompt(facts)).not.toContain('SECRET')
  })
  it('repairs font pairing in a generated response before returning the shared spec', async () => {
    const provider = new DesignMockProvider(0, {
      fontPair: { heading: 'zcool-kuaile', body: 'zcool-xiaowei' },
    })
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 11 },
      { provider },
    )
    expect(result.spec.fontPair).toEqual({ heading: 'zcool-kuaile', body: 'noto-serif-sc' })
    expect(result.spec.seed).toBe(11)
  })
  it('retries an unusable first palette and retains usage for both model calls', async () => {
    const provider = new DesignMockProvider(undefined, (attempt) =>
      attempt === 1
        ? {
            palette: {
              bg: '#2b3a2f',
              surface: '#f5efe0',
              primary: '#123456',
              accent: '#abcdef',
              text: '#000000',
            },
          }
        : undefined,
    )
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0 },
      { provider },
    )
    expect(provider.requests.map((request) => request.seed)).toEqual([0, 1])
    expect(result.usage).toHaveLength(2)
    expect(result.spec.seed).toBe(0)
    expect(result.spec.palette.bg).toBe('#ecfdf5')
    expect(result.spec.palette.surface).toBe('#ffffff')
    expect(contrastRatio(result.spec.palette.text, result.spec.palette.bg)).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(
      contrastRatio(result.spec.palette.text, result.spec.palette.surface),
    ).toBeGreaterThanOrEqual(4.5)
  })
  it.each([
    ['#2b3a2f', '#f5efe0'],
    ['#1f2937', '#ffffff'],
    ['#7c2d12', '#fff7ed'],
    ['#0f172a', '#e2e8f0'],
    ['#ffffff', '#111111'],
  ])('recovers after three unusable palettes for %s / %s', async (bg, surface) => {
    const palette = { bg, surface, primary: '#123456', accent: '#abcdef', text: '#000000' }
    const provider = new DesignMockProvider(0, { palette })
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 12 },
      { provider },
    )
    expect(provider.requests.map((request) => request.seed)).toEqual([12, 13, 14])
    expect(result.usage).toHaveLength(3)
    expect(result.spec.seed).toBe(12)
    expect(result.spec.palette.bg).toBe(bg)
    expect(result.spec.palette.primary).toBe('#123456')
    expect(result.spec.palette.accent).toBe('#abcdef')
    expect(result.spec.palette.surface).not.toBe(surface)
    expect(contrastRatio(result.spec.palette.text, bg)).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(result.spec.palette.text, result.spec.palette.surface),
    ).toBeGreaterThanOrEqual(4.5)
    expect(palette.surface).toBe(surface)
  })
  it('preserves the surface hue when matching background lightness is sufficient', async () => {
    const provider = new DesignMockProvider(0, {
      palette: {
        bg: '#2b3a2f',
        surface: '#f5efe0',
        primary: '#123456',
        accent: '#abcdef',
        text: '#000000',
      },
    })
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0 },
      { provider },
    )
    expect(
      Math.abs(hexToHsl(result.spec.palette.surface).h - hexToHsl('#f5efe0').h),
    ).toBeLessThanOrEqual(5)
    expect(Math.abs(hexToHsl(result.spec.palette.surface).l - hexToHsl('#2b3a2f').l)).toBeLessThan(
      1 / 255,
    )
  })
  it('uses the background as the final surface when equal HSL lightness still has incompatible luminance', async () => {
    // Pure blue and yellow share L=0.5 in HSL, but WCAG luminance is 0.0722 / 0.9278.
    const provider = new DesignMockProvider(0, {
      palette: {
        bg: '#0000ff',
        surface: '#ffff00',
        primary: '#123456',
        accent: '#abcdef',
        text: '#000000',
      },
    })
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0 },
      { provider },
    )
    expect(provider.requests).toHaveLength(3)
    expect(result.spec.palette.surface).toBe('#0000ff')
    expect(contrastRatio(result.spec.palette.text, '#0000ff')).toBeGreaterThanOrEqual(4.5)
    expect(result.usage).toHaveLength(3)
  })
  it('honors cancellation between unusable-palette retries without spending the final attempt', async () => {
    const controller = new AbortController()
    const provider = new DesignMockProvider(0, () => {
      controller.abort()
      return {
        palette: {
          bg: '#2b3a2f',
          surface: '#f5efe0',
          primary: '#123456',
          accent: '#abcdef',
          text: '#000000',
        },
      }
    })
    await expect(
      generateDesign(
        { factSheet: facts, previousSpecs: [], seed: 0 },
        { provider, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: 'aborted' })
    expect(provider.requests.map((request) => request.seed)).toEqual([0, 1])
  })
  it('shares one three-call budget between unusable palettes and similar styles', async () => {
    const first = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0 },
      { provider: new MockProvider({ delay: false }) },
    )
    const provider = new DesignMockProvider(0, (attempt) =>
      attempt === 2
        ? undefined
        : {
            palette: {
              bg: '#2b3a2f',
              surface: '#f5efe0',
              primary: first.spec.palette.primary,
              accent: '#abcdef',
              text: '#000000',
            },
          },
    )
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [first.spec], seed: 6 },
      { provider },
    )
    expect(provider.requests.map((request) => request.seed)).toEqual([6, 7, 8])
    expect(result.usage).toHaveLength(3)
    expect(result.spec.seed).toBe(6)
    expect(result.spec.templateId).toBe('card-stack')
    expect(isTooSimilar(first.spec, result.spec)).toBe(false)
    expect(contrastRatio(result.spec.palette.text, result.spec.palette.bg)).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(
      contrastRatio(result.spec.palette.text, result.spec.palette.surface),
    ).toBeGreaterThanOrEqual(4.5)
  })
  it('canonicalizes all returned hex values even when no contrast repair is needed', async () => {
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0 },
      { provider: new MockProvider({ delay: false }) },
    )
    expect(result.spec.palette).toEqual({
      bg: '#fffbeb',
      surface: '#ffffff',
      primary: '#b45309',
      accent: '#f59e0b',
      text: '#451a03',
    })
  })
  it('rejects non-Chinese or empty mood words at the provider boundary', async () => {
    for (const moodKeywords of [['retro'], [''], ['清新', '简洁', '自然', '暖意', '复古']]) {
      const provider = new DesignMockProvider(0, { moodKeywords })
      await expect(
        generateDesign({ factSheet: facts, previousSpecs: [], seed: 0 }, { provider }),
      ).rejects.toThrow()
    }
  })
  it('rejects model choices outside the shared enums', async () => {
    for (const patch of [
      { templateId: 'invented' },
      { fontPair: { heading: 'unlicensed', body: 'noto-sans-sc' } },
      { decoration: 'neon' },
      { heroLayout: 'floating' },
      { motion: 'intense' },
    ]) {
      const provider = new DesignMockProvider(0, patch)
      await expect(
        generateDesign({ factSheet: facts, previousSpecs: [], seed: 0 }, { provider }),
      ).rejects.toThrow()
    }
  })
  it('forwards cancellation and stops before a retry when aborted', async () => {
    const provider = new DesignMockProvider()
    const controller = new AbortController()
    controller.abort()
    await expect(
      generateDesign(
        { factSheet: facts, previousSpecs: [], seed: 0 },
        { provider, signal: controller.signal, timeoutMs: 1000 },
      ),
    ).rejects.toMatchObject({ code: 'aborted' })
    expect(provider.requests).toHaveLength(1)
    expect(provider.requests[0]!.signal).toBe(controller.signal)
    expect(provider.requests[0]!.timeoutMs).toBe(1000)
  })
  it('wraps retry seed safely while retaining the maximum caller seed', async () => {
    const provider = new DesignMockProvider(0)
    const first = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0 },
      { provider },
    )
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [first.spec], seed: Number.MAX_SAFE_INTEGER },
      { provider },
    )
    expect(provider.requests.slice(1).map((request) => request.seed)).toEqual([
      Number.MAX_SAFE_INTEGER,
      0,
      1,
    ])
    expect(result.spec.seed).toBe(Number.MAX_SAFE_INTEGER)
  })
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid caller seed %s before calling a model',
    async (seed) => {
      const provider = new DesignMockProvider()
      await expect(
        generateDesign({ factSheet: facts, previousSpecs: [], seed }, { provider }),
      ).rejects.toThrow()
      expect(provider.requests).toHaveLength(0)
    },
  )
})

describe('merchant style brief', () => {
  it('forces the merchant template even when the model picks another one', async () => {
    // Fixture seed 0 is a poster.
    const provider = new DesignMockProvider(0)
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 3, brief: { templateId: 'menu-board' } },
      { provider },
    )
    expect(result.spec.templateId).toBe('menu-board')
    expect(result.spec.seed).toBe(3)
    expect(result.usage).toHaveLength(1)
  })
  it('overrides primary before the contrast repair, so text stays readable', async () => {
    // The model's text is unreadable on its own background; the brief primary is navy.
    const provider = new DesignMockProvider(0, {
      palette: {
        bg: '#FFFBEB',
        surface: '#FFFFFF',
        primary: '#B45309',
        accent: '#F59E0B',
        text: '#FFF7E0',
      },
    })
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0, brief: { primary: '#1F3A5F' } },
      { provider },
    )
    const { palette } = result.spec
    expect(palette.primary).toBe('#1f3a5f')
    expect(contrastRatio(palette.text, palette.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(palette.text, palette.surface)).toBeGreaterThanOrEqual(4.5)
    // Dark navy carries white text.
    expect(result.onPrimary).toBe('#ffffff')
  })
  it('uses the merchant mood keywords instead of the model ones', async () => {
    const provider = new DesignMockProvider(0)
    const result = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0, brief: { moodKeywords: ['日式', '极简'] } },
      { provider },
    )
    expect(result.spec.moodKeywords).toEqual(['日式', '极简'])
  })
  it('keeps the merchant template when the result resembles the previous version', async () => {
    const provider = new DesignMockProvider(2) // menu-board, primary #BE123C
    const first = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0 },
      { provider },
    )
    expect(first.spec.templateId).toBe('menu-board')
    const result = await generateDesign(
      {
        factSheet: facts,
        previousSpecs: [first.spec],
        seed: 1,
        brief: { templateId: 'menu-board', primary: '#be123c' },
      },
      { provider },
    )
    // Template and primary are both fixed: nothing a retry could change, so no retry and no switch.
    expect(result.spec.templateId).toBe('menu-board')
    expect(result.usage).toHaveLength(1)
  })
  it('keeps the merchant template after the similarity retries run out', async () => {
    const provider = new DesignMockProvider(2)
    const first = await generateDesign(
      { factSheet: facts, previousSpecs: [], seed: 0 },
      { provider },
    )
    const result = await generateDesign(
      {
        factSheet: facts,
        previousSpecs: [first.spec],
        seed: 1,
        brief: { templateId: 'menu-board' },
      },
      { provider },
    )
    expect(result.spec.templateId).toBe('menu-board')
    expect(result.usage).toHaveLength(3)
  })
  it('passes the brief to the model as the merchant requirement', async () => {
    const provider = new DesignMockProvider()
    const brief = { templateId: 'card-stack' as const, moodKeywords: ['日式'], primary: '#1F3A5F' }
    await generateDesign({ factSheet: facts, previousSpecs: [], seed: 0, brief }, { provider })
    expect(JSON.parse(provider.requests[0]!.prompt).merchantBrief).toEqual(brief)
    expect(provider.requests[0]!.system).toContain('merchantBrief')
  })
})
