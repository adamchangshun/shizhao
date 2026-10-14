// pnpm demo:walkthrough
// Records the merchant console (module 11) end to end with Playwright, one take per viewport:
// 登录 → 新建 → 上传样本图 → 核对确认 → 生成中 → 预览 → 换一个风格 → 发布 → 二维码.
// Output: docs/assets/walkthrough/walkthrough-390x844.webm and -1280x800.webm (not committed).
//
// The model comes from .env.local as it is. Before recording, one text call and one image call
// check that it answers; if it does not (quota, network, wrong model name…), or the real-model
// take fails part-way, the script falls back to PROVIDER=mock and says so in its output.
//
// It starts its own `next dev` on WALKTHROUGH_PORT (default 6694) with a throwaway data
// directory (data/walkthrough) and admin token; stop any `pnpm dev` of this checkout first,
// since both would share .next.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Browser, Page } from '@playwright/test'
import { z } from 'zod'
import { getProvider } from '@/lib/providers'

const PORT = Number(process.env.WALKTHROUGH_PORT ?? 6694)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = path.resolve('docs/assets/walkthrough')
const DATA_DIR = path.resolve('data/walkthrough')
const SAMPLES = path.resolve('eval/samples')
const TOKEN = randomBytes(18).toString('base64url')
const SLOW_MO = 120
/** Real models can take a while per step; mock answers in seconds. */
const STEP_MS = 180_000

const VIEWPORTS = [
  { name: '390x844', viewport: { width: 390, height: 844 }, mobile: true },
  { name: '1280x800', viewport: { width: 1280, height: 800 }, mobile: false },
] as const

interface Sample {
  id: string
  type: 'single' | 'menu'
  shopName: string
  text: string
  images: string[]
}

function firstSample(): Sample {
  const id = fs
    .readdirSync(SAMPLES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(SAMPLES, d.name, 'gold.json')))
    .map((d) => d.name)
    .sort()[0]
  if (!id) throw new Error('eval/samples 下没有样本')
  const dir = path.join(SAMPLES, id)
  const gold = JSON.parse(fs.readFileSync(path.join(dir, 'gold.json'), 'utf8')) as {
    shop: { name: string }
    items: unknown[]
  }
  const imageDir = path.join(dir, 'images')
  return {
    id,
    type: gold.items.length > 1 ? 'menu' : 'single',
    shopName: gold.shop.name,
    // Exactly the sample text, so the mock (if used) answers with this sample's facts.
    text: fs.readFileSync(path.join(dir, 'input.txt'), 'utf8'),
    images: fs
      .readdirSync(imageDir)
      .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
      .sort()
      .map((f) => path.join(imageDir, f)),
  }
}

/** One text and one image call through the configured provider; null when it answers. */
async function preflight(sample: Sample): Promise<string | null> {
  if ((process.env.PROVIDER ?? 'mock') === 'mock') return null
  const schema = z.object({ ok: z.boolean() })
  try {
    const provider = getProvider()
    const ask = { stage: 'walkthrough-preflight', system: '你是助手。', schema, timeoutMs: 45_000 }
    await provider.generateJSON({ ...ask, prompt: '返回 {"ok": true}' })
    const image = sample.images[0]
    if (image)
      await provider.generateJSON({
        ...ask,
        prompt: '看到图片就返回 {"ok": true}',
        images: [{ path: image, mime: image.endsWith('.png') ? 'image/png' : 'image/jpeg' }],
      })
    return null
  } catch (err) {
    const code = (err as { code?: string }).code
    return `模型预检失败（${code ?? (err instanceof Error ? err.message : String(err))}）`
  }
}

function modelLabel(mock: boolean): string {
  if (mock) return 'PROVIDER=mock（固定演示数据）'
  const { PROVIDER, LLM_PROFILE, LLM_MODEL_TEXT, LLM_MODEL_VISION } = process.env
  return `${PROVIDER} / ${LLM_PROFILE ?? 'generic'}：文本 ${LLM_MODEL_TEXT}，视觉 ${LLM_MODEL_VISION}`
}

let server: ChildProcess | null = null

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) })).ok
  } catch {
    return false
  }
}

