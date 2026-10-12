// Fixed render inputs shared by tests and the demo script. Values are hand-written so the
// expected page text is known independently of the renderer.
import type { CopyDraft, DesignSpec, FactSheet, TemplateId } from '@/lib/core/schemas'

export const singleFacts: FactSheet = {
  projectId: 'proj_single',
  revision: 2,
  shop: {
    name: '甜心烘焙坊',
    phone: '021-6488 1234',
    wechat: 'tianxin_bake',
    address: '上海市徐汇区漕溪北路 88 号',
    hours: '每天 8:00-21:00',
  },
  items: [
    {
      id: 'ab12cd34',
      name: '草莓奶油蛋糕',
      price: { amount: 128, currency: 'CNY', unit: '6 寸' },
      spec: '约 450g',
      description: '当季草莓配动物奶油，每日现做。',
      tags: ['招牌', '需预订'],
      imageAssetIds: ['img_cake01'],
      sources: { name: 'merchant_text', price: 'merchant_text' },
    },
  ],
  extraClaims: ['当天现烤'],
  confirmedAt: '2026-10-12T02:00:00.000Z',
}

const menuNames: Array<[string, string, number, string]> = [
  ['m1aa0001', '美式咖啡', 18, '杯'],
  ['m1aa0002', '拿铁', 22.5, '杯'],
  ['m1aa0003', '燕麦拿铁', 25, '杯'],
  ['m1aa0004', '柠檬气泡美式', 26, '杯'],
  ['m1aa0005', '可颂', 12.5, '个'],
  ['m1aa0006', '肉桂卷', 16, '个'],
  ['m1aa0007', '芒果千层', 32, '份'],
  ['m1aa0008', '巧克力布朗尼', 18.8, '块'],
]

export const menuFacts: FactSheet = {
  projectId: 'proj_menu',
  revision: 1,
  shop: {
    name: '巷口咖啡',
    phone: '13800001234',
    wechat: 'xiangkou-coffee',
    address: '杭州市西湖区文三路 12 号',
    hours: '周一至周日 7:30-19:00',
    mapUrl: 'https://surl.amap.com/abc123',
  },
  items: menuNames.map(([id, name, amount, unit], i) => ({
    id,
    name,
    price: { amount, currency: 'CNY' as const, unit },
    ...(i === 0 ? { spec: '大杯 473ml' } : {}),
    ...(i === 1 ? { description: '意式浓缩加热牛奶。' } : {}),
    tags: i === 3 ? ['夏季限定'] : [],
    imageAssetIds: i < 3 ? [`img_menu0${i + 1}`] : [],
    sources: {},
  })),
  extraClaims: ['自家烘焙豆子', '可外带'],
  confirmedAt: '2026-10-12T02:00:00.000Z',
}

export const singleCopy: CopyDraft = {
  headline: '一口就是春天',
  subhead: '当季草莓，配上轻盈奶油',
  itemBlurbs: { ab12cd34: '切开那一刻，满满都是果香。' },
  closing: '欢迎到店，我们等你来尝。',
}

export const menuCopy: CopyDraft = {
  headline: '巷口的第一杯',
  subhead: '早上好，从一杯热咖啡开始',
  itemBlurbs: { m1aa0001: '清爽不苦，配什么都好。', m1aa0007: '层层叠叠的芒果香。' },
  closing: '路过的话，进来坐坐。',
}

export function designFor(templateId: TemplateId, overrides: Partial<DesignSpec> = {}): DesignSpec {
  const presets: Record<TemplateId, DesignSpec> = {
    poster: {
      templateId: 'poster',
      palette: { bg: '#fff8f3', surface: '#ffffff', primary: '#d64545', accent: '#f2b84b', text: '#2b1d1a' },
      fontPair: { heading: 'zcool-xiaowei', body: 'noto-sans-sc' },
      decoration: 'confetti',
      heroLayout: 'full-bleed',
      motion: 'subtle',
      moodKeywords: ['温暖', '甜'],
      seed: 7,
    },
    'card-stack': {
      templateId: 'card-stack',
      palette: { bg: '#f1f5ef', surface: '#ffffff', primary: '#2f6b4f', accent: '#e07a3f', text: '#1d2a22' },
      fontPair: { heading: 'noto-serif-sc', body: 'noto-sans-sc' },
      decoration: 'grain',
      heroLayout: 'stacked',
      motion: 'none',
      moodKeywords: ['清新'],
      seed: 3,
    },
    'menu-board': {
      templateId: 'menu-board',
      palette: { bg: '#1f2a24', surface: '#28362e', primary: '#f3d27a', accent: '#e8a87c', text: '#f4efe4' },
      fontPair: { heading: 'lxgw-wenkai', body: 'lxgw-wenkai' },
      decoration: 'line-art',
      heroLayout: 'split',
      motion: 'subtle',
      moodKeywords: ['复古', '黑板'],
      seed: 11,
    },
  }
  return { ...presets[templateId], ...overrides }
}

export const ALL_TEMPLATES: TemplateId[] = ['poster', 'card-stack', 'menu-board']
