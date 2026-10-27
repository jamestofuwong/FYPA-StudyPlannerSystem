import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.STUDENT_E2E_PORT ?? 3100)
const baseURL = process.env.STUDENT_E2E_BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.STUDENT_E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --webpack --hostname 127.0.0.1 --port ${port}`,
        env: { ...process.env, STUDENT_E2E: '1' },
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