async function startServer(mock: boolean): Promise<void> {
  if (await healthy())
    throw new Error(`端口 ${PORT} 已被占用，请先停止该服务或设置 WALKTHROUGH_PORT`)
  fs.rmSync(DATA_DIR, { recursive: true, force: true })
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATA_DIR,
    ADMIN_TOKEN: TOKEN,
    PUBLIC_BASE_URL: `http://localhost:${PORT}`,
    ...(mock ? { PROVIDER: 'mock' } : {}),
  }
  const migrate = spawnSync(process.execPath, ['--import', 'tsx', 'lib/db/migrate-cli.ts'], {
    env,
    stdio: 'ignore',
  })
  if (migrate.status !== 0) throw new Error('数据库迁移失败')
  // Own process group, so stopServer() also reaches the workers next dev forks.
  server = spawn(
    process.execPath,
    [path.resolve('node_modules/next/dist/bin/next'), 'dev', '--port', String(PORT)],
    { stdio: 'ignore', env, detached: true },
  )
  const started = Date.now()
  while (Date.now() - started < 120_000) {
    if (server.exitCode !== null) throw new Error(`next dev 启动失败（退出码 ${server.exitCode}）`)
    if (await healthy()) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('next dev 120 秒内没有就绪')
}

async function stopServer(): Promise<void> {
  const child = server
  server = null
  if (!child?.pid || child.exitCode !== null) return
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))])
}

/** Compiles the console routes once, outside the recording, so the video has no dev pauses. */
async function warmUp(browser: Browser): Promise<void> {
  const page = await browser.newPage()
  for (const route of ['/login', '/']) await page.goto(`${BASE}${route}`)
  await page.close()
}

const pause = (page: Page, ms: number): Promise<void> => page.waitForTimeout(ms)

/** The walkthrough step in progress, for failure reports. */
let step = ''

