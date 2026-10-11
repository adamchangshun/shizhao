import { buildLogoutCookie } from '@/lib/auth'

export function POST(): Response {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': buildLogoutCookie() } })
}
