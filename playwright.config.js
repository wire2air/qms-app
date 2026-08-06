import { defineConfig, devices } from '@playwright/test'
// Node-side `*.localhost` → 127.0.0.1 (browsers do this natively; Node fetch /
// APIRequestContext don't). Loaded here so every worker process gets it.
import './e2e/fixtures/localhostDns.js'

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
    // Safety nets: without these, navigation/action timeouts fall back to the
    // (large) test timeout, so a stalled goto or a locator that never resolves
    // silently consumes the whole budget instead of failing fast. Reload-tolerant
    // helpers pass their own longer timeouts where sync-back lag is expected.
    navigationTimeout: 30_000,
    actionTimeout: 25_000,
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
      name: 'nonconformances',
      testMatch: /nonconformances\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'capas',
      testMatch: /capas\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'changeRequests',
      testMatch: /changeRequests\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // The workflow ENGINE itself — the approval machinery Documents/CAPA/NCR/
      // CR/Audits/Training all instantiate. Until this project existed, workflow
      // behaviour was only ever exercised transitively through those six suites,
      // none of which asserts anything at the RLS layer — which is exactly where
      // the module's CRITICAL findings lived. See docs/modules/workflows/14.
      name: 'workflow',
      testMatch: /workflow\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'audits',
      testMatch: /audits\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Quality Events. The module had NO E2E surface at all until 2026-08-06 —
      // no project, no fixture, and zero rows in e2e-seed.sql, which is itself
      // part of why its two worst findings shipped. The DB-level fixes carry 39
      // integration/worker tests; what only this project can reach is the UI
      // control that F-02 was actually exploited through — a plain status
      // dropdown behind a 600 ms autosave. See docs/modules/quality-events/14.
      name: 'qualityEvents',
      testMatch: /qualityEvents\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Credential-layer journeys. Unlike every other project these mostly issue
      // raw pre-auth HTTP rather than driving the UI, and several deliberately
      // lock accounts — which is why they use throwaway personas (e2e-seed.sql
      // §27) and clear Redis lockout state in teardown. Never repoint them at a
      // shared persona.
      name: 'authentication',
      testMatch: /authentication\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'training',
      testMatch: /training\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'sites',
      testMatch: /sites\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'departments',
      testMatch: /departments\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'users',
      testMatch: /users\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Multi-site user assignment. Mostly RLS verdicts over raw GraphQL rather
      // than UI steps: what is under test is which records a `site`-scoped grant
      // reaches once a user holds several sites, and the UI is only one of the
      // clients that answer has to hold for. ms2 is the security half — it
      // proves a member cannot self-assign a site, which would widen their own
      // reach across the tenant.
      name: 'multiSite',
      testMatch: /multiSite\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Supplier portal — the surface an external party reaches. Most
      // assertions are RLS verdicts (asAppUser) rather than UI steps: what is
      // under test is who can read what, and the portal SPA is only one of the
      // clients that question has to hold for.
      name: 'suppliers',
      testMatch: /suppliers\/.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Purges the lots previous QC runs left behind. Without it the tenant
      // grows ~10 lots per run and syncEngine bootstrap slows until UI steps
      // time out — see e2e/fixtures/qc.setup.js.
      name: 'qcSetup',
      testMatch: /fixtures\/qc\.setup\.js/,
      dependencies: ['setup'],
    },
    {
      name: 'qcInspection',
      testMatch: /qcInspection\/.*\.spec\.js/,
      dependencies: ['qcSetup'],
      // The in-process journeys drive the progressive sample-collection grid,
      // whose readiness depends on a REST write reaching IndexedDB via the sync
      // service. The helpers already reload-and-retry; one Playwright-level
      // retry covers the residual lag without masking a real failure (a genuine
      // break fails both attempts).
      retries: 1,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
