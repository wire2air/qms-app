// SA-UI-4 — 🟢 Disable is the kill switch; enable puts it back. (Journey 5.)
//
// Disabling flips `user_status_id` to INACTIVE, and `requireAuthByApiKey`
// refuses a key whose owner is not ACTIVE — so ONE click stops every key on the
// account at once, without touching a single key. That is a very large action
// behind a very small icon button, which is why the warning it carries is part
// of the test rather than decoration.
//
// THE DISTINCTION THE DATABASE HAS TO CONFIRM: disable is NOT revoke. The
// controller's own comment promises "flipping back restores them", and the
// screen promises the same ("its keys will not authenticate ... until it is
// enabled"). If disabling quietly revoked the keys, every assertion in the UI
// would still pass and the promise would be a lie — the integration would come
// back with dead credentials. So `revoked` is read from Postgres on both sides
// of the toggle.
//
// The blocked action is asserted from BOTH states for the usual reason: "Issue
// key is disabled" proves nothing if the button is disabled all the time.
//
// ⚠ IF THIS FAILS WITH "Disabled never appeared", CHECK THE DATABASE BEFORE
// CHECKING THE SCREEN. `handleToggle` awaits the POST and then calls `reload()`
// — and `requireCompanyAccess` commits the write's transaction in
// `res.on('finish')`, i.e. AFTER the response reaches the client. So the re-list
// can be served by a transaction that started before the status change was
// visible, and the row comes back Active with the account already INACTIVE on
// disk: the toggle looks like it did nothing. Observed once on 2026-09-10, the
// same window that produced two 404s on create→issue (see ui-helpers.js). The
// assertion below is deliberately NOT relaxed to tolerate it — a status pill
// that lies about the kill switch is the thing this test exists to catch.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import {
  accountRow,
  apiAs,
  createAccountVia,
  expandRow,
  gotoServiceAccounts,
  issueKeyVia,
  keyRows,
  purge,
  saName,
  specPrefix,
  statusCellFor,
} from './ui-helpers.js'

const SPEC = 'j5'
const PREFIX = specPrefix(SPEC)

const account = saName(SPEC, 'toggle')
const KEY = 'j5 standing connector'
let accountId

test.describe('SA-UI-4 · disable / enable', () => {
  test.use({ storageState: AUTH.intAdmin })

  test.beforeAll(async ({ playwright }) => {
    const api = await apiAs(playwright, AUTH.intAdmin)
    accountId = (await createAccountVia(api, { name: account })).id
    await issueKeyVia(api, accountId, KEY)
    await api.dispose()
  })

  test.afterAll(() => purge(PREFIX))

  test('disabling warns first, blocks issuance, and enabling restores the account', async ({
    page,
  }) => {
    await gotoServiceAccounts(page)
    const row = await expandRow(page, account)

    // ── The baseline half of the control ───────────────────────────────────
    await expect(statusCellFor(page, account)).toContainText('Active')
    await expect(
      row.getByRole('button', { name: 'Issue key' }),
      'issuance is available while the account is active',
    ).toBeEnabled()
    await expect(row.getByText('This account is disabled', { exact: false })).toHaveCount(0)

    // ── The warning, before the click that needs it ────────────────────────
    const toggle = row.getByRole('button', { name: 'Disable service account' })
    await toggle.hover()
    await expect(
      page.getByRole('tooltip'),
      'the control says what it costs — every key on the account, at once',
    ).toContainText('stops every key at once')

    await toggle.click()

    // ── Disabled ───────────────────────────────────────────────────────────
    await expect(statusCellFor(page, account)).toContainText('Disabled', { timeout: 15_000 })
    await expect(
      row.getByRole('button', { name: 'Issue key' }),
      'a key issued now could never authenticate, so the button must not offer it',
    ).toBeDisabled()
    await expect(
      row.getByText('This account is disabled', { exact: false }),
      'and the row explains why, rather than leaving a dead button unexplained',
    ).toBeVisible()

    expect(accountRow(account).statusId, 'the kill switch is a status change').toBe('INACTIVE')
    expect(
      keyRows(accountId)[0].revoked,
      'disable must NOT revoke — the whole promise is that enabling brings the keys back',
    ).toBe(false)

    // ── And back ───────────────────────────────────────────────────────────
    await row.getByRole('button', { name: 'Enable service account' }).click()
    await expect(statusCellFor(page, account)).toContainText('Active', { timeout: 15_000 })
    await expect(row.getByRole('button', { name: 'Issue key' })).toBeEnabled()
    await expect(row.getByText('This account is disabled', { exact: false })).toHaveCount(0)

    expect(accountRow(account).statusId).toBe('ACTIVE')
    expect(keyRows(accountId)[0].revoked, 'the same key, still live').toBe(false)
  })
})
