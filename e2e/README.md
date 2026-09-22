# Documents E2E (Playwright)

End-to-end journeys for the Documents / Document Control module, driven against
the **real dev stack** (Postgres + Redis + MinIO + api/worker/sync + Vite), on a
dedicated, isolated test tenant. Every run produces a watchable HTML report with
video + trace for each test.

## Prerequisites (one time)

```bash
# From the repo root — starts docker infra + api/worker/sync + the Vite app.
./dev.sh
# In another shell: install the browser used by the tests.
cd qms-app && npx playwright install chromium
```

The tests reach the app at `http://e2elab.localhost:5173` (the dedicated test
tenant). `*.localhost` resolves to 127.0.0.1 automatically on macOS.

## What gets seeded

The Playwright `setup` project applies **[qms/database/e2e-seed.sql](../../qms/database/e2e-seed.sql)**
(idempotent) before any test, creating an isolated tenant separate from the demo
data:

- **Tenant** `E2ELAB` (`e2elab.localhost`) + a second tenant `E2EALT` for
  cross-tenant tests.
- **Users** (password `12345678`; signers' e-sign PIN `12345678`): owner, author,
  reviewer, approver, controller, auditor, own-scope author, no-access — each
  with role-scoped `document_control` / `document_templates` permissions.
- **Template** "E2E SOP Template" (PUBLISHED, prefix `ESOP`, training off).
- **Workflow** "E2E Document Approval": step 1 ACTION → Reviewer, step 2
  APPROVAL + e-signature → Approver.

Later sections of the seed extend the same tenant for the other suites:

- **NCR / CAPA** — extra permission grants on the existing roles, per-tenant
  lookups, two suppliers (one with a portal user), and the NCR + CAPA workflows.
- **Sites (§15)** — a second E2ELAB site (`Secondary Site`) and a department
  under it, three extra personas (`siteAdmin`, `siteReader`, `siteRoamer`), and
  a log book with a `sites_on_log_books` pivot row.
- **Departments (§16)** — `deptAdmin` (departments CRUD + `quality_events:create`)
  and `deptReader` (`departments:read` at DEPARTMENT scope), plus a supervisor on
  the Quality department so event routing has a working control path.
- **Audits (§23–26)** — audit grants on the existing roles (`author` = lead
  auditor with every audit permission; `reviewer`/`approver` = close-out and
  standard-approval step assignees; `auditor` = `audit_management:read` and
  nothing else, the persona PW-J9 needs), two workflows (`E2E Audit Close-Out`
  on module `AUDIT_INSTANCE`, `E2E Audit Standard Approval` on `AUDIT_STANDARD`),
  and the standard every audit journey runs against: **E2E Quality Standard**
  (`E2E-STD-9001`), v1.0 EFFECTIVE, one section header + two leaf clauses.

- **Inspections & Log Books (§34)** — three personas (`logOperator` =
  `field_records` create/read_own/edit_own_in_window and nothing else,
  `logSupervisor` = the two books' `supervisor_user_id` plus review/read_all,
  `logAdmin` = amend/void/assign/log-book authoring), a log book type, and the
  two ACTIVE books every journey files against: **E2E Operations Log**
  (`E2E-ILOP`, OPERATIONAL_LOG, TIME_WINDOW 120 min, no signature, no review) and
  **E2E Controlled Log** (`E2E-ILCR`, CONTROLLED_RECORD, e-signature at submit,
  review required, UNTIL_REVIEW), each with an active ad-hoc form assignment.
  Note §34's header: the …50/51/52 id slots belong to §30's roles-module cast, so
  this section owns …70/71/72 — reusing them does not fail, it silently hands the
  roles personas `field_records` verbs they are asserted not to have.
- **Asset Request (§43)** — no new personas (reuses `owner` for internal
  create/review/accept via the isOwner bypass, `noAccess` for the internal
  permission-denial probe, and the existing supplier-portal cast). One stable
  PENDING request + item against `SUPPLIER_IDS.withPortal` for the UI journeys
  to anchor on, plus a supplier + request in `E2EALT` — the module had no
  cross-tenant fixture at all before this. `e2e/suppliers/j12`/`j13` already
  lock the module's F-01 (read exposure — **fixed**, see
  `authorizeSupplierAssetRequestRead`) and F-03/F-08 findings at the raw
  HTTP/SQL layer; the `assetRequest` project adds the UI-driven journeys
  (create dialog, review dialog, the portal upload button) plus tenant
  isolation and the internal permission boundary.
