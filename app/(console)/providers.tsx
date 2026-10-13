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
        // Client errors (bad id, gone, not signed in) will not fix themselves by retrying.
        shouldRetryOnError: (err) => !(err instanceof ClientError) || err.status >= 500,
      }}
    >
      {children}
    </SWRConfig>
  )
}

export function LogoutButton({ className }: { className?: string }) {
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    window.location.assign('/login')
  }
  return (
    <button type="button" className={className} onClick={logout}>
      退出登录
    </button>
  )
}
