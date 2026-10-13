// Control group A: the model writes the whole page. The prompt follows the common pattern of
// open-source page generators (abi/screenshot-to-code, wandb/openui): expert front-end role,
// Tailwind via CDN, mobile-first, complete code, no placeholder comments, placeholder images.
// The output is stored as text and only ever parsed (page-text.ts); it is never run in a browser.
import { z } from 'zod'
import type { Usage } from '../../lib/core/schemas'
import {
  MockProvider,
  type GenerateJSONRequest,
  type ImageInput,
  type LLMProvider,
} from '../../lib/providers'
import type { GoldSheet } from './samples'

export const A_SYSTEM = `你是一名资深前端开发者，擅长使用 Tailwind CSS 制作移动端优先的网页。
- 根据用户提供的信息，生成一个完整、可直接打开的单文件 HTML 页面。
- 使用 Tailwind CSS，通过 <script src="https://cdn.tailwindcss.com"></script> 引入。
- 页面要美观、有吸引力，适合在手机上浏览。
- 写出完整内容，不要在代码里写「<!-- 在此添加更多商品 -->」之类的占位注释。
- 需要图片时使用 https://placehold.co 的占位图。
- 返回从 <html> 到 </html> 的完整 HTML，不要输出 Markdown 代码块标记。
- 以 JSON 对象 {"html": "<完整 HTML>"} 的形式返回。`

export const A_USER_GOLD =
  '根据以下商品信息，为这家店制作一个手机端宣传网页，输出完整 HTML。\n\n{facts}'
export const A_USER_RAW =
  '根据以下商家提供的文字和所附商品图片，为这家店制作一个手机端宣传网页，输出完整 HTML。\n\n商家文字：\n{text}'

export const PageHtml = z.object({ html: z.string().min(1).max(500_000) })

const yuan = (amount: number): string =>
  Number.isInteger(amount) ? String(amount) : amount.toFixed(2)

/** Natural-language description of the gold facts (the input of group A-gold). */
export function describeFacts(gold: GoldSheet): string {
  const { shop } = gold
  const lines = [`店铺名称：${shop.name}`]
  if (shop.phone) lines.push(`电话：${shop.phone}`)
  if (shop.wechat) lines.push(`微信：${shop.wechat}`)
  if (shop.address) lines.push(`地址：${shop.address}`)
  if (shop.hours) lines.push(`营业时间：${shop.hours}`)
  lines.push('商品：')
  gold.items.forEach((item, i) => {
    const parts = [item.name]
    if (item.price) parts.push(`${yuan(item.price.amount)} 元/${item.price.unit}`)
    if (item.spec) parts.push(`规格：${item.spec}`)
    if (item.description) parts.push(`介绍：${item.description}`)
    if (item.tags.length > 0) parts.push(`标签：${item.tags.join('、')}`)
    lines.push(`${i + 1}. ${parts.join('，')}`)
  })
  if (gold.extraClaims.length > 0) lines.push(`商家声明的卖点：${gold.extraClaims.join('；')}`)
  return lines.join('\n')
}

export function goldPrompt(gold: GoldSheet): string {
  return A_USER_GOLD.replace('{facts}', describeFacts(gold))
}

export function rawPrompt(inputText: string): string {
  return A_USER_RAW.replace('{text}', inputText)
}

export async function generatePageA(
  provider: LLMProvider,
  input: { prompt: string; images?: ImageInput[]; temperature: number; seed: number },
): Promise<{ html: string; usage: Usage }> {
  const { data, usage } = await provider.generateJSON({
    stage: 'page-html',
    system: A_SYSTEM,
    prompt: input.prompt,
    images: input.images,
    schema: PageHtml,
    temperature: input.temperature,
    seed: input.seed,
    timeoutMs: 120_000,
  })
  return { html: data.html, usage }
}

/**
 * Fixed demo page for PROVIDER=mock, never derived from the input (like MockProvider's
 * fixtures). It contains a script and a style block so the no-execution text path is exercised.
 */
export const MOCK_PAGE_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>本店宣传页</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>.price{content:"¥999"}</style>
<script>document.title = "¥888 限时";</script></head>
<body class="bg-amber-50">
<header><h1>欢迎光临本店</h1><p>全城销量第一的招牌好物！</p></header>
<section><div>招牌产品</div><div class="price">¥ 25.00</div><p>第二件半价，仅需 9.9元</p></section>
<footer><p>订购电话：13800000000</p></footer>
</body></html>`

/** MockProvider plus the `page-html` stage, answered with MOCK_PAGE_HTML. */
export class MockPageProvider implements LLMProvider {
  readonly name = 'mock'
  private readonly inner = new MockProvider({ delay: false })

  async generateJSON<T>(req: GenerateJSONRequest<T>): Promise<{ data: T; usage: Usage }> {
    if (req.stage !== 'page-html') return this.inner.generateJSON(req)
    const started = performance.now()
    return {
      data: req.schema.parse({ html: MOCK_PAGE_HTML }),
      usage: {
        provider: this.name,
        model: 'mock-fixtures',
        stage: req.stage,
        inputTokens: 0,
        outputTokens: 0,
        costCny: 0,
        latencyMs: Math.round(performance.now() - started),
      },
    }
  }
}
