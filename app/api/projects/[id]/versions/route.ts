import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { listProjectVersions } from '@/lib/jobs'

interface Ctx {
  params: Promise<{ id: string }>
}

/** Versions newest first → `{ versions: VersionSummary[] }` */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id)) throw Errors.notFound('项目')
    return Response.json({ versions: listProjectVersions(id) })
  } catch (err) {
    return toErrorResponse(err)
  }
}
