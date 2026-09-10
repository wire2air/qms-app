// SA-UI-1 — 🟢 Create a service account, and issue its one and only secret.
//
// Journeys 1 and 2 of the admin-UI brief, in one file because the second needs
// what the first makes and re-creating it would double the slowest step.
//
// WHAT MAKES THE SECOND HALF WORTH HAVING is not that a key appears — it is that
// the plaintext exists for exactly one dialog. `issueServiceAccountKey` persists
// only `sha256(rawKey)` (controllers/serviceAccounts.js) and hands the plaintext
// back once; every later read goes through `presentKey`, which never selects
// `key_hash` at all. So this asserts three things a screenshot could not:
//   · the field is `type="password"` before anyone touches it,
//   · the reveal toggle actually flips the native input type,
//   · after Done, the string is in NO input value and NO rendered text — checked
//     with a DOM sweep, because an <input>'s value is not text content and
//     `toContainText` would sail straight past the one place it actually lives.
// Plus the database check that closes it: `key_hash` equals sha256(secret), so
// the plaintext genuinely is not stored.
//
// ── THE ROLE IS NOT THE ONE THE BRIEF NAMED, and that is a finding ───────────
// The brief said "create it with the E2E Reviewer role". Two measurements say
// otherwise and both are pinned below:
//   1. E2E Reviewer holds 18 permissions, not `document_control:read` alone
//      (§38 of the seed backfills a read on every module a role touches).
//      intAdmin holds 5. Granting it is an ESCALATION and the server refuses —
//      see ui-7.
//   2. The picker could not offer it anyway: `roles_sel` admits a role to a
//      reader who is an owner, holds `role_permission_management:read`, or is
//      assigned the role. intAdmin is none of the first two.
// So the role a least-privilege integration admin can actually grant is their
// own — E2E Integration Admin — and that is what J1 uses. The consequence for
// the LIST is its own test at the bottom.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import {
  ROLE_INTEGRATION_ADMIN_NAME,
  accountRow,
  createViaDialog,
  expandRow,
  gotoServiceAccounts,
  keyRows,
  purge,
  redact,
  rowFor,
  saName,
  secretIsRecoverable,
  sha256,
  specPrefix,
  statusCellFor,
} from './ui-helpers.js'

const SPEC = 'j1'
const PREFIX = specPrefix(SPEC)

test.describe('SA-UI-1 · create, and the secret shown once', () => {
  test.use({ storageState: AUTH.intAdmin })

  // This spec's prefix only. A DELETE across every service account in the
  // tenant would be the obvious thing to write here and is exactly the trap
  // §39 of the seed warns about — the `api-` half runs against the same tenant.
  test.afterAll(() => purge(PREFIX))

  test('creates an account with a name, description and a role, and lists it Active', async ({
    page,
  }) => {
    const name = saName(SPEC, 'create')
    const description = 'Nightly ERP supplier master sync'

    await gotoServiceAccounts(page)
    await createViaDialog(page, { name, description, roleName: ROLE_INTEGRATION_ADMIN_NAME })

    const row = rowFor(page, name)
    await expect(row, 'the new account appears in the list').toBeVisible({ timeout: 15_000 })
    await expect(row).toContainText(description)
    await expect(
      statusCellFor(page, name),
      'a freshly created account is Active — its keys would authenticate',
    ).toContainText('Active')
    await expect(
      row.getByText(ROLE_INTEGRATION_ADMIN_NAME, { exact: true }),
      'the role badge names the authority the account carries',
    ).toBeVisible()

    // On disk it is a `users` row that CANNOT sign in. The UI says "machine
    // identity"; only the database can show that the claim is structural — no
    // email for getUserFromEmail to match, no password to check.
    const stored = accountRow(name)
    expect(stored, 'the account exists in Postgres').not.toBeNull()
    expect(stored.statusId).toBe('ACTIVE')
    expect(stored.noEmail, 'a service account has no email, so there is no login surface').toBe(
      true,
    )
    expect(stored.noPassword, 'and no password').toBe(true)
  })

  test('issues a key whose secret is shown once, masked, with a working reveal', async ({
    page,
  }) => {
    const name = saName(SPEC, 'issue')
    const keyName = 'SAP production connector'

    await gotoServiceAccounts(page)
    await createViaDialog(page, { name, roleName: ROLE_INTEGRATION_ADMIN_NAME })
    await expect(rowFor(page, name)).toBeVisible({ timeout: 15_000 })

    const row = await expandRow(page, name)
    await expect(
      row.getByText('No keys yet.', { exact: false }),
      'a new account owns nothing yet',
    ).toBeVisible()

    await row.getByRole('button', { name: 'Issue key' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Key Name', { exact: true }).fill(keyName)
    await dialog.getByRole('button', { name: 'Issue Key', exact: true }).click()

    // ── The one moment the plaintext exists ────────────────────────────────
    await expect(dialog.getByText('Key Issued')).toBeVisible({ timeout: 15_000 })
    const secretField = dialog.locator('input')
    await expect(secretField, 'the issued dialog shows exactly one field').toHaveCount(1)
    await expect(
      secretField,
      'the secret is masked before anyone asks to see it — a screen share is the default case',
    ).toHaveAttribute('type', 'password')

    const secret = await secretField.inputValue()
    expect(secret, `issued secret ${redact(secret)}`).toMatch(/^sk_[0-9a-f]{64}$/)

    await expect(
      dialog.getByText('cannot be shown again', { exact: false }),
      'the dialog says so, because the user has one chance to act on it',
    ).toBeVisible()

    // Reveal → hide → reveal. The toggle must move the NATIVE type, not just an
    // icon: a masked-looking field that is really `type="text"` is no masking
    // at all, and the reverse is a toggle that does nothing.
    await dialog.getByRole('button', { name: 'Reveal key' }).click()
    await expect(secretField).toHaveAttribute('type', 'text')
    await dialog.getByRole('button', { name: 'Hide key' }).click()
    await expect(secretField).toHaveAttribute('type', 'password')

    await expect(
      dialog.getByRole('button', { name: 'Copy key to clipboard' }),
      'copying is the only realistic way to get 67 characters out of here intact',
    ).toBeEnabled()

    await dialog.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(dialog).toHaveCount(0)

    // ── And it is gone ─────────────────────────────────────────────────────
    await expect(
      row.getByText(keyName, { exact: true }),
      'the key itself is listed — metadata survives, the credential does not',
    ).toBeVisible()
    expect(
      await secretIsRecoverable(page, secret),
      `the secret must not survive the dialog closing (${redact(secret)})`,
    ).toBe(false)

    // Re-open the issue dialog: a fresh form, not the previous result.
    await row.getByRole('button', { name: 'Issue key' }).click()
    await expect(page.getByRole('dialog').getByText('Issue API Key')).toBeVisible()
    expect(
      await secretIsRecoverable(page, secret),
      're-opening the dialog must not resurrect the previous secret',
    ).toBe(false)
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

    // A reload is the harder case — nothing may re-fetch it, because nothing
    // has it. `presentKey` never selects `key_hash`; only its digest is stored.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expandRow(page, name)
    expect(
      await secretIsRecoverable(page, secret),
      'and a reload must not either — the server has no plaintext to serve',
    ).toBe(false)

    const stored = accountRow(name)
    const keys = keyRows(stored.id)
    expect(keys, 'exactly one key was issued').toHaveLength(1)
    expect(keys[0].name).toBe(keyName)
    expect(keys[0].revoked).toBe(false)
    expect(
      keys[0].keyHash,
      'Postgres holds the digest, never the credential — which is WHY it can only be shown once',
    ).toBe(sha256(secret))
  })
})
