import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { readVersionMedia } from '@/lib/jobs'

interface Ctx {
  params: Promise<{ id: string; file: string }>
}

/** Preview images (contract R2): `media/<assetId>-<display|thumb>.webp` of one version. */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id, file } = await params
    if (!isValidId(id)) throw Errors.notFound('图片')
    const body = await readVersionMedia(id, file)
    return new Response(new Uint8Array(body), {
      headers: {
        'content-type': 'image/webp',
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
