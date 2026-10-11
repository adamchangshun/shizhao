import { z } from 'zod'
import { buildSessionCookie, checkAdminToken } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { readJsonLimited } from '@/lib/http'

const LoginBody = z.object({ token: z.string().min(1).max(200) })

export async function POST(request: Request): Promise<Response> {
  try {
    const { token } = LoginBody.parse(await readJsonLimited(request, 1024))
    // No await between the budget check and the failure count (see checkAdminToken).
    const check = checkAdminToken(token)
    if (check === 'blocked') throw Errors.tooManyRequests()
    if (check === 'invalid') throw Errors.unauthorized()
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': buildSessionCookie() } })
  } catch (err) {
    return toErrorResponse(err)
  }
}