- **Complaints (§45)** — the module had zero E2E coverage before this, and it
  is really TWO sibling modules sharing the section: `complaints` (internal
  Quality Complaints, table `complaints`) and `complaint_management` (Customer
  Complaints / support, table `customer_complaints`). Three new personas —
  `complaintOwner` (`complaints:create/read/update/close/delete` at TENANT
  scope), `complaintSiteUser` (`complaints:read/update` at SITE scope, Primary
  Site, and nothing else — the module's own/site/tenant tiers were fixed
  2026-08-11 and this is the persona that proves SITE is actually enforced),
  and `supportAgent` (`complaint_management:create/read/update` at TENANT
  scope, since that module has only tenant + assigned-to scope, no site
  tier). Fixtures: two internal complaints (Primary Site and Secondary Site,
  both owned by `complaintOwner`) for the scope-boundary journey, one internal
  complaint in `E2EALT` for tenant isolation, and one unassigned customer
  complaint for the support lifecycle journey. `noAccess` (already in the
  cast) is reused for the zero-grant denial probes. Route naming is a trap
  here: `/complaints` (`QaComplaintsIndex.vue`) is a QA lens over the
  INTERNAL `complaints` table despite a stale in-code comment claiming it
  shares `customer_complaints` — verified by reading the component, not the
  comment.
- **Risk Assessment (§44)** — zero E2E coverage before this: no project, no
  fixtures. The module has no standalone entity page (docs/modules/
  risk-assessment: "a capture mechanism with no consumption mechanism") — it's
  an admin CRUD surface at `/risk-assessment-templates` plus a form-builder
  widget (`riskAssessment` field type) embedded in a CAPA/NCR/CR/Complaint
  workflow step, which derives a `risk_assessments` row server-side the moment
  that step's task reaches APPROVED. No new personas: `reviewer` (`capa:update`)
  and `auditor` (`capa:read` only, no update) are already the exact admit/refuse
  pair the borrowed RLS permissions need, and `author` already gets
  `risk_assessment_templates:create/read/update/delete` for the template-CRUD
  journey. Fixtures: a dedicated CAPA workflow, **E2E Risk Assessment Review**
  (step 1 ACTION carries the `riskAssessment` field — deliberately NOT the
  shared "E2E CAPA Review & Approval" workflow, whose empty step-1 form_schema
  every other CAPA journey depends on), and a small deterministic 3×3 matrix
  template, **E2E Risk Matrix**. The `riskAssessment` project's J3 is a
  regression guard for F-01 (`risk_assessments_update_rls` had no permission
  clause at all — **fixed** 2026-09-01), re-verified live rather than assumed
  from the docs.
