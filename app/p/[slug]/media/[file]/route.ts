import { servePublished } from '@/lib/stats/public-page'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; file: string }> },
): Promise<Response> {
  const { slug, file } = await params
  return servePublished(slug, file)
}
