import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { readVersionHtml } from '@/lib/jobs'
import { INLINE_SCRIPT_SHA256 } from '@/lib/render'

interface Ctx {
  params: Promise<{ id: string }>
}

// Only the page's own inline script may run; no external script, frame or connection
// (connect-src 'none' also keeps previews out of the visit statistics).
const PREVIEW_CSP = [
  "default-src 'none'",
  `script-src 'sha256-${INLINE_SCRIPT_SHA256}'`,
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  'font-src data:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ')

/** The version's stored HTML; its relative `media/…` images resolve to the sibling media route. */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id)) throw Errors.notFound('版本')
    return new Response(await readVersionHtml(id), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': PREVIEW_CSP,
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
