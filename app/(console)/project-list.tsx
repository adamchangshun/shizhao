'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { messageOf, postJson } from './_lib/api'
import type { ProjectListItem } from './_lib/types'
import { StateBadge } from './state-badge'
import l from './list.module.css'
import s from './shell.module.css'

export function ProjectList() {
  const { data, error, isLoading } = useSWR<ProjectListItem[]>('/api/projects')
  const [creating, setCreating] = useState(false)

  return (
    <>
      <div className={l.head}>
        <div>
          <h1 className={s.h1}>我的宣传页</h1>
          <p className={`${s.muted} ${l.lede}`}>上传商品照片，AI 只改颜值，不改事实。</p>
        </div>
        {!creating && (
          <button type="button" className={s.btnPrimary} onClick={() => setCreating(true)}>
            新建宣传页
          </button>
        )}
      </div>

      {creating && <NewProjectForm onCancel={() => setCreating(false)} />}

      {error && (
        <p role="alert" className={s.error}>
          {messageOf(error)}
        </p>
      )}
      {isLoading && <p className={s.muted}>正在加载…</p>}
      {data && data.length === 0 && !creating && (
        <div className={`${s.card} ${l.empty}`}>
          <p className={l.emptyTitle}>还没有宣传页</p>
          <p className={s.muted}>点「新建宣传页」，三步做出一张能扫码打开的手机宣传页。</p>
        </div>
      )}
      {data && data.length > 0 && (
        <ul className={l.grid} aria-label="宣传页列表">
          {data.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className={l.item}>
                <span className={l.thumb}>
                  {p.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- authenticated API image
                    <img src={p.thumbUrl} alt="" width={160} height={160} loading="lazy" />
                  ) : (
                    <span aria-hidden="true" className={l.thumbEmpty}>
                      {p.title.slice(0, 1)}
                    </span>
                  )}
                </span>
                <span className={l.meta}>
                  <span className={l.title}>{p.title}</span>
                  <StateBadge state={p.state} />
                  <span className={`${s.small} ${s.muted}`}>近 7 天浏览 {p.views7d}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function NewProjectForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter()
  const nameId = useId()
  const [type, setType] = useState<'single' | 'menu'>('single')
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const { id } = await postJson<{ id: string }>('/api/projects', { type, title: title.trim() })
      router.push(`/projects/${id}?step=upload`)
    } catch (err) {
      setError(messageOf(err))
      setPending(false)
    }
  }

  return (
    <form className={`${s.card} ${l.form}`} onSubmit={onSubmit} aria-labelledby={`${nameId}-h`}>
      <h2 id={`${nameId}-h`} className={s.h2}>
        新建宣传页
      </h2>
      <fieldset className={l.types}>
        <legend className={s.label}>要做哪一种？</legend>
        {(
          [
            ['single', '单个商品', '一个招牌商品，做成一张海报'],
            ['menu', '菜单 / 多个商品', '几样商品一起展示，带价格'],
          ] as const
        ).map(([value, name, desc]) => (
          <label key={value} className={l.typeOption} data-checked={type === value}>
            <input
              type="radio"
              name="type"
              value={value}
              checked={type === value}
              onChange={() => setType(value)}
            />
            <span>
              <span className={l.typeName}>{name}</span>
              <span className={`${s.small} ${s.muted}`}>{desc}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className={s.field}>
        <label htmlFor={nameId} className={s.label}>
          店名
        </label>
        <input
          id={nameId}
          className={s.input}
          required
          maxLength={30}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：午后小店"
          autoComplete="organization"
        />
      </div>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <div className={s.row}>
        <button type="submit" className={s.btnPrimary} disabled={pending || !title.trim()}>
          {pending ? '正在创建…' : '创建并上传素材'}
        </button>
        <button type="button" className={s.btnGhost} onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  )
}
