import { toErrorResponse } from '@/lib/core/errors'
import { submitCorrection } from '@/lib/corrections/submit'

export const runtime = 'nodejs'

/** Public: a customer reports a wrong fact on a published page. Stores no customer identity. */
export async function POST(request: Request): Promise<Response> {
  try {
    await submitCorrection(request)
    return Response.json({ ok: true }, { status: 201, headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    const response = toErrorResponse(err)
    response.headers.set('cache-control', 'no-store')
    return response
  }
}
