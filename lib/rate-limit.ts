/** In-memory fixed-window counter. Valid because the deployment is a single long-lived process (R3). */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  isBlocked(key: string, now: number = Date.now()): boolean {
    const entry = this.hits.get(key)
    return entry !== undefined && entry.resetAt > now && entry.count >= this.limit
  }

  hit(key: string, now: number = Date.now()): void {
    const entry = this.hits.get(key)
    if (entry === undefined || entry.resetAt <= now) {
      this.prune(now)
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return
    }
    this.hits.set(key, { count: entry.count + 1, resetAt: entry.resetAt })
  }

  reset(key: string): void {
    this.hits.delete(key)
  }

  private prune(now: number): void {
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key)
    }
  }
}

/** Best-effort client key; behind a reverse proxy the first X-Forwarded-For hop is used. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip') || 'unknown'
}
