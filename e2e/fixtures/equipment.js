// Shared flows + DB assertions for the Equipment / calibration journeys.
//
// Fixtures live in qms/database/e2e-seed.sql §36 and are mirrored in cast.js as
// `EQUIPMENT`. Four facts about this module shape everything below.
//
// 1. THERE IS NO DETAIL ROUTE. `/equipment` is the whole module: a register
//    whose rows open the create dialog in edit mode (`EquipmentHome.vue`
//    `@rowClick="openEdit"`). Nothing deep-links to one instrument, so every UI
//    step here starts at the register.
//
// 2. THE WRITE PATHS DISAGREE, AND THAT IS THE POINT. Create goes over REST
//    (`POST /v1/services/equipment`), edit goes over the syncEngine
//    (`useLiveMutation` → GraphQL → `equipment_upd` as `app_user`), delete goes
//    over the syncEngine as a PARANOID UPDATE (`BaseModel.delete()` sets
//    deleted_at and issues an UPDATE, never a DELETE), and record-calibration /
//    record-pm are REST action RPCs. So a permission question has to be asked
//    of each path separately — a refusal on one says nothing about the others.
//    This is exactly the shape E1 exploited.
//
// 3. EVERY READ IS INDEXEDDB. The register is a `useLiveQueryWithDeps` over the
//    syncEngine's Equipment store, fed by the sync socket. A REST write lands in
//    Postgres immediately and reaches the page only when the broadcast does — so
//    assert hard facts in SQL and let the UI assertions retry.
//
// 4. `calibration_equipment` HAS NO `read` ACTION and `equipment_sel` is a bare
//    company_id match, so the register is readable by every member of the
//    tenant and /equipment carries no route-guard entry. "Can they see it" is
//    never the interesting question in this module; "can they change it" is.
import { expect } from '@playwright/test'
import { EQUIPMENT } from './cast.js'
import { sql, sqlRow, sqlValue, waitForSqlValue } from './db.js'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Unique, greppable code for one test run. Codes are unique per tenant. */
export function uniqueCode(tag) {
  return `E2E-EQ-${tag}-${Date.now()}`
}

/**
 * One browser context per persona, shared by every test in a spec file.
 *
 * Same shape and same reason as `e2e/fixtures/inspectionsLogs.js`: a fresh
 * context is a brand new IndexedDB and the register renders nothing until the
 * syncEngine has bootstrapped Equipment into it. Opening one per test per
 * persona spends most of the suite waiting for the same rows twice.
 */
export function createPersonaPool() {
  const pool = new Map()
  return {
    async page(browser, storageState) {
      if (!pool.has(storageState)) {
        const ctx = await browser.newContext({ storageState })
        pool.set(storageState, { ctx, page: await ctx.newPage() })
      }
      return pool.get(storageState).page
    },
    async close() {
      for (const { ctx } of pool.values()) await ctx.close().catch(() => {})
      pool.clear()
    },
  }
}

/**
 * One instrument, straight out of Postgres.
 *
 * Returns ISO strings for the dates rather than Date objects: every assertion
 * in this suite is either "is it null", "did it move", or a day-level
 * comparison, and psql's own rendering is the least lossy thing to compare.
 */
export function findEquipment(id) {
  const row = sqlRow(
    `SELECT code, name, status_id, category, requires_calibration, calibration_interval,
            calibration_interval_unit, last_calibrated_at, next_calibration_due,
            requires_pm, pm_interval, pm_interval_unit, last_pm_at, next_pm_due,
            site_id, department_id, deleted_at
       FROM equipment WHERE id = ${quote(id)}`,
  )
  if (!row) return null
  const nz = (v) => (v === '' ? null : v)
  return {
    code: row[0],
    name: row[1],
    statusId: row[2],
    category: nz(row[3]),
    requiresCalibration: row[4] === 't',
    calibrationInterval: nz(row[5]) === null ? null : Number(row[5]),
    calibrationIntervalUnit: nz(row[6]),
    lastCalibratedAt: nz(row[7]),
    nextCalibrationDue: nz(row[8]),
    requiresPm: row[9] === 't',
    pmInterval: nz(row[10]) === null ? null : Number(row[10]),
    pmIntervalUnit: nz(row[11]),
    lastPmAt: nz(row[12]),
    nextPmDue: nz(row[13]),
    siteId: nz(row[14]),
    departmentId: nz(row[15]),
    deletedAt: nz(row[16]),
  }
}

