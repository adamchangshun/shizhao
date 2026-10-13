'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { ClientError, messageOf } from '../../../_lib/api'
import type { ActionCounts, ProjectDetail, StatsResponse } from '../../../_lib/types'
import s from '../../../shell.module.css'
import w from '../wizard.module.css'
import st from './stats.module.css'

const ACTIONS: Array<[keyof ActionCounts, string]> = [
  ['view', '浏览'],
  ['call', '拨打电话'],
  ['wechat_copy', '复制微信'],
  ['navigate', '导航到店'],
]

function dayLabel(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function StatsView({ projectId }: { projectId: string }) {
  const base = `/api/projects/${encodeURIComponent(projectId)}`
  const project = useSWR<ProjectDetail>(base)
  const stats = useSWR<StatsResponse>(`${base}/stats?days=7`)
  // Until the statistics service is available the route answers 404: show「—」, not an error.
  const unavailable =
    project.data !== undefined && stats.error instanceof ClientError && stats.error.status === 404
  const data = stats.data
  const num = (n: number | undefined) => (data && n !== undefined ? String(n) : '—')

  const maxViews = Math.max(1, ...(data?.daily.map((d) => d.view) ?? [0]))
  const sourceTotal = data ? data.bySource.qr + data.bySource.link : 0
  const qrShare = sourceTotal > 0 ? Math.round((data!.bySource.qr / sourceTotal) * 100) : null

  return (
    <div className={w.workspace}>
      <div className={w.top}>
        <div className={w.titleRow}>
          <Link href={`/projects/${projectId}`} className={w.back}>
            ← 返回制作
          </Link>
          <h1 className={s.h1}>{project.data ? `${project.data.title} · 访问统计` : '访问统计'}</h1>
        </div>
        <p className={s.muted}>
          最近 7 天（北京时间）。匿名互动计数，可能包含重复或刷量，仅供观察趋势。
        </p>
      </div>

      {project.error && (
        <p role="alert" className={s.error}>
          {project.error instanceof ClientError && project.error.status === 404
            ? '这个宣传页不存在或已被删除'
            : messageOf(project.error)}
        </p>
      )}
      {stats.error && !unavailable && !project.error && (
        <p role="alert" className={s.error}>
          {messageOf(stats.error)}
        </p>
      )}
      {unavailable && (
        <p className={s.notice}>统计数据暂时还没有，宣传页上线并有顾客访问后会显示在这里。</p>
      )}

      <ul className={st.tiles} aria-label="近 7 天合计">
        {ACTIONS.map(([key, label]) => (
          <li key={key} className={st.tile}>
            <span className={st.tileLabel}>{label}</span>
            <span className={st.tileNum} data-testid={`stat-${key}`}>
              {num(data?.totals[key])}
            </span>
          </li>
        ))}
      </ul>

      <div className={st.panels}>
        <section className={s.card} aria-labelledby="daily-h">
          <h2 id="daily-h" className={s.h2}>
            每日浏览
          </h2>
          {data ? (
            <>
              <div className={st.chart} aria-hidden="true">
                {data.daily.map((d) => (
                  <div key={d.date} className={st.col}>
                    <span className={st.colNum}>{d.view}</span>
                    <span
                      className={st.bar}
                      style={{ transform: `scaleY(${d.view / maxViews})` }}
                    />
                    <span className={st.colDay}>{dayLabel(d.date)}</span>
                  </div>
                ))}
              </div>
              <table className={s.srOnly}>
                <caption>每日浏览、拨号、复制微信与导航次数</caption>
                <thead>
                  <tr>
                    <th scope="col">日期</th>
                    {ACTIONS.map(([k, l]) => (
                      <th key={k} scope="col">
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((d) => (
                    <tr key={d.date}>
                      <th scope="row">{dayLabel(d.date)}</th>
                      {ACTIONS.map(([k]) => (
                        <td key={k}>{d[k]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className={s.muted}>—</p>
          )}
        </section>

        <section className={s.card} aria-labelledby="src-h">
          <h2 id="src-h" className={s.h2}>
            访问来源
          </h2>
          {qrShare === null ? (
            <p className={s.muted}>{data ? '还没有访问' : '—'}</p>
          ) : (
            <>
              <div className={st.split} aria-hidden="true">
                <span className={st.splitQr} style={{ flexGrow: data!.bySource.qr }} />
                <span className={st.splitLink} style={{ flexGrow: data!.bySource.link }} />
              </div>
              <dl className={st.legend}>
                <div>
                  <dt>
                    <span className={st.dotQr} aria-hidden="true" />
                    扫码
                  </dt>
                  <dd>
                    {data!.bySource.qr} 次（{qrShare}%）
                  </dd>
                </div>
                <div>
                  <dt>
                    <span className={st.dotLink} aria-hidden="true" />
                    链接
                  </dt>
                  <dd>
                    {data!.bySource.link} 次（{100 - qrShare}%）
                  </dd>
                </div>
              </dl>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
