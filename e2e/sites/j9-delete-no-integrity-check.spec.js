// PW-J9 — 🔴 Deleting a site: no integrity check, no audit trail, and records
// that referenced it go blank. WRITTEN TO FAIL.
//
// A site is not a lookup value. Users belong to it, departments belong to it,
// and every NCR/document/quality event is filed under one. Deleting it is
// currently a single confirm dialog whose message reads "This cannot be undone"
// — about a soft delete — with:
//
//   * no check for dependents, and no list of what will be affected;
//   * no audit row, because the soft delete only writes deleted_at and the
//     worker's default audit config tracks statusId/stateId/name/title/code,
//     none of which changed (registry.js:105, diffUtils.js:73-75);
//   * downstream records left pointing at a row their UI cannot resolve.
//
// The last one has a specific shape worth pinning, and it is NOT "the consumer
// forgot a fallback". SiteBadgeById renders `<SiteBadge v-if="site" …/>` and
// nothing else, so an unresolvable site renders NOTHING. Its consumers do have
// a fallback — NonconformancesPageId.vue:937-941 is
//
//     <SiteSelectMenu  v-if="isEditable" … />
//     <SiteBadgeById   v-else-if="nc.siteId" … />
//     <BaseText        v-else color="secondary">—</BaseText>
//
// — but the `—` guards the wrong condition. It fires when there is no siteId at
// all; here the column still holds a perfectly good uuid, so the chain takes
// the badge branch and the badge renders empty. The guarded case and the broken
// case are disjoint, which is why this survives a reading of the template.
//
// A reader then cannot distinguish a record whose site was deleted from one
// that never had a site, and cannot recover which site it was without the
// database.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { gotoSites, deleteSiteViaUi } from '../fixtures/sites.js'
import { sql, sqlValue } from '../fixtures/db.js'

const SITE = { id: 'e2e51000-0000-4000-8000-000000000009', name: 'E2E J9 Doomed Site', code: 'J9DOOM' }
const DEPT = 'e2e7d000-0000-4000-8000-000000000009'
const NC = 'e2e9a000-0000-4000-8000-000000000009'

/** Recreate the doomed site and its dependents, undeleted. */
function seedDependents() {
  sql(`INSERT INTO sites (id, company_id, name, code, address, timezone, created_at, updated_at)
       VALUES ('${SITE.id}', '${COMPANY_ID}', '${SITE.name}', '${SITE.code}', '9 Doomed Way', 'America/New_York', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET deleted_at = NULL`)
  sql(`INSERT INTO departments (id, company_id, site_id, name, code, created_at, updated_at)
       VALUES ('${DEPT}', '${COMPANY_ID}', '${SITE.id}', 'E2E J9 Dept', 'J9D', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET deleted_at = NULL`)
  sql(`INSERT INTO nonconformances
         (id, company_id, nc_number, title, status_id, severity_id, type_id, source_id,
          site_id, department_id, owner_id, detected_at, created_by, updated_by, created_at, updated_at)
       VALUES ('${NC}', '${COMPANY_ID}', 'E2E-J9-1', 'E2E J9 dependent record', 'DRAFT', 'MINOR',
          'PROCESS', 'IN_PROCESS', '${SITE.id}', '${DEPT}', '${USERS.owner.id}',
          NOW(), '${USERS.owner.id}', '${USERS.owner.id}', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, site_id = EXCLUDED.site_id`)
}

function siteDeletedAt() {
  return sqlValue(`SELECT coalesce(deleted_at::text, '') FROM sites WHERE id = '${SITE.id}'`)
}

