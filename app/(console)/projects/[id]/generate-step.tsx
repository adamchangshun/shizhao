'use client'

import { useEffect, useId, useRef, useState } from 'react'
import useSWR from 'swr'
import type { ProjectState } from '@/lib/core/job-state'
import { MOOD_KEYWORD, StyleBrief } from '@/lib/design/brief'
import { ClientError, messageOf, postJson } from '../../_lib/api'
import type { JobView, ProjectDetail } from '../../_lib/types'
import s from '../../shell.module.css'
import { StepHeading } from './step-heading'
import w from './wizard.module.css'

const POLL_MS = 1500
const STAGES = [
  ['designing', '设计风格'],
  ['writing', '撰写文案'],
  ['guarding', '核对事实'],
  ['rendering', '生成页面'],
  ['checking', '检查页面'],
] as const
const TERMINAL = new Set(['succeeded', 'failed', 'timed_out'])

const TEMPLATES = [
  ['poster', '海报', '一张主图做视觉焦点，适合招牌单品或活动'],
  ['card-stack', '卡片叠放', '商品分卡片纵向排列，适合少量商品或系列'],
  ['menu-board', '菜单板', '黑板或木板菜单质感，适合多品菜单'],
] as const

/** What the merchant typed into 风格偏好; kept by the workspace so a regeneration reuses it. */
export interface StyleBriefDraft {
  templateId: '' | (typeof TEMPLATES)[number][0]
  keywords: string
  usePrimary: boolean
  primary: string
}

export const EMPTY_BRIEF_DRAFT: StyleBriefDraft = {
  templateId: '',
  keywords: '',
  usePrimary: false,
  primary: '#1f3a5f',
}

const draftKey = (projectId: string) => `shizhao:style-brief:${projectId}`

/** The last style preferences used in this browser for the project, if any were saved. */
export function loadBriefDraft(projectId: string): StyleBriefDraft | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(draftKey(projectId)) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return null
    const d = raw as Record<string, unknown>
    const templateId = TEMPLATES.find(([id]) => id === d.templateId)?.[0] ?? ''
    return {
      templateId,
      keywords: typeof d.keywords === 'string' ? d.keywords.slice(0, 60) : '',
      usePrimary: d.usePrimary === true,
      primary:
        typeof d.primary === 'string' && /^#[0-9a-f]{6}$/i.test(d.primary)
          ? d.primary
          : EMPTY_BRIEF_DRAFT.primary,
    }
  } catch {
    return null
  }
}

export function saveBriefDraft(projectId: string, draft: StyleBriefDraft): void {
  try {
    localStorage.setItem(draftKey(projectId), JSON.stringify(draft))
  } catch {
    // Storage may be unavailable (private mode); the draft then lives for this visit only.
  }
}

export type BriefResult =
  { ok: true; body?: { styleBrief: StyleBrief } } | { ok: false; message: string }

/** Draft → request body for POST /jobs; nothing filled in sends no body at all. */
export function briefRequest(draft: StyleBriefDraft): BriefResult {
  const words = draft.keywords.split(/[,，、\s]+/).filter(Boolean)
  if (words.length > 4 || words.some((k) => !MOOD_KEYWORD.test(k))) {
    return { ok: false, message: '风格词需要 1～4 个，每个 1～6 个汉字，用逗号分开' }
  }
  const brief = StyleBrief.parse({
    ...(draft.templateId ? { templateId: draft.templateId } : {}),
    ...(words.length > 0 ? { moodKeywords: words } : {}),
    ...(draft.usePrimary ? { primary: draft.primary } : {}),
  })
  return Object.keys(brief).length > 0 ? { ok: true, body: { styleBrief: brief } } : { ok: true }
}

interface StylePreferencesProps {
  value: StyleBriefDraft
  onChange: (next: StyleBriefDraft) => void
  /** Opens the section and marks the keywords field when the last attempt was rejected. */
  invalid?: boolean
}

