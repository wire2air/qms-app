// SA-UI-5 — 🟢 Delete says what it takes with it, and takes it. (Journey 6.)
//
// `deleteServiceAccount` revokes every key first, in the same transaction, and
// the reason is in its comment: "a deleted account whose keys still
// authenticate would be the worst of both worlds". The account is SOFT-deleted,
// so the row vanishing from the list is not evidence of anything — the keys
// could still be live and the screen would look identical.
//
// THE UI CANNOT SHOW THIS AT ALL. Once the account is gone there is no row to
// expand, no keys panel, no endpoint that will answer for it. Every claim the
// confirm dialog makes about the keys is therefore checked in Postgres, which
// is the only place the answer exists.
//
// THE CONTROL is a second account this spec also owns. "The row is gone" is
// satisfied by a list that failed to render; the survivor renders through the
// same reload, and its key stays unrevoked through the same transaction — so
// the deletion is scoped to the account that was named.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import {
  accountRow,
  apiAs,
  createAccountVia,
  gotoServiceAccounts,
  issueKeyVia,
  keyRows,
  purge,
  rowFor,
  saName,
  specPrefix,
} from './ui-helpers.js'

const SPEC = 'j6'
const PREFIX = specPrefix(SPEC)

const doomed = saName(SPEC, 'doomed')
const survivor = saName(SPEC, 'survivor')
let doomedId
let survivorId

test.describe('SA-UI-5 · delete', () => {
  test.use({ storageState: AUTH.intAdmin })

  test.beforeAll(async ({ playwright }) => {
    const api = await apiAs(playwright, AUTH.intAdmin)
    doomedId = (await createAccountVia(api, { name: doomed })).id
    survivorId = (await createAccountVia(api, { name: survivor })).id
    await issueKeyVia(api, doomedId, 'j6 doomed key')
    await issueKeyVia(api, survivorId, 'j6 survivor key')
    await api.dispose()
  })

  test.afterAll(() => purge(PREFIX))

  test('the confirm dialog promises every key is revoked, and Postgres agrees', async ({
    page,
  }) => {
    await gotoServiceAccounts(page)
    const row = rowFor(page, doomed)
    await expect(row).toBeVisible({ timeout: 15_000 })

    // The premise, asserted rather than assumed — otherwise "the keys are
    // revoked afterwards" is satisfied by keys that were never live.
    expect(keyRows(doomedId).map((k) => k.revoked)).toEqual([false])

    await row.getByRole('button', { name: 'Delete service account' }).click()

    const confirm = page.getByRole('dialog')
    await expect(confirm.getByText('Delete service account?')).toBeVisible()
    await expect(
      confirm,
      'the dialog names the real consequence: it is the KEYS that stop, not just a row that disappears',
    ).toContainText('Every API key')
    await expect(confirm).toContainText('revoked immediately')
    await expect(confirm).toContainText(doomed)
    await expect(confirm).toContainText('cannot be undone')

    await confirm.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(row, 'the account is gone from the list').toHaveCount(0, { timeout: 15_000 })
    await expect(
      rowFor(page, survivor),
      'CONTROL — the list still renders, so the absence above is a deletion',
    ).toBeVisible()

    // ── The half only the database can answer ──────────────────────────────
    expect(accountRow(doomed).deleted, 'the account row is soft-deleted').toBe(true)
    const revoked = keyRows(doomedId)
    expect(revoked.length, 'its keys are still on disk — revoked, not erased').toBeGreaterThan(0)
    expect(
      revoked.every((k) => k.revoked),
      'every key belonging to the deleted account is revoked',
    ).toBe(true)

    expect(
      keyRows(survivorId).every((k) => !k.revoked),
      'CONTROL — the other account keeps its live key through the same transaction',
    ).toBe(true)
    expect(accountRow(survivor).deleted).toBe(false)

    // A reload is the honest test of "gone": the list is re-fetched from the
    // server rather than spliced locally.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(rowFor(page, survivor)).toBeVisible({ timeout: 15_000 })
    await expect(rowFor(page, doomed)).toHaveCount(0)
  })
})
