import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { getStats } from '@/lib/stats/summary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    const query = new URL(request.url).searchParams.getAll('days')
    if (query.length > 1 || (query.length === 1 && !/^[1-9]\d{0,2}$/.test(query[0]!)))
      throw Errors.invalidInput()
    return Response.json(getStats(id, query.length ? Number(query[0]) : 7), {
      headers: { 'cache-control': 'private, no-store' },
    })
  } catch (err) {
    const response = toErrorResponse(err)
    response.headers.set('cache-control', 'private, no-store')
    return response
  }
}
