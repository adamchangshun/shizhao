/** Minimal counting semaphore: at most `limit` tasks run at once, the rest wait in FIFO order. */
export class Semaphore {
  private active = 0
  private readonly waiters: Array<() => void> = []

  constructor(private readonly limit: number) {}

  get running(): number {
    return this.active
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    } else {
      this.active++
    }
    try {
      return await task()
    } finally {
      const next = this.waiters.shift()
      // Hand the slot straight to the next waiter so a newcomer cannot jump the queue.
      if (next) next()
      else this.active--
    }
  }
}
