// SA-UI-7 — 🟢 "You cannot grant what you do not hold", as a user meets it.
// (Journey 8.)
//
// `assertNoPrivilegeEscalation` is the rule that stops a service account being
// a total-takeover primitive: without it, anyone holding `api_integrations:create`
// mints a machine identity with authority they were never granted, then acts
// through a credential — no session, no MFA, and an audit trail naming the
// integration rather than them. The integration suite proves the rule. What only
// a browser can prove is that a person MEETS it: refused, in words, naming what
// they lack, with the form still open to fix.
//
// ── THE BRIEF'S DOOR IS SHUT; THIS USES THE ONE THAT IS OPEN ────────────────
// The brief said: as intAdmin, create an account holding E2E Author → refused;
// CONTROL, the same flow with E2E Reviewer → succeeds. Three measurements
// against the live stack say that cannot be driven from this screen:
//
//   1. `roles_sel` (database/rls.sql) admits a role to a reader who is an owner,
//      holds `role_permission_management:read`, or IS ASSIGNED THE ROLE.
//      intAdmin is none of the first two, so `db.Role.where('statusId','ACTIVE')`
//      returns ONE row and the create dialog's picker offers ONE option — its
//      own. A role the picker will not show cannot be submitted from it.
//   2. That one option is also the only role intAdmin may legitimately grant, so
//      the create path cannot produce a refusal at all: every selectable role is
//      an accept.
//   3. E2E Reviewer is not the accept case the brief expected either. It carries
//      18 permissions (capa:update, ncr:update, change_control:update,
//      reports_dashboards:manage, document_control:manage_access …) against
//      intAdmin's 5, so granting it is an escalation and is refused.
//
// The guard has a SECOND DOOR, and the controller flags it as deliberate:
// issuing a key re-runs the check against the account's CURRENT roles, because
// "a powerful service account already exists (created by an owner, say), and
// anyone holding api_integrations:create mints a key against it and now acts
// with its authority." That door is fully drivable from this screen, so that is
// where the refusal is exercised — the same guard, the same message, the path a
// real escalation would actually take.
//
// CONTROL, one variable apart: the same persona, the same screen, the same
// button, on an account whose roles intAdmin DOES hold. It succeeds. Without it,
// a dialog that failed for any reason at all — a typo in the route, a 500 —
// would read as a working security control.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import {
  ROLE_AUTHOR,
  ROLE_AUTHOR_NAME,
  ROLE_INTEGRATION_ADMIN,
  ROLE_INTEGRATION_ADMIN_NAME,
  ROLE_REVIEWER_NAME,
  accountRow,
  apiAs,
  createAccountVia,
  expandRow,
  gotoServiceAccounts,
  keyRows,
  purge,
  redact,
  rowFor,
  saName,
  specPrefix,
} from './ui-helpers.js'

const SPEC = 'j8'
const PREFIX = specPrefix(SPEC)

// Made BY THE OWNER, necessarily: intAdmin cannot create either of these — the
// first because the guard would refuse it, the second because the picker would
// not offer the role. Which is the same RLS read as finding F-2 below, seen
// from the write side.
const powerful = saName(SPEC, 'powerful')
const matched = saName(SPEC, 'matched')
let powerfulId
let matchedId