- **RCA / Root Cause Analysis (§46)** — zero E2E coverage before this: no
  project, no fixtures, no `rca` Playwright project. Per docs/modules/rca the
  module "has no page of its own for its actual content" — `/rca-templates`
  administers Templates (CRUD on `rca_templates`) and Categories (admin on
  `root_cause_categories`, gated by a SINGLE `manage` action covering
  create/update/delete — the "no separate read action" shape that recurs
  across this codebase) only. The actual analysis is the embedded widget
  (`rca` field type, `RcaField.vue`) inside a workflow step's task form,
  which derives a `root_causes` row server-side the moment that step's task
  reaches APPROVED — mirroring the `riskAssessment` sibling exactly (same
  derivation service, same reasoning). One new persona, `rcaAdmin`
  (`rca_templates:create/read/update/delete` + `root_cause_categories:manage`
  — nobody in the existing cast held either); every other journey reuses
  `owner`, `noAccess`, `author` (`ncr:*` at tenant scope) and `capaSiteEditor`
  unmodified. Fixtures: a dedicated CAPA workflow, **E2E RCA Review** (step 1
  ACTION carries the `rca` field — deliberately NOT the shared "E2E CAPA
  Review & Approval" workflow, for the same reason Risk Assessment built its
  own), a seeded template **E2E RCA Template** with all four method configs
  pre-populated, four `root_cause_categories` rows (mirrors the real
  bootstrap default's Fishbone 6Ms subset), a dedicated nonconformance, and a
  seeded `root_causes` row written directly (there is no UI path to create
  one outside a workflow run, and none of this seed's *other* NCR/CAPA
  workflow steps carry an `rca`-type field). The `rca` project's PW-J4 is a
  regression guard for F-01 (`root_causes_update_rls` had no permission
  clause at all — **fixed** 2026-09-01) AND F-09 (a root cause could still be
  rewritten after its enclosing step was approved and e-signed — closed by a
  BEFORE UPDATE trigger, `enforce_root_cause_immutable`, ERRCODE `QMSRC`,
  that refuses to change anything but `deleted_at`), both re-verified live.
- **Automation Rules (§47)** — zero E2E coverage before this: no project, no
  fixtures, and the module's own written roadmap
  (`docs/modules/automation-rules/14-playwright-journeys.md`) implemented
  none of its five planned journeys. One new persona, `automationOwner`
  (`automation_rules:manage` — the module's only grantable action; `read` is
  not implied by anything else since RA-1, 2026-09-07). No rule fixtures are
  seeded — PW-J1/PW-J3 create, edit, toggle and soft-delete their own rules
  via the UI, mirroring the equipment/complaints "own-fixture" journeys.
  `noAccess` (already in the cast) drives PW-J4, the permission boundary: the
  route is guarded on `automation_rules:manage` across its whole subtree
  (`permissionGuard.js`), unlike most of this module's write-gated-but-
  read-open siblings. PW-J3 reuses the existing `e2emod` promoted-Module
  fixture (§35) rather than seeding a second one — `/templates` itself
  carries no route guard, so no new persona was needed there either. PW-J2
  (event-fired notification, needs a worker round-trip) and PW-J5
  (SCHEDULED-on-built-in smoke) are left for a later pass.

Roster and IDs live in [fixtures/cast.js](fixtures/cast.js).

## Running

**You do not run the seed yourself.** The `setup` project pipes
`qms/database/e2e-seed.sql` into the postgres container before any test in every
run, and it is idempotent (`ON CONFLICT DO NOTHING`), so it is safe to re-run
against a database that already has it. Adding a persona or fixture means adding
it to that file — nothing else has to change.

```bash
cd qms-app

npm run test:e2e:docs         # the documents journeys
npm run test:e2e:ncr          # nonconformances
npm run test:e2e:capas        # CAPAs
npm run test:e2e:sites        # sites
npm run test:e2e:depts        # departments
npm run test:e2e:audits       # audits (standards, programs, instances, findings)
npm run test:e2e:analytics    # analytics / QMS Intelligence
npm run test:e2e:assetRequest # asset requests (supplier-portal-adjacent)
npm run test:e2e:complaints   # complaints (internal Quality Complaints + Customer Complaints)
npm run test:e2e:riskAssessment # risk assessment (workflow-embedded matrix widget + templates)
npm run test:e2e:rca          # RCA (workflow-embedded analysis widget + templates + categories)
npm run test:e2e:automationRules # automation rules (standalone /automation-rules page)
npm run test:e2e:sites:headed # watch it drive a real browser

# Inspections & Log Books has no npm alias yet — run it by project name.
# It chains setup → inspectionsLogsSetup (a purge, like qcSetup), so a
# --project run reports its own count + 4.
npx playwright test --project=inspectionsLogs

npm run test:e2e:ui           # Playwright UI mode (pick/replay/inspect)
npm run test:e2e:report       # open the HTML report from the last run
```

### The `analytics` suite is shaped differently

Two things separate it from every other project here, and both are premises
rather than preferences.

**It needs a worker round-trip before it can assert anything.** `metric_catalog()`
ends with `AND EXISTS (SELECT 1 FROM analytics_rollup r WHERE r.metric_key = m.id)`,
and `analytics_rollup` is itself RLS'd. Until the rollup holds rows *this reader*
may see, every picker in the module is empty and every journey fails identically
whether the cause is a missing grant, a missing refresh or a broken executor.
`fixtures/analytics.js` exports `ensureRollup()`, which enqueues the real
`refresh_analytics_rollup` task and waits. Seeding rollup rows by hand would let
every downstream assertion pass while the refresh path was broken — which is
exactly the defect class Phase 0 found.

**Half of it is deliberately not UI steps.** The module's central claim is that one
stored question yields a *different correct answer per reader*. A screen can only
ever show one reader's answer at a time, so the comparison happens below the UI
via `metric_value()` under `app_user`, and the UI tests assert that a tile renders
the figure it was handed. `multiSite` and `suppliers` are shaped the same way for
the same reason.

**The fixture month is load-bearing.** `ncr.raised` buckets on `created_at`, and
every other suite in this repo creates nonconformances *now*, so anything asserted
against the current month is a hostage to run order. §31 back-dates six rows into
**2026-02** — inside `last_12_months` so the default period still shows them, and
a month nothing else writes to. That is what turns "greater than zero" into
exactly 6 at tenant scope and exactly 4 at site scope. **Nothing else in the suite
may write to 2026-02.**

`ANL-A1`, `A2` and `A3` are regression tests for a defect class nothing else in
the toolchain can see. Vue discards children handed to a slot that does not exist
— silently, with no build warning and no runtime error. On 2026-08-18 that shipped
a New-report dialog whose Save button was dead, five invisible empty-state
actions, and two popovers that opened empty, all of which passed eslint, the
production build, the layout guard and the design-system ratchet. `A1` locates the
submit control by the label the dialog *declares* (`Create report`), so a
regression to the broken form finds no button and fails here instead of in front
of a user.

### Module screenshots

`e2e/<module>/screens/*.spec.js` is a **screenshot suite**: it drives the same
fixtures, personas and selectors the journeys do, but its product is a folder of
full-page PNGs of every meaningful state of a module — for design review, docs
and release notes.

```bash
npm run test:e2e:screens            # every module → tests/screenshots/<module>/
npm run test:e2e:screens:headed     # watch it drive a real browser
npm run test:e2e:screens:docs       # one module (…:capas, :ncr, :audits, …)
```

All of it lives in one `screens` project (`testMatch: /\/screens\/.*\.spec\.js$/`),
which is why every module project above is narrowed to `[^/]+\.spec\.js$`:
`--project=capas` stays the CAPA journey suite and its runtime, unaffected by
~40 captures × 3s. Both depend on `setup`, so seeding and login still happen
automatically. A single module is a path filter, not its own project:
`npx playwright test --project=screens capas/screens`.

- **[fixtures/screenshots.js](fixtures/screenshots.js)** is the whole harness:
  `shooter('documents')` returns `shot(page, name)`, which pauses
  `OBSERVE_MS` (3s) and writes `tests/screenshots/documents/<name>.png` full-page.
- **The pause is deliberate — do not remove it.** In headed mode the app moves
  faster than a human can follow; the pause is what makes each state observable.
  It is not a substitute for waiting: every capture asserts the expected UI state
  with a normal Playwright assertion first, *then* calls `shot()`.
- Mid-flow dialogs that the shared fixtures click straight through are captured
  through inert-by-default hooks on those fixtures —
  `createSopDocument(page, title, { beforeSubmit })` and
  `submitForReview(page, { onTrainingGate, onWorkflowDialog })`. Pass nothing and
  the journeys behave exactly as before.

**Don't re-run the suite back to back.** `authLimiter` allows 300 auth requests
per 15 minutes per IP (in-memory in the api process, so Redis surgery won't clear
it), and each `setup` run spends ~100 logging the cast in (three requests per
persona — login, handoff, session — and the roster passed 30 with §34). Three
consecutive runs exhaust it and the next `setup` fails with `login … → 429`; wait
for the window rather than restarting the stack. Note this is `authLimiter`, not
the much tighter `strictAuthLimiter` (20/15 min) — that one guards reset-token,
MFA, invitation and PIN-reset routes, none of which `setup` touches.

Every project declares `dependencies: ['setup']`, so seeding + login happen
automatically whichever suite you run. To apply the seed by hand (e.g. to poke
at the tenant without running tests):

```bash
docker exec -i qms-postgres-1 psql -U postgres -d app-db < qms/database/e2e-seed.sql
```

### Expected failures

The `sites`, `departments` and `audits` suites are **not all-green by design.** Following
the pattern used for every module's confirmed defects, some journeys are written
to fail against current code and flip to release gates once the findings are
fixed. Each such test is titled `🔴 … (FAILS TODAY)` and sits alongside
`CONTROL ·` tests that must stay green — a run where a CONTROL goes red is a
real regression, a run where a 🔴 goes green means a fix landed.

Counts below are the suite's **own** tests. A `--project=X` run reports `X + 3`,
because every project depends on `setup` (3 tests: seed / stack-up / login) —
`qcInspection` chains `setup → qcSetup` and is inflated by 4. Take sizes from
`npx playwright test --project=X --list | grep -c '^  \[X\]'`, not the `--list`
footer. (These three rows carried the inflated totals until 2026-07-30.)

| Suite | Result | Failing by design |
| --- | --- | --- |
| `sites` | 39 pass / 15 fail | PW-J4, J7, J8, J9, J10, J11 |
| `departments` | 16 pass / 11 fail | DEPT-J1, J2, J3, J4 |
| `audits` | 20 pass / 13 fail | J1 ×2, J7 ×2, J9 ×3, J10 ×5 — **plus J6, which is NOT by design** (open harness issue: `forceResync` does not get the REST-attached approval workflow into IndexedDB, though the DB row is correct) |
| `authentication` | 18 pass / **0 fail** | none — the three 🔴 probes (lockout-as-DoS, `authLimiter` no-op, unbounded reset mail) became green release gates when C1–C3 were fixed on 2026-07-30 |
| `inspectionsLogs` | 24 pass / 0 fail | none — but see IL-D1 below: one open defect is asserted **as it currently behaves**, so the suite stays green and the test fails the day it is fixed |

**`inspectionsLogs` and IL-D1 — a green test that documents a broken feature.**
The module's own journey spec (`qms/docs/modules/inspections-logs/14-playwright-journeys.md`)
predates the fix for its top three findings and expects PW-J8/J9/J10 to fail;
they were closed at the database on 2026-08-31, so `j8-integrity-guards.spec.js`
is written the other way round — as the regression guard that keeps them closed,
probed from BOTH sides (a persona the policy admits, expecting a raised error;
and one it does not, expecting zero rows), because an RLS-filtered UPDATE
succeeds silently against nothing and would otherwise read as a passing guard.

Building the suite turned up a new one. **IL-D1: a field-record flag can never be
resolved on a log book that has a supervisor.** `fieldRecordFlagService.resolveFlag()`
closes the task the flag spawned with `statusId: 'RESOLVED'`, which is not a row
in `task_instance_statuses`; the FK rejects it, the whole transaction rolls back,
and `PATCH /v1/services/fieldRecordFlags/:id/resolve` answers 400 "Invalid
reference". The dialog and the button work — the write behind them does not.
`j5-flags.spec.js` asserts that refusal, carries the diagnosis, and is annotated
`known-defect`; when the lookup row is added it goes red, which is the signal to
flip it back to asserting a real resolution.

**The one flake to expect, and why it is not worth chasing.** Nothing in this
module is readable until the syncEngine has bootstrapped LogBook / FieldRecord /
FormAssignment into a context's IndexedDB — measured at ~17s on an idle machine.
`createPersonaPool` (fixtures/inspectionsLogs.js) pays that once per persona per
file rather than once per test, which is what took the suite from ~25 minutes to
5. The residual cost lands entirely on the FIRST test of the run, whose context
is cold: on a busy machine it can exceed even the 60s + 45s the helpers allow and
fail with "the log book never reached IndexedDB", then pass on the retry in
seconds. That is what `retries: 1` on this project is for. Note the helpers wait
long and reload ONCE on purpose — a reload restarts the bootstrap from zero, so
an impatient retry loop makes this failure more likely, not less.

Every audits failure is a confirmed defect, verified against the live stack on
2026-07-29. Three map to the inventory's own findings — #1 (standards routes
mount `enforcePermission` after the controller, so it never runs), #2 (six tables
have a company-only UPDATE policy) and #4 (worker-originated writes leave no
audit trail). The other three the journeys found themselves:

