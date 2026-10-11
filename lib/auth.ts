import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Errors } from './core/errors'
import { getEnv } from './env'

export const ADMIN_COOKIE = 'shizhao_admin'
const SESSION_MAX_AGE_S = 30 * 24 * 3600
const SESSION_LABEL = 'shizhao-admin-session-v1'

/** Cookie value: HMAC of a fixed label keyed by the admin token, so the token itself is never stored. */
export function sessionValue(token: string): string {
  return createHmac('sha256', token).update(SESSION_LABEL).digest('hex')
}

/** Constant-time string equality; hashing first makes the comparison length-independent. */
export function safeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest()
  const db = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(da, db)
}

export function verifyAdminToken(candidate: string): boolean {
  return safeEqual(candidate, getEnv().ADMIN_TOKEN)
}

function isSecureDeployment(): boolean {
  return getEnv().PUBLIC_BASE_URL.startsWith('https://')
}

export function buildSessionCookie(): string {
  const parts = [
    `${ADMIN_COOKIE}=${sessionValue(getEnv().ADMIN_TOKEN)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_S}`,
  ]
  if (isSecureDeployment()) parts.push('Secure')
  return parts.join('; ')
}

export function buildLogoutCookie(): string {
  const parts = [`${ADMIN_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (isSecureDeployment()) parts.push('Secure')
  return parts.join('; ')
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

function readBearer(request: Request): string | undefined {
  const header = request.headers.get('authorization')
  const match = header?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim()
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Cookie-authenticated state changes must come from our own origin (CSRF defence on top of
 * SameSite=Lax). Requests without Origin/Sec-Fetch-Site are non-browser clients and pass.
 */
function isSameOriginRequest(request: Request): boolean {
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

/** Throws ApiError(401/403) unless the request carries the admin token or a valid session cookie. */
export function requireAdmin(request: Request): void {
  const bearer = readBearer(request)
  if (bearer !== undefined) {
    if (verifyAdminToken(bearer)) return
    throw Errors.unauthorized()
  }
  const cookie = readCookie(request, ADMIN_COOKIE)
  if (cookie === undefined || !safeEqual(cookie, sessionValue(getEnv().ADMIN_TOKEN))) {
    throw Errors.unauthorized()
  }
  if (!SAFE_METHODS.has(request.method.toUpperCase()) && !isSameOriginRequest(request)) {
    throw Errors.forbidden()
  }
}
