import { expect, it } from 'vitest'
import { POST } from '@/app/api/auth/logout/route'

it.each([
  { origin: 'https://outside.example' },
  { 'sec-fetch-site': 'cross-site' },
  { origin: 'http://localhost:6688', 'sec-fetch-site': 'cross-site' },
  { origin: 'null' },
  { origin: 'not-a-url' },
])('refuses logout from %j without clearing the session cookie', async (headers) => {
  const response = POST(
    new Request('http://localhost:6688/api/auth/logout', {
      method: 'POST',
      headers: { ...headers, cookie: 'sz_session=existing-session' } as Record<string, string>,
    }),
  )
  expect(response.status).toBe(403)
  expect(response.headers.get('set-cookie')).toBeNull()
  expect(await response.json()).toEqual({
    error: { code: 'forbidden', message: '请求来源不被允许' },
  })
})

it.each([
  {},
  { origin: 'http://localhost:6688', 'sec-fetch-site': 'same-origin' },
  { origin: 'http://127.0.0.1:6690', host: '127.0.0.1:6690' },
  { authorization: 'Bearer test-admin-token-0123' },
])('preserves logout for same-origin and non-browser clients: %j', async (headers) => {
  const response = POST(
    new Request('http://localhost:6688/api/auth/logout', {
      method: 'POST',
      headers: headers as Record<string, string>,
    }),
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
})
