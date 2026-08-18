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
npm run test:e2e:sites:headed # watch it drive a real browser

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
it), and each `setup` run spends ~90 logging the cast in. Three consecutive runs
exhaust it and the next `setup` fails with `login … → 429`; wait for the window
rather than restarting the stack.

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
