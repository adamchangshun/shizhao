import fs from 'node:fs'
import path from 'node:path'
import { MEDIA_FILE } from '../jobs/files'
import { getPublishedHtmlPath } from '../publish'
import { INLINE_SCRIPT_SHA256 } from '../render/inline-script'

export const PUBLIC_CSP = [
  "default-src 'none'",
  `script-src 'sha256-${INLINE_SCRIPT_SHA256}'`,
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

const headers = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': PUBLIC_CSP,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
}

function unavailable(status: 'not_found' | 'never_published' | 'unpublished'): Response {
  const message = {
    not_found: '页面不存在',
    never_published: '页面尚未发布',
    unpublished: '该页面已下线',
  }[status]
  return new Response(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${message}</title></head><body><main><h1>${message}</h1><p>请联系商家获取最新页面。</p></main></body></html>`,
    {
      status: status === 'unpublished' ? 410 : 404,
      headers: { ...headers, 'cache-control': 'no-store' },
    },
  )
}

/** No await between resolving the pointer and reading its immutable files in the single process. */
export function servePublished(slug: string, file?: string): Response {
  try {
    if (file !== undefined && !MEDIA_FILE.test(file)) return unavailable('not_found')
    const published = getPublishedHtmlPath(slug)
    if (published.status !== 'ok') return unavailable(published.status)
    if (file !== undefined) {
      const dir = path.join(path.dirname(published.htmlPath), 'media')
      const abs = path.join(dir, file)
      // lstat rejects both a symlinked media directory and a symlinked file.
      if (!fs.lstatSync(dir).isDirectory() || !fs.lstatSync(abs).isFile())
        return unavailable('not_found')
      return new Response(new Uint8Array(fs.readFileSync(abs)), {
        headers: { ...headers, 'content-type': 'image/webp', 'cache-control': 'no-store' },
      })
    }
    return new Response(fs.readFileSync(published.htmlPath, 'utf8'), {
      headers: { ...headers, 'cache-control': 'public, max-age=60, stale-while-revalidate=600' },
    })
  } catch {
    // Never include file paths, exceptions or request data in public errors or logs.
    return unavailable('not_found')
  }
}
