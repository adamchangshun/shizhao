import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll } from 'vitest'
import { closeDb } from '@/lib/db/client'
import { resetEnvCache } from '@/lib/env'

// Each test file runs in its own process with a throwaway DATA_DIR.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shizhao-test-'))
process.env.DATA_DIR = dataDir
process.env.ADMIN_TOKEN = 'test-admin-token-0123'
process.env.PUBLIC_BASE_URL = 'http://localhost:6688'
process.env.PROVIDER = 'mock'
resetEnvCache()

afterAll(() => {
  closeDb()
  fs.rmSync(dataDir, { recursive: true, force: true })
})
