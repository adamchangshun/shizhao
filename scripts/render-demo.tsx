// pnpm render:demo [--screenshot]
// Renders every template with the fixed single-item and 8-item menu fixtures into
// data/demo/<template>-<dataset>/index.html. Images are generated SVG placeholders.
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

function placeholderSvg(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  const hue = h % 360
  const a = `hsl(${hue} 70% 72%)`
  const b = `hsl(${(hue + 40) % 360} 65% 52%)`
  const c = `hsl(${(hue + 180) % 360} 60% 92%)`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="800" height="800" fill="url(#g)"/>
<circle cx="400" cy="430" r="230" fill="${c}" opacity=".9"/>
<circle cx="400" cy="430" r="150" fill="${b}" opacity=".55"/>
<circle cx="${300 + (h % 200)}" cy="${200 + (h % 120)}" r="40" fill="${c}" opacity=".7"/>
</svg>`
}

async function render(templateId: TemplateId, name: string, facts: FactSheet, copy: CopyDraft): Promise<string> {
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
    assetUrl: (assetId, size) => `media/${assetId}-${size}.svg`,
  })
  for (const m of result.media) {
    fs.writeFileSync(path.join(dir, 'media', `${m.assetId}-${m.size}.svg`), placeholderSvg(m.assetId))
  }
  const file = path.join(dir, 'index.html')
  fs.writeFileSync(file, result.html)
  const htmlKb = (Buffer.byteLength(result.html) / 1024).toFixed(1)
  const fontKb = (result.fontBytes / 1024).toFixed(1)
  console.log(`${templateId}-${name}: html ${htmlKb} KB (inlined fonts ${fontKb} KB decoded)`)
  return file
}

async function screenshot(files: string[]): Promise<void> {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  try {
    for (const file of files) {
      for (const width of [360, 375, 430]) {
        const page = await browser.newPage({ viewport: { width, height: 812 }, deviceScaleFactor: 2 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto(`file://${file}`)
        await page.evaluate(() => document.fonts.ready)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
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
  } finally {
    await browser.close()
  }
}

async function main(): Promise<void> {
  const files: string[] = []
  for (const templateId of Object.keys(TEMPLATES) as TemplateId[]) {
    for (const [name, facts, copy] of DATASETS) {
      files.push(await render(templateId, name, facts, copy))
    }
  }
  if (process.argv.includes('--screenshot')) await screenshot(files)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
