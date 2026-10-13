// pnpm demo
// Walks the first eval sample through the public HTTP API: create project → upload → extract →
// confirm → generate → publish, then prints the links, the admin token and a terminal QR code.
// Uses a server already listening on DEMO_API_BASE (default http://127.0.0.1:6688); when none
// answers, starts `next dev` on that port and keeps it running after the demo (Ctrl+C stops it).
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import QRCode from 'qrcode'
import { loadEnvFiles } from './env-files'

const SAMPLES = path.resolve('eval/samples')
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}
const TERMINAL = new Set(['succeeded', 'failed', 'timed_out'])
const JOB_DEADLINE_MS = 5 * 60_000

loadEnvFiles()
const apiBase = (process.env.DEMO_API_BASE ?? 'http://127.0.0.1:6688').replace(/\/+$/, '')

class DemoError extends Error {}

function adminToken(): string {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN
  // Docker image without ADMIN_TOKEN: the entrypoint keeps a generated one here.
  const file = path.join(process.env.DATA_DIR ?? 'data', 'admin-token')
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim()
  throw new DemoError('没有找到管理口令：请先运行 pnpm bootstrap，或设置 ADMIN_TOKEN')
}

async function api<T>(token: string, method: string, route: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { authorization: `Bearer ${token}` } }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { ...init.headers, 'content-type': 'application/json' }
  }
  const res = await fetch(`${apiBase}${route}`, init)
  const data = (await res.json().catch(() => null)) as
    (T & { error?: { code: string; message: string } }) | null
  if (!res.ok)
    throw new DemoError(
      `${method} ${route} 失败（${res.status}）：${data?.error?.message ?? '无法解析响应'}${data?.error?.code ? ` [${data.error.code}]` : ''}`,
    )
  return data as T
}

async function healthy(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase}/api/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok && ((await res.json()) as { ok?: unknown }).ok === true
  } catch {
    return false
  }
}

/** HTTP status of the public page as a visitor sees it (redirects followed); 0 when unreachable. */
async function publicStatus(url: string): Promise<number> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(30_000) })).status
  } catch {
    return 0
  }
}

async function ensureServer(): Promise<ChildProcess | null> {
  if (await healthy()) {
    console.info(`[实招] 使用已在运行的服务：${apiBase}`)
    return null
  }
  const url = new URL(apiBase)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname))
    throw new DemoError(`${apiBase} 无法访问，请先启动服务`)
  const port = url.port || '80'
  console.info(`[实招] ${apiBase} 没有运行中的服务，正在启动 next dev（端口 ${port}）…`)
  const child = spawn(
    process.execPath,
    [path.resolve('node_modules/next/dist/bin/next'), 'dev', '--port', port],
    { stdio: ['ignore', 'ignore', 'inherit'], env: process.env },
  )
  const started = Date.now()
  while (Date.now() - started < 120_000) {
    if (child.exitCode !== null)
      throw new DemoError(`next dev 启动失败（退出码 ${child.exitCode}）`)
    if (await healthy()) return child
    await new Promise((r) => setTimeout(r, 1000))
  }
  child.kill()
  throw new DemoError('next dev 120 秒内没有就绪')
}

