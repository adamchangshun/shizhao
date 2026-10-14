import { FactItem, Shop } from '../core/schemas'
import extract from './mock-fixtures/extract.json'

// Deliberately small demo grammar: no OCR, inference, or execution of merchant instructions.
const nonFact = /忽略|指令|写成|改成|改为|请|^(?:电话|手机|地址|微信|营业时间|店名)\s*[:：]/u
const product =
  /^(.+?)\s*[,，:：]?\s*([¥￥])?\s*(\d{1,7}(?:\.\d{1,2})?)\s*(元|块)?(?:\s*(?:\/|每|一)\s*([^\d\s,，。;；/]{1,8}))?(?=$|[\s,，。;；])/u

function readProduct(line: string) {
  if (nonFact.test(line)) return null
  const match = product.exec(line)
  if (!match || (!match[2] && !match[4])) return null
  const name = match[1]!
    .trim()
    .replace(/[,，:：]$/, '')
    .trim()
  // Do not reinterpret a range/negative/over-precise number as part of a product name.
  if (/[\d.\-~～至¥￥]$/u.test(name)) return null
  const parsed = FactItem.safeParse({
    id: 'mock-item',
    name,
    price: { amount: Number(match[3]), currency: 'CNY', unit: match[5] ?? '份' },
    tags: [],
    imageAssetIds: [],
    sources: { name: 'merchant_text', price: 'merchant_text' },
  })
  return parsed.success ? parsed.data : null
}

/** Echo explicit text fields; absent fields retain the original offline demo fixtures. */
export function echoExtract(prompt: string) {
  const material = /<商家文字>([\s\S]*?)<\/商家文字>/.exec(prompt)
  const text = (material?.[1] ?? prompt).trim()
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const items = lines
    .flatMap((line) => line.split(/[;；。]/u))
    .map(readProduct)
    .filter((item) => item !== null)
    .slice(0, 30)
    .map((item, i) => ({ ...item, id: `mock-item-${i + 1}` }))
  const explicit = lines.find((line) => /^店名\s*[:：]/u.test(line))
  const candidate = explicit?.replace(/^店名\s*[:：]\s*/u, '') ?? lines[0] ?? ''
  const name = Shop.shape.name.safeParse(candidate)
  const hasName =
    name.success &&
    !readProduct(candidate) &&
    !nonFact.test(candidate) &&
    !/^（.*）$/u.test(candidate)
  return {
    ...extract,
    shop: hasName ? { name: name.data } : extract.shop,
    items: items.length ? items : extract.items,
  }
}
