import { ZodError } from 'zod'

export interface ErrorBody {
  error: { code: string; message: string }
}

/** An error whose code and Chinese message are safe to show to the client. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export const Errors = {
  unauthorized: () => new ApiError(401, 'unauthorized', '请先输入管理口令'),
  forbidden: () => new ApiError(403, 'forbidden', '请求来源不被允许'),
  notFound: (what = '资源') => new ApiError(404, 'not_found', `${what}不存在`),
  invalidInput: () => new ApiError(400, 'invalid_input', '请求参数不合法'),
  tooManyRequests: () => new ApiError(429, 'too_many_requests', '尝试次数过多，请稍后再试'),
  conflict: (message: string) => new ApiError(409, 'conflict', message),
}

/** Converts any thrown value to the contract error envelope without leaking internals. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json(errorBody(err.code, err.message), { status: err.status })
  }
  if (err instanceof ZodError || err instanceof SyntaxError) {
    const e = Errors.invalidInput()
    return Response.json(errorBody(e.code, e.message), { status: e.status })
  }
  console.error('[api] unhandled error', err)
  return Response.json(errorBody('internal_error', '服务器内部错误，请稍后再试'), { status: 500 })
}

function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } }
}
