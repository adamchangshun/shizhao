import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { confirmFacts } from '@/lib/extract'
import { readJsonLimited } from '@/lib/http'

interface Ctx {
  params: Promise<{ id: string }>
}

/**
 * Body `{ revision }`: the revision the merchant reviewed. Confirms it if it is still the latest
 * → `{ factSheet }` (already confirmed is a success too); 409 `facts_changed` if not.
 */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id)) throw Errors.notFound('项目')
    return Response.json({ factSheet: confirmFacts(id, await readJsonLimited(request, 1024)) })
  } catch (err) {
    return toErrorResponse(err)
  }
}
