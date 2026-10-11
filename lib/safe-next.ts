/**
 * Only same-origin paths are allowed as post-login targets (no open redirect). Parsing against a
 * sentinel origin applies the browser's own URL rules, so tricks such as `/\t/evil.example`
 * or `/\\evil.example` resolve to a foreign origin and are rejected. Only relative paths are
 * accepted, and a result starting with `//` is refused because the router would treat it as a
 * protocol-relative URL (e.g. `https://shizhao.invalid//evil.example`).
 */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/'
  const sentinel = 'https://shizhao.invalid'
  try {
    const url = new URL(raw, sentinel)
    if (url.origin !== sentinel || url.pathname.startsWith('//')) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}
