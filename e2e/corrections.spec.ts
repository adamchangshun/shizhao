import { expect, test, type APIRequestContext } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { E2E_ADMIN_TOKEN } from './merchant-env'

test.setTimeout(180_000)
const SHOT_DIR = path.resolve('.omc/m15')
const auth = { authorization: `Bearer ${E2E_ADMIN_TOKEN}` }

/** Builds and publishes a page through the HTTP API (mock provider): 拿铁 20 元/杯. */
async function publishedPage(api: APIRequestContext) {
  const created = await api.post('/api/projects', {
    headers: auth,
    data: { type: 'single', title: `纠错演示${Date.now() % 100000}` },
  })
  expect(created.status()).toBe(201)
  const { id } = (await created.json()) as { id: string }
  expect(
    (
      await api.post(`/api/projects/${id}/assets`, {
        headers: auth,
        multipart: { text: '拿铁 20元/杯，热拿铁。' },
      })
    ).status(),
  ).toBe(201)
  const extracted = await api.post(`/api/projects/${id}/extract`, { headers: auth })
  expect(extracted.status()).toBe(201)
  const { factSheet } = (await extracted.json()) as { factSheet: { revision: number } }
  expect(
    (
      await api.post(`/api/projects/${id}/facts/confirm`, {
        headers: auth,
        data: { revision: factSheet.revision },
      })
    ).status(),
  ).toBe(200)
  const job = await api.post(`/api/projects/${id}/jobs`, { headers: auth })
  const { jobId } = (await job.json()) as { jobId: string }
  await expect
    .poll(
      async () =>
        (
          (await (await api.get(`/api/jobs/${jobId}`, { headers: auth })).json()) as {
            status: string
          }
        ).status,
      { timeout: 90_000 },
    )
    .toBe('succeeded')
  const { versions } = (await (
    await api.get(`/api/projects/${id}/versions`, { headers: auth })
  ).json()) as { versions: Array<{ id: string }> }
  const published = await api.post(`/api/projects/${id}/publish`, {
    headers: auth,
    data: { versionId: versions[0]!.id, factsConfirmed: true },
  })
  expect(published.status()).toBe(200)
  const { url } = (await published.json()) as { url: string }
  return { id, url }
}

test('a customer reports a price, the merchant accepts it, the page shows the new price', async ({
  browser,
  page,
  request,
}) => {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  const { id, url } = await publishedPage(request)

  // Customer: a fresh 375px phone browser without any session.
  const customer = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  })
  const pub = await customer.newPage()
  await pub.goto(url)
  await expect(pub.locator('[data-fact$=".price"]').first()).toHaveText('¥20')
  await pub.getByText('信息有误？告诉老板').click()
  await pub.getByLabel('哪一项有误').selectOption({ label: '拿铁 · 价格' })
  await pub.getByLabel('正确的是').fill('18元')
  await pub.getByLabel('补充说明（选填）').fill('店里价目表是 18')
  await pub.screenshot({ path: path.join(SHOT_DIR, 'customer-form.png'), fullPage: true })
  await pub.getByRole('button', { name: '提交' }).click()
  await expect(pub.getByText('已转告老板，谢谢你')).toBeVisible()
  expect(await pub.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

  // Merchant: the report shows up in the corrections tab; accept it.
  await page.goto('/login')
  await page.getByLabel('管理口令').fill(E2E_ADMIN_TOKEN)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByRole('heading', { name: '我的宣传页' })).toBeVisible()
  await page.goto(`/projects/${id}?tab=corrections`)
  await expect(page.getByRole('link', { name: /顾客纠错\s*1\s*条待处理/ })).toBeVisible()
  const item = page.getByRole('list', { name: '待处理的纠错' }).getByRole('listitem').first()
  await expect(item).toContainText('拿铁 · 价格')
  await expect(item).toContainText('¥20/杯')
  await expect(item).toContainText('18元')
  await page.screenshot({ path: path.join(SHOT_DIR, 'merchant-tab.png'), fullPage: true })
  await item.getByRole('button', { name: '采纳', exact: true }).click()
  await expect(page.getByText('页面已更新，二维码不变')).toBeVisible()
  await expect(page.getByText('暂时没有待处理的纠错。')).toBeVisible()

  // Customer reloads: same link, new price.
  await pub.reload()
  await expect(pub.locator('[data-fact$=".price"]').first()).toHaveText('¥18')
  await pub.screenshot({ path: path.join(SHOT_DIR, 'customer-after.png'), fullPage: true })
  await customer.close()
})
