import { defineConfig, devices } from '@playwright/test'
import { E2E_ADMIN_TOKEN, E2E_FAIL_MARKER } from './e2e/merchant-env'

// A dedicated server for end-to-end runs: mock provider, its own data directory and admin token,
// and the test-only failure hook used by the merchant UI spec.
const port = Number(process.env.PORT ?? 6699)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  // The dev server compiles each route on first visit.
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testIgnore: /(merchant|corrections)\.spec\.ts$/,
    },
    {
      name: 'merchant-mobile',
      testMatch: /merchant\.spec\.ts$/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 375, height: 812 },
      },
    },
    {
      // The narrowest phone the console must support (spec: 360px wide).
      name: 'merchant-360',
      testMatch: /merchant\.spec\.ts$/,
      grep: /corrected price/,
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } },
    },
    {
      name: 'corrections-mobile',
      testMatch: /corrections\.spec\.ts$/,
      use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } },
    },
    {
      name: 'merchant-desktop',
      testMatch: /merchant\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `pnpm db:migrate && pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    port,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PROVIDER: 'mock',
      ADMIN_TOKEN: E2E_ADMIN_TOKEN,
      PUBLIC_BASE_URL: `http://localhost:${port}`,
      DATA_DIR: './data/e2e',
      MOCK_FAIL_ONCE_MARKER: E2E_FAIL_MARKER,
    },
  },
})
