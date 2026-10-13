import { ApiError } from '../core/errors'

/** A slot lives as long as its real task, even when the HTTP caller stops waiting. */
export class ModelGate {
  private active = 0
  private readonly waiters: Array<{ grant: () => void }> = []
  async run<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    signal.throwIfAborted()
    if (this.active < 2) this.active++
    else {
      if (this.waiters.length >= 64)
        throw new ApiError(429, 'model_queue_full', '检查队列已满，请稍后重试')
      await new Promise<void>((resolve, reject) => {
        const remove = () => {
          const index = this.waiters.indexOf(entry)
          if (index >= 0) this.waiters.splice(index, 1)
          clearTimeout(timer)
          signal.removeEventListener('abort', cancel)
        }
        const cancel = () => {
          remove()
          reject(signal.reason)
        }
        const entry = {
          grant: () => {
            remove()
            resolve()
          },
        }
        const timer = setTimeout(() => {
          remove()
          reject(new ApiError(429, 'model_queue_timeout', '等待检查超时，请稍后重试'))
        }, 10000)
        signal.addEventListener('abort', cancel, { once: true })
        this.waiters.push(entry)
      })
    }
    try {
      signal.throwIfAborted()
      return await task()
    } finally {
      const next = this.waiters[0]
      if (next) next.grant()
      else this.active--
    }
  }
}

export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', cancel)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', cancel)
        reject(error)
      },
    )
    if (signal.aborted) cancel()
  })
}
