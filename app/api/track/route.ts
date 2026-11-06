import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isJsonRequest, isSameOriginRequest, unsupportedMediaType } from '@/lib/http'
import { track } from '@/lib/stats/track'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  // Reject browser-origin abuse before reading the body or spending a tracking budget.
  const error = !isSameOriginRequest(request)
    ? Errors.forbidden()
    : !isJsonRequest(request)
      ? unsupportedMediaType()
      : null
  if (error) {
    const response = toErrorResponse(error)
    response.headers.set('cache-control', 'no-store')
    return response
  }
  try {
    await track(request)
  } catch {
    // Invalid payloads and limited events remain indistinguishable. Do not log identifiers.
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}
