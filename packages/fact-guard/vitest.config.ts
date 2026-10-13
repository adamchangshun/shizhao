import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Package tests need neither the application's aliases nor SQLite/environment setup.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
})
