import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { unpublishProject } from '@/lib/publish'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id)) throw Errors.notFound('项目')
    unpublishProject(id)
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    return toErrorResponse(err)
  }
}
