import { buildLogoutCookie } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isSameOriginRequest } from '@/lib/http'

export function POST(request: Request): Response {
  if (!isSameOriginRequest(request)) return toErrorResponse(Errors.forbidden())
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': buildLogoutCookie() } })
}
