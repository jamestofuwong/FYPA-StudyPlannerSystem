import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

const production = process.env.STUDENT_E2E_PHASE === 'production'
export default defineConfig({
  ...base,
  testDir: './tests/e2e',
  webServer: undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  outputDir: `../test-results/student-full/${production ? 'production' : 'development'}`,
  reporter: [['list'], ['json', { outputFile: `../test-results/student-full/${production ? 'production' : 'development'}/results.json` }]],
  use: { ...base.use, baseURL: process.env.STUDENT_E2E_BASE_URL, trace: 'retain-on-failure', actionTimeout: 15_000, navigationTimeout: 45_000 },
  projects: production
    ? [{ name: 'production-chromium', testMatch: '**/security.production.spec.ts', use: { ...devices['Desktop Chrome'] } }]
    : [
        { name: 'chromium', testIgnore: '**/*.production.spec.ts', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile-chromium', testMatch: '**/public-extra.spec.ts', grep: /@mobile/, use: { ...devices['Pixel 5'] } },
      ],
})
