import { describe, expect, it } from 'vitest'
import * as guard from '../src/index'
import type { Judge, Rewriter } from '../src/types'

describe('document cleaning', () => {
  it('removes an otherwise safe rewrite that exceeds its field budget', async () => {
    const result = await guard.guardDocument(
      { headline: '最好。暖意。' },
      { facts: [] },
      {
        maxFieldLengths: { headline: 8 },
        rewriter: async () => ['轻轻松松享受一个温暖的午后。'],
      },
    )
    expect(result).toMatchObject({ fields: { headline: '暖意。' }, rewritten: 0, removed: 1 })
  })
  it('splits at Chinese punctuation and line breaks, retaining punctuation and spacing', () => {
    expect(guard.splitSentences('午后。香气！好吗？慢慢喝；\n来坐坐\n')).toEqual([
      '午后。',
      '香气！',
      '好吗？',
      '慢慢喝；\n',
      '来坐坐\n',
    ])
  })
  it('rewrites once and retains every original rule hit', async () => {
    const result = await guard.guardText(
      '零糖配方。欢迎来坐坐。',
      { facts: [] },
      {
        rewriter: async () => ['香气扑鼻。'],
        judge: async ({ sentences }) => sentences.map(() => ({ unsupported: false })),
      },
    )
    expect(result).toMatchObject({ text: '香气扑鼻。欢迎来坐坐。', rewritten: 1, removed: 0 })
    expect(result.hits).toContainEqual(
      expect.objectContaining({ sentence: '零糖配方。', reason: 'unsupported_claim' }),
    )
  })
  it('deletes rewritten text with fresh numerical, absolute or model violations', async () => {
    for (const rewrite of ['99元。', '顶级口感。', '获得陌生荣誉。', '香气扑鼻。销量第一。']) {
      const result = await guard.guardText(
        '零糖配方。',
        { facts: [] },
        {
          rewriter: async () => [rewrite],
          judge: async ({ sentences }) =>
            sentences.map((sentence) => ({ unsupported: sentence.includes('陌生荣誉') })),
        },
      )
      expect(result).toMatchObject({ text: '', rewritten: 0, removed: 1 })
    }
  })
  it('judges once over all fields, rewrites only the first 10 bad sentences, judges rewritten text once', async () => {
    const batches: string[][] = [],
      rewrites: Array<{ sentence: string; problems: string[] }>[] = []
    const judge: Judge = async ({ sentences }) => {
      batches.push(sentences)
      return sentences.map((sentence) => ({
        unsupported: sentence.startsWith('陌生事实'),
        reason: '无事实依据',
      }))
    }
    const rewriter: Rewriter = async ({ items }) => {
      rewrites.push(items)
      return items.map(() => '香气扑鼻。')
    }
    const fields = {
      headline: '陌生事实。'.repeat(4),
      subhead: '陌生事实。'.repeat(4),
      closing: '陌生事实。'.repeat(4),
    }
    const result = await guard.guardDocument(fields, { facts: [] }, { judge, rewriter })
    expect(batches.map((b) => b.length)).toEqual([12, 10])
    expect(rewrites.map((b) => b.length)).toEqual([10])
    expect(result).toMatchObject({
      rewritten: 10,
      removed: 2,
      fields: {
        headline: '香气扑鼻。'.repeat(4),
        subhead: '香气扑鼻。'.repeat(4),
        closing: '香气扑鼻。'.repeat(2),
      },
    })
    expect(result.hits.filter((h) => h.phase === 'original')).toHaveLength(12)
  })
  it('generates references only for final output including rewritten fields', async () => {
    const result = await guard.guardDocument(
      { headline: '新西兰黄油。零糖配方。' },
      { facts: ['新西兰黄油', '当天现烤'], paths: ['items.cake.description', 'extraClaims.0'] },
      { rewriter: async () => ['当天现烤。'] },
    )
    expect(result.copyRefs).toEqual({
      headline: [
        { sentence: '新西兰黄油。', refs: ['items.cake.description'] },
        { sentence: '当天现烤。', refs: ['extraClaims.0'] },
      ],
    })
  })
  it('removes unsupported sentences without rewriting and leaves input intact', async () => {
    const fields = { headline: '最好。午后暖意。', subhead: '99元。' }
    expect(await guard.guardDocument(fields, { facts: [] })).toMatchObject({
      fields: { headline: '午后暖意。', subhead: '' },
      removed: 2,
    })
    expect(fields).toEqual({ headline: '最好。午后暖意。', subhead: '99元。' })
  })
  it('rejects incomplete callback arrays instead of treating missing judgments as supported', async () => {
    await expect(
      guard.guardText(
        '暖意。慢慢喝。',
        { facts: [] },
        { judge: async () => [{ unsupported: false }] },
      ),
    ).rejects.toThrow()
    await expect(
      guard.guardText('最好。顶级。', { facts: [] }, { rewriter: async () => ['暖意。'] }),
    ).rejects.toThrow()
  })
  it('propagates model failures and never returns unchecked rewrites', async () => {
    await expect(
      guard.guardText(
        '暖意。',
        { facts: [] },
        {
          judge: async () => {
            throw new Error('offline')
          },
        },
      ),
    ).rejects.toThrow('offline')
    await expect(
      guard.guardText(
        '最好。',
        { facts: [] },
        {
          rewriter: async () => {
            throw new Error('offline')
          },
        },
      ),
    ).rejects.toThrow('offline')
  })
  it('counts empty rewrites as removed, supports special field names safely', async () => {
    const fields = JSON.parse('{"__proto__":"最好。","constructor":"香气扑鼻。"}') as Record<
      string,
      string
    >
    const result = await guard.guardDocument(fields, { facts: [] }, { rewriter: async () => [''] })
    expect(Object.hasOwn(result.fields, '__proto__')).toBe(true)
    expect(result.fields['__proto__']).toBe('')
    expect(result.fields.constructor).toBe('香气扑鼻。')
    expect(result.removed).toBe(1)
  })
  it('checks each field and each rewrite against its own corpus and tells the judge fields and paths', async () => {
    const corpus = { facts: ['28元', '18元'], paths: ['items.a.price', 'items.b.price'] }
    const scoped = (field: string) =>
      field === 'b' ? { facts: ['18元'], paths: ['items.b.price'] } : corpus
    const judged: Parameters<Judge>[0][] = []
    const judge: Judge = async (input) => {
      judged.push(input)
      return input.sentences.map(() => ({ unsupported: false }))
    }
    const result = await guard.guardDocument(
      { a: '仅售28元。', b: '仅售28元。' },
      corpus,
      { corpusFor: scoped, judge, rewriter: async () => ['也是28元。'] },
    )
    expect(result.fields).toEqual({ a: '仅售28元。', b: '' })
    expect(result.hits.map((hit) => [hit.field, hit.phase, hit.reason])).toEqual([
      ['b', 'original', 'unsupported_number'],
      ['b', 'rewrite', 'unsupported_number'],
    ])
    expect(judged).toEqual([
      {
        sentences: ['仅售28元。'],
        facts: ['28元', '18元'],
        fields: ['a'],
        paths: ['items.a.price', 'items.b.price'],
        evidence: [null],
      },
    ])
  })
  it('leaves the judge payload unchanged without per-field corpora', async () => {
    const judged: Parameters<Judge>[0][] = []
    await guard.guardDocument(
      { a: '暖意。' },
      { facts: ['暖'], paths: ['items.a.name'] },
      {
        judge: async (input) => {
          judged.push(input)
          return [{ unsupported: false }]
        },
      },
    )
    expect(judged).toEqual([{ sentences: ['暖意。'], facts: ['暖'] }])
  })
})
