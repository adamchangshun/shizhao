// Fail fast on bad configuration, make sure DATA_DIR exists, then start the upload sweeper.
import { startUploadSweeper } from './lib/assets/sweep'
import { ensureDataDirs } from './lib/db/client'
import { EnvError, getEnv } from './lib/env'

try {
  getEnv()
} catch (err) {
  if (err instanceof EnvError) {
    console.error(`\n[实招] ${err.message}\n`)
    process.exit(1)
  }
  throw err
}
ensureDataDirs()
startUploadSweeper()
