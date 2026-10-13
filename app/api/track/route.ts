import { track } from '@/lib/stats/track'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  try {
    await track(request)
  } catch {
    // All invalid/rejected events are indistinguishable. Do not log payloads or identifiers.
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}
