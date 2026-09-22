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
      // Purges the documents previous runs left behind. Same reason as qcSetup
      // and inspectionsLogsSetup: Document/DocumentVersion/DocumentSection are
      // synced models, so accumulated rows slow every fresh browser context's
      // syncEngine bootstrap until UI steps time out. Measured 2026-09-08 at 894
      // documents in the tenant — 890 of them leftovers — with three successive
      // no-code-change runs degrading 17 → 10 → 9 passing.
      // See e2e/fixtures/documents.setup.js.
      name: 'documentsSetup',
      testMatch: /fixtures\/documents\.setup\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // The journeys themselves — direct children of e2e/documents only, so the
      // screenshot suite below doesn't inflate this project's runtime.
      name: 'documents',
      testMatch: /documents\/[^/]+\.spec\.js$/,
      dependencies: ['documentsSetup'],
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
      // Complaints — TWO separate authz modules sharing one project. `complaints`
      // (internal Quality Complaints, table `complaints`) has real own/site/
      // tenant RLS scope tiers; `complaint_management` (Customer Complaints /
      // support, table `customer_complaints`) has only tenant + assigned-to.
      // The module had zero E2E coverage before this — no project, no seed
      // section (e2e-seed.sql §45) — and the route naming is a trap worth
      // knowing before touching this suite: `/complaints` (QaComplaintsIndex)
      // is a QA lens over the INTERNAL `complaints` table despite a stale
      // in-code comment claiming it shares `customer_complaints`; the separate
      // `/customer-complaints` route is the actual support surface. J3 pins
      // that the two never cross.
      name: 'complaints',
      testMatch: /complaints\/[^/]+\.spec\.js$/,
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
      // Auditee — certification audits where the COMPANY is the one being
      // audited (/auditee). Same table as `audits`, different surface, and it
      // had no project and no seeded EXTERNAL row until e2e-seed.sql §40, so no
      // test could have reached it. The access half matters as much as the
      // journeys: /auditee carries NO permission gate for internal users by
      // design (RLS admits invited participants through team membership), so
      // the specs pin who sees what from both sides.
      name: 'auditee',
      testMatch: /auditee\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      // Same posture as qcInspection / inspectionsLogs / equipment: every
      // detail page reads its record out of IndexedDB after a REST write, so
      // readiness depends on a sync broadcast landing. One retry absorbs that
      // lag; a genuine break fails both attempts, and the DB assertions are
      // deterministic SQL.
      retries: 1,
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
      name: 'groups',
      testMatch: /groups\/[^/]+\.spec\.js$/,
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
      // Settings & Profile — company settings cards, lookups, organization
      // security and the self-service /profile page. Its personas (seed §41)
      // are logged in on demand by e2e/fixtures/settings.js, not by `setup`,
      // so the project adds nothing to the shared login budget. The company
      // cards save over GraphQL (company.save() → updateCompany → RLS), not the
      // REST route the module pack documents — see the fixture's header.
      name: 'settings',
      testMatch: /\/settings\/[^/]+\.spec\.js$/,
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
      // Service accounts — the machine identities that own API keys, and the
      // surface that REPLACED personal API keys (deleted 2026-09-09, because
      // routes/apiKeys.js carried no enforcePermission of any kind: the
      // permission was checked in the sidebar and nowhere else).
      //
      // Two halves, both in e2e/serviceAccounts/ and each with its own helper
      // module: `api-*.spec.js` exercises the CREDENTIAL (issue a key, use it
      // against the REST surface, revoke it), `ui-*.spec.js` the admin screen.
      // They share a tenant and no fixtures — the seed deliberately does NOT
      // clean service accounts up, because it runs at the start of every
      // invocation and a shared DELETE would let one suite wipe another's
      // fixtures mid-test, so each spec names its accounts with its own prefix
      // and purges only that.
      name: 'serviceAccounts',
      testMatch: /serviceAccounts\/[^/]+\.spec\.js$/,
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
      // Asset Request — supplier-portal-adjacent: no page of its own, just the
      // REST surface plus the SuppliersAssetRequestsTab (internal) /
      // SupplierAssetRequestsList (portal) UI. e2e/suppliers/j12 and j13
      // already lock F-01 (read exposure) and F-03/F-08 (accept + lifecycle)
      // at the raw HTTP/SQL layer; this project adds the UI-driven journeys
      // neither of those exercises (create dialog, review dialog, the portal
      // upload button) plus tenant isolation and an internal permission
      // denial. No dedicated setup project — the fixture is one stable row
      // (e2e-seed.sql §43) reset in each spec's own beforeAll/afterAll rather
      // than an accumulating one like qcSetup/documentsSetup.
      name: 'assetRequest',
      testMatch: /assetRequest\/[^/]+\.spec\.js$/,
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
      // Permissions & Authorization — the cross-cutting module that decides,
      // for every other module, who may do what. It had no project here at all
      // until 2026-09-17, which its own production-readiness doc named as one
      // of the two hard zeros holding the module's score down: the decision
      // engine has 151 integration tests and the enforcement WIRING had none.
      //
      // Most cases here probe the POLICY layer directly through `sqlAsAppUser`
      // rather than driving a browser, and that is deliberate rather than a
      // shortcut. A permission denial in this product is usually a zero-row
      // SELECT or a trigger refusal, neither of which the DOM can distinguish
      // from an empty table; and the defects these journeys pin (F-27's
      // unreachable delete policies, the dormant workflow verbs) live
      // specifically on the GraphQL/SQL path that a UI test never takes. The
      // journeys that ARE about the UI agreeing with the transport drive the
      // browser and the database in the same test.
      //
      // No `dependencies: ['setup']` on the SQL-layer files would be wrong even
      // though they never open a page: they read personas and grants the e2e
      // seed creates, and `setup` is what applies it.
      name: 'permissions',
      testMatch: /permissions\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // App Builder — Forms. The headline here is the public fill surface: an
      // unauthenticated read that used to serve any ACTIVE template in any
      // tenant to anyone holding the row's UUID, now a server-minted revocable
      // share token. Journeys that exercise it must run WITHOUT storageState,
      // which is the point of the surface, so they set `storageState: undefined`
      // per-test rather than inheriting a logged-in context.
      name: 'forms',
      testMatch: /forms\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      timeout: 120_000,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // App Builder — Records (Submissions). Covers both shapes that share the
      // one physical table: plain form submissions and promoted module records.
      // e2e-seed.sql §35 seeds the module fixture these need — before it, the
      // E2E database could not represent a module record at all.
      name: 'records',
      testMatch: /records\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      timeout: 120_000,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Custom Fields / Option Sets. The RLS gate on entity_field_values is
      // per-HOST-record (an NC's custom fields are the NC's), so these journeys
      // are cross-module by nature and need personas with differing host grants.
      name: 'customFields',
      testMatch: /customFields\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      timeout: 120_000,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Equipment / calibration programme. The module had no E2E surface at all
      // until 2026-09-07 — no project, no fixture, and zero equipment rows in
      // e2e-seed.sql — and the absence was not neutral: with no persona holding
      // a `calibration_equipment` grant, every write control in the register was
      // hidden from every persona, so a browser could not have reached the
      // module's defect even if someone had looked.
      //
      // EQ-J3 is why this project is worth more than its test count. E1 was a
      // live REST privilege escalation: DELETE /v1/services/equipment/:id was
      // gated on `calibration_equipment:update` while the RLS DELETE policy, the
      // soft-delete guard trigger (migration 20260907150000) and the register's
      // own button all demanded `:delete`. REST connects as the superuser, where
      // the trigger self-skips by design ("the route has already checked"), so
      // the route WAS the check and it asked the wrong question. J3 probes all
      // three paths — the hidden button, the syncEngine's paranoid UPDATE, and
      // the REST route — from the persona that held update and not delete.
      //
      // EQ-J4 reaches across into QC on purpose: `requires_calibration` is not
      // bookkeeping, it is an enforced production control
      // (inspectionResultService.js refuses a measurement taken with a lapsed
      // instrument), and the frontend half of it is a banner with no `disabled`,
      // so only a server-side assertion says anything.
      name: 'equipment',
      testMatch: /equipment\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      // Above the 120s default for the same reason as inspectionsLogs: the
      // register renders out of IndexedDB, so nothing is readable until the
      // syncEngine has bootstrapped Equipment into a fresh context, and a
      // journey that needs a second persona pays that bootstrap again.
      timeout: 180_000,
      // The register is a live-query over IndexedDB fed by the sync socket, so
      // a row written over REST appears only once the broadcast lands. The
      // helpers already reload-and-retry; one Playwright-level retry covers the
      // residual lag without masking a real failure — the DB-level probes are
      // deterministic SQL and fail both attempts when something is genuinely
      // broken.
      retries: 1,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Products / Item Master. The module had no browser coverage of any kind
      // until 2026-09-08 — no project, no specs, and, more to the point, no
      // persona holding a `products:*` grant. That last absence is why nothing
      // could have been asserted even if specs had existed: /products is an
      // ADMIN-tier route (permissionGuard.js ADMIN_PERMISSIONS), so a tenant
      // with no products grant does not get an empty register, it gets bounced
      // to /no-access. e2e-seed.sql §37 is that fixture.
      //
      // PJ-J5 and PJ-J11 are why this project is worth more than its test
      // count. `products` has NO REST layer at all — no route gate in front, no
      // service layer behind — so RLS and four triggers are the only
      // enforcement the item master has, and until 2026-09-07/08 three of those
      // four did not exist: any `products:update` holder could tombstone the
      // entire register (P5), the weaker grant could undo a delete-holder's
      // decision (P7), and the module's one business rule — no retiring an item
      // while a live Specification points at it — lived in a Vue component in
      // front of a syncEngine mutation (P8). Every one of those is probed from
      // BOTH sides here, because a policy that quietly stopped matching
      // anything refuses everyone and reads as a perfect guard against the
      // denial half alone.
      name: 'products',
      testMatch: /products\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      // Above the 120s default, and above `equipment`/`inspectionsLogs`' 180s —
      // reasoned, not copied. The register is a live query over IndexedDB, so
      // nothing is readable until the syncEngine has bootstrapped Product into a
      // fresh context, and this module's journeys additionally need
      // ProductFamily, ProductType, ProductStatus, ItemCategory, Uom,
      // Specification, ProductSupplier and ProductOption (the picker's view) in
      // the same store before a dialog can render its pickers.
      //
      // What pushes it past 180s is the PERSONA COUNT. The access-tier and
      // quick-add files each drive four personas — admin, editor, reader,
      // owner — and every one is a separate browser context with its own empty
      // IndexedDB paying that bootstrap again. `createPersonaPool` keeps it to
      // one bootstrap per persona per file, but the first test in a file can
      // legitimately pay two of them. Measured: `openRegister`'s 60s + 45s
      // budget ran out once on a machine also running three other agents'
      // suites, so it now makes three attempts (60/45/45) and the project
      // budget has to cover that plus the assertions after it.
      timeout: 240_000,
      // A row written in SQL or over the lookup REST routes appears on the page
      // only once the sync broadcast lands. The helpers already reload-and-retry
      // (openRegister waits long and reloads once), and one Playwright-level
      // retry covers the residual lag without masking a real failure: the
      // DB-level probes are deterministic SQL and fail both attempts when
      // something is genuinely broken.
      retries: 1,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Record Sharing — external share links (/share/:token). The only surface
      // in the product an anonymous browser reads company records through, and
      // until 2026-09-14 nobody but its author had ever walked it: token → code
      // → projection → file → revoke. e2e-seed.sql §42 is its fixture.
      //
      // retries: 0 is deliberate, not an oversight. The code endpoints sit on
      // strictAuthLimiter (20 / 15 min / IP, shared with every suite's MFA and
      // reset flows); a full run spends seven, and a retry replays a serial
      // file's OTP calls from the start. A flake here should be read, not
      // re-rolled. See the budget note in e2e/fixtures/recordSharing.js.
      name: 'recordSharing',
      testMatch: /recordSharing\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      // NC and auditee pages read out of IndexedDB, so a cold context pays one
      // syncEngine bootstrap before the share card exists; several journeys open
      // two such contexts.
      timeout: 180_000,
      retries: 0,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Purges the CAPAs the rca / riskAssessment journeys leave behind. Both
      // modules are embedded widgets with no entity of their own, so every
      // journey mints a whole CAPA to carry the widget and nothing ever
      // removed them. Measured 2026-09-15: 540 CAPAs in E2ELAB, 434 of them
      // leftovers, plus 3,855 task_instances / 1,929 workflow_instances --
      // enough syncEngine bootstrap load that UI steps began timing out in
      // spots that move around the suite (RCA-J1 on 'Start CAPA' inside the
      // shared createCapa fixture; PW-J3's category create missing its poll,
      // while the identical sequence driven by hand worked every time).
      // Same reason as qcSetup / documentsSetup / inspectionsLogsSetup.
      // See e2e/fixtures/capas.setup.js.
      name: 'capasSetup',
      testMatch: /fixtures\/capas\.setup\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Risk Assessment. Had ZERO E2E coverage before this — no project, no
      // seed section (e2e-seed.sql §44 is new). The module is not a
      // standalone page a user navigates to: it's an admin CRUD surface
      // (/risk-assessment-templates) plus a form-builder widget
      // (RiskAssessmentField.vue, field type `riskAssessment`) embedded in a
      // CAPA/NCR/CR/Complaint workflow step, which derives a risk_assessments
      // row server-side the moment that step's task reaches APPROVED. The
      // journeys drive a dedicated CAPA workflow ("E2E Risk Assessment
      // Review") built for exactly this, so they never disturb the shared
      // "E2E CAPA Review & Approval" workflow every other CAPA suite depends
      // on having an empty step-1 form_schema.
      //
      // RA-J3 is why this project is worth more than its test count: it is
      // the regression guard for F-01 (docs/modules/risk-assessment/11 —
      // `risk_assessments_update_rls` checked only company_id, no permission
      // clause at all). CLOSED 2026-09-01 (migration 20260901180000) — this
      // suite re-verifies it live, probed from both sides the way the
      // module's own integration suite does (a zero-grant persona is
      // filtered by the SELECT policy first and would pass against the
      // defect too; the persona that matters holds capa:read and not
      // capa:update).
      name: 'riskAssessment',
      testMatch: /riskAssessment\/[^/]+\.spec\.js$/,
      dependencies: ['capasSetup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // RCA (Root Cause Analysis). Had ZERO E2E coverage before this — no
      // project, no seed section (e2e-seed.sql §46 is new) — on the module
      // docs/modules/rca/ scored the lowest production-readiness in the
      // program (29/100, 2026-08-31), headlined by root_causes_update_rls
      // carrying no permission clause at all (F-01). CLOSED on
      // harden/rca-risk-assessment-phase1 (22-hardening-pass-2026-09-01.md):
      // the policy now mirrors INSERT/DELETE's capa|ncr|change_control|
      // complaints:update four-way OR, and a BEFORE UPDATE trigger
      // (enforce_root_cause_immutable, ERRCODE QMSRC) refuses to change
      // anything but deleted_at even for a caller who holds that OR.
      //
      // The module's only SCREEN is /rca-templates (Templates CRUD + Categories
      // admin — root_cause_categories, gated by a single `manage` action
      // covering create/update/delete, the "no separate read action" shape
      // that recurs across this codebase). `root_causes` itself — the derived
      // table the widget's Finalize step writes on workflow-step approval —
      // has NO screen anywhere (F-08) and no existing workflow step in this
      // seed carries an `rca`-type form field, so its RLS/immutability
      // journeys probe the layer the fix actually lives at (`sqlAsAppUser`,
      // the same role PostGraphile runs every request as) rather than
      // reaching it through a newly-authored workflow.
      name: 'rca',
      testMatch: /rca\/[^/]+\.spec\.js$/,
      dependencies: ['capasSetup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Automation Rules. Had ZERO E2E coverage before this — no project, no
      // seed section (e2e-seed.sql §47 is new), and the module's own written
      // roadmap (docs/modules/automation-rules/14-playwright-journeys.md)
      // implemented none of its five planned journeys. This project covers
      // PW-J1 (CRUD + toggle + soft-delete on the standalone /automation-rules
      // page), PW-J3 (module-scoped authoring via the Form Template
      // Automation tab) and PW-J4 (the route's permission boundary — a
      // single-action native module, `manage` is the only grant). PW-J2
      // (event-fired notification, needs a worker round-trip) is left for a
      // later pass — see the roadmap doc.
      name: 'automationRules',
      testMatch: /automationRules\/[^/]+\.spec\.js$/,
      dependencies: ['setup'],
      // Same posture as auditee/qcInspection/inspectionsLogs/equipment, for a
      // DIFFERENT source of lag: whichever spec's createAutomationRule call
      // runs first against a freshly-started `api` process pays a one-time
      // PostGraphile plan-compile tax (confirmed via trace inspection — the
      // GraphQL mutation payload is correct, the request just never gets a
      // response inside a normal window); `fixtures/db.js`'s `docker exec`
      // calls have also been observed to ETIMEDOUT (15s) under load. One
      // retry absorbs both; a genuine break fails both attempts, and every DB
      // assertion here is deterministic SQL.
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
