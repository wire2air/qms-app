// PW-J7 — 🔴 THE headline: moving a user between sites does not change what
// they can reach until they log in again. WRITTEN TO FAIL (first half only).
//
// A site-scoped grant is evaluated against `app.current_user_site_id`, which is
// built from the *session's* snapshot of the user's company membership
// (config/authzPgSettings.js:22-24 reads user.companies[companyId].siteId, and
// that object is serialized into the session at login). Moving the user to a
// different site writes the users row and nothing else — no session
// invalidation, no re-serialization, no revocation — so the GUC keeps carrying
// the value captured at login.
//
// So for as long as the moved user keeps their tab open they retain access to
// their OLD site and are refused their NEW one — access follows the session,
// not the org chart. For a transfer that is an inconvenience. For a
// revocation-by-transfer — the ordinary way an operator is moved off a
// restricted site — it is a control that silently does not take effect.
//
// THE SHAPE OF THIS SPEC IS THE POINT. Its first half must fail and its second
// half must pass. That pairing is what distinguishes "the policy is wrong" from
// "the value is stale", and it is what keeps the fix honest: a remediation that
// invalidates the session correctly turns the first half green WITHOUT changing
// the second. A "fix" that made the second half fail too would be a different
// bug, not a fix.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, SITES, COMPANY_ID } from '../fixtures/cast.js'
import { freshContext, graphql } from '../fixtures/sites.js'
import { sql, sqlValue } from '../fixtures/db.js'

const NC_A = 'e2e9a000-0000-4000-8000-000000000001' // Primary Site
const NC_B = 'e2e9a000-0000-4000-8000-000000000002' // Secondary Site

const READ_NC = `
  query ReadNc($id: UUID!) {
    nonconformance(id: $id) { id title siteId }
  }`

// Each site's probe record sits in that site's OWN department. This is not
// incidental: authz.scope_allowed()'s ladder is cumulative, so a site-scoped
// grant (rank 3) also satisfies the department branch (rank 2). Filing both
// records under one department makes the department branch decide, and the
// whole site-scope probe becomes vacuous — it passes for the wrong reason.
const DEPT = {
  [SITES.primary.id]: 'e2e7d000-0000-4000-8000-000000000001', // Quality  @ Primary
  [SITES.secondary.id]: 'e2e7d000-0000-4000-8000-000000000003', // Operations @ Secondary
}

function seedNc(id, siteId, suffix) {
  sql(`
    INSERT INTO nonconformances
      (id, company_id, nc_number, title, status_id, severity_id, type_id, source_id,
       site_id, department_id, owner_id, detected_at, created_by, updated_by, created_at, updated_at)
    VALUES
      ('${id}', '${COMPANY_ID}', 'E2E-J7-${suffix}', 'E2E J7 probe ${suffix}', 'DRAFT', 'MINOR',
       'PROCESS', 'IN_PROCESS',
       '${siteId}', '${DEPT[siteId]}', '${USERS.owner.id}',
       NOW(), '${USERS.owner.id}', '${USERS.owner.id}', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      site_id = EXCLUDED.site_id, department_id = EXCLUDED.department_id, deleted_at = NULL`)
}

/** Can this context read that NC? RLS filters the row rather than erroring. */
async function canRead(ctx, ncId) {
  const { body, errors } = await graphql(ctx, READ_NC, { id: ncId })
  expect(errors, 'the query itself must be well-formed').toBeNull()
  return body?.data?.nonconformance != null
}

function roamerSite() {
  return sqlValue(`SELECT site_id FROM users WHERE id = '${USERS.siteRoamer.id}'`)
}

// HARNESS NOTE — why each test does its own setup instead of sharing a
// beforeAll. Playwright discards and restarts the worker process after a failed
// test, and a restart re-runs `beforeAll` for the remaining tests in the file.
// In a journey whose whole point is that some tests fail, that silently resets
// the reassignment and rebuilds the "stale" context as a fresh one — so every
// later assertion runs against state that had been rewound, and reports a
// failure with the wrong cause. Each test below therefore establishes and tears
// down everything it needs, and the two halves of the journey are two
// self-contained tests rather than a sequence.

/** Put the roamer at a site and give them that site's department. */
function placeRoamer(siteId) {
  sql(`UPDATE users SET site_id = '${siteId}', department_id = '${DEPT[siteId]}'
         WHERE id = '${USERS.siteRoamer.id}'`)
}

