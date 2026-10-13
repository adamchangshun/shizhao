import type { JobStatus } from '../core/schemas'

/** The working stages of the pipeline, in order (contract section 4 without queued/terminal). */
export const STAGES = ['designing', 'writing', 'guarding', 'rendering', 'checking'] as const
export type Stage = (typeof STAGES)[number]

export function isStage(status: string): status is Stage {
  return (STAGES as readonly string[]).includes(status)
}

const LABELS: Record<JobStatus, string> = {
  queued: '排队中',
  designing: '正在设计风格',
  writing: '正在撰写文案',
  guarding: '正在核对文案事实',
  rendering: '正在生成页面',
  checking: '正在检查页面',
  succeeded: '已生成',
  failed: '生成失败',
  timed_out: '生成超时',
}

export function stageLabel(status: JobStatus): string {
  return LABELS[status]
}

/** Merchant-facing failure text per stage; technical details only go to the server log. */
export const STAGE_FAILURE: Record<Stage, string> = {
  designing: '风格生成服务暂时不可用，请稍后重试',
  writing: '文案生成服务暂时不可用，请稍后重试',
  guarding: '文案事实核对服务暂时不可用，请稍后重试',
  rendering: '页面生成失败，请稍后重试',
  checking: '页面信息核对未通过',
}

export const TIMEOUT_MESSAGE = '生成超时，请稍后重试'
