// Fail fast on bad configuration, then make sure DATA_DIR exists.
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
