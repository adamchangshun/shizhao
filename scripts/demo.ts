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
// Upload and extraction with a real model can take a while; nothing legitimate takes longer.
const REQUEST_TIMEOUT_MS = 120_000
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

loadEnvFiles()
const apiBase = (process.env.DEMO_API_BASE ?? 'http://127.0.0.1:6688').replace(/\/+$/, '')
let server: ChildProcess | null = null

class DemoError extends Error {}

/** The admin token travels in a header: only to this machine, or over https. */
function checkApiBase(): void {
  let url: URL
  try {
    url = new URL(apiBase)
  } catch {
    throw new DemoError(`DEMO_API_BASE 不是有效网址：${apiBase}`)
  }
  if (url.username || url.password) throw new DemoError('DEMO_API_BASE 不能包含用户名或密码')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname)))
    throw new DemoError('DEMO_API_BASE 只能是本机 http 地址或 https 地址，以免口令明文外传')
}

function adminToken(): string {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN
  // Docker image without ADMIN_TOKEN: the entrypoint keeps a generated one here.
  const file = path.join(process.env.DATA_DIR ?? 'data', 'admin-token')
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim()
  throw new DemoError('没有找到管理口令：请先运行 pnpm bootstrap，或设置 ADMIN_TOKEN')
}

async function api<T>(token: string, method: string, route: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { ...init.headers, 'content-type': 'application/json' }
  }
  let res: Response
  try {
    res = await fetch(`${apiBase}${route}`, init)
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? '请求超时' : '无法连接服务'
    throw new DemoError(`${method} ${route} 失败：${reason}`)
  }
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

/** Stops the `next dev` we started — its whole process group, workers included — and waits. */
async function stopServer(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  const child = server
  server = null
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  try {
    process.kill(-child.pid, signal)
  } catch {
    child.kill(signal)
  }
  const forced = setTimeout(() => {
    try {
      process.kill(-child.pid!, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }, 10_000)
  await exited
  clearTimeout(forced)
}

async function ensureServer(): Promise<boolean> {
  if (await healthy()) {
    console.info(`[实招] 使用已在运行的服务：${apiBase}`)
    return false
  }
  const url = new URL(apiBase)
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname))
    throw new DemoError(`${apiBase} 无法访问，请先启动服务`)
  const port = url.port || '80'
  console.info(`[实招] ${apiBase} 没有运行中的服务，正在启动 next dev（端口 ${port}）…`)
  // Own process group, so stopServer() also reaches the workers next dev forks.
  server = spawn(
    process.execPath,
    [path.resolve('node_modules/next/dist/bin/next'), 'dev', '--port', port],
    { stdio: ['ignore', 'ignore', 'inherit'], env: process.env, detached: true },
  )
  const child = server
  const started = Date.now()
  while (Date.now() - started < 120_000) {
    if (child.exitCode !== null)
      throw new DemoError(`next dev 启动失败（退出码 ${child.exitCode}）`)
    if (await healthy()) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
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
  // Relative to the repo root, so the same path works on the host and in the container.
  if (fs.existsSync(local))
    console.info(`本地文件：${path.relative(process.cwd(), path.resolve(local))}`)
  console.info(`管理口令：${token}\n`)
  console.info(await QRCode.toString(links.url, { type: 'terminal', small: true }))
  if (/\/\/(localhost|127\.)/.test(links.url))
    console.info(
      '提示：二维码指向 localhost，只能在本机打开。手机扫码请把 PUBLIC_BASE_URL 改成本机局域网地址（例如 http://192.168.1.10:6688）后重启服务。',
    )
}

async function main(): Promise<void> {
  // Installed before any child exists, so Ctrl+C at any point also stops a started next dev.
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => void stopServer(signal).then(() => process.exit(130)))
  let started = false
  try {
    checkApiBase()
    const token = adminToken()
    started = await ensureServer()
    await run(token)
  } catch (err) {
    console.error(`\n[实招] 演示失败：${err instanceof DemoError ? err.message : String(err)}`)
    await stopServer()
    process.exit(1)
  }
  if (started && server) {
    console.info('\n服务保持运行中，按 Ctrl+C 停止。')
    server.once('exit', (code) => process.exit(code ?? 0))
  }
}

void main()
