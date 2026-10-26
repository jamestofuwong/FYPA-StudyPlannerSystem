import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT || '3100';
const STUDENT_PORT = process.env.E2E_STUDENT_PORT || '3101';

// End-to-end tests drive the real advisor UI in a browser against a real (embedded) PostgreSQL with the production seed data.
// The Electron shell and the Ollama / portal integrations are not started: they need the packaged app and a university login.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,                                   // one shared database
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // the advisor (desktop) UI
    { name: 'chromium', testIgnore: '**/student/**', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // the student web app, from a production build
    { name: 'student', testDir: './e2e/student', use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${STUDENT_PORT}`, viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: 'node e2e/start-server.js',
      url: `http://127.0.0.1:${PORT}/api/ping`,
      timeout: 240_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'node e2e/student/start-student-server.js',
      url: `http://127.0.0.1:${STUDENT_PORT}/help`,
      timeout: 420_000,        // seed, production build, start
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
