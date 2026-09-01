// ALD-A4 — the module filter, and the vocabulary it is built on.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DEFECT THIS GUARDS, AND WHY IT SURVIVED SO LONG
//
// F2 in the pack was *"the module filter matches 0.52% of real rows"*. The
// SERVER half was fixed on 2026-08-17: `AuditLogsModulePlugin` dropped its
// hardcoded singular SCREAMING_SNAKE map and now resolves in SQL through
// `audit_canonical_entity_type()` → `audit_entity_types.module_id`. Re-measured
// by 23-hardening-pass: 58,178 of 65,773 rows resolve to a module — 88.45%.
//
// **The client was never updated, and that made the symptom WORSE, not better.**
// `MODULE_OPTIONS` in `src/utils/auditConstants.js` still held fourteen invented
// SCREAMING_SNAKE values (`DOCUMENT_CONTROL`, `USERS_ACCESS`, `ORG`, …), and
// `useAuditLogs.js:33` filters with `modules.includes(log.moduleId)` — an EXACT
// string compare. Every id in `authz.modules` is lowercase (verified: zero rows
// where `id <> lower(id)`). Not one of the fourteen could equal any of them.
// **Selecting any module in the filter returned zero rows**: 0.52% → 0%.
//
// And it presented as a fact about the business, not as a bug. "Filter by
// Document Control → nothing here" reads as *nothing happened in Document
// Control*, on the one screen in the product whose entire job is to say what
// happened. A silent wrong answer on an audit trail is worse than an error.
//
// `MODULE_OPTIONS` was regenerated on 2026-09-01 from the registry itself — 48
// real lowercase `audit_entity_types.module_id` values, labelled with the real
// `authz.modules.name`, restricted to modules that actually carry audit rows.
// This file is the regression net for that, in two layers:
//
//   1. THE VOCABULARY. Every option value is a joinable module id. This is the
//      cheap layer and it is the one that would have caught the original bug on
//      the day it was written — a pure string comparison against the database,
//      needing no browser.
//   2. THE BEHAVIOUR. Selecting one narrows the list to that module's rows and
//      does not empty it. Layer 1 cannot catch a filter wired to the wrong
//      field; layer 2 cannot tell you WHICH value drifted. Both, or neither is
//      worth much.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO-SIDED, BECAUSE "EMPTY" IS THE FAILURE MODE
//
// The bug being guarded produced an EMPTY LIST. So a test that only asserts
// "after filtering, every row is a Department" passes perfectly against it —
// zero rows satisfy every universal claim. The assertions below therefore pin
// BOTH ends every time: a row that must survive the filter (the probe
// department) and a row that must be removed by it (the probe nonconformance,
// module `ncr`), each seeded by this file so neither depends on what the tenant
// happens to hold.
import { test, expect } from '@playwright/test'
import { MODULE_OPTIONS } from '../../src/utils/auditConstants.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sql } from '../fixtures/db.js'
import {
  PROBE_DEPARTMENTS,
  PROBE_NC,
  TRAIL_SYNC_TIMEOUT,
  auditRows,
  dbNow,
  gotoAuditLogs,
  seedProbeDepartment,
  seedProbeNc,
  touchProbeDepartment,
  waitForAuditRow,
} from '../fixtures/auditLogs.js'

const DEPT = PROBE_DEPARTMENTS.primary

/** Every distinct module id the audit registry can actually produce. */
function realModuleIds() {
  const out = sql(`SELECT DISTINCT module_id FROM audit_entity_types WHERE module_id IS NOT NULL`)
  return new Set(out ? out.split('\n') : [])
}

