// Browser-side access to the merchant API. Every failure becomes a ClientError carrying the
// backend's Chinese `message` (or a fixed Chinese fallback); status codes and stacks never
// reach the screen.

export class ClientError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ClientError'
    this.status = status
    this.code = code
  }
}

const NETWORK_MESSAGE = '网络异常，请检查连接后重试'
const FALLBACK_MESSAGE = '操作没有成功，请稍后重试'

function goToLogin(): void {
  if (typeof window === 'undefined' || window.location.pathname === '/login') return
  const next = `${window.location.pathname}${window.location.search}`
  window.location.assign(`/login?next=${encodeURIComponent(next)}`)
}

export async function toClientError(res: Response): Promise<ClientError> {
  const body = (await res.json().catch(() => null)) as {
    error?: { code?: unknown; message?: unknown }
  } | null
  const code = typeof body?.error?.code === 'string' ? body.error.code : 'unknown'
  const message =
    typeof body?.error?.message === 'string' && body.error.message
      ? body.error.message
      : FALLBACK_MESSAGE
  if (res.status === 401) goToLogin()
  return new ClientError(res.status, code, message)
}

/** fetch + JSON with the error policy above. `null` for 204 responses. */
export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        ...(init.body !== undefined && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init.headers,
      },
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ClientError(0, 'network', NETWORK_MESSAGE)
  }
  if (!res.ok) throw await toClientError(res)
  if (res.status === 204) return null as T
  return (await res.json()) as T
}

export const fetcher = <T>(url: string): Promise<T> => api<T>(url)

export function postJson<T>(url: string, body?: unknown): Promise<T> {
  return api<T>(url, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function messageOf(err: unknown): string {
  return err instanceof ClientError ? err.message : FALLBACK_MESSAGE
}

/**
 * Multipart upload with progress (fetch cannot report upload progress). Resolves with the
 * parsed JSON body; rejects with a ClientError.
 */
export function uploadWithProgress<T>(
  url: string,
  form: FormData,
  onProgress: (fraction: number) => void,
): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open('POST', url)
    xhr.responseType = 'text'
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onerror = () => reject(new ClientError(0, 'network', NETWORK_MESSAGE))
    xhr.onabort = () => reject(new ClientError(0, 'aborted', '上传已取消'))
    xhr.onload = () => {
      const res = new Response(xhr.status === 204 ? null : xhr.responseText, {
        status: xhr.status,
        headers: { 'content-type': 'application/json' },
      })
      if (res.ok) {
        res.json().then(
          (body) => resolve(body as T),
          () => reject(new ClientError(0, 'bad', FALLBACK_MESSAGE)),
        )
      } else {
        toClientError(res).then(reject, () => reject(new ClientError(0, 'bad', FALLBACK_MESSAGE)))
      }
    }
    xhr.send(form)
  })
  return { promise, abort: () => xhr.abort() }
}
