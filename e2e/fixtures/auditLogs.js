// Audit Logs (`audit_trail`) E2E fixtures.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS SUITE EXISTS FOR
//
// `audit_log_select_rls` gated on `authz.has_permission('document_control',
// 'read')` — a grant 49 of the 75 live roles hold, baseline Employee included —
// while the product presented a dedicated `audit_trail` module in Role &
// Permission Management as though it governed the page. Grepping `audit_trail`
// across the whole of `database/rls.sql` at HEAD returned zero hits. So every
// document reader could read the company's entire cross-module audit trail:
// every tracked change in every module, with actor, IP and a field-level diff.
//
// The fix repoints that one policy at `authz.has_permission('audit_trail',
// 'read')`. This suite is the browser-level proof that the repoint took, and —
// more importantly — the regression net that catches it being undone.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PERSONA MAP, AND WHY IT IS THE WHOLE DESIGN
//
// `database/e2e-seed.sql` §35 grants `audit_trail:read` to exactly TWO roles and
// deliberately withholds it from five others. Those withholdings are not gaps in
// the fixture; they are the probes. A tenant where everybody can see everything
// cannot catch a permission regression, and audit-trail read is the widest read
// in the product.
//
//   GRANTED
//     owner      Olivia — `app.current_user_is_owner` bypass, no grant needed.
//                The POSITIVE CONTROL. Without her an empty list is equally
//                consistent with "the table is empty" and "the seed never ran",
//                and neither of those is the thing under test.
//     auditor    Ava, role `E2E Auditor` — the audit function. Holds
//                document_control:read, ncr/capa/change_control:read,
//                audit_management:read, and now audit_trail:read. Her
//                production counterpart (Auditor / Lead Auditor / External
//                Auditor) is who the whole fix is about: those roles read the
//                trail through `document_control` today and would LOSE it if the
//                policy shipped without the grant backfill.
//     roleAdmin  Rosa, role `E2E Role Admin` — the tenant administrator arm of
//                the backfill migration (`role_permission_management:update`).
//                Also the only granted persona holding `user_management:read`,
//                which is what makes the actor-scoped journey on /users/:id
//                pairable at all.
//
//   DENIED — each one a probe, not an omission
//     controller Carla, `E2E Doc Controller` — ★ THE regression probe. Full
//                document_control CRUD and zero audit_trail. Before the fix she
//                read the entire cross-module trail. After it she must read
//                nothing. If a future change re-couples the two permissions,
//                she is where it shows.
//     auditReader Rhea, `E2E Audit Reader` — audit_management / audit_standards /
//                audit_programs / audit_findings, all `:read`, and no
//                audit_trail. Proves that reading the Audits MODULE is not
//                reading the TRAIL. This is the shape of every role an
//                administrator creates after the backfill has run, so it is the
//                probe most likely to catch the next mistake.
//     author     Aaron — document_control + ncr create/read/update. The record
//                author who can reach a record's detail page and must still not
//                be offered its history.
//     noAccess   Noah — no role at all. The floor.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO THINGS THAT MAKE THIS SUITE DIFFERENT FROM THE OTHERS, AND BOTH ARE TRAPS
//
// 1. AN RLS REFUSAL HERE IS A ZERO-ROW SUCCESS, NOT AN ERROR. Nothing throws,
//    nothing 403s, no banner appears — `audit_log_select_rls` simply matches no
//    rows, the SyncEngine bootstrap syncs zero of them, the live query returns
//    [] and the section `v-if`s itself away. So EVERY probe in this suite is
//    written two-sided: the denied persona's empty result is only evidence if a
//    GRANTED persona sees rows in the same run, against the same generated data.
//    A one-sided "Carla sees nothing" passes identically when the seed did not
//    apply, the worker is down, or the page is broken — and a suite that passed
//    against the live defect is exactly the mistake this programme has already
//    made once.
//
// 2. AN UNRESOLVABLE ENTITY HIDES ITS ROW ENTIRELY. `AuditLogsItem` resolves
//    each row's subject out of IndexedDB via ENTITY_LABEL_RESOLVERS and renders
//    `v-if="resolvedEntity"` — a null resolve removes the row from the DOM. So a
//    probe row whose SUBJECT one persona cannot read would read as "the audit
//    permission denied it", when the truth is "she could not see the
//    department". That would make the pair prove nothing.
//
//    Which is why the probe subject is a DEPARTMENT WITH A NULL `site_id`.
//    `departments_sel` ends `… OR ((site_id IS NULL) OR (site_id = ANY
//    (authz.current_site_ids())))` — a site-less department is visible to every
//    member of the tenant, grants or no grants. The subject is therefore equally
//    readable to all six personas, and the ONLY variable left between them is
//    `audit_log_select_rls` itself. That is the whole point of choosing it.
import { expect } from '@playwright/test'
import { COMPANY_ID, DEPARTMENTS, SITES, USERS } from './cast.js'
import { sql, sqlValue, sqlAsAppUser, waitForSqlValue } from './db.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// ─────────────────────────────────────────────────────────────────────────────
// Personas
// ─────────────────────────────────────────────────────────────────────────────

