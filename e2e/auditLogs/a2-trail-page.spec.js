// ALD-A2 — /audit-logs in a browser: who gets the page, and who gets bounced.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS ADDS OVER ALD-A1
//
// A1 proves the POLICY. This proves the PRODUCT, and the two can disagree in
// both directions — which is not a hypothetical here. From 2026-08-04 to
// 2026-09-01 they did: `permissionGuard.js` and `MainSidebar.vue` had been
// gating this page on `audit_trail:read` for four weeks while
// `audit_log_select_rls` gated the rows on `document_control:read`. The UI hid
// the door; the door was open. 23-hardening-pass §10.1 calls that out as "an
// irony worth recording". A suite that tests only one layer records it as
// nothing at all.
//
// So both halves are asserted, on the same personas, in the same run:
//   • the ROUTE guard   — `permissionGuard.js:79` → `/no-access`
//   • the ROW gate      — `audit_log_select_rls` → rendered rows, or none
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE POSITIVE HALF IS THE EXPENSIVE ONE, AND WHY IT IS NOT OPTIONAL
//
// A DENIED persona is instant: the guard redirects before anything loads. A
// GRANTED persona pays a full syncEngine bootstrap of ~64k audit rows first.
// That asymmetry is a trap, because the cheap half is the half that passes
// against a broken product: "Carla was redirected" is equally true when the
// route table is empty, when the app fails to boot, and when the seed never
// ran. Only Ava seeing real rows in the same run tells them apart.
//
// MEASURED (2026-09-01) — the newest rows arrive FIRST, which is what makes the
// positive half affordable at all. `GraphQLSchemaGenerator` emits
// `CREATED_AT_DESC` for every model with a `syncField` and `bootstrapModel()`
// passes it as `orderBy`, so page 1 of the walk is the newest 100 rows, not a
// random 100. The page's own live query then takes `.limit(200)` off IDB.
// (`fixtures/auditLogs.js` used to claim the opposite; the note there is
// corrected.)
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import {
  PROBE_DEPARTMENTS,
  TRAIL_SYNC_TIMEOUT,
  auditRows,
  dbNow,
  gotoAuditLogs,
  seedProbeDepartment,
  trailRowsInTable,
  waitForAuditRow,
} from '../fixtures/auditLogs.js'

const DEPT = PROBE_DEPARTMENTS.primary

test.describe('ALD-A2 — the trail page', () => {
  test.beforeAll(async () => {
    // Something to see. Without a row written by THIS run, "the page shows
    // rows" is an assertion about the E2E tenant's history rather than about
    // the page, and it would keep passing after the trail stopped recording.
    const since = dbNow()
    seedProbeDepartment(DEPT, USERS.owner.id)
    await waitForAuditRow({ entityType: 'Departments', entityId: DEPT.id, action: 'CREATE', since })
    expect(trailRowsInTable(`entity_id = '${DEPT.id}'`), 'the probe row exists').toBeGreaterThan(0)
  })

  test('a granted persona reads the page; a denied persona never reaches it', async ({
    browser,
  }) => {
    test.setTimeout(TRAIL_SYNC_TIMEOUT + 60_000)

    // ── The positive half. Ava holds `audit_trail:read` and nothing that would
    // let her reach the trail by accident.
    const granted = await browser.newContext({ storageState: AUTH.auditor })
    try {
      const page = await granted.newPage()
      await gotoAuditLogs(page)

      expect(page.url(), 'the guard lets an audit_trail holder through').toContain('/audit-logs')
      // The filter bar, not the subtitle: `BaseListLayout` takes a `subtitle`
      // prop and does not render it anywhere (the title alone is teleported to
      // the top bar), so an assertion on that string tests the layout's prop
      // list rather than the page. The filter bar is chrome that is genuinely on
      // screen whether the list is full or empty, which is what "the page
      // rendered, not a shell" has to mean here.
      await expect(
        page.getByText('Filters', { exact: true }),
        'the page itself rendered, not a shell',
      ).toBeVisible({ timeout: 30_000 })

      // The rows. This is the assertion the whole file is built around: a
      // number greater than zero, produced by RLS admitting them.
      await expect(auditRows(page).first(), 'the trail renders entries').toBeVisible({
        timeout: TRAIL_SYNC_TIMEOUT,
      })
      expect(await auditRows(page).count()).toBeGreaterThan(0)
    } finally {
      await granted.close()
    }

    // ── The negative half. Carla holds the FULL Document Control CRUD set —
    // the permission that used to carry this page — and is bounced at the
    // router before a single row is fetched.
    const denied = await browser.newContext({ storageState: AUTH.controller })
    try {
      const page = await denied.newPage()
      await gotoAuditLogs(page)
      await page.waitForURL(/\/no-access/, { timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
      expect(
        await auditRows(page).count(),
        'and no audit row is rendered anywhere on the way',
      ).toBe(0)
    } finally {
      await denied.close()
    }
  })

  test('the floor: a user with no role at all is bounced too', async ({ browser }) => {
    // Noah holds no role. He is not an interesting probe on his own — he is the
    // control that says the redirect above is a PERMISSION result and not the
    // route simply being broken for everybody.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    try {
      const page = await ctx.newPage()
      await gotoAuditLogs(page)
      await page.waitForURL(/\/no-access/, { timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
    } finally {
      await ctx.close()
    }
  })

  test('the owner bypass is live — she holds no audit_trail grant and reads it anyway', async ({
    browser,
  }) => {
    test.setTimeout(TRAIL_SYNC_TIMEOUT + 60_000)

    // `app.current_user_is_owner` short-circuits the policy before
    // `has_permission` is consulted, and `isAllowed()` short-circuits the router
    // guard the same way. e2e-seed.sql §35 grants Olivia nothing, deliberately:
    // she is the positive control that distinguishes "the permission denied it"
    // from "the table is empty", and she is the ONE persona `sqlAsAppUser`
    // cannot probe (it pins the owner GUC to 'false'), so this is the only
    // place that arm is exercised at all.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    try {
      const page = await ctx.newPage()
      await gotoAuditLogs(page)
      expect(page.url()).toContain('/audit-logs')
      await expect(auditRows(page).first(), 'the owner reads the trail').toBeVisible({
        timeout: TRAIL_SYNC_TIMEOUT,
      })
    } finally {
      await ctx.close()
    }
  })
})
