'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import useSWR from 'swr'
import { messageOf, postJson } from '../../_lib/api'
import { formatTime } from '../../_lib/labels'
import type { CorrectionList, CorrectionView } from '../../_lib/types'
import s from '../../shell.module.css'
import w from './wizard.module.css'

interface CorrectionsTabProps {
  projectId: string
  /** Called after an accept, so the project (published version) reloads. */
  onAccepted: () => void
}

export function correctionsKey(projectId: string, status: 'pending' | 'handled' = 'pending') {
  return `/api/projects/${encodeURIComponent(projectId)}/corrections?status=${status}`
}

export function CorrectionsTab({ projectId, onAccepted }: CorrectionsTabProps) {
  const pending = useSWR<CorrectionList>(correctionsKey(projectId))
  const handled = useSWR<CorrectionList>(correctionsKey(projectId, 'handled'))
  const [notice, setNotice] = useState('')

  async function refresh() {
    await Promise.all([pending.mutate(), handled.mutate()])
  }

  const list = pending.data?.corrections ?? []
  return (
    <section aria-labelledby="corr-h" className={w.corrections}>
      <h2 id="corr-h" className={s.h2}>
        顾客纠错
      </h2>
      <p className={s.muted}>
        顾客在宣传页上点「信息有误？告诉老板」提交的建议。采纳后立即发布新页面，链接和二维码不变；顾客手机上已打开或缓存的页面约
        1 分钟内刷新可见。文案只会删减，不会重新生成。
      </p>
      <p role="status" aria-live="polite" className={notice ? s.success : s.srOnly}>
        {notice}
      </p>
      {pending.error && (
        <p role="alert" className={s.error}>
          {messageOf(pending.error)}
        </p>
      )}
      {!pending.data && !pending.error && <p className={s.muted}>正在加载…</p>}
      {pending.data && list.length === 0 && (
        <p className={`${s.card} ${s.muted}`}>暂时没有待处理的纠错。</p>
      )}
      {list.length > 0 && (
        <ul className={w.corrList} aria-label="待处理的纠错">
          {list.map((c) => (
            <CorrectionItem
              key={c.id}
              projectId={projectId}
              item={c}
              onDone={async (message, accepted) => {
                setNotice(message)
                if (accepted) onAccepted()
                await refresh()
              }}
            />
          ))}
        </ul>
      )}

      {(handled.data?.corrections.length ?? 0) > 0 && (
        <details className={w.details}>
          <summary>已处理（{handled.data!.corrections.length}）</summary>
          <ul className={w.corrHandled}>
            {handled.data!.corrections.map((c) => (
              <li key={c.id}>
                <span
                  className={`${s.badge} ${c.status === 'accepted' ? s.badgeLive : s.badgeDraft}`}
                >
                  {c.status === 'accepted' ? '已采纳' : '已忽略'}
                </span>{' '}
                {c.fieldLabel}
                {c.suggestedValue && <> → {c.suggestedValue}</>}
                <span className={`${s.small} ${s.muted}`}>
                  {' '}
                  · {formatTime(c.resolvedAt ?? c.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

interface ItemProps {
  projectId: string
  item: CorrectionView
  onDone: (message: string, accepted: boolean) => Promise<void>
}

function CorrectionItem({ projectId, item, onDone }: ItemProps) {
  const inputId = useId()
  const [editing, setEditing] = useState(item.needsValue)
  const [value, setValue] = useState(item.suggestedValue)
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const processing = item.status === 'processing'

  async function accept(withValue: boolean) {
    setBusy('accept')
    setError(null)
    try {
      await postJson(
        `/api/corrections/${encodeURIComponent(item.id)}/accept`,
        withValue ? { value: value.trim() } : {},
      )
      await onDone('页面已更新，二维码不变', true)
    } catch (err) {
      setError(messageOf(err))
      setBusy(null)
    }
  }

  async function reject() {
    setBusy('reject')
    setError(null)
    try {
      await postJson(`/api/corrections/${encodeURIComponent(item.id)}/reject`)
      await onDone('已忽略这条纠错', false)
    } catch (err) {
      setError(messageOf(err))
      setBusy(null)
    }
  }

  return (
    <li className={`${s.card} ${w.corrItem}`}>
      <p className={w.corrLine}>
        <span className={w.corrField}>{item.fieldLabel}</span>
        <span className={w.corrValues}>
          <span>{item.currentValue ?? '未填写'}</span>
          <span aria-hidden="true"> → </span>
          <span className={s.srOnly}>，建议改为</span>
          <strong>
            {item.needsValue ? '顾客反映可能有误' : item.suggestedValue || '（未填写）'}
          </strong>
        </span>
      </p>
      {item.note && <p className={w.corrNote}>补充说明：{item.note}</p>}
      <p className={`${s.small} ${s.muted}`}>{formatTime(item.createdAt)}</p>

      {processing && <p className={s.notice}>正在处理，请稍候刷新。</p>}
      {item.manual && !processing && (
        <p className={s.small}>
          这条建议没有指明具体信息，请到{' '}
          <Link href={`/projects/${projectId}?step=facts`}>核对信息</Link>{' '}
          里修改后重新生成，再点「忽略」。
        </p>
      )}
      {editing && !item.manual && !processing && (
        <div className={s.field}>
          <label htmlFor={inputId} className={s.label}>
            {item.needsValue ? '请核实后填写正确的内容' : '改成'}
          </label>
          <input
            id={inputId}
            className={s.input}
            maxLength={100}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      )}
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {!processing && (
        <div className={s.row}>
          {!item.manual && !editing && (
            <button
              type="button"
              className={s.btnPrimary}
              disabled={busy !== null}
              onClick={() => void accept(false)}
            >
              {busy === 'accept' ? '正在更新页面…' : '采纳'}
            </button>
          )}
          {!item.manual && editing && (
            <button
              type="button"
              className={s.btnPrimary}
              disabled={busy !== null || value.trim() === ''}
              onClick={() => void accept(true)}
            >
              {busy === 'accept' ? '正在更新页面…' : '确认修改并采纳'}
            </button>
          )}
          {!item.manual && !editing && (
            <button
              type="button"
              className={s.btn}
              disabled={busy !== null}
              onClick={() => setEditing(true)}
            >
              修改后采纳
            </button>
          )}
          <button
            type="button"
            className={s.btnGhost}
            disabled={busy !== null}
            onClick={() => void reject()}
          >
            {busy === 'reject' ? '正在忽略…' : '忽略'}
          </button>
        </div>
      )}
    </li>
  )
}
