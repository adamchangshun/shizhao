import { requireAdmin } from '@/lib/auth'
import { toErrorResponse } from '@/lib/core/errors'
import { listCorrections } from '@/lib/corrections/merchant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ id: string }>
}

/** `?status=pending` (default) or `?status=handled` → `{ corrections, pendingCount }`. */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    const status = new URL(request.url).searchParams.get('status')
    return Response.json(listCorrections(id, status), {
      headers: { 'cache-control': 'private, no-store' },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