- **The CSV template import is posted as free text.** `AuditStandardImportDialog`
  resets `format.value = 'paste'` on open, so `parsePasteContent` emits one
  clause per LINE — numbered 1..N, raw CSV line as the title, header row
  included — and the mangled standard goes EFFECTIVE with no approval. The same
  CSV via the API parses correctly; `j7` runs that as the control beside it.
- **A successful import never opens the standard it created** — the dialog reads
  `res.auditStandard`, the controller returns `standard`.
- **An open Audit Program page reverts the generator's schedule advance** via its
  inline auto-save, delaying the next audit by a full window (`j1`).

`j9` and `j10` each carry `CONTROL ·` tests proving the probe itself is sound —
J9 shows `auditPrograms`, which mounts the same middleware correctly, refusing
the same request; J10 shows `audit_instances`, whose identical defect was fixed
on 2026-07-22, still refusing the write.

**A login performed inside a test must pass an explicit empty `storageState`.**
`request.newContext()` called inside a test **inherits that test's
`use.storageState`**, so a context you believe is cookie-free actually carries the
current role's `connect.sid`. Since every login redirects through
`GET /v1/auth/handoff`, which calls `req.session.regenerate()`, the login
**destroys the session of whatever cookie it carried** — i.e. the role the test
declared. Nothing fails at the time (the live context gets the new cookie); it
fails in every *later* spec, which loads the now-stale `e2e/.auth/<role>.json` and
gets 401 → `/signin`. `freshContext()` therefore passes
`storageState: { cookies: [], origins: [] }`; keep it that way, and copy it into
any new helper that logs in mid-test. This was the "sessions die mid-run after
`audits/j3`" bug — it produced ~42 false failures in a full-suite run and the
old advice to run `j3` separately is obsolete.

