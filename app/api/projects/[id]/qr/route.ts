import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { generateProjectQr } from '@/lib/publish/qr'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id)) throw Errors.notFound('项目')
    const result = await generateProjectQr(id, new URL(request.url).searchParams)
    return new Response(result.body, {
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
