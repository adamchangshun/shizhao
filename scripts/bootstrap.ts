// pnpm bootstrap
// 1. Copies .env.example to .env (skipped when .env exists).
// 2. Fills an empty ADMIN_TOKEN in .env with a random one and prints the effective token.
// 3. Runs the database migrations.
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { loadEnvFiles, readEnvValue } from './env-files'

const ENV = '.env'
const LOCAL = '.env.local'

function main(): void {
  if (fs.existsSync(ENV)) {
    console.info(`[实招] ${ENV} 已存在，跳过复制`)
  } else {
    fs.copyFileSync('.env.example', ENV, fs.constants.COPYFILE_EXCL)
    fs.chmodSync(ENV, 0o600)
    console.info(`[实招] 已从 .env.example 生成 ${ENV}`)
  }

  const content = fs.readFileSync(ENV, 'utf8')
  if (!readEnvValue(content, 'ADMIN_TOKEN')) {
    const token = randomBytes(24).toString('base64url')
    const next = /^ADMIN_TOKEN=.*$/m.test(content)
      ? content.replace(/^ADMIN_TOKEN=.*$/m, `ADMIN_TOKEN=${token}`)
      : `${content.trimEnd()}\nADMIN_TOKEN=${token}\n`
    fs.writeFileSync(ENV, next)
    console.info(`[实招] 已随机生成管理口令并写入 ${ENV}`)
  }

  // Same precedence as Next.js: .env.local overrides .env.
  const localToken = fs.existsSync(LOCAL)
    ? readEnvValue(fs.readFileSync(LOCAL, 'utf8'), 'ADMIN_TOKEN')
    : undefined
  const token = localToken ?? readEnvValue(fs.readFileSync(ENV, 'utf8'), 'ADMIN_TOKEN')
  console.info(`[实招] 管理口令：${token}${localToken ? `（来自 ${LOCAL}）` : ''}`)
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
