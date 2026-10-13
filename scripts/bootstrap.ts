// pnpm bootstrap
// 1. Copies .env.example to .env (skipped when .env exists).
// 2. Fills an empty ADMIN_TOKEN in .env with a random one and prints the effective token.
// 3. Runs the database migrations.
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { hasEnvKey, loadEnvFiles, readEnvValue } from './env-files'

const ENV = '.env'
const LOCAL = '.env.local'

function main(): void {
  if (fs.existsSync(ENV) && fs.lstatSync(ENV).isSymbolicLink()) {
    console.error(`[实招] ${ENV} 是符号链接，为避免改写其他文件已停止；请换成普通文件后重试`)
    process.exit(1)
  }
  if (fs.existsSync(ENV)) {
    console.info(`[实招] ${ENV} 已存在，跳过复制`)
  } else {
    fs.copyFileSync('.env.example', ENV, fs.constants.COPYFILE_EXCL)
    console.info(`[实招] 已从 .env.example 生成 ${ENV}`)
  }
  // .env holds the admin token (and possibly model keys): owner-only, also when it pre-existed.
  fs.chmodSync(ENV, 0o600)

  const content = fs.readFileSync(ENV, 'utf8')
  if (!readEnvValue(content, 'ADMIN_TOKEN')) {
    const token = randomBytes(24).toString('base64url')
    const next = /^ADMIN_TOKEN=.*$/m.test(content)
      ? content.replace(/^ADMIN_TOKEN=.*$/m, `ADMIN_TOKEN=${token}`)
      : `${content.trimEnd()}\nADMIN_TOKEN=${token}\n`
    fs.writeFileSync(ENV, next, { mode: 0o600 })
    console.info(`[实招] 已随机生成管理口令并写入 ${ENV}`)
  }

  // Same precedence as Next.js: shell environment, then .env.local, then .env. An empty
  // ADMIN_TOKEN= in .env.local still wins over .env, so it has to be reported, not papered over.
  const local = fs.existsSync(LOCAL) ? fs.readFileSync(LOCAL, 'utf8') : ''
  const [token, source] = process.env.ADMIN_TOKEN
    ? [process.env.ADMIN_TOKEN, '环境变量 ADMIN_TOKEN']
    : hasEnvKey(local, 'ADMIN_TOKEN')
      ? [readEnvValue(local, 'ADMIN_TOKEN'), LOCAL]
      : [readEnvValue(fs.readFileSync(ENV, 'utf8'), 'ADMIN_TOKEN'), ENV]
  if (!token) {
    console.error(`[实招] ${source} 中的 ADMIN_TOKEN 为空，会覆盖 ${ENV}；请删除该行或填入口令`)
    process.exit(1)
  }
  console.info(`[实招] 管理口令：${token}（来自 ${source}）`)
  if (source !== ENV)
    console.info(`[实招] 注意：docker compose 只读取 ${ENV}，容器会使用 ${ENV} 中的口令`)
}

async function migrate(): Promise<void> {
  loadEnvFiles()
  // Imported after the env files are loaded: getEnv() caches process.env on first use.
  const { EnvError, getEnv } = await import('../lib/env')
  const { closeDb, runMigrations } = await import('../lib/db/client')
  try {
    const env = getEnv()
    runMigrations()
    closeDb()
    console.info(`[实招] 数据库迁移完成：${env.DATA_DIR}/db.sqlite`)
  } catch (err) {
    console.error(err instanceof EnvError ? `[实招] ${err.message}` : '[实招] 数据库迁移失败', err)
    process.exit(1)
  }
}

main()
void migrate().then(() => console.info('[实招] 准备完成。下一步：pnpm demo'))
