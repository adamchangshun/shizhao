/**
 * In-memory fixed-window counter. Valid because the deployment is a single long-lived process
 * (R3). Holds at most `maxKeys` live keys so attacker-chosen keys cannot grow memory unbounded.
 */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys: number = 10_000,
  ) {}

  isBlocked(key: string, now: number = Date.now()): boolean {
    const entry = this.hits.get(key)
    return entry !== undefined && entry.resetAt > now && entry.count >= this.limit
  }

  hit(key: string, now: number = Date.now()): void {
    const entry = this.hits.get(key)
    if (entry !== undefined && entry.resetAt > now) {
      this.hits.set(key, { count: entry.count + 1, resetAt: entry.resetAt })
      return
    }
    this.hits.delete(key)
    if (this.hits.size >= this.maxKeys) {
      // Map iterates in insertion order: drop the oldest window.
      const oldest = this.hits.keys().next().value
      if (oldest !== undefined) this.hits.delete(oldest)
    }
    this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
  }

  reset(key: string): void {
    this.hits.delete(key)
  }
}
