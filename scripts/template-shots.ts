// pnpm template:shots
// Renders the first eval sample (eval/samples, sorted by name) with each of the three templates
// and saves a 390px-wide full-page PNG per template into docs/assets/templates/ (not committed),
// for the submission PDF. No model is called: the facts are the sample's hand-labelled gold.json
// and the copy is fixed text built from those facts, so every number on the page is a gold fact.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { CopyDraft, FactSheet, TemplateId } from '@/lib/core/schemas'
import { renderPage } from '@/lib/render'
import { designFor } from '@/tests/render/fixtures'

const SAMPLES = path.resolve('eval/samples')
const OUT = path.resolve('docs/assets/templates')
const WORK = path.resolve('data/template-shots')
const TEMPLATES: TemplateId[] = ['poster', 'card-stack', 'menu-board']
const WIDTH = 390

interface Sample {
  id: string
  facts: FactSheet
  /** Asset id → source image path. */
  images: Map<string, string>
}

/** Gold image references are file names; rendering needs ids matching [a-zA-Z0-9_-]+. */
function assetId(file: string): string {
  return path.parse(file).name.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function firstSample(): Sample {
  const id = fs
    .readdirSync(SAMPLES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(SAMPLES, d.name, 'gold.json')))
    .map((d) => d.name)
    .sort()[0]
  if (!id) throw new Error('eval/samples 下没有样本')
  const dir = path.join(SAMPLES, id)
  const gold = JSON.parse(fs.readFileSync(path.join(dir, 'gold.json'), 'utf8')) as Omit<
    FactSheet,
    'projectId' | 'revision' | 'confirmedAt'
  >
  const images = new Map<string, string>()
  const items = gold.items.map((item) => ({
    ...item,
    imageAssetIds: item.imageAssetIds.map((file) => {
      images.set(assetId(file), path.join(dir, 'images', file))
      return assetId(file)
    }),
  }))
  const facts: FactSheet = {
    ...gold,
    items,
    projectId: 'template-shots',
    revision: 1,
    confirmedAt: new Date(0).toISOString(),
  }
  return { id, facts, images }
}

/** Copy made only of the sample's own facts (no model, nothing for the guard to remove). */
function copyFor(facts: FactSheet): CopyDraft {
  return {
    headline: facts.shop.name.slice(0, 20),
    subhead: facts.extraClaims.join('，').slice(0, 40),
    itemBlurbs: Object.fromEntries(
      facts.items.flatMap((i) => (i.description ? [[i.id, i.description.slice(0, 60)]] : [])),
    ),
    closing: '欢迎到店',
  }
}

async function writeMedia(
  dir: string,
  sample: Sample,
  media: Awaited<ReturnType<typeof renderPage>>['media'],
): Promise<void> {
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true })
  for (const ref of media) {
    const source = sample.images.get(ref.assetId)
    if (!source) throw new Error(`样本里没有图片 ${ref.assetId}`)
    const image = sharp(source)
    const resized =
      ref.size === 'display'
        ? image.resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true })
        : image.resize({ width: 240, height: 240, fit: 'cover' })
    await resized.webp({ quality: 85 }).toFile(path.join(dir, 'media', ref.file))
  }
}

async function main(): Promise<void> {
  const started = Date.now()
  const sample = firstSample()
  const { chromium } = await import('@playwright/test')
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  try {
    for (const templateId of TEMPLATES) {
      const result = await renderPage({
        factSheet: sample.facts,
        design: designFor(templateId),
        copy: copyFor(sample.facts),
        versionId: 'shots',
        slug: 'shots0',
        trackingBase: '',
      })
      const dir = path.join(WORK, templateId)
      fs.rmSync(dir, { recursive: true, force: true })
      await writeMedia(dir, sample, result.media)
      const html = path.join(dir, 'index.html')
      fs.writeFileSync(html, result.html)

      const page = await browser.newPage({
        viewport: { width: WIDTH, height: 844 },
        deviceScaleFactor: 2,
      })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(`file://${html}`)
      await page.evaluate(() => document.fonts.ready)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      const file = path.join(OUT, `${sample.id}-${templateId}.png`)
      // A fullPage capture leaves position:fixed elements (the call / map bar) where the first
      // viewport ended, over the content. Grow the viewport to the whole page instead, so the
      // bar sits at the real bottom as a customer sees it after scrolling down.
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
      await page.setViewportSize({ width: WIDTH, height: pageHeight })
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: file })
      const { width, height } = await sharp(file).metadata()
      await page.close()
      console.log(
        `[实招] ${templateId}: ${path.relative(process.cwd(), file)}（${width}×${height} 像素，CSS 宽 ${WIDTH}px` +
          `${overflow > 0 ? `，横向溢出 ${overflow}px` : ''}）`,
      )
    }
  } finally {
    await browser.close()
  }
  console.log(
    `[实招] 样本 ${sample.id}，3 套模板，用时 ${((Date.now() - started) / 1000).toFixed(1)} 秒`,
  )
}

main().catch((error: unknown) => {
  console.error('[实招] 模板截图失败：', error instanceof Error ? error.message : error)
  process.exit(1)
})
