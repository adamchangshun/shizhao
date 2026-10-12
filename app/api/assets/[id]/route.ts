import { requireAdmin } from '@/lib/auth'
import { deleteAsset } from '@/lib/assets'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id) || !(await deleteAsset(id))) throw Errors.notFound('素材')
    return new Response(null, { status: 204 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
