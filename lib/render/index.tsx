// renderPage: FactSheet + DesignSpec + CopyDraft → one self-contained, deterministic HTML file.
// Facts are printed only from the FactSheet (see shared/facts.tsx); copy is plain escaped text.
// No dangerouslySetInnerHTML anywhere: React escapes everything it renders, and the only raw
// strings spliced in are our own CSS and the fixed inline script.
import { createRequire } from 'node:module'
import { z } from 'zod'

// This renders standalone files in a Node job, outside Next's Server Component renderer.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as typeof import('react-dom/server')
import {
  DesignSpec as DesignSpecSchema,
  FactSheet as FactSheetSchema,
  type CopyDraft,
  type DesignSpec,
  type FactSheet,
} from '@/lib/core/schemas'
import { getTemplate } from '@/templates'
import { baseCss } from './css'
import { buildFontFaces, FONT_REGISTRY } from './fonts'
import { navigationHref } from './format'
import { INLINE_SCRIPT } from './inline-script'
import { ActionBar, CopyToast, CorrectionSlot, ShopInfo, SiteFooter } from './shared/chrome'
import type { ImageSize, TemplateCopy, TemplateImage } from './types'

export { INLINE_SCRIPT_SHA256 } from './inline-script'
export type { ImageSize } from './types'

export interface RenderInput {
  factSheet: FactSheet
  design: DesignSpec
  copy: CopyDraft
  versionId: string
  /** Project slug; sent with tracking events. */
  slug: string
  /** Tracking endpoint (e.g. `/api/track`). Empty string disables tracking (previews). */
  trackingBase: string
  /** Absolute public URL of the page (`<PUBLIC_BASE_URL>/p/<slug>/`); makes og:image absolute for WeChat sharing. */
  pageUrl?: string
}

export interface MediaRef {
  assetId: string
  size: ImageSize
  /** File name inside the version's `media/` directory. */
  file: string
}

export interface RenderResult {
  html: string
  /** Images the page references; the caller copies them into `<versionDir>/media/`. */
  media: MediaRef[]
  /** Decoded size of the inlined font data. */
  fontBytes: number
}

const ASSET_ID = /^[a-zA-Z0-9_-]+$/

export function mediaFileName(assetId: string, size: ImageSize): string {
  if (!ASSET_ID.test(assetId)) throw new Error('invalid asset id')
  return `${assetId}-${size}.webp`
}

/** Version-relative image path (contract R2). Not overridable: pages never reference other origins. */
const assetUrl = (assetId: string, size: ImageSize): string => `media/${mediaFileName(assetId, size)}`

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" }

function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, m => ENTITIES[m] ?? m)
}

function visibleText(markup: string): string {
  return decodeEntities(markup.replace(/<[^>]*>/g, ' '))
}

/** Text inside elements styled with the heading font (class token `fh`); those elements never nest their own tag. */
function headingText(markup: string): string {
  const parts: string[] = []
  for (const m of markup.matchAll(/<([a-z0-9]+)\b[^>]*\bclass="(?:[^"]*\s)?fh(?:\s[^"]*)?"[^>]*>([\s\S]*?)<\/\1>/g)) {
    parts.push(visibleText(m[2] ?? ''))
  }
  return parts.join('')
}

// Characters drawn by CSS `content` rather than markup.
const CSS_GLYPHS = '/'

function assertSafeRawCss(css: string): string {
  if (/<\/style/i.test(css)) throw new Error('unsafe css')
  return css
}

// Copy is display text only; length and wording rules belong to the copy/guard stage (07).
// The renderer just needs strings — escaping, not validation, is what keeps them inert.
// Upper bounds still cap HTML size and font-subsetting work.
const RenderCopy = z.object({
  headline: z.string().max(200),
  subhead: z.string().max(200),
  itemBlurbs: z.record(z.string(), z.string().max(200)),
  closing: z.string().max(200),
})

const ITEM_ID = /^[A-Za-z0-9_-]+$/

/** Item ids become `data-fact` path segments: they must be unambiguous and unique. */
function assertItemIds(facts: FactSheet): void {
  const seen = new Set<string>()
  for (const item of facts.items) {
    if (!ITEM_ID.test(item.id) || seen.has(item.id)) throw new Error('invalid item id')
    seen.add(item.id)
  }
}

function byFile(a: MediaRef, b: MediaRef): number {
  return a.file < b.file ? -1 : a.file > b.file ? 1 : 0
}

