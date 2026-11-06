'use client'

import { useState, type ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { ClientError, fetcher } from './_lib/api'
import s from './shell.module.css'

export function ConsoleProviders({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        // Client errors (bad id, gone, not signed in) will not fix themselves by retrying;
        // network failures (status 0) and server errors may.
        shouldRetryOnError: (err) =>
          !(err instanceof ClientError) || err.status === 0 || err.status >= 500,
      }}
    >
      {children}
    </SWRConfig>
  )
}

export function LogoutButton({ className }: { className?: string }) {
  const [error, setError] = useState(false)

  async function logout() {
    setError(false)
    if (!(await performLogout())) setError(true)
  }

  return (
    <>
      <button type="button" className={className} onClick={() => void logout()}>
        退出登录
      </button>
      {error && <LogoutFailure />}
    </>
  )
}

export function LogoutFailure() {
  return (
    <p role="alert" className={s.error}>
      退出失败，请刷新后重试
    </p>
  )
}

/** Leaves the current console session open unless the server confirms its cookie was cleared. */
export async function performLogout(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST' })
    if (!response.ok) return false
    window.location.assign('/login')
    return true
  } catch {
    return false
  }
}
