'use client'

import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { ClientError, fetcher } from './_lib/api'

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
  return (
    <button type="button" className={className} onClick={performLogout}>
      退出登录
    </button>
  )
}

/** Leaves the current console session open unless the server confirms its cookie was cleared. */
export async function performLogout(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST' })
    if (!response.ok) {
      window.alert('退出失败，请刷新后重试')
      return false
    }
    window.location.assign('/login')
    return true
  } catch {
    window.alert('退出失败，请刷新后重试')
    return false
  }
}
