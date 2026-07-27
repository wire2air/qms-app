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
npm run test:e2e:sites:headed # watch it drive a real browser

npm run test:e2e:ui           # Playwright UI mode (pick/replay/inspect)
npm run test:e2e:report       # open the HTML report from the last run
```

Every project declares `dependencies: ['setup']`, so seeding + login happen
automatically whichever suite you run. To apply the seed by hand (e.g. to poke
at the tenant without running tests):

```bash
docker exec -i qms-postgres-1 psql -U postgres -d app-db < qms/database/e2e-seed.sql
```

### Expected failures

The `sites` and `departments` suites are **not all-green by design.** Following
the pattern used for every module's confirmed defects, some journeys are written
to fail against current code and flip to release gates once the findings are
fixed. Each such test is titled `🔴 … (FAILS TODAY)` and sits alongside
`CONTROL ·` tests that must stay green — a run where a CONTROL goes red is a
real regression, a run where a 🔴 goes green means a fix landed.

| Suite | Result | Failing by design |
| --- | --- | --- |
| `sites` | 42 pass / 15 fail | PW-J4, J7, J8, J9, J10, J11 |
| `departments` | 19 pass / 11 fail | DEPT-J1, J2, J3, J4 |

Findings are written up in
[qms/docs/modules/sites/14-playwright-journeys.md](../../qms/docs/modules/sites/14-playwright-journeys.md)
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

## How it's built

- **[fixtures/auth.setup.js](fixtures/auth.setup.js)** — applies the seed, then
  logs every role in via the real `/v1/auth/login` and saves a `storageState`.
- **[fixtures/cast.js](fixtures/cast.js)** — users, tenant URLs, seeded fixture names.
- **[fixtures/db.js](fixtures/db.js)** — direct-DB assertion helper (`psql` in the
  postgres container; no npm deps). `waitForSqlValue` polls for worker-produced
  state (snapshots, tasks).
- **[fixtures/documents.js](fixtures/documents.js)** — shared UI flows
  (create-from-template, section fill with a DB persistence barrier, submit with
  reviewer picks). Selects are driven by keyboard for stability.

## Notes

- Journeys run serially (`workers: 1`) — they share the seeded fixtures.
- Auth state (`e2e/.auth/`) is gitignored (contains session cookies).
- If the stack runs elsewhere, set `E2E_BASE_URL` / `E2E_ALT_BASE_URL` and the
  `E2E_PSQL_*` env vars (see `fixtures/db.js`).
