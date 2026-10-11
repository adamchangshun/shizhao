import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Errors } from './core/errors'
import { getEnv } from './env'
import { FixedWindowLimiter } from './rate-limit'

export const ADMIN_COOKIE = 'shizhao_admin'
export const SESSION_MAX_AGE_S = 30 * 24 * 3600
const SESSION_LABEL = 'shizhao-admin-session-v1'

/**
 * Cookie value `<exp>.<hmac>`: the expiry (unix seconds) signed with an HMAC keyed by the admin
 * token. The token itself is never stored, and the server enforces the expiry.
 */
export function sessionValue(token: string, expS: number): string {
  const mac = createHmac('sha256', token).update(`${SESSION_LABEL}.${expS}`).digest('hex')
  return `${expS}.${mac}`
}

export function verifySessionValue(value: string, nowMs: number = Date.now()): boolean {
  const match = /^(\d{1,12})\.[0-9a-f]{64}$/.exec(value)
  if (!match) return false
  const expS = Number(match[1])
  const nowS = Math.floor(nowMs / 1000)
  if (expS <= nowS || expS > nowS + SESSION_MAX_AGE_S) return false
  return safeEqual(value, sessionValue(getEnv().ADMIN_TOKEN, expS))
}

/** Constant-time string equality; hashing first makes the comparison length-independent. */
export function safeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest()
  const db = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(da, db)
}

// One global budget for wrong admin tokens (login form and Bearer header alike). Keyed globally
// on purpose: client addresses are spoofable without a trusted proxy, and there is one admin.
const AUTH_FAILURE_KEY = 'admin'
const authFailures = new FixedWindowLimiter(30, 15 * 60 * 1000)

export type TokenCheck = 'ok' | 'invalid' | 'blocked'

/** Synchronous check-and-count, so concurrent requests cannot slip past the failure budget. */
export function checkAdminToken(candidate: string): TokenCheck {
  if (authFailures.isBlocked(AUTH_FAILURE_KEY)) return 'blocked'
  if (safeEqual(candidate, getEnv().ADMIN_TOKEN)) return 'ok'
  authFailures.hit(AUTH_FAILURE_KEY)
  return 'invalid'
}

/** Test-only: clear the failure budget. */
export function resetAuthFailures(): void {
  authFailures.reset(AUTH_FAILURE_KEY)
}

function isSecureDeployment(): boolean {
  return getEnv().PUBLIC_BASE_URL.startsWith('https://')
}

export function buildSessionCookie(nowMs: number = Date.now()): string {
  const expS = Math.floor(nowMs / 1000) + SESSION_MAX_AGE_S
  const parts = [
    `${ADMIN_COOKIE}=${sessionValue(getEnv().ADMIN_TOKEN, expS)}`,
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

/** Throws ApiError(401/403/429) unless the request carries the admin token or a valid session cookie. */
export function requireAdmin(request: Request): void {
  const bearer = readBearer(request)
  if (bearer !== undefined) {
    const check = checkAdminToken(bearer)
    if (check === 'ok') return
    throw check === 'blocked' ? Errors.tooManyRequests() : Errors.unauthorized()
  }
  const cookie = readCookie(request, ADMIN_COOKIE)
  if (cookie === undefined || !verifySessionValue(cookie)) {
    throw Errors.unauthorized()
  }
  if (!SAFE_METHODS.has(request.method.toUpperCase()) && !isSameOriginRequest(request)) {
    throw Errors.forbidden()
  }
}