**Writes made outside the app need `forceResync`.** A `page.request` REST call
changes the server but not the page's IndexedDB, and a plain reload will not
re-read it: `bootstrapGate` skips re-bootstrap while local data is under its
5-minute TTL. `fixtures/audits.js` exports `forceResync(page)` for this; without
it a gate that depends on the changed field (e.g. "Submit for Approval", which
needs `standard.workflowVersionId`) never appears.

Findings are written up in
[qms/docs/modules/sites/14-playwright-journeys.md](../../qms/docs/modules/sites/14-playwright-journeys.md),
[qms/docs/modules/audits/14-playwright-journeys.md](../../qms/docs/modules/audits/14-playwright-journeys.md)
and in each spec's header comment.

**Harness note worth knowing before you add expected-failure tests.** Playwright
discards and restarts the worker process after a failed test, and a restart
re-runs `beforeAll` for the rest of that file. In a suite where failures are
expected, shared setup gets silently rewound mid-file and later assertions then
fail with the wrong cause — convincingly enough to look like a product bug. Keep
such tests self-contained (see `sites/j7`, `sites/j9`, `departments/j5`).

The HTML report (`playwright-report/`) embeds a **video, trace, and screenshots**
for every test — this is the "see all the execution" view. Open a trace with
`npx playwright show-trace <path-from-report>`.

