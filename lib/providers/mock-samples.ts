import fs from 'node:fs'
import path from 'node:path'

// Demo-only fixture lookup for the `extract` stage. When the merchant text is exactly the text of
// one of the bundled samples in eval/samples/, MockProvider answers with that sample's reviewed
// facts (gold.json) instead of the generic latte fixture, so `pnpm demo` shows the uploaded
// shop. The whole text is the key: nothing is parsed out of it, and any other text still gets
// the generic fixture. Eval runs construct MockProvider without this option, so mock-mode eval
// reports never score gold answers against themselves.

interface GoldItem {
  name: string
  price?: { amount: number; unit: string }
  spec?: string
  description?: string
  imageAssetIds?: string[]
}
interface Gold {
  shop: Record<string, string | undefined>
  items: GoldItem[]
  extraClaims?: string[]
}
interface Sample {
  gold: Gold
  /**
   * Image file names in upload order: sorted, one request per file, as `pnpm demo` uploads them.
   * (Images sent in one request share a timestamp and are listed by random asset id.)
   */
  images: string[]
}

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i
const SAMPLES_DIR = path.join(process.cwd(), 'eval', 'samples')
let cache: Map<string, Sample> | undefined

const normalize = (text: string) => text.replace(/\r\n?/g, '\n').trim()

function samples(): Map<string, Sample> {
  if (cache) return cache
  let dirs: fs.Dirent[]
  try {
    dirs = fs.readdirSync(SAMPLES_DIR, { withFileTypes: true })
  } catch {
    // No samples shipped (or unreadable right now): generic fixture, and retry on the next call.
    return new Map()
  }
  cache = new Map()
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue
    const root = path.join(SAMPLES_DIR, dir.name)
    try {
      const text = fs.readFileSync(path.join(root, 'input.txt'), 'utf8')
      const gold = JSON.parse(fs.readFileSync(path.join(root, 'gold.json'), 'utf8')) as Gold
      const imageDir = path.join(root, 'images')
      // Same filter as `pnpm demo`, so stray files (.DS_Store) cannot shift the indexes.
      const images = fs.existsSync(imageDir)
        ? fs
            .readdirSync(imageDir)
            .filter((f) => IMAGE_EXT.test(f))
            .sort()
        : []
      cache.set(normalize(text), { gold, images })
    } catch {
      /* Incomplete sample directories are simply not demo fixtures. */
    }
  }
  return cache
}

/** The model-shaped draft for a bundled sample, or null when the text is not one of them. */
export function sampleExtractDraft(prompt: string): unknown {
  const text = /<商家文字>\n([\s\S]*)\n<\/商家文字>/.exec(prompt)?.[1]
  const sample = text === undefined ? undefined : samples().get(normalize(text))
  if (!sample) return null
  // Prompt lists images as「第 N 张图片：编号 <assetId>」in upload order.
  const assetIds = [...prompt.matchAll(/第 (\d+) 张图片：编号 (\S+)/g)].map((m) => m[2]!)
  const assetFor = (file: string) => assetIds[sample.images.indexOf(file)]
  const { gold } = sample
  return {
    shop: gold.shop,
    items: gold.items.map((item) => ({
      name: item.name,
      price: item.price ? { amount: item.price.amount, unit: item.price.unit } : null,
      spec: item.spec ?? null,
      description: item.description ?? null,
      imageAssetIds: (item.imageAssetIds ?? [])
        .map(assetFor)
        .filter((id): id is string => id !== undefined),
    })),
    extraClaims: gold.extraClaims ?? [],
  }
}
