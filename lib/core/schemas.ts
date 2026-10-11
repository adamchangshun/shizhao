// Code form of docs/CONTRACT.md section 3. Must stay identical to the contract; do not edit per module.
import { z } from 'zod'

export const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const FactSource = z.enum(['merchant_text', 'image_ocr', 'merchant_edit'])

export const Price = z.object({
  amount: z.number().nonnegative().multipleOf(0.01),
  currency: z.literal('CNY'),
  unit: z.string().min(1).max(8),            // 例如「个」「6 寸」「份」「杯」
})

export const FactItem = z.object({
  id: z.string().min(1),                     // 稳定 id，例如 nanoid(8)
  name: z.string().min(1).max(30),
  price: Price.optional(),
  spec: z.string().max(40).optional(),       // 规格，例如「约 450g」
  description: z.string().max(120).optional(),
  tags: z.array(z.string().max(10)).max(5).default([]),
  imageAssetIds: z.array(z.string()).max(6).default([]),
  sources: z.record(z.enum(['name', 'price', 'spec', 'description']), FactSource).default({}),
})

export const Shop = z.object({
  name: z.string().min(1).max(30),
  phone: z.string().max(20).optional(),
  wechat: z.string().max(40).optional(),
  address: z.string().max(80).optional(),
  hours: z.string().max(40).optional(),
  mapUrl: z.string().url().refine(u => u.startsWith('https://'), '仅允许 https 链接').optional(), // 渲染前再次校验
})

export const FactSheet = z.object({
  projectId: z.string(),
  revision: z.number().int().positive(),
  shop: Shop,
  items: z.array(FactItem).min(1).max(30),
  extraClaims: z.array(z.string().max(30)).max(10).default([]), // 商家明确声明的卖点，文案只能引用这里和上面的字段
  confirmedAt: z.string().datetime().nullable(),
})

export const TemplateId = z.enum(['poster', 'card-stack', 'menu-board'])
export const FontId = z.enum(['noto-sans-sc', 'noto-serif-sc', 'lxgw-wenkai', 'zcool-xiaowei', 'zcool-kuaile']) // 均为 OFL 许可

export const DesignSpec = z.object({
  templateId: TemplateId,
  palette: z.object({ bg: Hex, surface: Hex, primary: Hex, accent: Hex, text: Hex }),
  fontPair: z.object({ heading: FontId, body: FontId }),
  decoration: z.enum(['none', 'paper', 'confetti', 'line-art', 'grain']),
  heroLayout: z.enum(['full-bleed', 'split', 'stacked']),
  motion: z.enum(['none', 'subtle']),
  moodKeywords: z.array(z.string().max(6)).min(1).max(4),
  seed: z.number().int().nonnegative(),
})

export const CopyDraft = z.object({
  headline: z.string().min(1).max(20),
  subhead: z.string().max(40),
  itemBlurbs: z.record(z.string(), z.string().max(60)), // key 为 FactItem.id
  closing: z.string().max(40),
})

export const GuardViolation = z.object({
  field: z.string(),                         // 例如 'headline' 或 'itemBlurbs.ab12cd34'
  sentence: z.string(),
  reason: z.enum(['unsupported_number', 'unsupported_claim', 'ad_law_absolute', 'llm_flagged']),
  evidence: z.string().optional(),           // 命中的词或模型给出的理由
})

export const GuardResult = z.object({
  copy: CopyDraft,                           // 清洗后的文案
  violations: z.array(GuardViolation),       // 最初检测到的全部违规
  rewritten: z.number().int().nonnegative(), // 重写后通过的句数
  removed: z.number().int().nonnegative(),   // 最终删除的句数
})

export const JobStatus = z.enum(['queued', 'designing', 'writing', 'guarding', 'rendering', 'checking', 'succeeded', 'failed', 'timed_out'])

export const Usage = z.object({
  provider: z.string(),
  model: z.string(),
  stage: z.string(),                         // 例如 'extract' | 'design' | 'copy' | 'guard'
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costCny: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
})

export const QaIssue = z.object({
  severity: z.enum(['blocking', 'advisory']),
  code: z.string(),                          // 例如 'fact_mismatch' | 'horizontal_overflow' | 'image_broken'
  message: z.string(),
})
export const QaReport = z.object({ passed: z.boolean(), issues: z.array(QaIssue), screenshots: z.array(z.string()) })

export type Hex = z.infer<typeof Hex>
export type FactSource = z.infer<typeof FactSource>
export type Price = z.infer<typeof Price>
export type FactItem = z.infer<typeof FactItem>
export type Shop = z.infer<typeof Shop>
export type FactSheet = z.infer<typeof FactSheet>
export type TemplateId = z.infer<typeof TemplateId>
export type FontId = z.infer<typeof FontId>
export type DesignSpec = z.infer<typeof DesignSpec>
export type CopyDraft = z.infer<typeof CopyDraft>
export type GuardViolation = z.infer<typeof GuardViolation>
export type GuardResult = z.infer<typeof GuardResult>
export type JobStatus = z.infer<typeof JobStatus>
export type Usage = z.infer<typeof Usage>
export type QaIssue = z.infer<typeof QaIssue>
export type QaReport = z.infer<typeof QaReport>

// R7: per-field sentence → fact-path references, stored in versions.copyRefs.
export type CopyRefs = Record<string, Array<{ sentence: string; refs: string[] }>>
