import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Errors } from './core/errors'
import { getEnv } from './env'
import { isSameOriginRequest } from './http'
import { FixedWindowLimiter } from './rate-limit'
import { loadOrCreateSessionKey } from './session-key'

export const ADMIN_COOKIE = 'shizhao_admin'
export const SESSION_MAX_AGE_S = 30 * 24 * 3600
const SESSION_LABEL = 'shizhao-admin-session-v1'

/**
 * Server-side signing key, kept in DATA_DIR/session.key (see lib/session-key.ts).
 * It must not be derivable from ADMIN_TOKEN: otherwise an attacker could mint a cookie for each
 * candidate token offline and use 200/401 responses to guess the token past the failure budget.
 * Cached per process: rotating session.key requires a restart (single instance, R3).
 */
let cachedKey: { dir: string; key: Buffer } | undefined

function sessionKey(): Buffer {
  const dir = getEnv().DATA_DIR
  if (cachedKey?.dir !== dir) cachedKey = { dir, key: loadOrCreateSessionKey(dir) }
  return cachedKey.key
}

/**
 * Cookie value `<exp>.<hmac>`: the expiry (unix seconds) plus a fingerprint of the current admin
 * token, signed with the server-side key. Changing ADMIN_TOKEN, or replacing session.key and restarting, ends all sessions.
 */
export function sessionValue(expS: number): string {
  const tokenFp = createHash('sha256').update(getEnv().ADMIN_TOKEN, 'utf8').digest('hex')
  const mac = createHmac('sha256', sessionKey())
    .update(`${SESSION_LABEL}.${expS}.${tokenFp}`)
    .digest('hex')
  return `${expS}.${mac}`
}

export function verifySessionValue(value: string, nowMs: number = Date.now()): boolean {
  const match = /^(\d{1,12})\.[0-9a-f]{64}$/.exec(value)
  if (!match) return false
  const expS = Number(match[1])
  const nowS = Math.floor(nowMs / 1000)
  if (expS <= nowS || expS > nowS + SESSION_MAX_AGE_S) return false
  return safeEqual(value, sessionValue(expS))
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
    `${ADMIN_COOKIE}=${sessionValue(expS)}`,
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
