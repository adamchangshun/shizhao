import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { readJsonLimited } from '@/lib/http'
import { publishVersion } from '@/lib/publish'

const PublishRequest = z.object({
  versionId: z.string().refine(isValidId),
  factsConfirmed: z.literal(true),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id)) throw Errors.notFound('项目')
    const { versionId } = PublishRequest.parse(await readJsonLimited(request, 4096))
    return Response.json(publishVersion(id, versionId), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
