import { defineConfig, devices } from '@playwright/test'

// Two suites:
//  - smoke: public-route rendering against any served build (backend mocked in-spec).
//  - documents: real end-to-end journeys against the live dev stack
//    (postgres/redis/minio + api :4000, worker :4002, sync :4003, vite :5173,
//    tenant pharma.localhost — see e2e/README.md). Auth state is prepared once
//    by the `setup` project (e2e/fixtures/auth.setup.js).
//
// Execution is fully observable: HTML report + video + trace on every
// documents run (`npx playwright show-report` / `--ui` / `--headed`).
const BASE_URL = process.env.E2E_BASE_URL || 'http://e2elab.localhost:5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // documents journeys share seeded fixtures; keep ordered per file
  workers: 1,
  timeout: 120_000, // journeys drive multi-step UI + wait on worker jobs
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    headless: !process.env.E2E_HEADED,
    trace: 'on',
    video: 'on',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /fixtures\/auth\.setup\.js/,
    },
    {
      name: 'documents',
      testMatch: /documents\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
