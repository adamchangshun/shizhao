import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MockProvider, getProvider } from '@/lib/providers'
import { MockPageProvider } from '@/eval/lib/group-a'
import { buildExtractPrompt } from '@/lib/extract/prompt'
import { ModelDraft } from '@/lib/extract/schema'

const text = (dir: string) => fs.readFileSync(`eval/samples/${dir}/input.txt`, 'utf8')

async function extract(provider: MockProvider, merchantText: string, imageIds: string[] = []) {
  const prompt = buildExtractPrompt(
    merchantText,
    imageIds.map((id, i) => ({ id, index: i + 1 })),
  )
  const res = await provider.generateJSON({
    stage: 'extract',
    system: '',
    prompt,
    schema: ModelDraft,
  })
  return res.data
}

describe('MockProvider sample facts (pnpm demo)', () => {
  const demo = new MockProvider({ delay: false, sampleFacts: true })

  it('answers a bundled sample text with that sample, not the latte fixture', async () => {
    const draft = await extract(demo, text('bakery-croissant-single'), ['img-a'])
    expect(draft.shop).toMatchObject({ name: '麦香小铺', phone: '021-6123 4567' })
    expect(draft.items).toEqual([
      {
        name: '黄油可颂',
        price: { amount: 12, unit: '个' },
        spec: '约 80g',
        description: null,
        imageAssetIds: ['img-a'],
      },
    ])
    expect(draft.extraClaims).toEqual(['每天早上现烤'])
  })

  it('maps sample image files to the uploaded asset ids in sorted upload order', async () => {
    // egg-tart.png sorts before menu.png, so it is the first uploaded image.
    const draft = await extract(demo, text('bakery-dessert-menu'), ['first', 'second'])
    expect(draft.items.map((i) => [i.name, i.imageAssetIds])).toEqual([
      ['葡式蛋挞', ['first']],
      ['提拉米苏', []],
      ['巴斯克芝士蛋糕', []],
    ])
  })

  it('keeps the generic fixture for any other text', async () => {
    const draft = await extract(demo, `${text('bakery-croissant-single')}\n多一行`)
    expect(draft.shop?.name).toBe('午后小店')
  })

  it('is off unless enabled, so mock eval runs never see gold answers', async () => {
    const draft = await extract(new MockProvider({ delay: false }), text('bakery-croissant-single'))
    expect(draft.shop?.name).toBe('午后小店')
  })
})

describe('which MockProvider the app and the eval get', () => {
  it('the app provider (PROVIDER=mock) answers samples with their facts', async () => {
    const provider = getProvider()
    const prompt = buildExtractPrompt(text('bakery-croissant-single'), [])
    const res = await provider.generateJSON({
      stage: 'extract',
      system: '',
      prompt,
      schema: ModelDraft,
    })
    expect(res.data.shop?.name).toBe('麦香小铺')
  })
  it('the eval provider keeps the generic fixture for the same sample', async () => {
    const prompt = buildExtractPrompt(text('bakery-croissant-single'), [])
    const res = await new MockPageProvider().generateJSON({
      stage: 'extract',
      system: '',
      prompt,
      schema: ModelDraft,
    })
    expect(res.data.shop?.name).toBe('午后小店')
  })
})
