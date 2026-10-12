import fs from 'node:fs/promises'
import { requireAdmin } from '@/lib/auth'
import { findAssetFile, isAssetSize } from '@/lib/assets'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'

interface Ctx {
  params: Promise<{ id: string; size: string }>
}

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id, size } = await params
    if (!isValidId(id) || !isAssetSize(size)) throw Errors.notFound('图片')
    const file = findAssetFile(id, size)
    if (!file) throw Errors.notFound('图片')
    let data: Buffer
    try {
      data = await fs.readFile(file)
    } catch {
      throw Errors.notFound('图片')
    }
    return new Response(new Uint8Array(data), {
      headers: {
        'content-type': 'image/webp',
        'content-length': String(data.length),
        'cache-control': 'private, max-age=3600',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