test.describe('PW-J9 · site deletion has no integrity check and no trail', () => {
  // Each test rebuilds its own fixture. Playwright restarts the worker after a
  // failed test and re-runs beforeAll, so shared setup in a spec with expected
  // failures gets silently rewound — see the harness note in j7.
  test.beforeEach(() => seedDependents())

  test.afterAll(() => {
    sql(`DELETE FROM nonconformances WHERE id = '${NC}'`)
    sql(`DELETE FROM departments WHERE id = '${DEPT}'`)
    sql(`DELETE FROM sites WHERE id = '${SITE.id}'`)
  })

  test('CONTROL · before deletion the dependent record shows its site (must pass)', async ({
    browser,
  }) => {
    // Establishes that the field renders at all, so the blank below is caused
    // by the deletion rather than by the page or the permission tier.
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const page = await ctx.newPage()
    await page.goto(`/nonconformances/${NC}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(SITE.name).first()).toBeVisible({ timeout: 30_000 })
    await ctx.close()
  })

  test('🔴 the delete confirm names what depends on the site (FAILS TODAY)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.siteAdmin })
    const page = await ctx.newPage()
    await gotoSites(page)

    const row = page.getByRole('row').filter({ hasText: SITE.name }).first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    await row.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()

    const dialog = page.getByText('Delete Site', { exact: true }).last()
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // A site with a department, a user and an open nonconformance under it must
    // not be removable behind a generic confirm. Either name the dependents or
    // refuse — today it does neither, and says "This cannot be undone" about a
    // soft delete on top.
    await expect(
      page.getByText(/depend|in use|associated|1 department|nonconformance/i).first(),
      'the confirm must disclose what is attached to this site',
    ).toBeVisible({ timeout: 5_000 })

    await ctx.close()
  })

  test('🔴 the deletion is recorded in the audit trail (FAILS TODAY)', async ({ browser }) => {
    const before = Number(sqlValue(`SELECT count(*) FROM audit_logs WHERE entity_id = '${SITE.id}'`))

    const ctx = await browser.newContext({ storageState: AUTH.siteAdmin })
    const page = await ctx.newPage()
    await gotoSites(page)
    await deleteSiteViaUi(page, SITE.name)
    await expect(page.getByRole('cell', { name: SITE.name, exact: true })).toHaveCount(0, {
      timeout: 20_000,
    })
    await ctx.close()

    expect(siteDeletedAt(), 'precondition: the site really was deleted').not.toBe('')

    // Poll — the pipeline is trigger → graphile job → audit_event.js.
    const deadline = Date.now() + 20_000
    let after = before
    while (Date.now() < deadline && after === before) {
      await new Promise((r) => setTimeout(r, 1_500))
      after = Number(sqlValue(`SELECT count(*) FROM audit_logs WHERE entity_id = '${SITE.id}'`))
    }

    expect(
      after,
      'removing a site that users, departments and records are filed under must be auditable',
    ).toBeGreaterThan(before)
  })

  test('🔴 a record filed under the deleted site still shows a site (FAILS TODAY)', async ({
    browser,
  }) => {
    const admin = await browser.newContext({ storageState: AUTH.siteAdmin })
    const adminPage = await admin.newPage()
    await gotoSites(adminPage)
    await deleteSiteViaUi(adminPage, SITE.name)
    await expect(adminPage.getByRole('cell', { name: SITE.name, exact: true })).toHaveCount(0, {
      timeout: 20_000,
    })
    await admin.close()

    // The nonconformance still carries the site_id — nothing repointed or
    // cleared it. Only the UI's ability to resolve it went away.
    expect(sqlValue(`SELECT site_id FROM nonconformances WHERE id = '${NC}'`)).toBe(SITE.id)

    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const page = await ctx.newPage()
    await page.goto(`/nonconformances/${NC}`, { waitUntil: 'domcontentloaded' })
    // Wait for the page itself, so the absence below is a real absence and not
    // an unrendered page.
    await expect(page.getByText('E2E J9 dependent record').first()).toBeVisible({ timeout: 30_000 })

    // Some indication must remain: a placeholder, the raw id, "deleted" — any
    // of them. Today the field renders nothing at all, and a reader cannot tell
    // the record is missing a site from one that never had one.
    // Scope to the field's own container (the label's parent) rather than
    // "the next non-empty element" — an empty field makes that walk past it
    // into an unrelated section and report a confusing value.
    const siteField = page.getByText('Site', { exact: true }).first().locator('xpath=..')
    await expect(
      siteField,
      'a record pointing at a deleted site must not render an empty field',
    ).toHaveText(/—|deleted|unknown|e2e51000/i, { timeout: 10_000 })

    await ctx.close()
  })
})
