import type { RuleSet } from '../types.js'

export const defaultRules: RuleSet = {
  numbers: true,
  numberWhitelist: [
    '第一口',
    '第一次',
    '第一眼',
    '一百分的心情',
    '一如既往',
    '一心一意',
    '十足',
    '三言两语',
    '一年四季',
    '三五好友',
    '十全十美',
  ],
  rules: [
    {
      id: 'ingredients',
      reason: 'unsupported_claim',
      terms: [
        '零糖',
        '无糖',
        '低糖',
        '零添加',
        '无添加',
        '无防腐剂',
        '纯天然',
        '有机',
        '全麦',
        '0脂',
        '零脂',
        '低脂',
        '无麸质',
        '零蔗糖',
        '不含蔗糖',
      ],
      patterns: ['糖分(?:为|是)零', '不加[一0-9]*滴水'],
      whitelist: [],
    },
    {
      id: 'origin',
      reason: 'unsupported_claim',
      terms: ['进口', '原装', '新西兰', '法国', '日本', '云南', '远渡重洋', '高原牧场'],
      patterns: [
        '[\\p{Script=Han}]{2,8}(?:直供|直采|空运)',
        '产地[\\p{Script=Han}]{0,4}(?:直接|直供|直采)',
      ],
      whitelist: [],
    },
    {
      id: 'honors',
      reason: 'unsupported_claim',
      evidenceScope: 'fact-span',
      terms: [
        '认证',
        '获奖',
        '金奖',
        '米其林',
        '必吃榜',
        '网红',
        '老字号',
        '非遗',
        '官方',
        '指定',
        '权威检测',
        '冠军',
      ],
      patterns: ['(?:拿|得|获)(?:过|得)?奖', '星级酒店[\\p{Script=Han}]{0,4}出身'],
      whitelist: [],
    },
    {
      id: 'ranking',
      reason: 'unsupported_claim',
      evidenceScope: 'fact-span',
      terms: ['销量', '热卖', '排名', '爆款', '回头客', '回购率', '好评率', '领先'],
      patterns: [
        '\\btop\\s*[0-9]+',
        '\\bno\\.\\s*1\\b',
        '(?:每天|天天)[\\p{Script=Han}]{0,8}(?:售罄|断货|卖光)',
        '人气[\\p{Script=Han}]{0,8}(?:居高|攀升|领先)',
        '(?:全城|全市|全国)[\\p{Script=Han}]{0,6}(?:排队|抢购)',
      ],
      whitelist: [],
    },
    {
      id: 'effects',
      reason: 'unsupported_claim',
      terms: [
        '减肥',
        '养生',
        '美容',
        '治疗',
        '降血糖',
        '提高免疫力',
        '助消化',
        '吃不胖',
        '不长肉',
        '美白',
        '养胃',
      ],
      whitelist: [],
    },
    {
      id: 'absolute',
      reason: 'ad_law_absolute',
      always: true,
      terms: [
        '最',
        '顶级',
        '极品',
        '第一',
        '唯一',
        '首个',
        '国家级',
        '世界级',
        '绝对',
        '万能',
        '首选',
      ],
      patterns: ['100\\s*%', '百分之百', '\\bno\\.\\s*1\\b'],
      whitelist: ['最近', '最后', '最初'],
      whitelistPatterns: [
        '第一(?:口|次|眼)(?=$|\\p{P}|就|便|都|即|尝|看|见|来|喝|吃|的)',
        '最终(?![极级])',
      ],
    },
    {
      id: 'sharing',
      reason: 'unsupported_claim',
      always: true,
      terms: ['转发领', '分享后', '集赞', '砍价', '助力', '拉好友', '关注后领取', '不转不是'],
      patterns: [
        '(?:转发|分享|关注)[\\p{Script=Han}]{0,6}(?:领取|领|解锁|获赠|优惠)',
        '关注[^，。！？；、,.!?;\\r\\n]{0,4}送',
        '邀请好友[^。！？；.!?;\\r\\n]{0,16}(?:立减|优惠|领取|获赠|送)',
      ],
      whitelist: [],
    },
  ],
}
export const rulePacks: Record<'food', RuleSet> = {
  food: {
    rules: [
      {
        id: 'food-process',
        reason: 'unsupported_claim',
        terms: ['现做', '现烤', '鲜榨', '手工'],
        whitelist: [],
      },
      { id: 'food-effects', reason: 'unsupported_claim', terms: ['保健', '药膳'], whitelist: [] },
    ],
  },
}

/** Later entries with the same id replace earlier entries. Inputs are never mutated. */
export function mergeRules(...sets: RuleSet[]): RuleSet {
  const rules = new Map<string, RuleSet['rules'][number]>()
  let numbers: boolean | undefined, numberWhitelist: string[] | undefined
  for (const set of sets) {
    if (set.numbers !== undefined) numbers = set.numbers
    if (set.numberWhitelist !== undefined) numberWhitelist = [...set.numberWhitelist]
    for (const rule of set.rules)
      rules.set(rule.id, {
        ...rule,
        terms: rule.terms?.slice(),
        patterns: rule.patterns?.slice(),
        whitelist: rule.whitelist?.slice(),
        whitelistPatterns: rule.whitelistPatterns?.slice(),
      })
  }
  return {
    ...(numbers !== undefined ? { numbers } : {}),
    ...(numberWhitelist ? { numberWhitelist } : {}),
    rules: [...rules.values()],
  }
}
