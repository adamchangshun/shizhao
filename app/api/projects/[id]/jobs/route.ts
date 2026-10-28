import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { parseStyleBrief } from '@/lib/design/brief'
import { readJsonLimited } from '@/lib/http'
import { createGenerationJob } from '@/lib/jobs'

interface Ctx {
  params: Promise<{ id: string }>
}

const JobRequest = z.object({ styleBrief: z.unknown().optional() })

/**
 * Starts generation from the latest confirmed facts → 202 `{ jobId }`; the job runs in the
 * background. Optional body `{ styleBrief? }` (400 `invalid_style_brief` when malformed).
 * 409 `facts_not_confirmed` without confirmed facts, 409 `job_running` while a job runs.
 */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id)) throw Errors.notFound('项目')
    const hasBody = request.headers.get('content-length') !== '0' && request.body !== null
    const body = JobRequest.parse(hasBody ? await readJsonLimited(request, 1024) : {})
    return Response.json(createGenerationJob(id, parseStyleBrief(body.styleBrief)), {
      status: 202,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