test.describe('ALD-A4 — the module filter', () => {
  test('every dropdown value is a joinable module id (layer 1)', () => {
    expect(MODULE_OPTIONS.length, 'the dropdown is populated').toBeGreaterThan(0)

    // The exact shape of the original defect, stated as a rule rather than as a
    // list of the fourteen bad values — a fifteenth invented label would be the
    // same bug and the list would not catch it.
    const uppercase = MODULE_OPTIONS.filter((m) => m.value !== m.value.toLowerCase())
    expect(
      uppercase.map((m) => m.value),
      'no SCREAMING_SNAKE labels — authz.modules ids are lowercase, and the filter compares exactly',
    ).toEqual([])

    // Joinable to `authz.modules`, which is what makes it an id rather than a
    // label. (A field called `moduleId` that joins to nothing is what the
    // deleted plugin map emitted.)
    const known = new Set(sql(`SELECT id FROM authz.modules`).split('\n'))
    const orphans = MODULE_OPTIONS.filter((m) => !known.has(m.value))
    expect(orphans.map((m) => m.value), 'every option names a real authz.modules row').toEqual([])

    // …and reachable from the audit registry, so the dropdown cannot offer a
    // module that is empty by construction. This is the half that keeps the
    // list honest as `audit_entity_types` grows.
    const producible = realModuleIds()
    const unreachable = MODULE_OPTIONS.filter((m) => !producible.has(m.value))
    expect(
      unreachable.map((m) => m.value),
      'every option is a module some audit entity type actually resolves to',
    ).toEqual([])
  })

  test('selecting a module narrows the list to it, and does not empty it (layer 2)', async ({
    browser,
  }) => {
    test.setTimeout(TRAIL_SYNC_TIMEOUT + 120_000)

    // Both ends of the filter, written by this test so the assertion does not
    // depend on the tenant's traffic:
    //   • a Departments row  → module `departments`, must SURVIVE
    //   • a Nonconformances row → module `ncr`, must be REMOVED
    const since = dbNow()
    seedProbeNc(USERS.owner.id)
    await waitForAuditRow({
      entityType: 'Nonconformances',
      entityId: PROBE_NC.id,
      action: 'CREATE',
      since,
    })
    seedProbeDepartment(DEPT, USERS.owner.id)
    touchProbeDepartment(DEPT, {
      actorId: USERS.owner.id,
      description: `ALD-A4 ${Date.now()}`,
    })
    await waitForAuditRow({
      entityType: 'Departments',
      entityId: DEPT.id,
      action: 'UPDATE',
      since,
    })

    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    try {
      const page = await ctx.newPage()
      await gotoAuditLogs(page)

      const deptRow = auditRows(page).filter({ hasText: DEPT.name })
      const ncRow = auditRows(page).filter({ hasText: PROBE_NC.number })

      // ── Unfiltered. Both must be on screen, or the narrowing below proves
      // nothing: a filter that removes a row which was never there passes.
      await expect(deptRow.first(), 'the departments row is on the unfiltered list').toBeVisible({
        timeout: TRAIL_SYNC_TIMEOUT,
      })
      await expect(ncRow.first(), 'and so is the ncr row').toBeVisible({ timeout: 60_000 })
      const before = await auditRows(page).count()
      expect(before, 'the unfiltered list has rows to narrow').toBeGreaterThan(1)

      // ── Filter to Departments. The dropdown is a multi-select BaseSelect
      // (role=combobox → role=listbox/option); the search box inside it is a
      // second combobox, so the trigger is anchored on its placeholder rather
      // than by position.
      await page.getByRole('combobox').filter({ hasText: 'All modules' }).first().click()
      const listbox = page.getByRole('listbox')
      await expect(listbox).toBeVisible({ timeout: 10_000 })
      await page.getByPlaceholder('Search…').fill('Departments')
      await listbox.getByRole('option', { name: 'Departments', exact: true }).first().click()
      await page.keyboard.press('Escape')

      // ── The regression assertion, in the exact shape the bug broke. With the
      // old SCREAMING_SNAKE values this count was ZERO — `'DEPARTMENTS'` never
      // equalled `'departments'` — and the page said "No audit log entries
      // match your filters".
      await expect(ncRow, 'the ncr row is filtered out').toHaveCount(0, { timeout: 20_000 })
      await expect(deptRow.first(), 'the departments row survives').toBeVisible()

      const after = await auditRows(page).count()
      expect(after, 'the filter selects rows rather than emptying the list').toBeGreaterThan(0)
      expect(after, 'and it is a narrowing, not a no-op').toBeLessThan(before)

      // Universal claim, meaningful only because `after > 0` above.
      // `audit_entity_types` maps exactly one canonical type to `departments`
      // (verified live: `Department`), so every surviving row must be typed
      // Department.
      expect(
        await auditRows(page).filter({ hasText: 'Department' }).count(),
        'every remaining row belongs to the module that was selected',
      ).toBe(after)
    } finally {
      await ctx.close()
    }
  })
})
