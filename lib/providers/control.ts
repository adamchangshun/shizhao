import { setTimeout as sleep } from 'node:timers/promises'
import { HTTPS_REQUIRED_MESSAGE, isLocalHost } from '../net'
import { ProviderError } from './errors'

/** One deadline for the whole call, including retries and local file reads. */
export function createCallControl(timeoutMs = 45000, external?: AbortSignal) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647)
    throw new ProviderError('bad_response')
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), timeoutMs)
  const signal = external ? AbortSignal.any([deadline.signal, external]) : deadline.signal
  const check = () => {
    if (external?.aborted) throw new ProviderError('aborted')
    if (deadline.signal.aborted) throw new ProviderError('timeout')
  }
  return {
    signal,
    check,
    async wait(ms: number) {
      check()
      try {
        await sleep(ms, undefined, { signal })
      } catch {
        check()
        throw new ProviderError('upstream_error')
      }
      check()
    },
    close() {
      clearTimeout(timer)
    },
  }
}

/**
 * Shared endpoint policy for every provider and the env parser. Public hosts need https so
 * keys and merchant data never cross the network in plain text; Docker Desktop's host alias
 * is allowed for LLM endpoints only (README: Ollama from a container).
 */
export function llmEndpoint(baseUrl: string, path: string): string {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    throw new ProviderError('bad_response', '必须是完整网址')
  }
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new ProviderError('bad_response', '只能是不含用户名、密码、查询参数或锚点的 http(s) 网址')
  const host = base.hostname.toLowerCase()
  if (base.protocol !== 'https:' && !isLocalHost(host) && host !== 'host.docker.internal')
    throw new ProviderError('bad_response', `${HTTPS_REQUIRED_MESSAGE}，或 host.docker.internal`)
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/${path}`
  return base.toString()
}

/** Bound memory while reading, rather than trusting Content-Length. */
export async function readResponse(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 2 * 1024 * 1024) {
        await reader.cancel()
        throw new ProviderError('bad_response')
      }
      chunks.push(next.value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally {
    reader.releaseLock()
  }
}

/** Error identifiers only; anything else (prompt echoes, escaped text) is dropped. */
const identifier = (value: unknown) =>
  (typeof value === 'string' || typeof value === 'number') && /^[\w.:-]{1,100}$/.test(String(value))
    ? String(value)
    : undefined

/**
 * Log-safe summary of a failed upstream call. Never logs the body or `error.message`, which
 * may echo prompts in escaped forms no redaction can match: only status plus the JSON
 * `error.type` / `error.code` identifiers, or the content type when the body is not JSON.
 */
export function upstreamFailure(
  response: Response,
  body: string,
): { status: number; type?: string; code?: string; contentType?: string } {
  try {
    const error = (JSON.parse(body) as { error?: unknown } | null)?.error
    if (error && typeof error === 'object') {
      const { type, code } = error as Record<string, unknown>
      return {
        status: response.status,
        ...(identifier(type) ? { type: identifier(type) } : {}),
        ...(identifier(code) ? { code: identifier(code) } : {}),
      }
    }
    if (error !== undefined) return { status: response.status }
  } catch {
    /* Not JSON: discard the body. */
  }
  return {
    status: response.status,
    contentType: (response.headers.get('content-type') ?? '').slice(0, 100),
  }
}