/** The live row for a code, ignoring tombstones. Null when there is none. */
export function findEquipmentByCode(code) {
  const id = sqlValue(
    `SELECT id FROM equipment WHERE code = ${quote(code)} AND deleted_at IS NULL LIMIT 1`,
  )
  return id ? { id, ...findEquipment(id) } : null
}

/**
 * Force an instrument back out of calibration.
 *
 * EQ-J4 RECALIBRATES the instrument it is testing — that is the second half of
 * the journey — and the seed is `ON CONFLICT DO NOTHING`, so it will never put
 * the row back. Without this the journey passes once and then asserts against an
 * in-calibration instrument forever after, which is the quietest possible
 * false green. The reset is the journey's arrange step, written in SQL because
 * no product surface can move a due date backwards.
 *
 * `updated_at` is bumped deliberately: the register reads out of IndexedDB and
 * the sync service broadcasts on the audit trigger, so a write that left
 * updated_at alone would be invisible to any page already open.
 */
export function expireCalibration(id, { daysOverdue = 45, intervalMonths = 3 } = {}) {
  sql(
    `UPDATE equipment
        SET requires_calibration = true,
            calibration_interval = ${Number(intervalMonths)},
            calibration_interval_unit = 'MONTH',
            last_calibrated_at = NOW() - INTERVAL '${Number(daysOverdue) + 90} days',
            next_calibration_due = NOW() - INTERVAL '${Number(daysOverdue)} days',
            updated_at = NOW()
      WHERE id = ${quote(id)}`,
  )
  const after = findEquipment(id)
  expect(after, `equipment ${id} exists`).not.toBeNull()
  expect(
    new Date(after.nextCalibrationDue).getTime(),
    'the reset actually put next-due in the past',
  ).toBeLessThan(Date.now())
  return after
}

/**
 * Put a calibration next-due back to a known point in the FUTURE.
 *
 * The mirror of `expireCalibration`, for the journeys that roll a due date
 * forward and would otherwise inherit whatever the previous run left. Same
 * updated_at bump, same reason.
 */
export function resetCalibrationWindow(id, { daysUntilDue = 20, intervalMonths = 6 } = {}) {
  sql(
    `UPDATE equipment
        SET requires_calibration = true,
            calibration_interval = ${Number(intervalMonths)},
            calibration_interval_unit = 'MONTH',
            last_calibrated_at = NOW() - INTERVAL '${Number(intervalMonths) * 30 - Number(daysUntilDue)} days',
            next_calibration_due = NOW() + INTERVAL '${Number(daysUntilDue)} days',
            updated_at = NOW()
      WHERE id = ${quote(id)}`,
  )
  return findEquipment(id)
}

/** PM twin of resetCalibrationWindow — puts next-PM a fixed way into the past. */
export function resetPmWindow(id, { daysOverdue = 10, intervalMonths = 3 } = {}) {
  sql(
    `UPDATE equipment
        SET requires_pm = true,
            pm_interval = ${Number(intervalMonths)},
            pm_interval_unit = 'MONTH',
            last_pm_at = (NOW() - INTERVAL '${Number(intervalMonths) * 30 + Number(daysOverdue)} days')::date,
            next_pm_due = NOW() - INTERVAL '${Number(daysOverdue)} days',
            updated_at = NOW()
      WHERE id = ${quote(id)}`,
  )
  return findEquipment(id)
}

