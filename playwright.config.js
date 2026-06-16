import { defineConfig, devices } from '@playwright/test'

// Route smoke tests — boot the production build and assert public routes render
// without uncaught errors. Authenticated routes need a test session/backend and
// are gated behind E2E_BASE_URL (see e2e/smoke.spec.js).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4173',
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Build + serve the prod bundle, unless an external base URL is provided.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
