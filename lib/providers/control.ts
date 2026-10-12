import { setTimeout as sleep } from 'node:timers/promises'
import { ProviderError } from './errors'

/** One deadline for the whole call, including retries and local file reads. */
export function createCallControl(timeoutMs = 45000, external?: AbortSignal) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647)
    throw new ProviderError('bad_response')
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), timeoutMs)
  const signal = external ? AbortSignal.any([deadline.signal, external]) : deadline.signal
  const check = () => {
    if (external?.aborted) throw new ProviderError('aborted')
    if (deadline.signal.aborted) throw new ProviderError('timeout')
  }
  return {
    signal,
    check,
    async wait(ms: number) {
      check()
      try {
        await sleep(ms, undefined, { signal })
      } catch {
        check()
        throw new ProviderError('upstream_error')
      }
      check()
    },
    close() {
      clearTimeout(timer)
    },
  }
}