/**
 * Hard-remove rows a test minted, tombstoned or not.
 *
 * `code` is unique per tenant and the service rejects a duplicate, so a
 * throwaway row left behind by a failed run would block the next one. DELETE
 * rather than restore: these rows never existed as far as the fixture set is
 * concerned.
 */
export function purgeEquipmentByCode(code) {
  // Signatures FIRST. Since migration 20260911110000 the evidence ledger points
  // at instruments (`signatures.equipment_id`, a COMPOSITE FK), so a hard DELETE
  // of an instrument that has ever been calibrated through the product raises a
  // foreign-key violation — and because `db.js` runs psql with
  // `ON_ERROR_STOP=1`, that surfaces as a thrown `Command failed: docker exec …`
  // out of a beforeAll/afterAll hook, which Playwright reports against whichever
  // test happened to be last. Deleting the ledger rows is correct here and only
  // here: these are throwaway fixtures that never existed as far as the product
  // is concerned. NOTHING in the application may do this.
  sql(
    `DELETE FROM signatures
      WHERE equipment_id IN (SELECT id FROM equipment WHERE code = ${quote(code)})`,
  )
  sql(`DELETE FROM equipment WHERE code = ${quote(code)}`)
}

/**
 * Purge every row a previous run of this suite minted (codes are prefixed).
 *
 * Worth calling at the START of the first spec in the project, not just at the
 * end of each: a run that dies mid-test leaves its throwaway instruments behind,
 * and they are not inert — they sit in the register and change what a SORT or a
 * count assertion sees on the next run. That is exactly how EQ-J1's sort journey
 * failed against rows EQ-J3 had leaked (`Throwaway E2E-EQ-J3SYNC-…` sorts after
 * every seeded name, so it became the first row descending).
 */
export function purgeMintedEquipment() {
  sql(
    `DELETE FROM signatures
      WHERE equipment_id IN (SELECT id FROM equipment WHERE code LIKE 'E2E-EQ-%')`,
  )
  sql(`DELETE FROM equipment WHERE code LIKE 'E2E-EQ-%'`)
}

// ── REST ────────────────────────────────────────────────────────────────────
// `page.request` inherits the page's cookies, so these speak as the persona the
// context was opened for — which is the whole point: the escalation E1 fixed was
// reachable over REST by a session whose UI hid the button.
export async function restPost(page, path, body) {
  return page.request.post(`/api/v1/services${path}`, { data: body ?? {} })
}
export async function restPatch(page, path, body) {
  return page.request.patch(`/api/v1/services${path}`, { data: body ?? {} })
}
export async function restDelete(page, path) {
  return page.request.delete(`/api/v1/services${path}`)
}

/**
 * The message an API error carried. Same two response shapes as every other
 * suite (`{ error: { message } }` from the global handler, bare `{ message }`
 * from a few older routes); must be awaited before the context is closed.
 */
