import { ApiError } from './core/errors'

/**
 * Reads a JSON body with a hard byte cap enforced while streaming, so neither a missing nor a
 * forged Content-Length lets an unauthenticated client make us buffer a huge body.
 */
export async function readJsonLimited(request: Request, maxBytes: number): Promise<unknown> {
  const tooLarge = () => new ApiError(413, 'payload_too_large', '请求内容过大')
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > maxBytes) throw tooLarge()
  if (!request.body) throw new SyntaxError('empty body')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
