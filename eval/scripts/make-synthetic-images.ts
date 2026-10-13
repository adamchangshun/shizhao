// Generates the synthetic images of the bundled example samples (flat colours, simple shapes and
// ASCII text drawn from SVG with sharp). No photos or third-party material; released as CC0.
// Run once after editing: pnpm exec tsx eval/scripts/make-synthetic-images.ts
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SAMPLES = path.resolve('eval/samples')

interface Picture {
  sample: string
  file: string
  background: string
  shapes: string
  lines: string[]
}

const W = 640
const H = 480

const PICTURES: Picture[] = [
  {
    sample: 'bakery-croissant-single',
    file: 'croissant.png',
    background: '#f6e7cf',
    shapes: `<path d="M140 300 Q320 80 500 300 Q320 220 140 300 Z" fill="#c98a3c"/>
      <path d="M200 270 Q320 150 440 270" stroke="#a96a24" stroke-width="10" fill="none"/>`,
    lines: ['BUTTER CROISSANT', '12 / 80g'],
  },
  {
    sample: 'bakery-dessert-menu',
    file: 'egg-tart.png',
    background: '#fff3d6',
    shapes: `<circle cx="320" cy="210" r="130" fill="#d99a3d"/><circle cx="320" cy="210" r="100" fill="#f7cf4a"/>
      <circle cx="290" cy="185" r="22" fill="#b5651d" opacity="0.6"/>`,
    lines: ['EGG TART 8'],
  },
  {
    sample: 'bakery-dessert-menu',
    file: 'menu.png',
    background: '#3b2a24',
    shapes: `<rect x="40" y="40" width="560" height="400" rx="18" fill="none" stroke="#f1d9b5" stroke-width="6"/>`,
    lines: ['EGG TART ...... 8', 'TIRAMISU ...... 32', 'BASQUE 6in ... 128'],
  },
  {
    sample: 'drink-cafe-menu',
    file: 'menu-board.png',
    background: '#1f3b34',
    shapes: `<rect x="40" y="40" width="560" height="400" rx="12" fill="none" stroke="#e8f1ea" stroke-width="5"/>
      <circle cx="560" cy="90" r="28" fill="#d8b384"/>`,
    lines: ['LATTE (M) ..... 22', 'AMERICANO ..... 18', 'LEMON TEA ..... 15'],
  },
]

function svg(p: Picture): string {
  const light = p.background.startsWith('#f') || p.background.startsWith('#e')
  const color = light ? '#3b2a24' : '#f5ecd9'
  const top = p.lines.length === 1 ? 400 : 120
  const text = p.lines
    .map(
      (line, i) =>
        `<text x="${W / 2}" y="${top + i * 90 + (p.lines.length > 2 ? 40 : 0)}" font-family="Helvetica, Arial, sans-serif" font-size="40" font-weight="700" fill="${color}" text-anchor="middle">${line}</text>`,
    )
    .join('')
  // Text sits below the shapes for single-line pictures and above them for menus.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="${p.background}"/>${p.lines.length > 1 && p.lines.length < 3 ? `<g transform="translate(0 100)">${p.shapes}</g>` : p.shapes}${text}</svg>`
}

async function main(): Promise<void> {
  for (const p of PICTURES) {
    const dir = path.join(SAMPLES, p.sample, 'images')
    fs.mkdirSync(dir, { recursive: true })
    const out = path.join(dir, p.file)
    await sharp(Buffer.from(svg(p)))
      .png({ compressionLevel: 9 })
      .toFile(out)
    console.log(`wrote ${path.relative(process.cwd(), out)}`)
  }
}

void main()
