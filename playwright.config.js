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
// Single source of truth for the target origin — cast.js also derives the
// port from VITE_DEV_PORT in .env.local when E2E_BASE_URL isn't set.
import { BASE_URL } from './e2e/fixtures/cast.js'

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
      // The journeys themselves — direct children of e2e/documents only, so the
      // screenshot suite below doesn't inflate this project's runtime.
      name: 'documents',
      testMatch: /documents\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Screenshot coverage for every module (e2e/<module>/screens/*.spec.js).
      // Drives the same fixtures, personas and selectors as the journeys; its
      // product is tests/screenshots/<module>/*.png rather than assertions —
      // see e2e/fixtures/screenshots.js, which owns the deliberate 3s pause
      // before every capture.
      //
      // Deliberately its own project (and why every module project above is
      // narrowed to `[^/]+\.spec\.js$`): a module's own --project stays the
      // journey suite and its runtime, unaffected by ~40 captures × 3s.
      // Run one module with a path filter: `--project=screens capas/screens`.
      name: 'screens',
      testMatch: /\/screens\/.*\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Cross-module record links (Related records) — spans NC, module
      // records and the generic picker, so it belongs to no single module.
      name: 'recordLinks',
      testMatch: /recordLinks\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'nonconformances',
      testMatch: /nonconformances\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'capas',
      testMatch: /capas\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'changeRequests',
      testMatch: /changeRequests\/[^/]+\.spec\.js$/,
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
      testMatch: /workflow\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'audits',
      testMatch: /audits\/[^/]+\.spec\.js$/,
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
      testMatch: /qualityEvents\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Analytics / QMS Intelligence. Two things make this project unlike the
      // others.
      //
      // First, it needs a WORKER ROUND-TRIP before it can assert anything:
      // `metric_catalog()` only returns metrics that already have rollup rows the
      // reader may see, so `fixtures/analytics.js` enqueues
      // `refresh_analytics_rollup` and waits. A hand-written rollup row would let
      // every downstream assertion pass while the refresh path was broken.
      //
      // Second, roughly half of it is deliberately NOT UI steps. The module's
      // central claim is that one stored question yields a different correct
      // answer per reader, and a screen can only ever show one reader's answer at
      // a time — so the comparison happens under `app_user` via metric_value()
      // while the UI tests assert that a tile renders the figure it was handed.
      //
      // ANL-A1/A2/A3 are regression tests for a defect class nothing else in the
      // toolchain can see: children handed to a Vue slot that does not exist are
      // discarded silently, which shipped a dead Save button and five invisible
      // empty-state actions past eslint, the build and the layout guard.
      name: 'analytics',
      testMatch: /analytics\/[^/]+\.spec\.js$/,
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
      testMatch: /authentication\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'training',
      testMatch: /training\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'sites',
      testMatch: /sites\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'departments',
      testMatch: /departments\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'users',
      testMatch: /users\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Roles — the module that decides what everybody else may do. It had no
      // E2E surface at all until 2026-08-08, and the reason was a fixture gap
      // rather than a design one: the tenant seeded eleven roles and not one of
      // them held a `role_permission_management` grant, so nothing in the module
      // could be written from a browser. e2e-seed.sql §30 is that fixture.
      //
      // ROLE-J1 is the reason this project is worth more than its test count.
      // Cycle 1's two CRITICAL escalations were not a missing check — every
      // layer had one. Five surfaces answered "may you grant a role" and gave
      // four different answers, and the weakest sat on the only path the SPA
      // actually uses. J1 pins the agreement itself, which no other project in
      // this repo does for any module.
      name: 'roles',
      testMatch: /roles\/[^/]+\.spec\.js$/,
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
      testMatch: /multiSite\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Supplier portal — the surface an external party reaches. Most
      // assertions are RLS verdicts (asAppUser) rather than UI steps: what is
      // under test is who can read what, and the portal SPA is only one of the
      // clients that question has to hold for.
      name: 'suppliers',
      testMatch: /suppliers\/[^/]+\.spec\.js$/,
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
      testMatch: /qcInspection\/[^/]+\.spec\.js$/,
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
      // Purges the log entries previous Inspections & Logs runs left behind.
      // Same reason as qcSetup: FieldRecord/FieldRecordRevision/FieldRecordFlag/
      // AssignmentInstance are all synced models, so accumulated rows slow every
      // fresh browser context's syncEngine bootstrap until UI steps time out.
      // See e2e/fixtures/inspectionsLogs.setup.js.
      name: 'inspectionsLogsSetup',
      testMatch: /fixtures\/inspectionsLogs\.setup\.js/,
      dependencies: ['setup'],
    },
    {
      // Inspections & Log Books — field records, log books, form assignments.
      // The module had zero E2E coverage until 2026-08-31 and is the one place
      // in the product where an immutable, e-signed record is created by a
      // floor user rather than an author: submit, the edit window closing,
      // supervisor review, amendment and void.
      //
      // IL-J8 is the reason this project is worth more than its test count. It
      // pins the module's three top security-review findings (#1 a revision's
      // Part-11 signature could be repointed, #2 a submitter could self-approve,
      // #3 an assignee could self-complete a scheduled occurrence) — all three
      // closed at the database on 2026-08-31, and each probed from BOTH sides so
      // a policy that quietly stopped matching anything cannot read as a pass.
      name: 'inspectionsLogs',
      testMatch: /inspectionsLogs\/[^/]+\.spec\.js$/,
      dependencies: ['inspectionsLogsSetup'],
      // Above the 120s default. Nothing in this module is readable until the
      // syncEngine has bootstrapped LogBook / FieldRecord / FormAssignment into
      // a context's IndexedDB — ~17s idle, considerably more while trace and
      // video are recording — and a journey that needs a second persona pays it
      // again. `createPersonaPool` keeps that to one bootstrap per persona per
      // file; the headroom covers the first one.
      timeout: 180_000,
      // The fill page and the detail overlay both read the log book and the
      // record out of IndexedDB after a REST write, so their readiness depends
      // on a sync broadcast landing. One Playwright-level retry covers the
      // residual lag without masking a real failure (a genuine break fails both
      // attempts).
      retries: 1,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Tasks — the unified work inbox. Every journey has to MINT its task
      // first: a task is not a page (taskRoute.js deep-links to the host
      // entity) and the inbox is hard-scoped to `assignedTo`, so there is no
      // fixture shortcut — the specs drive a real CAPA or document workflow to
      // the point where a task exists, then log in as the assignee. That cost
      // is why `e2e/fixtures/tasks.js` carries mintCapaTask / mintCollaboratorTask.
      //
      // The load-bearing probe is the read leak (HIGH-3): `task_instance_select_rls`
      // released every task in the tenant to any holder of `document_control:read`
      // — measured, the E2E Doc Controller persona saw 3,672 of 3,672. Both sides
      // are asserted, because a policy that quietly stopped matching anything
      // would otherwise read as a perfect guard.
      name: 'tasks',
      testMatch: /tasks\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      // Same reason as inspectionsLogs: nothing is readable until the syncEngine
      // has bootstrapped TaskInstance into a context's IndexedDB, and a journey
      // that needs a second persona pays that again.
      timeout: 180_000,
      // Every file here pays for its fixtures in a `beforeAll` that drives the
      // CAPA create wizard and/or the document rail — two to three full UI mints
      // before a single assertion runs. Those forms read their pickers out of
      // IndexedDB, so a context whose bootstrap has not landed opens a select
      // with no options and BaseSelect renders its empty state instead of a
      // listbox; observed twice on 2026-09-01, both times in the mint, never in
      // an assertion. One retry covers that without masking a real failure —
      // a genuine break fails both attempts, and the probes themselves are
      // deterministic SQL. Same posture and same reason as inspectionsLogs.
      retries: 1,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Audit Logs — a read surface, so the journeys are cheap, and the module's
      // only CRITICAL is exactly the kind E2E proves well: `audit_log_select_rls`
      // gated on `document_control:read` (49 of 75 roles, incl. baseline
      // Employee) instead of `audit_trail:read` (10). The e2e seed grants the
      // trail to E2E Auditor and E2E Role Admin and DENIES it to E2E Doc
      // Controller — those denials are regression probes placed on purpose, so
      // every one is paired with a granted persona reading the same rows.
      name: 'auditLogs',
      testMatch: /auditLogs\/[^/]+\.spec\.js$/,
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
