import { requireAdmin } from '@/lib/auth'
import { toErrorResponse } from '@/lib/core/errors'
import { rejectCorrection } from '@/lib/corrections/merchant'

export const runtime = 'nodejs'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    rejectCorrection(id)
    return Response.json(
      { status: 'rejected' },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  } catch (err) {
    return toErrorResponse(err)
  }
}