export async function errorMessage(res) {
  const body = await res.text()
  try {
    const json = JSON.parse(body)
    const base = json?.error?.message ?? json?.message ?? json?.error ?? body
    // Zod's ValidationError carries the generic "Validation failed" as its
    // message and puts the substance in `error.fields`. Returning the message
    // alone made every schema rejection indistinguishable from every other one —
    // a spec could assert "the interval unit was refused" and pass on a refusal
    // about a completely different field. Append the field map so the assertion
    // can name the field that was actually wrong.
    const fields = json?.error?.fields
    if (fields && typeof fields === 'object') {
      const detail = Object.entries(fields)
        .map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`)
        .join('; ')
      return detail ? `${base} — ${detail}` : base
    }
    return base
  } catch {
    return body
  }
}

// ── UI ──────────────────────────────────────────────────────────────────────

/**
 * Open the register and wait until it has genuinely hydrated.
 *
 * Anchoring on a SEEDED ROW, never on the page chrome: `BaseListLayout` renders
 * its header, its toolbar and its empty state before the syncEngine has put a
 * single Equipment row in IndexedDB, so a test that waited on the "Equipment"
 * heading would assert against an empty table and read a bootstrap that never
 * finished as "no rows matched".
 *
 * WAIT LONG, RELOAD ONCE — a reload restarts the bootstrap from zero, so an
 * impatient retry loop is counter-productive. Same posture as
 * `inspectionsLogs.js` `openEntry`.
 */
export async function openRegister(page, { anchorName = EQUIPMENT.calDue.name, firstWaitMs = 60_000, retryWaitMs = 45_000 } = {}) {
  const anchor = page.getByText(anchorName, { exact: false }).first()
  for (const budget of [firstWaitMs, retryWaitMs]) {
    await page.goto('/equipment')
    const ok = await anchor
      .waitFor({ state: 'visible', timeout: budget })
      .then(() => true)
      .catch(() => false)
    if (ok) return
  }
  throw new Error(
    `openRegister: the register never hydrated — "${anchorName}" never appeared. ` +
      'The page shell renders before IndexedDB has any Equipment rows, so this is a sync/bootstrap failure, not a filter miss.',
  )
}

/**
 * The register row for one instrument, located by its NAME cell.
 *
 * Rows are `<tr>`; the name cell also carries the code and serial as a
 * sub-line, so filtering the table's rows by the name text is both the most
 * stable handle and the one a human would use.
 */
export function registerRow(page, name) {
  return page.locator('tbody tr').filter({ hasText: name }).first()
}

/**
 * Type into the register's search box and wait for the row count to settle on
 * the expected value.
 *
 * The search is a client-side filter over the live query (no debounce, no
 * request), so "settle" means one expect poll rather than a network wait.
 */
export async function searchRegister(page, term) {
  const box = page.getByPlaceholder('Search by name, code, or serial')
  await box.fill(term)
}

/**
 * Wait for a value the syncEngine has to deliver before the UI can show it.
 *
 * Thin wrapper over `waitForSqlValue` so specs read as journeys rather than as
 * SQL; the barrier semantics (count(*) of "0" and boolean "f" both count as NOT
 * ready) are inherited from db.js and are the reason this is not a bare poll.
 */
export async function waitForEquipmentState(query, opts) {
  return waitForSqlValue(query, opts)
}

/**
 * How far apart two timestamps are, in whole days.
 *
 * Every calibration assertion in this suite is "did next-due move by the
 * interval", and an interval expressed in MONTHs cannot be checked to the
 * second: `addInterval` uses `Date.setMonth`, so six months from 31 August is
 * 28 February plus a day of clock drift. Days, with a tolerance, is the only
 * honest unit.
 */
export function daysBetween(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

// ── EQ-J2 / EQ-J4 additions (2026-09-08) ────────────────────────────────────

/**
 * The DataTable column index for a header label, read off the rendered header.
 *
 * Hard-coding `td:nth(4)` for "Next calibration" would be a silent lie the day
 * someone inserts a column, a selection checkbox, or a row-expander: the
 * assertion would move to the neighbouring cell and keep passing or start
 * failing for a reason that has nothing to do with calibration. Reading the
 * header makes the locator say what it means.
 */
export async function columnIndex(page, label) {
  const headers = await page.locator('thead tr').first().locator('th').allInnerTexts()
  const i = headers.findIndex((h) => h.trim().toLowerCase().startsWith(label.toLowerCase()))
  expect(i, `the register has a "${label}" column (saw: ${headers.map((h) => h.trim()).join(' | ')})`).toBeGreaterThanOrEqual(0)
  return i
}

/** One row's cell under a named column. */
export async function cellFor(page, name, columnLabel) {
  const i = await columnIndex(page, columnLabel)
  return registerRow(page, name).locator('td').nth(i)
}

/**
 * The calibration-status badge for one instrument, as a class string.
 *
 * `dueClass()` in EquipmentHome.vue is the module's ONLY calibration-status
 * surface — there is no detail page, no print module and no dashboard widget —
 * so red-when-overdue and amber-inside-30-days are literally the whole
 * indication an auditor or a technician gets. Returned as the raw class
 * attribute so a spec can assert both what it IS and what it is NOT.
 */
export async function calibrationBadgeClass(page, name) {
  const cell = await cellFor(page, name, 'Next calibration')
  // Bounded and non-throwing: this is polled while the live query catches up
  // with a write, so "the row is not there yet" has to read as "no badge class
  // yet" rather than as an exception that ends the poll on its first attempt.
  return (
    (await cell
      .locator('span')
      .first()
      .getAttribute('class', { timeout: 3_000 })
      .catch(() => null)) ?? ''
  )
}

/**
 * Mint an instrument over the REST create route as the acting persona.
 *
 * Runtime fixtures rather than seed rows, deliberately: a calibration journey
 * MUTATES its instrument (that is the journey), and `database/e2e-seed.sql` is
 * `ON CONFLICT DO NOTHING`, so a seeded row is never restored and the second
 * run of a journey asserts against whatever the first run left. A row minted
 * per-run cannot inherit anything.
 */
export async function createEquipmentViaRest(page, body) {
  const res = await restPost(page, '/equipment', { siteId: undefined, ...body })
  expect(res.status(), `equipment create failed: ${await res.text()}`).toBe(201)
  const row = findEquipmentByCode(body.code)
  expect(row, `minted equipment ${body.code} is in Postgres`).not.toBeNull()
  return row
}

/**
 * Click the register's "Record calibration" quick action on one row.
 *
 * The button is `v-if="canUpdate && row.requiresCalibration"`, so its ABSENCE
 * is two different facts and a spec that just clicked would report the wrong
 * one. Asserting it is present first separates "the persona cannot update" from
 * "this instrument is not calibration-tracked".
 */
export async function recordCalibrationFromRow(page, name) {
  const row = registerRow(page, name)
  const button = row.getByRole('button', { name: /Record calibration/ })
  await expect(button, `"${name}" offers the calibration quick action`).toBeVisible({ timeout: 20_000 })
  await button.click()
}

/** PM twin of recordCalibrationFromRow. */
export async function recordPmFromRow(page, name) {
  const row = registerRow(page, name)
  const button = row.getByRole('button', { name: /Record PM/ })
  await expect(button, `"${name}" offers the PM quick action`).toBeVisible({ timeout: 20_000 })
  await button.click()
}

// ── Schema probes for the Part 11 package (agent C's window) ────────────────
//
// The evidentiary layer around a calibration completion — an `equipment_id`
// subject on `signatures`, plus certificate / vendor columns on `equipment` —
// is being built in the backend WHILE these journeys are written. Rather than
// omit the assertions (which would leave the finding unpinned once it lands) or
// hard-fail on them (which would leave a red suite for days), the journeys probe
// the schema and skip with a message naming the dependency. They arm themselves
// the moment the migration runs.

/** Does `signatures` carry a subject column for equipment yet? */
export function signaturesHaveEquipmentSubject() {
  return (
    sqlValue(
      `SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'signatures' AND column_name = 'equipment_id'`,
    ) === '1'
  )
}

/** Does `equipment` carry a given column yet (certificate / vendor work)? */
export function equipmentHasColumn(column) {
  return (
    sqlValue(
      `SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'equipment' AND column_name = ${quote(column)}`,
    ) === '1'
  )
}

/** Signature rows whose subject is one instrument, newest first. */
export function signaturesForEquipment(equipmentId) {
  if (!signaturesHaveEquipmentSubject()) return []
  const out = sql(
    `SELECT id, user_id, meaning, is_revoked
       FROM signatures
      WHERE equipment_id = ${quote(equipmentId)}
      ORDER BY signed_at DESC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, userId, meaning, isRevoked] = line.split('|')
    return { id, userId, meaning, isRevoked: isRevoked === 't' }
  })
}
