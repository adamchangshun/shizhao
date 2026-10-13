'use client'

import { useCallback, useEffect, useState } from 'react'
import { toClientError } from '../../_lib/api'
import s from '../../shell.module.css'
import w from './wizard.module.css'

type LongState =
  { kind: 'loading' } | { kind: 'ready'; url: string } | { kind: 'failed'; message: string }

/** Fetches the published version's long image (contract R9) so it can be saved as a file. */
export function LongImage({
  projectId,
  shopName,
  versionKey,
}: {
  projectId: string
  shopName: string
  versionKey: string
}) {
  const [state, setState] = useState<LongState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  const load = useCallback(
    async (signal: AbortSignal): Promise<string | null> => {
      setState({ kind: 'loading' })
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/long-image`, {
          signal,
        })
        if (!res.ok) {
          const err = await toClientError(res)
          setState({
            kind: 'failed',
            message: res.status === 404 ? '长图还没有生成好' : err.message,
          })
          return null
        }
        const url = URL.createObjectURL(await res.blob())
        setState({ kind: 'ready', url })
        return url
      } catch {
        if (!signal.aborted) setState({ kind: 'failed', message: '网络异常，长图没有加载出来' })
        return null
      }
    },
    [projectId],
  )

  useEffect(() => {
    const ctrl = new AbortController()
    let url: string | null = null
    void load(ctrl.signal).then((u) => {
      url = u
    })
    return () => {
      ctrl.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [load, versionKey, attempt])

  return (
    <div className={w.longImage}>
      <h4 className={s.h3}>宣传长图</h4>
      <p className={`${s.small} ${s.muted}`}>
        顾客在微信里打不开链接时，可以直接把长图发到顾客群或朋友圈。
      </p>
      <div aria-live="polite">
        {state.kind === 'loading' && <p className={s.small}>正在生成长图…</p>}
        {state.kind === 'ready' && (
          <a className={s.btnPrimary} href={state.url} download={`${shopName}-宣传长图.png`}>
            下载宣传长图
          </a>
        )}
        {state.kind === 'failed' && (
          <div className={s.row}>
            <span className={s.small}>{state.message}</span>
            <button
              type="button"
              className={`${s.btn} ${s.btnSmall}`}
              onClick={() => setAttempt((n) => n + 1)}
            >
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
