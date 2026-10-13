// pnpm render:demo [--screenshot]
// Renders every template with the fixed single-item and 8-item menu fixtures into
// data/demo/<template>-<dataset>/index.html. Placeholder images are WebP drawn in Chromium.
// With --screenshot, takes 375×812 Playwright screenshots and checks for horizontal
// overflow at 360/375/430px.
import fs from 'node:fs'
import path from 'node:path'
import type { FactSheet, CopyDraft, TemplateId } from '@/lib/core/schemas'
import { renderPage } from '@/lib/render'
import { TEMPLATES } from '@/templates'
import { designFor, menuCopy, menuFacts, singleCopy, singleFacts } from '@/tests/render/fixtures'

const OUT = path.resolve('data/demo')
const DATASETS: Array<[string, FactSheet, CopyDraft]> = [
  ['single', singleFacts, singleCopy],
  ['menu', menuFacts, menuCopy],
]

type Browser = Awaited<ReturnType<(typeof import('@playwright/test'))['chromium']['launch']>>

/** Draws a gradient placeholder in Chromium and returns it as WebP bytes. */
async function placeholderWebp(browser: Browser, seed: string, size: number): Promise<Buffer> {
  let h = 0
  for (const ch of seed) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  const page = await browser.newPage()
  try {
    const dataUrl = await page.evaluate(
      ([hue, px]) => {
        const c = document.createElement('canvas')
        c.width = px
        c.height = px
        const g = c.getContext('2d') as CanvasRenderingContext2D
        const grad = g.createLinearGradient(0, 0, px, px)
        grad.addColorStop(0, `hsl(${hue} 70% 72%)`)
        grad.addColorStop(1, `hsl(${(hue + 40) % 360} 65% 52%)`)
        g.fillStyle = grad
        g.fillRect(0, 0, px, px)
        g.fillStyle = `hsl(${(hue + 180) % 360} 60% 92%)`
        g.beginPath()
        g.arc(px / 2, px * 0.54, px * 0.29, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = `hsl(${(hue + 40) % 360} 65% 52% / .55)`
        g.beginPath()
        g.arc(px / 2, px * 0.54, px * 0.19, 0, Math.PI * 2)
        g.fill()
        return c.toDataURL('image/webp', 0.8)
      },
      [h % 360, size] as const,
    )
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
  } finally {
    await page.close()
  }
}

async function render(
  browser: Browser,
  templateId: TemplateId,
  name: string,
  facts: FactSheet,
  copy: CopyDraft,
): Promise<string> {
  const dir = path.join(OUT, `${templateId}-${name}`)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true })
  const result = await renderPage({
    factSheet: facts,
    design: designFor(templateId),
    copy,
    versionId: 'demo',
    slug: 'demo00',
    trackingBase: '',
  })
  for (const m of result.media) {
    fs.writeFileSync(
      path.join(dir, 'media', m.file),
      await placeholderWebp(browser, m.assetId, m.size === 'display' ? 800 : 240),
    )
  }
  const file = path.join(dir, 'index.html')
  fs.writeFileSync(file, result.html)
  const htmlKb = (Buffer.byteLength(result.html) / 1024).toFixed(1)
  const fontKb = (result.fontBytes / 1024).toFixed(1)
  console.log(`${templateId}-${name}: html ${htmlKb} KB (inlined fonts ${fontKb} KB decoded)`)
  return file
}

async function screenshot(browser: Browser, files: string[]): Promise<void> {
  for (const file of files) {
    for (const width of [360, 375, 430]) {
      const page = await browser.newPage({ viewport: { width, height: 812 }, deviceScaleFactor: 2 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(`file://${file}`)
      await page.evaluate(() => document.fonts.ready)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      if (overflow > 0) console.log(`  OVERFLOW ${overflow}px at ${width}px: ${file}`)
      if (width === 375) {
        const shot = file.replace(/index\.html$/, 'screenshot-375x812.png')
        await page.screenshot({ path: shot })
        await page.screenshot({ path: shot.replace('.png', '-full.png'), fullPage: true })
        console.log(`  screenshot: ${shot}`)
      }
      await page.close()
    }
  }
}

async function main(): Promise<void> {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  try {
    const files: string[] = []
    for (const templateId of Object.keys(TEMPLATES) as TemplateId[]) {
      for (const [name, facts, copy] of DATASETS) {
        files.push(await render(browser, templateId, name, facts, copy))
      }
    }
    if (process.argv.includes('--screenshot')) await screenshot(browser, files)
  } finally {
    await browser.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
