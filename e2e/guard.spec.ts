import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test('negative example highlights reasons; desktop and 375px mobile render without overflow', async ({
  browser,
  baseURL,
}) => {
  fs.mkdirSync('.omc/m16', { recursive: true })
  for (const [name, width, height] of [
    ['desktop', 1280, 900],
    ['mobile', 375, 812],
  ] as const) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: name === 'mobile',
      hasTouch: name === 'mobile',
    })
    const page = await context.newPage()
    await page.goto('/check')
    await expect(page.getByRole('heading', { name: '营销文案检查' })).toBeVisible()
    await page.getByRole('button', { name: '反面示例', exact: true }).click()
    const first = page.getByRole('button', { name: '第一：广告法禁止的绝对化用语', exact: true })
    await expect(first).toBeVisible()
    await first.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('第一：广告法禁止的绝对化用语', { exact: true })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({ path: path.resolve(`.omc/m16/check-${name}.png`), fullPage: true })
    await context.close()
  }
})

test('grounded example works and input changes discard stale results', async ({ page }) => {
  await page.goto('/check')
  await page.getByRole('button', { name: '烘焙店文案', exact: true }).click()
  await expect(page.getByText('规则与所选判定未发现问题。', { exact: true })).toBeVisible()
  await page.getByLabel('营销文案', { exact: true }).fill('零糖')
  await expect(page.getByText('规则与所选判定未发现问题。', { exact: true })).toHaveCount(0)
})

test('untrusted text is escaped and API errors are shown in Chinese', async ({ page }) => {
  await page.goto('/check')
  await page.getByLabel('营销文案', { exact: true }).fill('<img src=x onerror=alert(1)>零糖')
  await page.getByRole('button', { name: '开始检查', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '零糖：无依据的事实声明', exact: true }),
  ).toBeVisible()
  await expect(page.locator('img[src="x"]')).toHaveCount(0)
  await page.getByLabel('检查行业', { exact: true }).selectOption('food')
  await page.getByRole('button', { name: '开始检查', exact: true }).click()
  await expect(page.getByRole('form', { name: '文案检查表单' }).getByRole('alert')).toHaveText(
    '该功能需要 API Key',
  )
})

test('dark mode remains usable by keyboard', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/check')
  await page.getByRole('button', { name: '反面示例', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', { name: '第一：广告法禁止的绝对化用语', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: path.resolve('.omc/m16/check-dark.png'), fullPage: true })
})
