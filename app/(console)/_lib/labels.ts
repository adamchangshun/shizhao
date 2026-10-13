import type { GuardViolation } from '@/lib/core/schemas'
import type { ProjectState } from '@/lib/core/job-state'

export const STATE_LABEL: Record<ProjectState, string> = {
  generating: '生成中',
  previewable: '可预览',
  live: '已上线',
}

export const LAYOUT_LABEL: Record<string, string> = {
  poster: '海报版式',
  'card-stack': '卡片版式',
  'menu-board': '菜单版式',
}

export const REASON_LABEL: Record<GuardViolation['reason'], string> = {
  unsupported_number: '数字在商品信息里找不到依据',
  unsupported_claim: '说法在商品信息里找不到依据',
  ad_law_absolute: '广告法禁止的绝对化用语',
  llm_flagged: '复核判定与商品信息不符',
}

export function fieldLabel(field: string): string {
  if (field === 'headline') return '主标题'
  if (field === 'subhead') return '副标题'
  if (field === 'closing') return '结尾语'
  if (field.startsWith('itemBlurbs.')) return '商品介绍'
  return '文案'
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatPrice(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
}
