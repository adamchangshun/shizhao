import { createHmac, randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
import { getEnv } from '../env'
import { FixedWindowLimiter } from '../rate-limit'

const salt = randomBytes(32)

/** Never trust user-supplied forwarding chains. Opt-in requires a sanitizing, exclusive proxy. */
export function clientHash(request: Request): string {
  let address = 'unknown'
  if (getEnv().TRACK_TRUST_PROXY) {
    const candidate = request.headers.get('x-real-ip')?.trim() ?? ''
    const family = isIP(candidate)
    if (family === 4) address = candidate
    if (family === 6) {
      address = new URL(`http://[${candidate}]/`).hostname
      // URL serialization canonicalizes IPv6; fold IPv4-mapped IPv6 into the IPv4 bucket.
      const mapped = /^\[::ffff:([a-f0-9]+):([a-f0-9]+)\]$/.exec(address)
      if (mapped) {
        const hi = parseInt(mapped[1]!, 16),
          lo = parseInt(mapped[2]!, 16)
        address = [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.')
      }
    }
  }
  return createHmac('sha256', salt).update(address).digest('hex')
}

/** Fixed budgets count attempts (including duplicates). Full capacity fails closed, never evicts. */
export class TrackingLimiter {
  private readonly keys = new Map<string, { resetAt: number; lastAccepted?: number }>()
  private readonly budget: FixedWindowLimiter
  private nextSweep = 0

  constructor(private readonly maxKeys = 10_000) {
    this.budget = new FixedWindowLimiter(30, 60_000, maxKeys)
  }

  accept(key: string, now = Date.now()): boolean {
    if (now >= this.nextSweep) {
      for (const [k, state] of this.keys) {
        if (
          state.resetAt <= now &&
          (state.lastAccepted === undefined || state.lastAccepted + 10_000 <= now)
        ) {
          this.keys.delete(k)
          this.budget.reset(k)
        }
      }
      this.nextSweep = now + 10_000
    }
    let state = this.keys.get(key)
    if (!state) {
      if (this.keys.size >= this.maxKeys) return false
      state = { resetAt: now + 60_000 }
      this.keys.set(key, state)
    }
    if (this.budget.isBlocked(key, now)) return false
    this.budget.hit(key, now)
    if (state.resetAt <= now) state.resetAt = now + 60_000
    if (state.lastAccepted !== undefined && now - state.lastAccepted < 10_000) return false
    state.lastAccepted = now
    return true
  }
}
