// `checking` stage, minimum version (module 08 §3; module 13 was cut): every `data-fact` element
// must print exactly the FactSheet value for its path, every fact must be on the page, and every
// image the page references must exist in the version's media/ directory.
import fs from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'node-html-parser'
import type { FactSheet } from '../core/schemas'
import type { MediaRef } from '../render'
import { formatPriceAmount } from '../render/format'
import { MEDIA_FILE } from './files'

export class PageCheckError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PageCheckError'
  }
}

/** data-fact path → exact text, as the renderer's fact components print it. */
export function expectedFactTexts(facts: FactSheet): Map<string, string> {
  const out = new Map<string, string>()
  for (const field of ['name', 'phone', 'wechat', 'address', 'hours'] as const) {
    const value = facts.shop[field]
    if (value) out.set(`shop.${field}`, value)
  }
  for (const item of facts.items) {
    const p = `items.${item.id}`
    out.set(`${p}.name`, item.name)
    if (item.price) {
      out.set(`${p}.price`, formatPriceAmount(item.price))
      if (item.price.unit) out.set(`${p}.price.unit`, item.price.unit)
    }
    if (item.spec) out.set(`${p}.spec`, item.spec)
    if (item.description) out.set(`${p}.description`, item.description)
    item.tags.forEach((tag, i) => out.set(`${p}.tags.${i}`, tag))
  }
  facts.extraClaims.forEach((claim, i) => out.set(`extraClaims.${i}`, claim))
  return out
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await fs.lstat(p)).isFile()
  } catch {
    return false
  }
}

/** Throws PageCheckError (message is technical, for the server log) on the first problem. */
export async function checkPage(
  html: string,
  facts: FactSheet,
  mediaDir: string,
  media: readonly MediaRef[],
): Promise<void> {
  const root = parse(html)
  const expected = expectedFactTexts(facts)
  const seen = new Set<string>()
  for (const node of root.querySelectorAll('[data-fact]')) {
    const factPath = node.getAttribute('data-fact') ?? ''
    const want = expected.get(factPath)
    if (want === undefined) throw new PageCheckError(`unknown data-fact ${factPath}`)
    if (node.text !== want) throw new PageCheckError(`data-fact ${factPath} text mismatch`)
    seen.add(factPath)
  }
  for (const factPath of expected.keys()) {
    if (!seen.has(factPath)) throw new PageCheckError(`fact ${factPath} missing from page`)
  }

  const files = new Set(media.map((m) => m.file))
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? ''
    const file = src.startsWith('media/') ? src.slice('media/'.length) : ''
    if (!MEDIA_FILE.test(file)) throw new PageCheckError(`image source outside media/: ${src}`)
    files.add(file)
  }
  for (const file of files) {
    if (!MEDIA_FILE.test(file) || !(await isFile(path.join(mediaDir, file)))) {
      throw new PageCheckError(`media file missing: ${file}`)
    }
  }
}
