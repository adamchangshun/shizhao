import { SLUG_PATTERN } from '@/lib/core/ids'
import { servePublished } from '@/lib/stats/public-page'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  const url = new URL(request.url)
  if (SLUG_PATTERN.test(slug) && !url.pathname.endsWith('/')) {
    return new Response(null, {
      status: 308,
      headers: { location: `/p/${slug}/${url.search}`, 'cache-control': 'no-store' },
    })
  }
  return servePublished(slug)
}