/** What the page showed when a step failed: headings and alert / status text. */
async function describe(page: Page): Promise<string> {
  const texts = await page
    .locator('h1, h2, [role="alert"], [role="status"]')
    .allInnerTexts()
    .catch(() => [])
  return texts
    .map((t) => t.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .slice(0, 6)
    .join(' | ')
}

async function walkthrough(page: Page, sample: Sample): Promise<void> {
  const { expect } = await import('@playwright/test')
  const heading = (name: string) => page.getByRole('heading', { name, exact: true })

  // 登录
  step = '登录'
  await page.goto(`${BASE}/login`)
  await pause(page, 800)
  await page.getByLabel('管理口令').pressSequentially(TOKEN, { delay: 25 })
  await page.getByRole('button', { name: '登录' }).click()
  await expect(heading('我的宣传页')).toBeVisible({ timeout: 30_000 })
  await pause(page, 1200)

  // 新建
  step = '新建'
  await page.getByRole('button', { name: '新建宣传页' }).click()
  await page.getByText(sample.type === 'menu' ? '菜单 / 多个商品' : '单个商品').click()
  await page.getByLabel('店名').pressSequentially(sample.shopName, { delay: 60 })
  await pause(page, 600)
  await page.getByRole('button', { name: '创建并上传素材' }).click()

  // 上传样本图
  step = '上传样本图'
  await expect(heading('上传素材')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('image-input').setInputFiles(sample.images)
  await expect(page.getByRole('list', { name: '已上传的图片' }).getByRole('listitem')).toHaveCount(
    sample.images.length,
    { timeout: 60_000 },
  )
  await page.getByLabel('文字说明').fill(sample.text)
  await pause(page, 1500)

  // 核对确认
  step = '核对确认'
  await page.getByRole('button', { name: '下一步：识别商品信息' }).click()
  await expect(heading('核对商品信息')).toBeVisible({ timeout: STEP_MS })
  await page.mouse.wheel(0, 400)
  await pause(page, 2500)
  await page.getByRole('button', { name: '确认无误，开始生成' }).click()

  // 生成中 → 预览
  step = '生成中 → 预览'
  await expect(heading('正在生成宣传页')).toBeVisible({ timeout: 30_000 })
  await pause(page, 1500)
  await expect(heading('预览')).toBeVisible({ timeout: STEP_MS })
  await pause(page, 3000)

  // 换一个风格
  step = '换一个风格'
  await page.getByRole('button', { name: '换一个风格' }).click()
  await expect(heading('正在生成宣传页')).toBeVisible({ timeout: 30_000 })
  await expect(heading('预览')).toBeVisible({ timeout: STEP_MS })
  await pause(page, 3000)

  // 发布
  step = '发布'
  await page.getByRole('button', { name: '用这一版发布' }).click()
  await expect(heading('发布前最后核对')).toBeVisible({ timeout: 30_000 })
  await pause(page, 1500)
  await page.getByLabel('我已核对以上信息无误').check()
  await pause(page, 600)
  await page
    .getByRole('region', { name: '当前步骤' })
    .getByRole('button', { name: '发布', exact: true })
    .click()

  // 二维码
  step = '二维码'
  await expect(page.getByText('发布成功，顾客现在可以扫码查看')).toBeVisible({ timeout: 60_000 })
  const qr = page.getByRole('img', { name: /宣传页二维码/ })
  await expect(qr).toBeVisible()
  await qr.scrollIntoViewIfNeeded()
  await pause(page, 3500)
}

/** Records one take per viewport; returns the saved video paths and their durations. */
async function recordAll(browser: Browser, sample: Sample): Promise<string[]> {
  const lines: string[] = []
  for (const { name, viewport, mobile } of VIEWPORTS) {
    const raw = path.join(OUT, `.raw-${name}`)
    const context = await browser.newContext({
      viewport,
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: mobile ? 2 : 1,
      locale: 'zh-CN',
      recordVideo: { dir: raw, size: viewport },
    })
    // Hide the Next.js dev-mode badge so it does not appear in the recording.
    await context.addInitScript(() => {
      const style = document.createElement('style')
      style.textContent = 'nextjs-portal { display: none !important; }'
      document.addEventListener('DOMContentLoaded', () => document.head.append(style))
    })
    const page = await context.newPage()
    const started = Date.now()
    try {
      await walkthrough(page, sample)
    } catch (err) {
      const shot = path.join(OUT, `.failure-${name}.png`)
      await page.screenshot({ path: shot }).catch(() => {})
      const seen = await describe(page)
      throw new Error(
        `${name} 在「${step}」失败；页面显示：${seen || '（无标题）'}；截图 ${path.relative(process.cwd(), shot)}`,
        { cause: err },
      )
    } finally {
      await context.close() // finalizes the video
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1)
    const target = path.join(OUT, `walkthrough-${name}.webm`)
    const video = page.video()
    if (!video) throw new Error('没有录到视频')
    await video.saveAs(target)
    fs.rmSync(raw, { recursive: true, force: true })
    const mb = (fs.statSync(target).size / 1024 / 1024).toFixed(1)
    lines.push(`${path.relative(process.cwd(), target)}（${seconds} 秒，${mb} MB）`)
  }
  return lines
}

async function take(sample: Sample, mock: boolean): Promise<string[]> {
  const { chromium } = await import('@playwright/test')
  await startServer(mock)
  const browser = await chromium.launch({ slowMo: SLOW_MO })
  try {
    await warmUp(browser)
    return await recordAll(browser, sample)
  } finally {
    await browser.close()
    await stopServer()
  }
}

async function main(): Promise<void> {
  const started = Date.now()
  const sample = firstSample()
  fs.mkdirSync(OUT, { recursive: true })
  let mock = (process.env.PROVIDER ?? 'mock') === 'mock'
  let note = mock ? '.env.local 本身就是 mock' : ''

  if (!mock) {
    const failed = await preflight(sample)
    if (failed) {
      mock = true
      note = `${failed}，已自动回落到 PROVIDER=mock`
    }
  }
  console.log(`[实招] 样本 ${sample.id}；模型：${modelLabel(mock)}${note ? `（${note}）` : ''}`)

  let videos: string[]
  try {
    videos = await take(sample, mock)
  } catch (err) {
    if (mock) throw err
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err)
    mock = true
    note = `真实模型录制中途失败（${reason}），已自动回落到 PROVIDER=mock 重录`
    console.log(`[实招] ${note}`)
    videos = await take(sample, mock)
  }

  console.log(`[实招] 录制完成，模型：${modelLabel(mock)}${note ? `（${note}）` : ''}`)
  for (const line of videos) console.log(`[实招]   ${line}`)
  console.log(`[实招] 总用时 ${((Date.now() - started) / 1000).toFixed(1)} 秒`)
}

main()
  .catch(async (error: unknown) => {
    console.error('[实招] 录制失败：', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => stopServer())