/** Personas e2e-seed.sql §35 grants `audit_trail:read` (owner bypasses). */
export const TRAIL_GRANTED = ['owner', 'auditor', 'roleAdmin']

/** Personas §35 deliberately DENIES. Each is a probe — see the header. */
export const TRAIL_DENIED = ['controller', 'auditReader', 'author', 'noAccess']

// ─────────────────────────────────────────────────────────────────────────────
// Timing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long a fresh context needs before the trail is queryable. Generous, and
 * the reason is structural rather than defensive.
 *
 * `AuditLog` is a synced model, and `sync/bootstrap.js` pages it into IndexedDB
 * 100 rows at a time. The E2E tenant holds ~64k audit rows, so a granted
 * persona's fresh context is walking ~640 sequential GraphQL round trips for
 * the whole table, and it is still walking them while the page renders.
 *
 * ⚠ CORRECTION (2026-09-01, measured): an earlier version of this comment said
 * the walk had "no server-side ordering guarantee" and that ~640 round trips
 * had to complete before the newest row was in IDB. That is wrong, and it is
 * wrong in the direction that matters. `GraphQLSchemaGenerator` emits
 * `syncFieldOrderByDesc` (`CREATED_AT_DESC`) for every model with a `syncField`,
 * and `bootstrapModel()` passes it as `orderBy` — so page 1 is the NEWEST 100
 * rows and a just-written probe row is in IDB after ONE round trip, not 640.
 * The budget below is therefore for the page's own full IDB scan under a
 * bootstrap still running in the background, not for reaching our row.
 *
 * A DENIED persona is instant (RLS returns nothing), which is its own trap: the
 * negative half of every pair finishes in seconds and the positive half does
 * not, so the positive half is what sets the budget.
 */
export const TRAIL_SYNC_TIMEOUT = 180_000

// ─────────────────────────────────────────────────────────────────────────────
// The probe subject: a site-less department this suite owns outright
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ids live in the `e2ead000-…` block, which nothing else in `e2e-seed.sql` or
 * the suites uses. Two departments, because "the actor filter works" needs a row
 * this actor did NOT perform to exclude, and two rows on the SAME subject are
 * indistinguishable in the UI — they render the same label.
 */
export const PROBE_DEPARTMENTS = {
  primary: {
    id: 'e2ead000-0000-4000-8000-000000000001',
    code: 'ALDP',
    name: 'ALD Probe Department',
  },
  foreign: {
    id: 'e2ead000-0000-4000-8000-000000000002',
    code: 'ALDF',
    name: 'ALD Foreign Department',
  },
}

/** A throwaway NC, for the record-scoped dialog journeys. */
export const PROBE_NC = {
  id: 'e2ead000-0000-4000-8000-000000000011',
  number: 'NC-ALD-001',
  title: 'ALD Probe Nonconformance',
}

/** Server clock, so a window is never skewed by the test machine's clock. */
export function dbNow() {
  return sqlValue(`SELECT now()::text`)
}

/**
 * Run DML with `app.current_user_id` set, so the audit trigger attributes the
 * row to a real person instead of writing a NULL performer that renders as
 * "System".
 *
 * The trigger (`*_audit_trigger` → `graphile_worker.add_job('audit_event')`)
 * reads `current_setting('app.current_user_id', true)` off the SESSION, and
 * `db.js`'s `sql()` runs everything through one `psql -c`, so the set_config and
 * the DML share a session and an implicit transaction. Attribution is not
 * cosmetic here: PW-J6 filters the trail BY ACTOR, and an unattributed row
 * cannot be filtered into or out of anything.
 */
function sqlAsActor(actorId, statements) {
  return sql(`SELECT set_config('app.current_user_id', ${q(actorId)}, false); ${statements}`)
}

