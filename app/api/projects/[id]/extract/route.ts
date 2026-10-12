import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { extractFacts } from '@/lib/extract'

interface Ctx {
  params: Promise<{ id: string }>
}

/** Runs extraction on the project's material → `{ factSheet, conflicts, lowConfidenceFields }`. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id)) throw Errors.notFound('项目')
    const result = await extractFacts(id, { signal: request.signal })
    return Response.json(result, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
