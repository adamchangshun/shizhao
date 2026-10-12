import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { confirmFacts } from '@/lib/extract'

interface Ctx {
  params: Promise<{ id: string }>
}

/** Confirms the latest revision → `{ factSheet }`; already confirmed is a success too. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id)) throw Errors.notFound('项目')
    return Response.json({ factSheet: confirmFacts(id) })
  } catch (err) {
    return toErrorResponse(err)
  }
}