/**
 * Create (or recreate) a probe department. `site_id` is NULL deliberately — see
 * the header: it is what makes the subject equally readable to every persona, so
 * the pair isolates `audit_log_select_rls` and nothing else.
 *
 * The INSERT is itself the auditable action: it produces a `Departments` CREATE
 * row whose `newValueJson` carries the tracked fields, which is what PW-J3
 * expands and PW-J9 hunts for.
 */
export function seedProbeDepartment(dept, actorId = USERS.owner.id) {
  removeProbeDepartment(dept)
  sqlAsActor(
    actorId,
    `INSERT INTO departments (id, code, company_id, name, description, site_id,
       supervisor_user_id, created_at, updated_at)
     VALUES (${q(dept.id)}, ${q(dept.code)}, ${q(COMPANY_ID)}, ${q(dept.name)},
       'Owned by the auditLogs E2E suite.', NULL, NULL, NOW(), NOW());`,
  )
}

/**
 * A tracked UPDATE on the probe department.
 *
 * `description` is in `departmentSites.js`'s trackFields
 * (`name, code, siteId, supervisorUserId, description, deletedAt`), so this
 * produces an UPDATE row with a real old→new diff — the shape PW-J3 needs, and
 * distinct from the CREATE row the INSERT already wrote.
 */
export function touchProbeDepartment(dept, { actorId, description }) {
  sqlAsActor(
    actorId,
    `UPDATE departments SET description = ${q(description)}, updated_at = NOW()
      WHERE id = ${q(dept.id)};`,
  )
}

export function removeProbeDepartment(dept) {
  sql(`DELETE FROM departments WHERE id = ${q(dept.id)}`)
}

/**
 * Create a throwaway nonconformance the record-scoped journeys can open.
 *
 * CLOSED and owned by `author`, mirroring the analytics fixtures in
 * `e2e-seed.sql` §31: a terminal status means no lifecycle guard trigger can
 * object to a row that arrived without a transition history. The INSERT is the
 * auditable action — it writes a `Nonconformances` CREATE row.
 *
 * Deliberately NOT one of the seeded `NC-ANL-*` rows, which carry "Do not edit"
 * and whose counts the analytics suite asserts on.
 *
 * ── `site_id` AND `department_id` ARE NOT OPTIONAL HERE ──────────────────────
 * This helper shipped with both set to NULL and could never have run: every
 * call raised
 *
 *   new row for relation "nonconformances" violates check constraint
 *   "nc_complete_when_open"
 *
 * The constraint (verified live) is
 *
 *   CHECK (status_id = 'DRAFT' OR (severity_id, type_id, source_id, site_id,
 *          department_id, owner_id, detected_at ARE ALL NOT NULL))
 *
 * — i.e. DRAFT is the only status a partially-filled NC may hold, and this row
 * is deliberately CLOSED for the reason above. So the two columns are filled
 * with the seeded Primary Site / Quality department rather than the status
 * being relaxed: dropping to DRAFT would trade a constraint failure for a
 * lifecycle-trigger one and lose the "terminal, nothing can move it" property
 * the record-scoped journeys rely on.
 *
 * Both persona-visible: `auditor` and `author` hold their NCR grants at TENANT
 * scope, so pinning a site does not change who can reach the record — measured,
 * both still read it and `controller` still does not.
 */
export function seedProbeNc(actorId = USERS.owner.id) {
  removeProbeNc()
  sqlAsActor(
    actorId,
    `INSERT INTO nonconformances (
       id, company_id, nc_number, title, description, status_id, severity_id, type_id,
       source_id, site_id, department_id, owner_id, detected_at,
       created_by, updated_by, created_at, updated_at)
     VALUES (${q(PROBE_NC.id)}, ${q(COMPANY_ID)}, ${q(PROBE_NC.number)}, ${q(PROBE_NC.title)},
       'Owned by the auditLogs E2E suite.', 'CLOSED', 'MINOR', 'PROCESS', 'IN_PROCESS',
       ${q(SITES.primary.id)}, ${q(DEPARTMENTS.quality.id)}, ${q(USERS.author.id)}, '2026-02-10',
       ${q(USERS.author.id)}, ${q(USERS.author.id)}, NOW(), NOW());`,
  )
}

