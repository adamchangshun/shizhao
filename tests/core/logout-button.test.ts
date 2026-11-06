import { afterEach, expect, it, vi } from 'vitest'
import { performLogout } from '@/app/(console)/providers'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('keeps the console open when the logout endpoint refuses to clear the session', async () => {
  const assign = vi.fn()
  const alert = vi.fn()
  vi.stubGlobal('window', { alert, location: { assign } })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'forbidden', message: '请求来源不被允许' } }), {
        status: 403,
      }),
    ),
  )

  await expect(performLogout()).resolves.toBe(false)
  expect(assign).not.toHaveBeenCalled()
  expect(alert).toHaveBeenCalledWith('退出失败，请刷新后重试')
})

it('redirects to login only after the logout endpoint clears the session', async () => {
  const assign = vi.fn()
  const alert = vi.fn()
  vi.stubGlobal('window', { alert, location: { assign } })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

  await expect(performLogout()).resolves.toBe(true)
  expect(assign).toHaveBeenCalledWith('/login')
  expect(alert).not.toHaveBeenCalled()
})
