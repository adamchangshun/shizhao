import { z } from 'zod'
import { buildSessionCookie, verifyAdminToken } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { clientKey, FixedWindowLimiter } from '@/lib/rate-limit'

const LoginBody = z.object({ token: z.string().min(1).max(200) })

// 10 failed attempts per client per 15 minutes.
const failures = new FixedWindowLimiter(10, 15 * 60 * 1000)

export async function POST(request: Request): Promise<Response> {
  try {
    const key = clientKey(request)
    if (failures.isBlocked(key)) throw Errors.tooManyRequests()
    const { token } = LoginBody.parse(await request.json())
    if (!verifyAdminToken(token)) {
      failures.hit(key)
      throw Errors.unauthorized()
    }
    failures.reset(key)
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': buildSessionCookie() } })
  } catch (err) {
    return toErrorResponse(err)
  }
}