/**
 * Drop the probe NC. Its audit rows are DELIBERATELY left behind.
 *
 * This helper used to open with `DELETE FROM audit_logs WHERE entity_id = …`,
 * which cannot run and never could: `prevent_audit_log_mutation()` raises
 *
 *   audit_logs rows are immutable — UPDATE and DELETE are prohibited
 *
 * on every row it touches. (It looked harmless in isolation because a DELETE
 * matching zero rows never fires a row-level trigger, so the statement
 * "succeeded" on any database where the probe had not run yet.)
 *
 * The right answer is not to find a way round the trigger. That trigger is the
 * tamper control this whole module exists to provide, and a fixture that
 * rewrote history to make its own bookkeeping tidier would be undermining the
 * property under test. Callers that need a clean count scope their query to a
 * `created_at >` window instead — see `dbNow()` and `waitForAuditRow({ since })`.
 */
export function removeProbeNc() {
  sql(`DELETE FROM nonconformances WHERE id = ${q(PROBE_NC.id)}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit-row assertions at the database layer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wait for the worker to land the audit row for an action just performed.
 *
 * The trigger only ENQUEUES; `graphile_worker` writes `audit_logs`. Every
 * assertion in this suite is downstream of that hop, so a single-shot query
 * right after the DML races it and reads as "not audited".
 */
export async function waitForAuditRow({ entityType, entityId, action = null, since = null }) {
  const clauses = [`entity_type = ${q(entityType)}`, `entity_id = ${q(entityId)}`]
  if (action) clauses.push(`action = ${q(action)}`)
  if (since) clauses.push(`created_at > ${q(since)}`)
  return waitForSqlValue(
    `SELECT id FROM audit_logs WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 1`,
    { timeoutMs: 90_000, label: `audit row: ${action ?? 'any'} ${entityType}/${entityId}` },
  )
}

/**
 * How many audit rows `audit_log_select_rls` shows this user — the policy under
 * test, evaluated exactly as PostGraphile evaluates it.
 *
 * `sqlAsAppUser` drops to the untrusted `app_user` DB role and sets the same
 * GUCs the real request path sets. That is the ONLY way to read the policy's
 * verdict directly: Sequelize/REST connects as the superuser and bypasses RLS
 * entirely, so a REST-based probe would answer a different question.
 *
 * Note it pins `app.current_user_is_owner = 'false'`, so the owner cannot be
 * probed through here — her leg of every pair is the superuser count below, or
 * the browser.
 *
 * The `RESULT=` marker exists because the helper's own session setup emits rows:
 * three `SELECT set_config(...)` statements each print their value, so the
 * output is several lines and a bare `count(*)` would have to be located by
 * position. Marking it makes the parse independent of how many lines precede it.
 */
export function trailRowsVisibleTo(userId, where = 'TRUE') {
  const res = sqlAsAppUser(
    `SELECT 'RESULT=' || count(*)::text FROM audit_logs WHERE company_id = ${q(COMPANY_ID)} AND (${where});`,
    { userId, companyId: COMPANY_ID },
  )
  expect(res.ok, `RLS probe ran (stderr: ${res.error})`).toBeTruthy()
  const m = /RESULT=(\d+)/.exec(res.output)
  expect(m, `RLS probe returned a count (output: ${res.output})`).not.toBeNull()
  return Number(m[1])
}

/** Ground truth, RLS bypassed — what the table actually holds. */
export function trailRowsInTable(where = 'TRUE') {
  return Number(
    sqlValue(
      `SELECT count(*) FROM audit_logs WHERE company_id = ${q(COMPANY_ID)} AND (${where})`,
    ),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The global trail page.
 *
 * ── WHY THIS RETRIES, AND WHAT IT MUST NOT SWALLOW ──────────────────────────
 * A saved storage state can lose its session mid-suite — most reliably when a
 * second Playwright run re-executes the `setup` project against the same tenant
 * while this one is in flight, which is routine in this repo (several module
 * passes share one dev stack). The app handles that gracefully and INVISIBLY:
 * it bounces to /signin, completes a handoff from the cookie it still holds,
 * and lands on `/dashboard` — the destination is dropped, not the session. A
 * single `goto` therefore ends up on a page with no audit rows on it, and the
 * failure reads as "the trail is empty for this persona", which is the one
 * conclusion this suite must never reach by accident.
 *
 * So the bounce is retried once, and ONLY the bounce: if the second attempt
 * does not land on /audit-logs either, the caller's own assertions fail as
 * normal. A persona the router genuinely rejects goes to /no-access, which is
 * neither /signin nor /dashboard and is left strictly alone — the denial
 * probes in ALD-A2 depend on that.
 */
export async function gotoAuditLogs(page) {
  await page.goto('/audit-logs', { waitUntil: 'domcontentloaded', timeout: 30_000 })
  if (/\/(signin|dashboard)/.test(page.url())) {
    await page.waitForURL(/\/(dashboard|audit-logs|no-access)/, { timeout: 30_000 })
    await page.goto('/audit-logs', { waitUntil: 'domcontentloaded', timeout: 30_000 })
  }
}

/**
 * Every rendered audit row on the page or in the dialog.
 *
 * `AuditLogsItem` wraps each row in `BaseClickableRow`, which renders
 * `role="button"` with an aria-label that toggles between the two strings below.
 * Both are matched because the label flips the moment a row is expanded, and a
 * count keyed to only one of them would silently drop the row PW-J3 just opened.
 */
export function auditRows(scope) {
  return scope.getByRole('button', { name: /^(Expand|Collapse) change details$/ })
}

/**
 * Make a detail page's record actions reachable, whatever shape they took.
 *
 * ⚠ `DetailActionBar` DOES NOT ALWAYS OVERFLOW. It promotes actions to inline
 * buttons and only spills the remainder into a ⋯ menu, so which of the two the
 * Audit Log action lives in depends on HOW MANY OTHER ACTIONS THE PERSONA HAS.
 * On the CLOSED probe NC it is inline — measured: the header renders exactly
 * `Print` and `Audit Log` as buttons and there is no ⋯ trigger on the page at
 * all. A helper that insisted on opening an overflow menu therefore timed out
 * looking for a control the page had no reason to render, and the failure read
 * as "the record did not load for this persona", which is a different and much
 * more alarming claim than the truth.
 *
 * So: open the overflow IF there is one, and leave the page alone otherwise.
 * Pair it with `auditLogMenuItem`, which matches both shapes.
 *
 * `.first()` on the trigger is required rather than defensive — `BaseMenu`
 * hard-codes `aria-label="More actions"` on EVERY trigger it renders, and a
 * record page can carry two (the header's, and a workflow step card's), so a
 * bare locator is a strict-mode violation before anything is clicked. The
 * header's is first in DOM order and is the one that carries record actions.
 */
export async function revealRecordActions(page) {
  const overflow = page.getByRole('button', { name: 'More actions' })
  if (await overflow.count()) await overflow.first().click()
}

/** @deprecated Use `revealRecordActions` — see the note above. */
export async function openMoreActions(page) {
  const trigger = page.getByRole('button', { name: 'More actions' }).first()
  await expect(trigger, 'the record rendered for this persona').toBeVisible({ timeout: 60_000 })
  await trigger.click()
}

/**
 * The gated affordance itself — the control that opens `AuditLogDialog`.
 *
 * All ten embed points declare it with the same label through
 * `visible: !!canViewAuditTrail`, so one locator covers Documents, CAPA, NCR,
 * Change Requests, Audits (instances + standards), Customer Complaints, QA
 * Complaints, Quality Events and Users.
 *
 * TWO ROLES, because `DetailActionBar` renders the same declared action as an
 * inline `button` when it fits and as a `menuitem` when it spills into the ⋯
 * overflow — and which one you get depends on how many OTHER actions the
 * persona has, i.e. on the very permissions under test. Matching only
 * `menuitem` made the affordance look absent for a persona who simply had few
 * enough actions to keep it on the bar, which would have turned this suite's
 * central assertion into a coin toss. `exact` so the dialog's own title
 * ("Audit Log — NC-…") cannot satisfy it.
 */
export function auditLogMenuItem(page) {
  return page
    .getByRole('menuitem', { name: 'Audit Log', exact: true })
    .or(page.getByRole('button', { name: 'Audit Log', exact: true }))
}

/** The dialog's denial state — deliberately NOT its empty state. */
export function trailDeniedNotice(scope) {
  return scope.getByText("You don't have permission to view the audit trail.")
}

/** The dialog's empty state, which the denial state must never be confused with. */
export function trailEmptyState(scope) {
  return scope.getByText('No changes have been recorded yet.')
}

/**
 * The centralised print view for a record — `/print?module=…&id=…`.
 *
 * Opened by URL rather than through the detail page's Print action, which spawns
 * a popup. `window.print()` is stubbed by the caller: the print view fires it
 * automatically once its data resolves, and a real print dialog blocks the run.
 */
export function printUrl(module, id) {
  return `/print?module=${module}&id=${id}`
}
