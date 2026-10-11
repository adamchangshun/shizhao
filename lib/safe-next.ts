/**
 * Only same-origin paths are allowed as post-login targets (no open redirect). Parsing against a
 * sentinel origin applies the browser's own URL rules, so tricks such as `/\t/evil.example`
 * or `/\\evil.example` resolve to a foreign origin and are rejected.
 */
export function safeNext(raw: string | null): string {
  if (!raw) return '/'
  const sentinel = 'https://shizhao.invalid'
  try {
    const url = new URL(raw, sentinel)
    if (url.origin !== sentinel) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}
