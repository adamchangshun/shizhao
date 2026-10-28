// Deliberately limited to characters used by the shipped rule vocabulary/numerals.
const simplified: Record<string, string> = {
  終: '终',
  銷: '销',
  無: '无',
  優: '优',
  糧: '粮',
  機: '机',
  脂: '脂',
  國: '国',
  級: '级',
  頂: '顶',
  極: '极',
  獎: '奖',
  認: '认',
  證: '证',
  網: '网',
  紅: '红',
  號: '号',
  遺: '遗',
  糖: '糖',
  麥: '麦',
  進: '进',
  產: '产',
  裝: '装',
  蘭: '兰',
  雲: '云',
  熱: '热',
  賣: '卖',
  減: '减',
  療: '疗',
  養: '养',
  血: '血',
  助: '助',
  絕: '绝',
  萬: '万',
  億: '亿',
  兩: '两',
  貳: '贰',
  參: '叁',
  陸: '陆',
  鮮: '鲜',
  榨: '榨',
  烤: '烤',
  藥: '药',
  關: '关',
  注: '注',
  領: '领',
  轉: '转',
  發: '发',
  贊: '赞',
  價: '价',
  好: '好',
  後: '后',
  時: '时',
  種: '种',
  飽: '饱',
  腸: '肠',
  購: '购',
  檢: '检',
  測: '测',
  運: '运',
  採: '采',
  師: '师',
  選: '选',
  過: '过',
  獲: '获',
  榮: '荣',
  權: '权',
  麩: '麸',
  質: '质',
  體: '体',
  現: '现',
  點: '点',
  氣: '气',
  爐: '炉',
  製: '制',
  祕: '秘',
}
export interface NormalizedText {
  text: string
  starts: number[]
  ends: number[]
}
const graphemes = new Intl.Segmenter('und', { granularity: 'grapheme' })
const han = /\p{Script=Han}/u
const ignorable = /^(?:\p{Cf}|\p{Default_Ignorable_Code_Point})$/u
const interference =
  /^[\s\u200b-\u200f\u2060\ufeff*·~._\-+^|/\\#@]|\p{Extended_Pictographic}|[\ufe0e\ufe0f]$/u

export function isIgnorable(char: string): boolean {
  return ignorable.test(char)
}

function normalizeCompatibility(segment: string): string {
  let output = '',
    pending = ''
  for (const char of segment) {
    if (char !== '\u2025' && char !== '\u2026') {
      pending += char
      continue
    }
    output += pending.normalize('NFKC') + char
    pending = ''
  }
  return output + pending.normalize('NFKC')
}

/** Normalize with an explicit mapping; removed interference stays within matched source spans. */
export function normalizeText(input: string): NormalizedText {
  const tokens: Array<{ text: string; start: number; end: number }> = []
  // Remove controls before segmentation so they cannot split a combining sequence.
  let visible = ''
  const sourceStarts: number[] = [],
    sourceEnds: number[] = []
  let offset = 0
  for (const char of input) {
    if (!isIgnorable(char)) {
      visible += char
      for (let i = 0; i < char.length; i++) {
        sourceStarts.push(offset)
        sourceEnds.push(offset + char.length)
      }
    }
    offset += char.length
  }
  for (const { segment, index } of graphemes.segment(visible)) {
    // Normalize whole graphemes for canonical composition as well as compatibility
    // expansion, except horizontal ellipses that must not become clause-boundary dots.
    // Every resulting code unit maps to the complete source cluster.
    for (const char of normalizeCompatibility(segment)) {
      tokens.push({
        text: (simplified[char] ?? char).toLowerCase(),
        start: sourceStarts[index]!,
        end: sourceEnds[index + segment.length - 1]!,
      })
    }
  }
  const kept: typeof tokens = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (han.test(kept.at(-1)?.text ?? '') && interference.test(token.text)) {
      let next = i
      while (next < tokens.length && interference.test(tokens[next]!.text)) next++
      if (next - i <= 3 && han.test(tokens[next]?.text ?? '')) {
        i = next - 1
        continue
      }
    }
    kept.push(token)
  }
  const starts: number[] = [],
    ends: number[] = []
  for (const token of kept)
    for (let i = 0; i < token.text.length; i++) {
      starts.push(token.start)
      ends.push(token.end)
    }
  return { text: kept.map((t) => t.text).join(''), starts, ends }
}

export function originalSpan(
  text: NormalizedText,
  start: number,
  end: number,
): { start: number; end: number } {
  return { start: text.starts[start] ?? 0, end: text.ends[end - 1] ?? 0 }
}
