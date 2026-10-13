import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { GET as preview } from './preview/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Canonical R2 preview address; keep the legacy /preview endpoint working. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await context.params
    if (!isValidId(id)) throw Errors.notFound('版本')
    const url = new URL(request.url)
    if (!url.pathname.endsWith('/')) {
      return new Response(null, {
        status: 308,
        headers: { location: `/api/versions/${id}/${url.search}`, 'cache-control': 'no-store' },
      })
    }
    return preview(request, context)
  } catch (err) {
    return toErrorResponse(err)
  }
}
