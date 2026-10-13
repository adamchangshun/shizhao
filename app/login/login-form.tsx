'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { safeNext } from '@/lib/safe-next'
import s from '../(console)/shell.module.css'
import l from './login.module.css'

export function LoginForm() {
  const router = useRouter()
  const next = safeNext(useSearchParams().get('next'))
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) {
        router.replace(next)
        return
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      setError(body?.error?.message ?? '登录失败，请重试')
    } catch {
      setError('网络异常，请检查连接后重试')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className={l.form}>
      <div className={s.field}>
        <label htmlFor="token" className={s.label}>
          管理口令
        </label>
        <input
          id="token"
          name="token"
          type="password"
          autoComplete="current-password"
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? 'login-error' : undefined}
          className={s.input}
        />
      </div>
      {error && (
        <p id="login-error" role="alert" className={s.error}>
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={s.btnPrimary}>
        {pending ? '登录中…' : '登录'}
      </button>
    </form>
  )
}
