'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import type { ProjectState } from '@/lib/core/job-state'
import { messageOf, postJson } from '../../_lib/api'
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

interface GenerateStepProps {
  projectId: string
  jobId: string | null
  state: ProjectState | null
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
  onFinished,
  onRestarted,
}: GenerateStepProps & { jobId: string }) {
  // SWR stops polling when this component unmounts and once the job reaches a final state.
  const { data: job, error } = useSWR<JobView>(`/api/jobs/${encodeURIComponent(jobId)}`, {
    refreshInterval: (latest) => (latest && TERMINAL.has(latest.status) ? 0 : POLL_MS),
    dedupingInterval: 0,
  })
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const reported = useRef(false)

  useEffect(() => {
    if (job?.status === 'succeeded' && !reported.current) {
      reported.current = true
      onFinished(true)
    }
  }, [job?.status, onFinished])

  async function retry() {
    setRetrying(true)
    setRetryError(null)
    try {
      const res = await postJson<{ jobId: string }>(
        `/api/projects/${encodeURIComponent(projectId)}/jobs`,
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
          {messageOf(error)}（会自动重新查询）
        </p>
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