test.describe('PW-J7 · site reassignment does not revoke a live session', () => {
  test.beforeEach(() => {
    seedNc(NC_A, SITES.primary.id, 'A')
    seedNc(NC_B, SITES.secondary.id, 'B')
    placeRoamer(SITES.primary.id)
  })

  test.afterAll(() => {
    sql(`DELETE FROM nonconformances WHERE id IN ('${NC_A}', '${NC_B}')`)
    placeRoamer(SITES.primary.id)
  })

  test('BASELINE · site scope is genuinely enforced here (must pass)', async ({ browser }) => {
    // Unlike `sites` itself (PW-J10), the `nonconformances` binding carries a
    // real site_col, so a site-scoped grant is evaluated per-site rather than
    // collapsing to tenant. Without this, the journey below would be vacuous.
    const ctx = await freshContext(browser, 'siteRoamer')
    expect(roamerSite()).toBe(SITES.primary.id)
    expect(await canRead(ctx, NC_A), 'own-site record is readable').toBe(true)
    expect(await canRead(ctx, NC_B), 'other-site record is refused').toBe(false)
    await ctx.close()
  })

  test('CONTROL · after a re-login the move is fully in effect (must pass today)', async ({
    browser,
  }) => {
    // The half that proves the diagnosis. The policy is correct and the grant is
    // correct — a session minted AFTER the move sees the new reality in both
    // directions. Any real fix must leave this test green exactly as it is; a
    // "fix" that turned this red would be a different bug, not a fix.
    placeRoamer(SITES.secondary.id)

    const fresh = await freshContext(browser, 'siteRoamer')
    expect(roamerSite(), 'the users row was updated').toBe(SITES.secondary.id)
    expect(await canRead(fresh, NC_A), 'old site is refused').toBe(false)
    expect(await canRead(fresh, NC_B), 'new site is allowed').toBe(true)
    await fresh.close()
  })

  test('🔴 a session opened BEFORE the move keeps the old site and is denied the new one (FAILS TODAY)', async ({
    browser,
  }) => {
    // The journey proper, in one test so a worker restart cannot rewind it
    // halfway (see the harness note above).
    //
    // Soft assertions: both directions are separate facts about the same defect
    // and both are worth reporting. A hard assertion on the first would hide
    // the second, and the second is the half that shows this is not only a
    // security gap — the transferred user cannot do their new job either.
    const stale = await freshContext(browser, 'siteRoamer')

    // Sanity: this session starts out correct.
    expect(await canRead(stale, NC_A), 'precondition: reaches the old site').toBe(true)

    // The reassignment. Writes the users row and nothing else — no session
    // invalidation, no re-serialization, no revocation.
    placeRoamer(SITES.secondary.id)
    expect(roamerSite(), 'the database is updated immediately').toBe(SITES.secondary.id)

    expect
      .soft(await canRead(stale, NC_A), 'the moved user must LOSE access to the old site')
      .toBe(false)
    expect
      .soft(await canRead(stale, NC_B), 'the moved user must GAIN access to the new site')
      .toBe(true)

    await stale.close()
  })

  test('the admin UI performs the reassignment', async ({ browser }) => {
    // The path an administrator actually uses. Kept separate from the staleness
    // assertions so a UI regression and an authorization regression cannot be
    // mistaken for one another.
    const admin = await browser.newContext({ storageState: AUTH.owner })
    const page = await admin.newPage()
    await page.goto(`/users/${USERS.siteRoamer.id}`, { waitUntil: 'domcontentloaded' })

    const combo = page
      .getByText('Site', { exact: true })
      .first()
      .locator('xpath=following::*[@role="combobox"][1]')
    await expect(combo).toBeVisible({ timeout: 20_000 })
    await combo.click()
    await page.getByRole('listbox').getByRole('option', { name: SITES.secondary.name }).first().click()

    await expect
      .poll(roamerSite, { timeout: 20_000, message: 'the users row reflects the new site' })
      .toBe(SITES.secondary.id)

    // Read again after a settle window rather than trusting the first poll.
    // Note the Site and Department controls (:271, :281) are the only editable
    // fields on this page with no @update:modelValue="saveUser" handler of
    // their own, so their persistence rides on a different path from their
    // neighbours' — worth pinning that the value stays put, not just appears.
    await page.waitForTimeout(6_000)
    expect(roamerSite(), 'and it stays put').toBe(SITES.secondary.id)

    await admin.close()
  })
})
