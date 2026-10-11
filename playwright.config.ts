import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PORT ?? 6688)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'pnpm dev',
    port,
    reuseExistingServer: true,
  },
})