## Journeys

| Spec | Journey | Asserts (UI + DB) |
|---|---|---|
| `documents/j1-author-create-submit.spec.js` | PW-J1 create → draft → submit | DRAFT insert, no doc number on create, completeness gate, IN_REVIEW + minted `ESOP-nnn` + workflow instance + approval task |
| `documents/j2-review-approve-esign.spec.js` | PW-J2 review → e-signed approval → effective | reviewer completes ACTION step, approver signs with PIN, version EFFECTIVE, `signatures` row, worker snapshot SHA-256, audit-snapshot in UI |

More journeys (J3–J10: rejection loop, obsoletion, supersede, supplier viewer,
filters/export, template lifecycle, permission denials, notifications) are being
added.

### Audits

| Spec | Journey | Asserts (UI + DB) |
|---|---|---|
| `audits/j1-program-generator.spec.js` | PW-J1 recurring program → generated audit | program create, generator skips a not-yet-due program, mints one SCHEDULED instance with the frozen clause list + LEAD team row, advances `next_due_date`, stays idempotent; 🔴 the generated rows leave no `audit_logs` trail |
| `audits/j2-adhoc-lifecycle-esign.spec.js` | PW-J2 ad-hoc audit → e-signed close-out | SCHEDULED create, both submit gates (unassessed leaves, open findings), MAJOR_NC auto-finding, REVIEW → CLOSED via the workflow, `signatures` row, read-only terminal state |
| `audits/j3-supplier-remediation.spec.js` | PW-J3 supplier agenda → release → remediation | `shared_with_user` grants, agenda JSONB + NTF-02, `released_at`, supplier session responds + completes a finding, NTF-04 to the lead auditor |
| `audits/j4-finding-conversion.spec.js` | PW-J4 finding → CAPA, both paths | attach-existing sets `spawned_capa_id` + `record_links` lineage; `?findingId=` deep link self-links the new CAPA; the two findings keep distinct targets |
| `audits/j5-bulk-findings-capa.spec.js` | PW-J5 many findings → one CAPA | `?findingIds=a,b` carries both ids, one CAPA created, both `spawned_capa_id`s point at it |
| `audits/j6-standard-authoring-approval.spec.js` | PW-J6 authoring + version approval | v1.0 DRAFT → UNDER_REVIEW → EFFECTIVE, then v1.1 EFFECTIVE with v1.0 SUPERSEDED; 🟡 documents that no UI attaches the approval workflow |
| `audits/j7-byol-import-attest.spec.js` | PW-J7 BYOL import + attestation | CSV import mints v1.0 EFFECTIVE with no workflow, stamps attester + timestamp, resolves parent clauses, is immediately pickable; duplicate code → structured 409 |
| `audits/j8-print-report.spec.js` | PW-J8 printable report | opens `/print?module=AuditInstance`, renders number/scope/conformance FAIL/findings/sign-off, and omits per-clause detail by design |
| `audits/j9-standards-permission-bypass.spec.js` | PW-J9 🔴 finding #1 | create / update / BYOL import all succeed without any `audit_standards` grant; CONTROLs pin the persona's zero grants and a correctly-gated sibling route |
| `audits/j10-rls-update-gate.spec.js` | PW-J10 🔴 finding #2 | raw `app_user` UPDATE rewrites findings, programs, requirements, standards and versions with no permission; CONTROL pins the fixed `audit_instances` policy |
| `audits/j11-permission-denials.spec.js` | PW-J11 route tiers | `/audits` gated, detail routes open by design (RLS withholds the row), supplier exemption, read-only auditor, 403 create, 401 + sign-in bounce |
| `audits/j12-tenant-isolation.spec.js` | PW-J12 cross-tenant | REST 404s on audit / finding / standard, the row is invisible to E2EALT under RLS, and nothing is mutated |

