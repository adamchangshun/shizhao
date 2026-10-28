import { ApiError } from './core/errors'
import { getEnv } from './env'

/**
 * Reads a JSON body with a hard byte cap enforced while streaming, so neither a missing nor a
 * forged Content-Length lets an unauthenticated client make us buffer a huge body.
 */
export async function readJsonLimited(
  request: Request,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const bytes = await readBytesLimited(request, maxBytes, signal)
  if (!bytes) throw new SyntaxError('empty body')
  return JSON.parse(bytes.toString('utf8'))
}

/** Like readJsonLimited, but a missing or zero-byte body is `undefined` instead of an error. */
export async function readOptionalJsonLimited(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const bytes = await readBytesLimited(request, maxBytes)
  return bytes && bytes.length > 0 ? JSON.parse(bytes.toString('utf8')) : undefined
}

/** The raw body under the byte cap; null when the request has no body stream. */
async function readBytesLimited(
  request: Request,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  signal?.throwIfAborted()
  const tooLarge = () => new ApiError(413, 'payload_too_large', '请求内容过大')
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > maxBytes) throw tooLarge()
  if (!request.body) return null
  const reader = request.body.getReader()
  const cancel = () => {
    void reader.cancel().catch(() => {})
  }
  signal?.addEventListener('abort', cancel, { once: true })
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        void reader.cancel().catch(() => {})
        throw tooLarge()
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } finally {
    signal?.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

/**
 * Browser state changes must come from our own origin: the CSRF defence for cookie sessions (on
 * top of SameSite=Lax) and for the anonymous correction form. Requests without
 * Origin/Sec-Fetch-Site are non-browser clients and pass.
 */
export function isSameOriginRequest(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  const allowed = new Set([new URL(getEnv().PUBLIC_BASE_URL).host])
  const host = request.headers.get('host')
  if (host) allowed.add(host)
  return allowed.has(originHost)
}

/** True when the media type is application/json; parameters such as charset are ignored. */
export function isJsonRequest(request: Request): boolean {
  const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  return type === 'application/json'
}
