import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { createGenerationJob } from '@/lib/jobs'

interface Ctx {
  params: Promise<{ id: string }>
}

/**
 * Starts generation from the latest confirmed facts → 202 `{ jobId }`; the job runs in the
 * background. 409 `facts_not_confirmed` without confirmed facts, 409 `job_running` while a job runs.
 */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id)) throw Errors.notFound('项目')
    return Response.json(createGenerationJob(id), { status: 202 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