### Complaints

| Spec | Journey | Asserts (UI + DB) |
|---|---|---|
| `complaints/j1-create-crud.spec.js` | CMP-J1 internal complaint CRUD | create over REST lands OPEN in `complaints` (not `customer_complaints`), CMP- number minted, QA-review workflow auto-starts, live-query list/detail render, inline description edit auto-saves |
| `complaints/j2-status-transitions.spec.js` | CMP-J2 the QMSCM lifecycle guard | SECURITY INVOKER + trigger-attachment premise check; `app_user` refused on every status write and on INSERT outside DRAFT/OPEN; trusted path walks OPEN→CLOSED→OPEN (reopen)→CANCELLED and DRAFT→OPEN / DRAFT→CANCELLED; CANCELLED terminal; `markComplete` 409s while a workflow step is open |
| `complaints/j3-customer-complaint-lifecycle.spec.js` | CMP-J3 Customer Complaint (support) lifecycle | create → accept → assign → close over `complaint_management`, lands in `customer_complaints` only, terminal-close refusal, and a regression lock that the QA lens never surfaces a support ticket |
| `complaints/j4-permission-scope-boundary.spec.js` | CMP-J4 permission/scope boundary | `complaints`' SITE tier admits a Primary-Site row and refuses Secondary-Site (both paired against a TENANT-scope persona seeing both); zero-grant denial on both modules' create, nav and detail routes |
| `complaints/j5-tenant-isolation.spec.js` | CMP-J5 cross-tenant | E2EALT's complaint list excludes E2ELAB's, REST/RLS both refuse a cross-tenant read/write, paired against each tenant reaching its own row |

### Risk Assessment

| Spec | Journey | Asserts (UI + DB) |
|---|---|---|
| `riskAssessment/j1-workflow-lifecycle.spec.js` | RA-J1 workflow-embedded lifecycle | CAPA on the dedicated Risk Assessment workflow, reviewer scores + finalizes the matrix, Mark Complete fires COMPLETE_AND_ADVANCE, `risk_assessments` row derived server-side with the frozen likelihood/severity/RPN/justification; approver's e-signed final step leaves the row untouched; the model's own partial-unique-index claim verified live |
| `riskAssessment/j2-state-machine.spec.js` | RA-J2 finalize state machine | IN PROGRESS → FINALIZED gated on a matrix cell alone (hazard category / INITIAL-RESIDUAL toggle both hidden fields); any post-finalize input change clears the stamp; FINALIZED → COMMITTED is not reachable by the widget itself — finalizing writes nothing until the parent task reaches APPROVED |
| `riskAssessment/j3-rls-update-regression.spec.js` | RA-J3 🟢 F-01 regression guard | `risk_assessments_update_rls` — CLOSED 2026-09-01 — re-verified live: a `capa:read`-only holder cannot downgrade the score, rewrite the justification or soft-delete; a zero-grant probe is filtered by SELECT first (the vacuity case); CONTROL proves a `capa:update` holder still can; WITH CHECK refuses a cross-tenant rewrite |
| `riskAssessment/j4-tenant-isolation.spec.js` | RA-J4 cross-tenant | the E2ELAB CAPA renders empty for an E2EALT session (RECORD-tier route, RLS-gated content); the `risk_assessments` row is invisible and unwritable under E2EALT's RLS session; the seeded template is invisible on E2EALT's admin page |
| `riskAssessment/j5-template-crud.spec.js` | RA-J5 template CRUD | PERM-01 create → list (live query) → edit → paranoid soft-delete at `/risk-assessment-templates`; a zero-grant persona sees no New Template button; the seeded template is the one the workflow field is bound to (`riskAssessmentTemplateId`) |

### RCA (Root Cause Analysis)

