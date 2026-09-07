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
  sql(`DELETE FROM equipment WHERE code = ${quote(code)}`)
}

/** Purge every row a previous run of this suite minted (codes are prefixed). */
export function purgeMintedEquipment() {
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
    return json?.error?.message ?? json?.message ?? json?.error ?? body
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
