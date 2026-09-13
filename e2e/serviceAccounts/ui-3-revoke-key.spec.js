// SA-UI-3 — 🟢 Revoke a key from the row, and it stays revoked. (Journey 4.)
//
// Revocation is one-way by design: `revokeServiceAccountKey` only ever writes
// `revoked: true`, and the row renders its Revoke control under
// `v-if="!key.revoked"`. There is no un-revoke anywhere in the product, and the
// confirm dialog promises exactly that ("Revoking cannot be undone — issue a
// new key instead"). A test that only checked the pill turned red would pass
// against a build that also offered to turn it back.
//
// TWO KEYS, ONE REVOKED. The second is the control and it is doing real work:
// "row A has no Revoke button" is a much weaker claim on its own — a panel that
// failed to render its buttons at all would satisfy it. Row B keeps its button
// through the same render, so the absence on A is revocation rather than
// breakage, and the change is scoped to the key that was named.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import {
  apiAs,
  createAccountVia,
  expandRow,
  gotoServiceAccounts,
  issueKeyVia,
  keyRows,
  purge,
  saName,
  specPrefix,
} from './ui-helpers.js'

const SPEC = 'j4'
const PREFIX = specPrefix(SPEC)

const account = saName(SPEC, 'revoke')
const DOOMED = 'j4 doomed connector'
const SURVIVOR = 'j4 surviving connector'
let accountId

test.describe('SA-UI-3 · revoke', () => {
  test.use({ storageState: AUTH.intAdmin })

  test.beforeAll(async ({ playwright }) => {
    const api = await apiAs(playwright, AUTH.intAdmin)
    accountId = (await createAccountVia(api, { name: account })).id
    await issueKeyVia(api, accountId, SURVIVOR)
    await issueKeyVia(api, accountId, DOOMED)
    await api.dispose()
  })

  test.afterAll(() => purge(PREFIX))

  test('revoking one key marks it Revoked, leaves the other alone, and cannot be undone', async ({
    page,
  }) => {
    await gotoServiceAccounts(page)
    const row = await expandRow(page, account)

    const doomed = keyRowFor(page, DOOMED)
    const survivor = keyRowFor(page, SURVIVOR)
    await expect(doomed).toBeVisible({ timeout: 15_000 })
    await expect(doomed, 'both keys start usable').toContainText('Active')
    await expect(survivor).toContainText('Active')

    await doomed.getByRole('button', { name: 'Revoke' }).click()

    const confirm = page.getByRole('dialog')
    await expect(confirm.getByText('Revoke this key?')).toBeVisible()
    await expect(
      confirm,
      'the dialog states the consequence AND that it is one-way, before the click that does it',
    ).toContainText('stops working immediately')
    await expect(confirm).toContainText('cannot be undone')
    await confirm.getByRole('button', { name: 'Revoke', exact: true }).click()

    await expect(doomed).toContainText('Revoked', { timeout: 15_000 })
    await expect(
      doomed.getByRole('button', { name: 'Revoke' }),
      'a revoked key offers no further action — there is no un-revoke',
    ).toHaveCount(0)

    // CONTROL — one variable apart: the same panel, the same render, the other
    // key. Its button is still there, so the absence above is revocation.
    await expect(survivor, 'the other key is untouched').toContainText('Active')
    await expect(survivor.getByRole('button', { name: 'Revoke' })).toBeVisible()

    // Postgres, not the pill.
    const rows = Object.fromEntries(keyRows(accountId).map((k) => [k.name, k]))
    expect(rows[DOOMED].revoked, 'the revoked key is revoked on disk').toBe(true)
    expect(rows[SURVIVOR].revoked, 'and only that one').toBe(false)

    // A reload is where an "un-revoke" would have to live if it existed: the
    // row is rebuilt from the server, and it must come back the same way.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expandRow(page, account)
    await expect(keyRowFor(page, DOOMED)).toContainText('Revoked', { timeout: 15_000 })
    await expect(keyRowFor(page, DOOMED).getByRole('button', { name: 'Revoke' })).toHaveCount(0)
    await expect(
      row.getByRole('button', { name: /restore|re-?enable|un-?revoke/i }),
      'nothing in the row offers to reverse it',
    ).toHaveCount(0)
  })
})

/**
 * One key's row inside the expanded panel. Same reasoning as `rowFor`: the
 * innermost div containing the key's (unique) name IS the key row, because the
 * name sits in a span that is that div's own child.
 */
function keyRowFor(page, keyName) {
  return page
    .locator('div')
    .filter({ has: page.getByText(keyName, { exact: true }) })
    .last()
}
