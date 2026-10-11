import { EnvError, getEnv } from '../env'
import { closeDb, runMigrations } from './client'

try {
  const env = getEnv()
  runMigrations()
  closeDb()
  console.info(`[实招] 数据库迁移完成：${env.DATA_DIR}/db.sqlite`)
} catch (err) {
  if (err instanceof EnvError) {
    console.error(`[实招] ${err.message}`)
  } else {
    console.error('[实招] 数据库迁移失败', err)
  }
  process.exit(1)
}
