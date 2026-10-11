import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    // Each file gets its own DATA_DIR via tests/setup.ts; sqlite files must not be shared.
    pool: 'forks',
    setupFiles: ['tests/setup.ts'],
  },
})
