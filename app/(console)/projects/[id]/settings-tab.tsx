'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { api, messageOf, postJson } from '../../_lib/api'
import type { ProjectDetail } from '../../_lib/types'
import s from '../../shell.module.css'
import w from './wizard.module.css'

export function SettingsTab({
  project,
  onChanged,
}: {
  project: ProjectDetail
  onChanged: () => void
}) {
  const router = useRouter()
  const confirmId = useId()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState<'unpublish' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState('')
  const [askUnpublish, setAskUnpublish] = useState(false)

  async function unpublish() {
    setBusy('unpublish')
    setError(null)
    try {
      await postJson(`/api/projects/${encodeURIComponent(project.id)}/unpublish`)
      setDone('宣传页已下线，顾客扫码将看不到页面。')
      setAskUnpublish(false)
      onChanged()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    setBusy('delete')
    setError(null)
    try {
      await api(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' })
      router.push('/')
    } catch (err) {
      setError(messageOf(err))
      setBusy(null)
    }
  }

  return (
    <div className={w.settings}>
      <h2 className={s.h2}>设置</h2>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <p role="status" aria-live="polite" className={done ? s.success : s.srOnly}>
        {done}
      </p>

      <section className={s.card} aria-labelledby="unpub-h">
        <h3 id="unpub-h" className={s.h3}>
          下线宣传页
        </h3>
        {project.state === 'live' ? (
          <>
            <p className={s.muted}>下线后链接和二维码暂时打不开，之后可以重新发布。</p>
            {askUnpublish ? (
              <div className={s.row}>
                <span>确定要下线吗？</span>
                <button
                  type="button"
                  className={s.btnDanger}
                  onClick={() => void unpublish()}
                  disabled={busy !== null}
                >
                  {busy === 'unpublish' ? '正在下线…' : '确定下线'}
                </button>
                <button type="button" className={s.btnGhost} onClick={() => setAskUnpublish(false)}>
                  取消
                </button>
              </div>
            ) : (
              <button type="button" className={s.btnDanger} onClick={() => setAskUnpublish(true)}>
                下线
              </button>
            )}
          </>
        ) : (
          <p className={s.muted}>宣传页目前没有上线。</p>
        )}
      </section>

      <section className={`${s.card} ${w.danger}`} aria-labelledby="del-h">
        <h3 id="del-h" className={s.h3}>
          删除宣传页
        </h3>
        <p className={s.muted}>会删除全部素材、版本和访问统计，无法恢复。</p>
        <div className={s.field}>
          <label htmlFor={confirmId} className={s.label}>
            请输入店名「{project.title}」确认删除
          </label>
          <input
            id={confirmId}
            className={s.input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          className={s.btnDanger}
          disabled={typed.trim() !== project.title || busy !== null}
          onClick={() => void remove()}
        >
          {busy === 'delete' ? '正在删除…' : '永久删除'}
        </button>
      </section>
    </div>
  )
}