export async function renderPage(input: RenderInput): Promise<RenderResult> {
  // mapUrl is re-validated here rather than by zod, so a bad link drops the button, not the page.
  const rawMapUrl: unknown = input.factSheet.shop.mapUrl
  const facts = FactSheetSchema.parse({ ...input.factSheet, shop: { ...input.factSheet.shop, mapUrl: undefined } })
  const mapUrl = rawMapUrl == null ? undefined : typeof rawMapUrl === 'string' ? rawMapUrl : 'invalid'
  const nav = navigationHref(facts.shop, mapUrl)
  assertItemIds(facts)
  const design = DesignSpecSchema.parse(input.design)
  const draft = RenderCopy.parse(input.copy)
  const template = getTemplate(design.templateId)

  const media = new Map<string, MediaRef>()
  let heroUsed = false
  const image = (assetId: string, size: ImageSize, hero = false): TemplateImage => {
    const file = mediaFileName(assetId, size)
    media.set(file, { assetId, size, file })
    const isHero = hero && !heroUsed
    if (isHero) heroUsed = true
    return { src: assetUrl(assetId, size), hero: isHero }
  }

  const ogAsset = facts.items.find(item => item.imageAssetIds.length > 0)?.imageAssetIds[0]
  const ogSrc = ogAsset ? image(ogAsset, 'display').src : null
  const ogImage = ogSrc && input.pageUrl ? new URL(ogSrc, input.pageUrl).href : ogSrc

  const copy: TemplateCopy = {
    headline: draft.headline,
    subhead: draft.subhead,
    closing: draft.closing,
    blurb: itemId => (Object.hasOwn(draft.itemBlurbs, itemId) ? draft.itemBlurbs[itemId] : undefined),
  }
  const { Component } = template

  // One pass over the whole document so React places its own hints (e.g. the hero image
  // preload) inside <head>. Our CSS and script are spliced in afterwards.
  const markup = renderToStaticMarkup(
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <title>{facts.shop.name}</title>
        {draft.subhead && <meta name="description" content={draft.subhead} />}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={facts.shop.name} />
        {draft.subhead && <meta property="og:description" content={draft.subhead} />}
        {ogImage && <meta property="og:image" content={ogImage} />}
        {input.pageUrl && <meta property="og:url" content={input.pageUrl} />}
        <meta name="theme-color" content={design.palette.primary} />
      </head>
      <body data-track={input.trackingBase} data-slug={input.slug} data-version={input.versionId}>
        <div className={`page t-${design.templateId} deco-${design.decoration}`}>
          <Component facts={facts} copy={copy} design={design} image={image} />
          <ShopInfo shop={facts.shop} />
          <CorrectionSlot />
          <SiteFooter />
        </div>
        <ActionBar shop={facts.shop} nav={nav} />
        <CopyToast />
      </body>
    </html>,
  )

  // React escapes every `<` in text and attributes, so these tags occur exactly once.
  const headEnd = markup.indexOf('</head>')
  const bodyEnd = markup.lastIndexOf('</body>')
  if (headEnd < 0 || bodyEnd < headEnd) throw new Error('unexpected document markup')
  const body = markup.slice(headEnd, bodyEnd)

  const headingFont = design.fontPair.heading
  const bodyFont = design.fontPair.body
  const sameFace =
    FONT_REGISTRY[headingFont].heading.pkg === FONT_REGISTRY[bodyFont].body.pkg &&
    FONT_REGISTRY[headingFont].heading.css === FONT_REGISTRY[bodyFont].body.css
  const bodyFaces = await buildFontFaces(bodyFont, 'body', visibleText(body) + CSS_GLYPHS)
  const headingFaces = sameFace ? null : await buildFontFaces(headingFont, 'heading', headingText(body))

  const css = assertSafeRawCss(
    [headingFaces?.css ?? '', bodyFaces.css, baseCss(design, { headingSharesBody: sameFace }), template.styles].join('\n'),
  )

  const doctype = markup.startsWith('<!DOCTYPE html>') ? '' : '<!DOCTYPE html>'
  const html =
    doctype +
    markup.slice(0, headEnd) +
    `<style>${css}</style>` +
    markup.slice(headEnd, bodyEnd) +
    `<script>${INLINE_SCRIPT}</script>` +
    markup.slice(bodyEnd)

  return { html, media: [...media.values()].sort(byFile), fontBytes: bodyFaces.bytes + (headingFaces?.bytes ?? 0) }
}
