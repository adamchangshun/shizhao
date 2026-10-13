import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { getJobView } from '@/lib/jobs'

interface Ctx {
  params: Promise<{ id: string }>
}

/** → `{ status, stage, stageLabel, etaSeconds: [lo, hi], startedAt, error? }` */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id)) throw Errors.notFound('任务')
    return Response.json(getJobView(id), { headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    return toErrorResponse(err)
  }
}