function firstSample(): { dir: string; type: 'single' | 'menu'; text: string; images: string[] } {
  const name = fs
    .readdirSync(SAMPLES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()[0]
  if (!name) throw new DemoError('eval/samples 下没有样本')
  const dir = path.join(SAMPLES, name)
  const imageDir = path.join(dir, 'images')
  const images = fs.existsSync(imageDir)
    ? fs
        .readdirSync(imageDir)
        .filter((f) => IMAGE_TYPES[path.extname(f).toLowerCase()])
        .sort()
        .map((f) => path.join(imageDir, f))
    : []
  return {
    dir: name,
    type: name.endsWith('-menu') ? 'menu' : 'single',
    text: fs.readFileSync(path.join(dir, 'input.txt'), 'utf8'),
    images,
  }
}

interface FactSheetView {
  revision: number
  shop: { name: string }
  items: Array<{ name: string; price?: { amount: number; unit: string } }>
}
interface JobView {
  status: string
  stageLabel?: string
  error?: string
}

async function run(token: string): Promise<void> {
  const sample = firstSample()
  console.info(`\n[1/6] 样本 ${sample.dir}：${sample.images.length} 张图片 + 文字`)
  const title =
    sample.text
      .split(/\r?\n/)
      .find((l) => l.trim())
      ?.trim()
      .slice(0, 30) || sample.dir
  const project = await api<{ id: string; slug: string }>(token, 'POST', '/api/projects', {
    type: sample.type,
    title,
  })
  console.info(`      已建项目「${title}」 id=${project.id}`)

  const form = new FormData()
  for (const file of sample.images)
    form.append(
      'images',
      await fs.openAsBlob(file, { type: IMAGE_TYPES[path.extname(file).toLowerCase()] }),
      path.basename(file),
    )
  form.append('text', sample.text)
  const uploaded = await api<{ assets: unknown[] }>(
    token,
    'POST',
    `/api/projects/${project.id}/assets`,
    form,
  )
  console.info(`[2/6] 已上传 ${uploaded.assets.length} 份素材`)

  const { factSheet } = await api<{ factSheet: FactSheetView }>(
    token,
    'POST',
    `/api/projects/${project.id}/extract`,
  )
  const items = factSheet.items
    .map((i) => `${i.name}${i.price ? ` ${i.price.amount} 元/${i.price.unit}` : ''}`)
    .join('、')
  console.info(`[3/6] 抽取完成（第 ${factSheet.revision} 版）：${factSheet.shop.name}｜${items}`)

  await api(token, 'POST', `/api/projects/${project.id}/facts/confirm`, {
    revision: factSheet.revision,
  })
  console.info('[4/6] 已确认事实表')

  const { jobId } = await api<{ jobId: string }>(token, 'POST', `/api/projects/${project.id}/jobs`)
  const deadline = Date.now() + JOB_DEADLINE_MS
  let last = ''
  let job: JobView
  for (;;) {
    job = await api<JobView>(token, 'GET', `/api/jobs/${jobId}`)
    const label = job.stageLabel ?? job.status
    if (label !== last) console.info(`[5/6] 生成中：${label}`)
    last = label
    if (TERMINAL.has(job.status)) break
    if (Date.now() > deadline) throw new DemoError('生成超过 5 分钟仍未完成')
    await new Promise((r) => setTimeout(r, 1000))
  }
  if (job.status !== 'succeeded')
    throw new DemoError(`生成未成功：${job.status}${job.error ? `（${job.error}）` : ''}`)

  const { versions } = await api<{ versions: Array<{ id: string }> }>(
    token,
    'GET',
    `/api/projects/${project.id}/versions`,
  )
  const version = versions[0]
  if (!version) throw new DemoError('生成成功但没有找到版本')
  const links = await api<{ url: string }>(token, 'POST', `/api/projects/${project.id}/publish`, {
    versionId: version.id,
    factsConfirmed: true,
  })
  console.info('[6/6] 已发布\n')

  const local = path.join(
    process.env.DATA_DIR ?? 'data',
    'pages',
    project.id,
    version.id,
    'index.html',
  )
  console.info(`公开页面：${links.url}`)
  const status = await publicStatus(links.url)
  if (status !== 200)
    console.info(`          （当前返回 HTTP ${status}，可先用下面的管理预览或本地文件查看）`)
  console.info(`管理预览：${apiBase}/api/versions/${version.id}/preview （需要管理口令）`)
  if (fs.existsSync(local)) console.info(`本地文件：${path.resolve(local)}`)
  console.info(`管理口令：${token}\n`)
  console.info(await QRCode.toString(links.url, { type: 'terminal', small: true }))
  if (/\/\/(localhost|127\.)/.test(links.url))
    console.info(
      '提示：二维码指向 localhost，只能在本机打开。手机扫码请把 PUBLIC_BASE_URL 改成本机局域网地址（例如 http://192.168.1.10:6688）后重启服务。',
    )
}

async function main(): Promise<void> {
  let server: ChildProcess | null = null
  try {
    const token = adminToken()
    server = await ensureServer()
    await run(token)
  } catch (err) {
    console.error(`\n[实招] 演示失败：${err instanceof DemoError ? err.message : String(err)}`)
    server?.kill()
    process.exit(1)
  }
  if (server) {
    const child = server
    console.info('\n服务保持运行中，按 Ctrl+C 停止。')
    process.on('SIGINT', () => child.kill('SIGINT'))
    process.on('SIGTERM', () => child.kill('SIGTERM'))
    child.on('exit', (code) => process.exit(code ?? 0))
  }
}

void main()
