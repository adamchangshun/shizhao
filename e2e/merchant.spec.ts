import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { E2E_ADMIN_TOKEN, E2E_FAIL_MARKER } from './merchant-env'

// Generation with the mock provider takes a few seconds per run; allow for a cold dev server.
test.setTimeout(240_000)
const GENERATION_MS = 90_000
const SHOT_DIR = path.resolve('.omc/m11')

const NOTES = '拿铁 20元/杯，热拿铁，现磨咖啡豆。电话 13800138000'

async function image(color: string) {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: color } })
    .png()
    .toBuffer()
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('管理口令').fill(E2E_ADMIN_TOKEN)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByRole('heading', { name: '我的宣传页' })).toBeVisible()
}

/** Axe on the console only (the generated page inside the preview frame belongs to module 06). */
async function expectAccessible(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).exclude('iframe').analyze()
  const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    bad.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

async function shot(page: Page, info: TestInfo, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  await page.screenshot({
    path: path.join(SHOT_DIR, `${info.project.name}-${name}.png`),
    fullPage: true,
  })
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}

async function createAndUpload(page: Page, shopName: string) {
  await page.getByRole('button', { name: '新建宣传页' }).click()
  await page.getByText('菜单 / 多个商品').click()
  await page.getByLabel('店名').fill(shopName)
  await page.getByRole('button', { name: '创建并上传素材' }).click()
  await expect(page.getByRole('heading', { name: '上传素材' })).toBeVisible()

  await page.getByTestId('image-input').setInputFiles([
    { name: 'latte.png', mimeType: 'image/png', buffer: await image('#c08040') },
    { name: 'menu.png', mimeType: 'image/png', buffer: await image('#305080') },
  ])
  await expect(page.getByRole('list', { name: '已上传的图片' }).getByRole('listitem')).toHaveCount(
    2,
  )
  await page.getByLabel('文字说明').fill(NOTES)
}

async function toFacts(page: Page) {
  await page.getByRole('button', { name: '下一步：识别商品信息' }).click()
  await expect(page.getByRole('heading', { name: '核对商品信息' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('名称').first()).toHaveValue('拿铁')
}

async function waitForPreview(page: Page) {
  await expect(page.getByRole('heading', { name: '预览', exact: true })).toBeVisible({
    timeout: GENERATION_MS,
  })
}

function projectIdOf(page: Page): string {
  const id = /\/projects\/([^/?]+)/.exec(page.url())?.[1]
  if (!id) throw new Error(`no project id in ${page.url()}`)
  return id
}

test('upload → check → generate → restyle → publish, with corrected price', async ({
  page,
}, info) => {
  await login(page)
  await shot(page, info, '0-list')
  await createAndUpload(page, `演示小店${Date.now() % 100000}`)
  await expectAccessible(page, 'upload')
  await noHorizontalScroll(page)
  await shot(page, info, '1-upload')

  await toFacts(page)
  await page.getByLabel('价格（元）').first().fill('18')
  await expectAccessible(page, 'facts')
  await noHorizontalScroll(page)
  await shot(page, info, '2-facts')

  await page.getByRole('button', { name: '确认无误，开始生成' }).click()
  await expect(page.getByRole('heading', { name: '正在生成宣传页' })).toBeVisible()
  await expect(page.getByText(/预计还需|马上就好|马上进入预览/)).toBeVisible()
  await expectAccessible(page, 'generate')
  await shot(page, info, '3-generate')

  await waitForPreview(page)
  await expect(page.getByTestId('guard-summary')).toContainText(/拦截|依据/)
  await expectAccessible(page, 'preview')
  // Reduced motion also skips the colour transition, so axe samples the settled dark colours.
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await expectAccessible(page, 'preview-dark')
  await shot(page, info, '4-preview-dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await noHorizontalScroll(page)
  await shot(page, info, '4-preview')

  // 换一个风格 → a second version whose layout or main colour differs.
  await page.getByRole('button', { name: '换一个风格' }).click()
  await expect(page.getByRole('heading', { name: '正在生成宣传页' })).toBeVisible()
  await waitForPreview(page)
  const thumbs = page.getByTestId('version-thumb')
  await expect(thumbs).toHaveCount(2)
  const looks = await thumbs.evaluateAll((els) =>
    els.map((el) => `${el.getAttribute('data-template')}|${el.getAttribute('data-primary')}`),
  )
  expect(new Set(looks).size).toBe(2)

  await page.getByRole('button', { name: '用这一版发布' }).click()
  await expect(page.getByRole('heading', { name: '发布前最后核对' })).toBeVisible()
  await expect(page.getByText('18 元 / 杯')).toBeVisible()
  const publish = page
    .getByRole('region', { name: '当前步骤' })
    .getByRole('button', { name: '发布', exact: true })
  await expect(publish).toBeDisabled()
  await page.getByLabel('我已核对以上信息无误').check()
  await expect(publish).toBeEnabled()
  await expectAccessible(page, 'publish')
  await publish.click()

  await expect(page.getByText('发布成功，顾客现在可以扫码查看')).toBeVisible()
  const url = await page.getByLabel('宣传页链接').inputValue()
  expect(url).toMatch(/\/p\/[a-z0-9]{6}\/$/)
  const qr = page.getByRole('img', { name: /宣传页二维码/ })
  await expect(qr).toBeVisible()
  await expect
    .poll(() => qr.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true)
  await noHorizontalScroll(page)
  await shot(page, info, '5-publish')

  // The published page shows the corrected price. Until the public page (module 10) is merged,
  // /p/<slug>/ is not served, so the check falls back to the published version's HTML.
  const pub = await page.request.get(url)
  let html: string
  if (pub.status() === 404) {
    info.annotations.push({ type: 'pending', description: '公开页 /p/<slug>/ 待 10 号模块合并' })
    const versions = (await (
      await page.request.get(`/api/projects/${projectIdOf(page)}/versions`)
    ).json()) as { versions: Array<{ id: string }> }
    html = await (
      await page.request.get(`/api/versions/${versions.versions[0]!.id}/preview`)
    ).text()
  } else {
    html = await pub.text()
  }
  expect(html).toContain('18')
  expect(html).not.toMatch(/¥\s*20(?!\d)|20\s*元/)
})

test('a failed generation shows the reason in Chinese and succeeds on retry', async ({ page }) => {
  await login(page)
  const name = `${E2E_FAIL_MARKER}${Date.now() % 100000}`
  await createAndUpload(page, name)
  await toFacts(page)
  await page.getByLabel('店名').fill(name)
  await page.getByRole('button', { name: '确认无误，开始生成' }).click()

  await expect(page.getByRole('heading', { name: '这次没有生成成功' })).toBeVisible({
    timeout: GENERATION_MS,
  })
  await expect(page.getByText('文案生成服务暂时不可用，请稍后重试')).toBeVisible()
  await expectAccessible(page, 'failed')
  await page.getByRole('button', { name: '重试' }).click()
  await waitForPreview(page)
})