/** 风格偏好（可选）: collapsed by default; every field may stay empty. */
export function StylePreferences({ value, onChange, invalid = false }: StylePreferencesProps) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<StyleBriefDraft>) => onChange({ ...value, ...patch })
  return (
    <details
      className={`${s.card} ${w.brief}`}
      open={open || invalid}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className={w.briefSummary}>风格偏好（可选）</summary>
      <p className={s.hint}>不填就由 AI 自由搭配；填了的项目，生成结果一定照做。</p>
      <fieldset className={w.briefTemplates}>
        <legend className={s.label}>版式</legend>
        {[['', '不指定', '由 AI 按商品挑选'] as const, ...TEMPLATES].map(([id, name, note]) => (
          <label key={id || 'auto'} className={w.briefOption}>
            <input
              type="radio"
              name={`${uid}-template`}
              value={id}
              checked={value.templateId === id}
              onChange={() => set({ templateId: id })}
            />
            <span>
              <span className={w.briefOptionName}>{name}</span>
              <span className={s.small}>{note}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className={s.field}>
        <label htmlFor={`${uid}-keywords`} className={s.label}>
          风格词
        </label>
        <input
          id={`${uid}-keywords`}
          className={s.input}
          value={value.keywords}
          placeholder="例如：日式，极简"
          aria-describedby={`${uid}-keywords-h`}
          aria-invalid={invalid || undefined}
          onChange={(e) => set({ keywords: e.target.value })}
        />
        <span id={`${uid}-keywords-h`} className={s.hint}>
          1～4 个，每个 1～6 个汉字，用逗号分开。
        </span>
      </div>
      <div className={w.briefColor}>
        <label className={w.briefOption}>
          <input
            type="checkbox"
            checked={value.usePrimary}
            onChange={(e) => set({ usePrimary: e.target.checked })}
          />
          <span>指定主色</span>
        </label>
        <label htmlFor={`${uid}-primary`} className={s.srOnly}>
          主色
        </label>
        <input
          id={`${uid}-primary`}
          type="color"
          className={w.briefSwatch}
          value={value.primary}
          disabled={!value.usePrimary}
          onChange={(e) => set({ primary: e.target.value })}
        />
        {value.usePrimary && <span className={s.small}>{value.primary}</span>}
      </div>
    </details>
  )
}

interface GenerateStepProps {
  projectId: string
  jobId: string | null
  state: ProjectState | null
  brief: StyleBriefDraft
  onBriefChange: (next: StyleBriefDraft) => void
  /** The job ended: true when it produced a new version. */
  onFinished: (ok: boolean) => void
  onRestarted: (jobId: string) => void
}

export function GenerateStep(props: GenerateStepProps) {
  // Without a job id (e.g. opened from the list while generating) only the project state is known.
  return props.jobId ? <JobProgress {...props} jobId={props.jobId} /> : <ProjectWait {...props} />
}

function JobProgress({
  projectId,
  jobId,
  brief,
  onBriefChange,
  onFinished,
  onRestarted,
}: GenerateStepProps & { jobId: string }) {
  // SWR stops polling when this component unmounts, once the job reaches a final state, and
  // after an error that retrying cannot fix (job gone, not signed in).
  const [halted, setHalted] = useState(false)
  const { data: job, error } = useSWR<JobView>(`/api/jobs/${encodeURIComponent(jobId)}`, {
    refreshInterval: (latest) => (halted || (latest && TERMINAL.has(latest.status)) ? 0 : POLL_MS),
    dedupingInterval: 0,
    onError: (err) => {
      if (err instanceof ClientError && err.status >= 400 && err.status < 500) setHalted(true)
    },
  })
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [briefInvalid, setBriefInvalid] = useState(false)
  const reported = useRef(false)

  useEffect(() => {
    if (job?.status === 'succeeded' && !reported.current) {
      reported.current = true
      onFinished(true)
    }
  }, [job?.status, onFinished])

  async function retry() {
    const request = briefRequest(brief)
    setBriefInvalid(!request.ok)
    if (!request.ok) {
      setRetryError(request.message)
      return
    }
    setRetrying(true)
    setRetryError(null)
    try {
      const res = await postJson<{ jobId: string }>(
        `/api/projects/${encodeURIComponent(projectId)}/jobs`,
        request.body,
      )
      onRestarted(res.jobId)
    } catch (err) {
      setRetryError(messageOf(err))
    } finally {
      setRetrying(false)
    }
  }

  const failed = job?.status === 'failed' || job?.status === 'timed_out'
  const current = job ? STAGES.findIndex(([k]) => k === job.status) : -1
  const position =
    job?.status === 'succeeded' ? STAGES.length : job?.status === 'queued' ? 0 : current
  const [lo, hi] = job?.etaSeconds ?? [0, 0]

  return (
    <div className={w.generate}>
      <StepHeading>{failed ? '这次没有生成成功' : '正在生成宣传页'}</StepHeading>
      {error && (
        <p role="alert" className={s.error}>
          {messageOf(error)}
          {halted ? '' : '（会自动重新查询）'}
        </p>
      )}
      {halted && (
        <div className={w.actions}>
          <button type="button" className={s.btn} onClick={() => onFinished(false)}>
            回到核对信息
          </button>
        </div>
      )}
      {job && !failed && (
        <div aria-live="polite" className={w.stageNow}>
          <p className={w.stageLabel}>{job.stageLabel}</p>
          <p className={s.muted}>
            {job.status === 'succeeded'
              ? '马上进入预览…'
              : hi > 0
                ? `预计还需 ${lo}～${hi} 秒`
                : '马上就好'}
          </p>
        </div>
      )}
      {job && (
        <ol className={w.stages} aria-label="生成进度">
          {STAGES.map(([key, name], i) => {
            const state =
              failed && i === current
                ? 'failed'
                : i < position
                  ? 'done'
                  : i === position
                    ? 'active'
                    : 'todo'
            return (
              <li
                key={key}
                data-state={state}
                aria-current={state === 'active' ? 'step' : undefined}
              >
                <span className={w.stageBar} aria-hidden="true" />
                <span className={w.stageName}>
                  {name}
                  <span className={s.srOnly}>
                    {state === 'done'
                      ? '（已完成）'
                      : state === 'active'
                        ? '（进行中）'
                        : state === 'failed'
                          ? '（失败）'
                          : ''}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {failed && (
        <div role="alert" className={s.error}>
          <p className={w.failText}>{job?.error ?? '生成失败，请稍后重试'}</p>
        </div>
      )}
      {failed && <StylePreferences value={brief} onChange={onBriefChange} invalid={briefInvalid} />}
      {failed && (
        <div className={w.actions}>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={() => void retry()}
            disabled={retrying}
          >
            {retrying ? '正在重新开始…' : '重试'}
          </button>
        </div>
      )}
      {retryError && (
        <p role="alert" className={s.error}>
          {retryError}
        </p>
      )}
    </div>
  )
}

function ProjectWait({ projectId, onFinished }: GenerateStepProps) {
  const { data, error } = useSWR<ProjectDetail>(`/api/projects/${encodeURIComponent(projectId)}`, {
    refreshInterval: (latest) => (latest && latest.state !== 'generating' ? 0 : POLL_MS),
  })
  const reported = useRef(false)
  useEffect(() => {
    if (data && data.state !== 'generating' && !reported.current) {
      reported.current = true
      onFinished(data.state !== null)
    }
  }, [data, onFinished])
  return (
    <div className={w.generate}>
      <StepHeading>正在生成宣传页</StepHeading>
      <p aria-live="polite" className={s.muted}>
        {data?.state === 'generating'
          ? '生成还在进行，完成后会自动进入预览。'
          : '正在查询生成进度…'}
      </p>
      {error && (
        <p role="alert" className={s.error}>
          {messageOf(error)}（会自动重新查询）
        </p>
      )}
    </div>
  )
}
