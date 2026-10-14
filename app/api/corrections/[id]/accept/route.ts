import { requireAdmin } from '@/lib/auth'
import { toErrorResponse } from '@/lib/core/errors'
import { acceptCorrection } from '@/lib/corrections/merchant'
import { readJsonLimited } from '@/lib/http'

export const runtime = 'nodejs'

interface Ctx {
  params: Promise<{ id: string }>
}

/** Body `{ value? }` (the merchant may edit the suggestion) → `{ status, resultRevision }`. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    const hasBody = request.headers.get('content-length') !== '0' && request.body !== null
    const body = hasBody ? await readJsonLimited(request, 2048) : {}
    return Response.json(await acceptCorrection(id, body), {
      headers: { 'cache-control': 'private, no-store' },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
