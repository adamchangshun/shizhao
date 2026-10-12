// Font pipeline: map FontId to a locally installed (npm) font, subset it to the characters
// the page actually uses, and inline the result as base64 @font-face rules. No external
// font host is ever referenced.
//
// The packages ship CJK fonts pre-sliced by unicode-range (Google's slicing). We parse the
// package CSS to find which slices contain the page's characters and subset only those.
import fs from 'node:fs'
import path from 'node:path'
import subsetFont from 'subset-font'
import type { FontId } from '@/lib/core/schemas'

export type FontRole = 'heading' | 'body'

interface FontSource {
  pkg: string
  css: string
  weight: 400 | 700
}

interface FontEntry {
  heading: FontSource
  body: FontSource
  fallback: string
}

const SANS = 'system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
const SERIF = '"Songti SC", "STSong", "SimSun", serif'
const KAI = '"Kaiti SC", "STKaiti", "KaiTi", serif'

export const FONT_REGISTRY: Readonly<Record<FontId, FontEntry>> = {
  'noto-sans-sc': {
    heading: { pkg: '@fontsource/noto-sans-sc', css: '700.css', weight: 700 },
    body: { pkg: '@fontsource/noto-sans-sc', css: '400.css', weight: 400 },
    fallback: SANS,
  },
  'noto-serif-sc': {
    heading: { pkg: '@fontsource/noto-serif-sc', css: '700.css', weight: 700 },
    body: { pkg: '@fontsource/noto-serif-sc', css: '400.css', weight: 400 },
    fallback: SERIF,
  },
  'lxgw-wenkai': {
    heading: { pkg: 'lxgw-wenkai-webfont', css: 'lxgwwenkai-bold.css', weight: 700 },
    body: { pkg: 'lxgw-wenkai-webfont', css: 'lxgwwenkai-regular.css', weight: 400 },
    fallback: KAI,
  },
  // ZCOOL faces have a single weight; heading stays at 400 to avoid synthetic bold.
  'zcool-xiaowei': {
    heading: { pkg: '@fontsource/zcool-xiaowei', css: '400.css', weight: 400 },
    body: { pkg: '@fontsource/zcool-xiaowei', css: '400.css', weight: 400 },
    fallback: SERIF,
  },
  'zcool-kuaile': {
    heading: { pkg: '@fontsource/zcool-kuaile', css: '400.css', weight: 400 },
    body: { pkg: '@fontsource/zcool-kuaile', css: '400.css', weight: 400 },
    fallback: SANS,
  },
}

export const FONT_FAMILY: Readonly<Record<FontRole, string>> = { heading: 'SZ Heading', body: 'SZ Body' }

export function fontWeight(id: FontId, role: FontRole): 400 | 700 {
  return FONT_REGISTRY[id][role].weight
}

export function fontStack(id: FontId, role: FontRole): string {
  return `"${FONT_FAMILY[role]}", ${FONT_REGISTRY[id].fallback}`
}

interface Slice {
  file: string
  ranges: ReadonlyArray<readonly [number, number]>
}

const sliceCache = new Map<string, Slice[]>()
const bufferCache = new Map<string, Buffer>()
const subsetCache = new Map<string, { b64: string; bytes: number }>()

function packageDir(pkg: string): string {
  // Resolved from the project root on purpose: bundlers cannot rewrite this path, and
  // the deployment is a long-running Node process started in the repo root (contract R3).
  return path.resolve(process.cwd(), 'node_modules', pkg)
}

function parseRanges(value: string): Array<readonly [number, number]> {
  return value.split(',').flatMap(part => {
    const m = /^\s*U\+([0-9a-fA-F]+)(?:-([0-9a-fA-F]+))?\s*$/.exec(part)
    if (!m || !m[1]) return []
    const start = parseInt(m[1], 16)
    const end = m[2] ? parseInt(m[2], 16) : start
    return [[start, end] as const]
  })
}

function loadSlices(source: FontSource): Slice[] {
  const key = `${source.pkg}/${source.css}`
  const cached = sliceCache.get(key)
  if (cached) return cached
  const dir = packageDir(source.pkg)
  const css = fs.readFileSync(path.join(dir, source.css), 'utf8')
  const slices: Slice[] = []
  for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = block[1] ?? ''
    const file = /url\(\s*['"]?\.\/(files\/[^'")]+\.woff2)['"]?\s*\)/.exec(body)?.[1]
    const range = /unicode-range:\s*([^;}]+)/.exec(body)?.[1]
    if (!file || !range) continue
    slices.push({ file: path.join(dir, file), ranges: parseRanges(range) })
  }
  if (slices.length === 0) throw new Error(`no font slices found in ${key}`)
  sliceCache.set(key, slices)
  return slices
}

function readBuffer(file: string): Buffer {
  const cached = bufferCache.get(file)
  if (cached) return cached
  const buf = fs.readFileSync(file)
  bufferCache.set(file, buf)
  return buf
}

function inRanges(cp: number, ranges: Slice['ranges']): boolean {
  return ranges.some(([a, b]) => cp >= a && cp <= b)
}

/** Compact `U+4e00-4e02,U+4e05` form of an ascending code point list. */
function toUnicodeRange(cps: readonly number[]): string {
  const parts: string[] = []
  let i = 0
  while (i < cps.length) {
    const start = cps[i] as number
    let end = start
    while (i + 1 < cps.length && cps[i + 1] === end + 1) end = cps[++i] as number
    parts.push(start === end ? `U+${start.toString(16)}` : `U+${start.toString(16)}-${end.toString(16)}`)
    i++
  }
  return parts.join(',')
}

async function subsetSlice(file: string, cps: readonly number[]): Promise<{ b64: string; bytes: number }> {
  const text = String.fromCodePoint(...cps)
  const key = `${file}\u0000${text}`
  const cached = subsetCache.get(key)
  if (cached) return cached
  const out = await subsetFont(readBuffer(file), text, { targetFormat: 'woff2' })
  const result = { b64: Buffer.from(out).toString('base64'), bytes: out.length }
  if (subsetCache.size > 500) subsetCache.clear()
  subsetCache.set(key, result)
  return result
}

export interface FontFaceResult {
  css: string
  bytes: number
}

/** Inline @font-face rules for one role, covering exactly the code points in `text`. */
export async function buildFontFaces(id: FontId, role: FontRole, text: string): Promise<FontFaceResult> {
  const source = FONT_REGISTRY[id][role]
  const cps = [...new Set(Array.from(text, ch => ch.codePointAt(0) as number))]
    .filter(cp => cp > 0x20 && !/\s/u.test(String.fromCodePoint(cp)))
    .sort((a, b) => a - b)
  const remaining = new Set(cps)
  const rules: string[] = []
  let bytes = 0
  for (const slice of loadSlices(source)) {
    const hit = cps.filter(cp => remaining.has(cp) && inRanges(cp, slice.ranges))
    if (hit.length === 0) continue
    for (const cp of hit) remaining.delete(cp)
    const { b64, bytes: size } = await subsetSlice(slice.file, hit)
    bytes += size
    rules.push(
      `@font-face{font-family:"${FONT_FAMILY[role]}";font-style:normal;font-weight:${source.weight};` +
        `font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2");` +
        `unicode-range:${toUnicodeRange(hit)}}`,
    )
  }
  return { css: rules.join('\n'), bytes }
}