test.describe('SA-UI-7 · the escalation guard, in the UI', () => {
  test.use({ storageState: AUTH.intAdmin })

  test.beforeAll(async ({ playwright }) => {
    const api = await apiAs(playwright, AUTH.owner)
    powerfulId = (await createAccountVia(api, { name: powerful, roleIds: [ROLE_AUTHOR] })).id
    matchedId = (await createAccountVia(api, { name: matched, roleIds: [ROLE_INTEGRATION_ADMIN] }))
      .id
    await api.dispose()
  })

  test.afterAll(() => purge(PREFIX))

  test('issuing a key on an account more powerful than you is refused, and says which permissions', async ({
    page,
  }) => {
    await gotoServiceAccounts(page)
    const row = await expandRow(page, powerful)

    // Premise: the account really does carry authority intAdmin lacks.
    expect(accountRow(powerful).statusId, 'the refusal must not be "it is disabled"').toBe('ACTIVE')

    await row.getByRole('button', { name: 'Issue key' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Key Name', { exact: true }).fill('j8 escalation attempt')

    const refusal = page.waitForResponse(
      (r) =>
        /\/service-accounts\/[0-9a-f-]{36}\/keys$/.test(r.url()) && r.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Issue Key', exact: true }).click()

    const res = await refusal
    expect(res.status(), 'the server refuses the issuance outright').toBe(403)
    const body = await res.json().catch(() => ({}))
    const message = body?.error?.message ?? body?.message ?? ''
    expect(message).toContain('cannot be granted permissions you do not hold yourself')
    expect(
      message,
      'and names them, so the fix is one round trip rather than a guessing game',
    ).toContain('document_control:create')
    expect(message).toContain('document_control:update')

    // The user's side of the same refusal. Asserted immediately after the
    // response so the 3s auto-dismiss cannot outrun the poll.
    const alert = page.getByRole('alert')
    await expect(alert, 'the refusal reaches the person, not just the network tab').toContainText(
      'cannot be granted permissions you do not hold yourself',
    )
    await expect(alert).toContainText('document_control:create')

    // The form stays open on the failure — there is nothing to redo, only a
    // decision to abandon, and a dialog that closed would leave the user
    // guessing whether anything happened.
    await expect(dialog.getByText('Issue API Key')).toBeVisible()
    await expect(
      dialog.locator('input[type="password"]'),
      'no secret is shown, because none was minted',
    ).toHaveCount(0)

    expect(keyRows(powerfulId), 'and nothing reached api_keys').toEqual([])
  })

  test('CONTROL · the same button, on an account whose authority you do hold, succeeds', async ({
    page,
  }) => {
    // One variable apart from the test above: the roles the account carries.
    // Same persona, same screen, same dialog, same submit.
    await gotoServiceAccounts(page)
    const row = await expandRow(page, matched)

    await row.getByRole('button', { name: 'Issue key' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Key Name', { exact: true }).fill('j8 permitted key')
    await dialog.getByRole('button', { name: 'Issue Key', exact: true }).click()

    await expect(dialog.getByText('Key Issued')).toBeVisible({ timeout: 15_000 })
    const secret = await dialog.locator('input').first().inputValue()
    expect(secret, `issued ${redact(secret)}`).toMatch(/^sk_[0-9a-f]{64}$/)
    await dialog.getByRole('button', { name: 'Done', exact: true }).click()

    expect(keyRows(matchedId).map((k) => k.name)).toEqual(['j8 permitted key'])
  })

  test('the create dialog can only ever offer roles the creator personally holds', async ({
    page,
  }) => {
    // Pinned rather than fixed, because it is why the refusal above had to be
    // reached through key issuance. This is not the escalation guard doing its
    // job — the guard compares PERMISSIONS, and would happily accept a role
    // whose permissions the creator holds without holding the role itself. This
    // is `roles_sel` withholding the rows, which is a different and blunter
    // rule, and it lands on the exact persona the module is designed for.
    await gotoServiceAccounts(page)
    await page.getByRole('button', { name: 'New Service Account' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('combobox').first().click()

    // The menu is driven by `db.Role.where('statusId','ACTIVE')` — IndexedDB, not
    // the network — so on a cold context this waits on the syncEngine bootstrap
    // rather than on a render. The default 5s is not enough in a full run.
    await expect(
      page.getByRole('option', { name: ROLE_INTEGRATION_ADMIN_NAME, exact: true }),
      'intAdmin is assigned this one, so roles_sel admits it',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('option', { name: ROLE_AUTHOR_NAME, exact: true }),
      'and no other role in the tenant is offered at all',
    ).toHaveCount(0)
    await expect(page.getByRole('option', { name: ROLE_REVIEWER_NAME, exact: true })).toHaveCount(0)
  })

  test('🔴 the list does not show which roles a service account holds (FAILS TODAY)', async ({
    page,
  }) => {
    // FINDING F-2. `RoleBadgeById` renders under `v-if="role"` over
    // `db.Role.findByPk(roleId)`, and roles the viewer cannot read are not in
    // IndexedDB — so the badges are not wrong, or raw uuids, or a placeholder.
    // They are ABSENT. The `powerful` account carries E2E Author, 50 permissions
    // wide, and the screen whose entire purpose is "what may this integration
    // do" renders that as blank space to the very administrator who owns the
    // screen. The API already returns `roleIds`; only the name lookup is gated.
    //
    // The owner CONTROL below renders the same badge for the same account, which
    // is what places the cause on the reader rather than on the row.
    await gotoServiceAccounts(page)

    // CONTROL, in the same persona and the same list: `matched` carries
    // E2E Integration Admin, which intAdmin IS assigned and may therefore read.
    // Its badge renders — so `Role` is in this context's IndexedDB, the
    // component works, and the absence below is about WHICH role rather than
    // about a cold sync or a broken badge.
    await expect(
      rowFor(page, matched).getByText(ROLE_INTEGRATION_ADMIN_NAME, { exact: true }),
      'CONTROL — a role this reader may read does render its badge',
    ).toBeVisible({ timeout: 30_000 })

    const row = rowFor(page, powerful)
    await expect(row).toBeVisible()
    await expect(
      row.getByText(ROLE_AUTHOR_NAME, { exact: true }),
      'an integration admin must be able to see what authority an account carries',
    ).toBeVisible()
  })

  test.describe('CONTROL · owner — the same rows, a reader who may read roles', () => {
    test.use({ storageState: AUTH.owner })

    test('the picker offers the whole tenant, and the badge renders', async ({ page }) => {
      await gotoServiceAccounts(page)

      await expect(
        rowFor(page, powerful).getByText(ROLE_AUTHOR_NAME, { exact: true }),
        'CONTROL for F-2 — same account, same component, a reader roles_sel admits',
      ).toBeVisible({ timeout: 30_000 })

      await page.getByRole('button', { name: 'New Service Account' }).first().click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('combobox').first().click()
      // 44 active roles in the tenant; the menu is searchable, so narrow rather
      // than scroll.
      await page.getByPlaceholder('Search…').fill(ROLE_AUTHOR_NAME)
      await expect(
        page.getByRole('option', { name: ROLE_AUTHOR_NAME, exact: true }),
        'CONTROL for the picker — the dialog can render these options; the persona is the difference',
        // Same 30s the badge assertion above gets, and for the same reason: the
        // picker reads roles out of IndexedDB, so it is waiting on a syncEngine
        // bootstrap of the tenant's 44 roles that this test does not control.
        // Without it this was the one test that failed under a full-suite run
        // and passed in isolation — a timing artifact, not a finding.
      ).toBeVisible({ timeout: 30_000 })
    })
  })
})