| Spec | Journey | Asserts (UI + DB) |
|---|---|---|
| `rca/j1-analysis-lifecycle.spec.js` | PW-J1 workflow-embedded analysis lifecycle | CAPA on the dedicated `E2E RCA Review` workflow, reviewer picks a method (5 Whys), writes the primary root cause, Mark Complete auto-finalizes and fires COMPLETE_AND_ADVANCE, `root_causes` row derived server-side with the product's real `method_used` vocabulary (`5WHY`, not the model's dead `FIVE_WHY` enum); approver's e-signed final step closes the CAPA; the explicit "Finalize Analysis" button probed separately |
| `rca/j2-templates-crud.spec.js` | PW-J2 Templates admin | create with all four method configs (Fishbone default 6Ms, 5 Whys, Is/Is Not, Why Tree) → edit → paranoid soft-delete at `/rca-templates`; `noAccess` reaches the UNGUARDED page but sees no write controls, and `rca_templates_ins` refuses the write at the RLS layer directly |
| `rca/j3-categories-manage-boundary.spec.js` | PW-J3 Categories manage-only boundary | the single `root_cause_categories:manage` action gates all four REST routes (create/update/deactivate/restore); a holder drives the full cycle through the UI; a non-holder sees a view-only page and gets 403 on all four routes with nothing changed underneath |
| `rca/j4-root-causes-boundary.spec.js` | PW-J4 🟢 F-01 + F-09 regression guard | `root_causes_update_rls` — CLOSED 2026-09-01 — re-verified live with the vacuity lesson observed (a zero-grant persona is filtered by SELECT first, so the admitting persona must hold a real parent-module grant); the `enforce_root_cause_immutable` (QMSRC) trigger refuses to rewrite content even for that same admitting persona, admitting only the `deleted_at` soft-delete path; INSERT/DELETE still require the OR; the cross-module read exposure (an `ncr:read` holder sees this Nonconformance-attached row) is pinned as a documented, open design decision |
| `rca/j5-tenant-isolation.spec.js` | PW-J5 cross-tenant | `rca_templates` and `root_cause_categories` (both tenancy-only SELECT policies) and `root_causes` (borrowed-permission table) are all invisible to E2EALT — including its OWNER, whose isOwner bypass does not cross the tenant predicate; REST 404s on a cross-tenant category write |

### Automation Rules

| Spec | Journey | Asserts (UI + DB) |
|---|---|---|
| `automationRules/j1-crud-toggle-delete.spec.js` | PW-J1 CRUD + toggle + soft-delete | create (Object + one no-config action) lands with the right `object_type`/`trigger`/`actions` shape; edit changes the trigger in place (same row id); Active toggles off/on with no dialog, DB `is_active` flips; delete goes through the confirm dialog and soft-deletes (`deleted_at` set, row gone from the list) |
| `automationRules/j3-module-scoped-authoring.spec.js` | PW-J3 module-scoped authoring (UJ-06/UJ-07) | New rule from the `e2emod` Form Template's Automation tab — no Object picker, `object_type` lands as the module key; the rule shows in BOTH that tab's own list AND the standalone `/automation-rules` list with no per-module filter, Object column resolved to the module's display name |
| `automationRules/j4-permission-boundary.spec.js` | PW-J4 route permission boundary | `noAccess` (zero grants) is bounced to `/no-access` and never sees the page; CONTROL — `automationOwner` (`automation_rules:manage`) reaches it |

## How it's built

- **[fixtures/auth.setup.js](fixtures/auth.setup.js)** — applies the seed, then
  logs every role in via the real `/v1/auth/login` and saves a `storageState`.
- **[fixtures/cast.js](fixtures/cast.js)** — users, tenant URLs, seeded fixture names.
- **[fixtures/db.js](fixtures/db.js)** — direct-DB assertion helper (`psql` in the
  postgres container; no npm deps). `waitForSqlValue` polls for worker-produced
  state (snapshots, tasks).
- **[fixtures/audits.js](fixtures/audits.js)** — audit UI flows (ad-hoc create,
  walkthrough scoring, close-out submit + approval, standard authoring) and the
  DB readers the journeys assert on. Note its header: selects inside a dialog go
  through `selectInDialog`, because the audits list page uses the same column
  labels the create dialog uses.
- **[fixtures/documents.js](fixtures/documents.js)** — shared UI flows
  (create-from-template, section fill with a DB persistence barrier, submit with
  reviewer picks). Selects are driven by keyboard for stability.

## Notes

- Journeys run serially (`workers: 1`) — they share the seeded fixtures.
- Auth state (`e2e/.auth/`) is gitignored (contains session cookies).
- If the stack runs elsewhere, set `E2E_BASE_URL` / `E2E_ALT_BASE_URL` and the
  `E2E_PSQL_*` env vars (see `fixtures/db.js`).
