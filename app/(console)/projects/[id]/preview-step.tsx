'use client'

import { useState } from 'react'
import type { SWRResponse } from 'swr'
import { messageOf, postJson } from '../../_lib/api'
import { fieldLabel, formatTime, LAYOUT_LABEL, REASON_LABEL } from '../../_lib/labels'
import type { VersionSummary } from '../../_lib/types'
import s from '../../shell.module.css'
import { StepHeading } from './step-heading'
import w from './wizard.module.css'

interface PreviewStepProps {
  projectId: string
  versions: SWRResponse<{ versions: VersionSummary[] }>
  publishedVersionId: string | null
  selectedId: string | null
  onSelect: (versionId: string) => void
  onRestyle: (jobId: string) => void
  onPublish: (versionId: string) => void
}

/** One entry per flagged sentence; a sentence can break several rules. */
export function groupFlagged(g: VersionSummary['guard']) {
  const groups = new Map<string, { field: string; sentence: string; reasons: string[] }>()
  for (const f of g.flagged) {
    const key = `${f.field}\u0000${f.sentence}`
    const entry = groups.get(key) ?? { field: f.field, sentence: f.sentence, reasons: [] }
    const reason = REASON_LABEL[f.reason]
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason)
    groups.set(key, entry)
  }
  return [...groups.values()]
}

export function guardSummary(g: VersionSummary['guard']): string {
  const sentences = g.flagged.length > 0 ? groupFlagged(g).length : g.violations
  if (sentences === 0) return '文案每一句都能在商品信息里找到依据，没有拦截。'
  const parts = [
    g.rewritten > 0 ? `已重写 ${g.rewritten} 句` : '',
    g.removed > 0 ? `删除 ${g.removed} 句` : '',
  ]
    .filter(Boolean)
    .join('、')
  return `拦截 ${sentences} 句无依据描述${parts ? `，${parts}` : ''}。`
}

export function PreviewStep(props: PreviewStepProps) {
  const { projectId, versions, publishedVersionId } = props
  const [restyling, setRestyling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = versions.data?.versions ?? []
  const selected = list.find((v) => v.id === props.selectedId) ?? list[0]

  async function restyle() {
    setRestyling(true)
    setError(null)
    try {
      const { jobId } = await postJson<{ jobId: string }>(
        `/api/projects/${encodeURIComponent(projectId)}/jobs`,
      )
      props.onRestyle(jobId)
    } catch (err) {
      setError(messageOf(err))
      setRestyling(false)
    }
  }

  if (versions.error) {
    return (
      <p role="alert" className={s.error}>
        {messageOf(versions.error)}
      </p>
    )
  }
  if (!versions.data) return <p className={s.muted}>正在加载…</p>
  if (!selected) {
    return (
      <div>
        <StepHeading>预览</StepHeading>
        <p className={s.muted}>还没有生成好的宣传页。</p>
      </div>
    )
  }

  const index = list.indexOf(selected)
  return (
    <div className={w.previewGrid}>
      <div className={w.phone}>
        <div className={w.phoneScreen}>
          <iframe
            key={selected.id}
            src={`/api/versions/${encodeURIComponent(selected.id)}/`}
            title={`宣传页预览：第 ${list.length - index} 版`}
            className={w.frame}
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      <div className={w.previewSide}>
        <StepHeading>预览</StepHeading>
        <p className={s.muted}>
          第 {list.length - index} 版 · {LAYOUT_LABEL[selected.templateId] ?? '版式'} ·{' '}
          {formatTime(selected.createdAt)}
          {selected.id === publishedVersionId && (
            <span className={`${s.badge} ${s.badgeLive} ${w.inlineBadge}`}>正在上线</span>
          )}
        </p>

        <div className={w.mood}>
          <span className={s.label}>风格关键词</span>
          <ul className={w.chips} aria-label="风格关键词">
            {selected.moodKeywords.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>

        <section className={w.guard} aria-labelledby="guard-h">
          <h3 id="guard-h" className={s.h3}>
            事实守卫
          </h3>
          <p data-testid="guard-summary">{guardSummary(selected.guard)}</p>
          {selected.guard.flagged.length > 0 && (
            <details className={w.details}>
              <summary>查看被拦截的原句和原因</summary>
              <ul className={w.flaggedList}>
                {groupFlagged(selected.guard).map((f, i) => (
                  <li key={`${f.field}-${i}`}>
                    <span className={w.flaggedWhere}>{fieldLabel(f.field)}</span>
                    <del className={w.flaggedSentence}>{f.sentence}</del>
                    <span className={w.flaggedReason}>{f.reasons.join('；')}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
        <div className={w.actions}>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={() => props.onPublish(selected.id)}
          >
            用这一版发布
          </button>
          <button
            type="button"
            className={s.btn}
            onClick={() => void restyle()}
            disabled={restyling}
          >
            {restyling ? '正在开始…' : '换一个风格'}
          </button>
        </div>

        {list.length > 1 && (
          <section aria-labelledby="history-h" className={w.history}>
            <h3 id="history-h" className={s.h3}>
              历史版本
            </h3>
            <ul className={w.versionList}>
              {list.map((v, i) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={w.versionBtn}
                    aria-pressed={v.id === selected.id}
                    onClick={() => props.onSelect(v.id)}
                    data-testid="version-thumb"
                    data-template={v.templateId}
                    data-primary={v.palette.primary}
                  >
                    <span
                      className={w.swatch}
                      aria-hidden="true"
                      style={{ background: v.palette.bg }}
                    >
                      <span style={{ background: v.palette.primary }} />
                    </span>
                    <span className={w.versionText}>
                      <span>第 {list.length - i} 版</span>
                      <span className={s.small}>{LAYOUT_LABEL[v.templateId] ?? '版式'}</span>
                      {v.id === publishedVersionId && <span className={s.small}>正在上线</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
