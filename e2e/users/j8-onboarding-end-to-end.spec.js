// USER-J8 — 🟢 Onboarding, end to end: create → invite → email → accept → active.
//
// THE POINT OF THIS FILE. Every other spec in this directory is a security
// probe. Until this one, the module's MAIN PATH — the reason Users exists — had
// no automated coverage of any kind: not integration, not route, not E2E. The
// security cluster was 6/6 and everything functional was 0. A suite shaped like
// that will happily stay green while "create a user" is broken.
//
// It is also the one journey that crosses every service in the stack, which is
// why it is worth doing as one test rather than four:
//
//   frontend  the Create User dialog writes through the syncEngine (GraphQL),
//             then calls the invite action RPC over REST
//   api       POST /v1/services/users/:id/invite enqueues the mail job
//   postgres  the audit trigger fires on the users INSERT
//   worker    send_invitation_email writes invitation_tokens and sends mail
//   api       POST /v1/auth/invitation/accept consumes the token, sets the
//             password, flips the row to ACTIVE
//
// A break anywhere in that chain shows up here and nowhere else.
//
// THE TOKEN IS READ OUT OF THE EMAIL, not minted like USER-J3 does. J3 is
// asking a security question and needs to control both halves of the token; J8
// is asking whether onboarding WORKS, so it must consume the same link a real
// invitee gets. Only the sha256 hash is stored, so the raw value exists in
// exactly one place — the delivered message — and Mailhog is the only way to
// see it. If Mailhog is not running the test skips rather than fails: an absent
// dev-stack container is not a product defect.
//
// THE SUBJECT is created and destroyed by this file and has its own id space,
// so it can never collide with a seeded cast member.
import { test, expect, request } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, SITES, DEPARTMENTS } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'

const API = 'http://e2elab.localhost:4000'
const MAILHOG = process.env.E2E_MAILHOG || 'http://localhost:8025'

const SUBJECT_EMAIL = 'j8-newhire@e2e.test'
const FIRST = 'Jamie'
const LAST = 'NewHire'
// Must clear the tenant password policy (upper + lower + number, strength 3).
// The seeded PASSWORD does not — cast members only work because the seed writes
// their hashes directly, bypassing validation.
const NEW_PASSWORD = 'E2E-Onboard-Str0ng!2026'

function subjectId() {
  return (
    sqlValue(
      `SELECT id FROM users WHERE email = '${SUBJECT_EMAIL}' AND deleted_at IS NULL`,
    ) || null
  )
}

/**
 * Retire the subject so the next run starts clean.
 *
 * NOT a DELETE. Once the subject has logged in — which the last step of this
 * journey makes them do — `login_events` holds a row referencing them, that
 * table is immutable (prevent_login_event_mutation), and its FK to `users` is
 * not ON DELETE CASCADE. So the row cannot be removed by any means, and neither
 * can the audit trail it produced. Both are correct: an audit record that
 * vanishes with its subject is not a record.
 *
 * Soft-delete plus an email tombstone is therefore the cleanup.
 * `users_company_email_unique` is partial on `deleted_at IS NULL`, so the soft
 * delete alone frees the address; the rename is what stops a later run
 * resurrecting the previous subject by email lookup.
 */
function purge() {
  const id = subjectId()
  if (!id) return
  sql(`DELETE FROM invitation_tokens WHERE user_id = '${id}'`)
  sql(`DELETE FROM user_sessions WHERE email = '${SUBJECT_EMAIL}'`)
  sql(`DELETE FROM user_devices WHERE email = '${SUBJECT_EMAIL}'`)
  sql(`DELETE FROM roles_on_users WHERE user_id = '${id}'`)
  sql(
    `UPDATE users SET deleted_at = NOW(), user_status_id = 'INACTIVE',
        email = 'j8-purged-' || id || '@e2e.test'
      WHERE id = '${id}'`,
  )
}

/**
 * Pull the newest invitation link delivered to the subject and return its raw
 * token. Mailhog stores the body quoted-printable, which wraps long lines with
 * a trailing '=' — a token split across that boundary is silently truncated and
 * the accept call then 400s for a reason that looks like a product bug. Undo
 * the soft breaks before matching.
 */
async function tokenFromInbox() {
  const ctx = await request.newContext({ baseURL: MAILHOG })
  try {
    const res = await ctx.get(
      `/api/v2/search?kind=to&query=${encodeURIComponent(SUBJECT_EMAIL)}&limit=50`,
      { failOnStatusCode: false },
    )
    if (!res.ok()) return null
    const items = (await res.json()).items ?? []
    if (!items.length) return null
    // Mailhog returns newest first.
    const body = String(items[0]?.Content?.Body ?? '')
      .replace(/=\r?\n/g, '')
      .replace(/=3D/g, '=')
    const match = body.match(/token=([A-Za-z0-9._-]+)/)
    return match ? match[1] : null
  } catch {
    return null
  } finally {
    await ctx.dispose()
  }
}

test.describe('USER-J8 · onboarding end to end', () => {
  test.use({ storageState: AUTH.owner })

  test.beforeAll(() => purge())
  test.afterAll(() => purge())

  test('create with an invite, accept the emailed link, and land ACTIVE', async ({ page }) => {
    // ── 1. create, through the real dialog ────────────────────────────────
    await page.goto('/users', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Users' }).first()).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Create User' }).click()

    // By accessible name, not by placeholder: `getByPlaceholder` matches on a
    // SUBSTRING, so 'e.g. John' also matches the email field's
    // 'e.g. john.doe@example.com' and fails on a strict-mode violation.
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'First Name' }).fill(FIRST)
    await dialog.getByRole('textbox', { name: 'Last Name' }).fill(LAST)
    await dialog.getByRole('textbox', { name: 'Email' }).fill(SUBJECT_EMAIL)

    // Roles / Site / Department are all required by the form, and every one of
    // them is an authority input — this is the screen where placement is
    // decided, which is why USER-J7 cares that changing it later is audited.
    // Each is a BaseSelect, whose trigger is role=combobox showing the
    // nullLabel until something is chosen.
    await dialog.getByRole('combobox').nth(0).click()
    await page.getByRole('option', { name: 'E2E Auditor', exact: true }).click()
    await page.keyboard.press('Escape')

    await dialog.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: SITES.primary.name, exact: true }).click()

    await dialog.getByRole('combobox').nth(2).click()
    await page.getByRole('option', { name: DEPARTMENTS.quality.name, exact: true }).click()

    // force: the real <input> is sr-only and its visual proxy <span> intercepts
    // pointer events, so an unforced check() waits for stability forever.
    await dialog.getByRole('checkbox').check({ force: true })
    await page.getByRole('button', { name: 'Create User' }).last().click()

    // ── 2. the row, as the database sees it ───────────────────────────────
    await waitForSqlValue(`SELECT count(*) FROM users WHERE email = '${SUBJECT_EMAIL}'`, {
      label: 'the new user row',
      timeoutMs: 20_000,
    })
    const id = subjectId()
    expect(id, 'the user was created').toBeTruthy()

    // INACTIVE, not some third status. Acceptance is what activates them —
    // there is no INVITED row in `user_statuses` and the column is
    // FK-constrained to what is there (migration 20260807141000).
    expect(sqlValue(`SELECT user_status_id FROM users WHERE id = '${id}'`)).toBe('INACTIVE')
    // invite_sent is polled, not read once: the dialog creates the row with
    // inviteSent=false through the syncEngine and THEN calls the invite action
    // RPC, which is what flips it. Reading immediately after the row appears
    // races that second call and reports a working invite as 'f'.
    await waitForSqlValue(
      `SELECT count(*) FROM users WHERE id = '${id}' AND invite_sent = true`,
      { label: 'the invite RPC marked the user invited', timeoutMs: 20_000 },
    )
    expect(
      sqlValue(`SELECT company_id FROM users WHERE id = '${id}'`),
      'created into the acting tenant, never a client-supplied one',
    ).toBe(COMPANY_ID)
    // Also polled: role assignment is a second round of syncEngine saves after
    // the user row lands, so it is not there the instant the user row is.
    await waitForSqlValue(
      `SELECT count(*) FROM roles_on_users WHERE user_id = '${id}' AND deleted_at IS NULL`,
      { label: 'the role picked in the dialog is assigned', timeoutMs: 20_000 },
    )

    // ── 3. the invitation, written by the worker ──────────────────────────
    // Asynchronous: the audit trigger enqueues send_invitation_email, which is
    // what writes the token row and sends the mail. Poll rather than assume.
    await waitForSqlValue(
      `SELECT count(*) FROM invitation_tokens WHERE user_id = '${id}' AND used_at IS NULL`,
      { label: 'an unused invitation token', timeoutMs: 30_000 },
    )
    expect(
      sqlValue(`SELECT count(*) FROM invitation_tokens
                 WHERE user_id = '${id}' AND expires_at > now()`),
      'the token carries a future expiry',
    ).not.toBe('0')

    // ── 4. accept the link that was actually delivered ────────────────────
    const token = await tokenFromInbox()
    test.skip(token === null, 'Mailhog not reachable on :8025 — cannot read the invitation link')

    const anon = await request.newContext({
      baseURL: API,
      storageState: { cookies: [], origins: [] },
    })
    const accepted = await anon.post('/v1/auth/invitation/accept', {
      data: { token, password: NEW_PASSWORD },
      failOnStatusCode: false,
    })
    expect(
      accepted.status(),
      `accept should succeed, got ${accepted.status()} ${await accepted.text()}`,
    ).toBeLessThan(300)

    // ── 5. the outcome ────────────────────────────────────────────────────
    expect(sqlValue(`SELECT user_status_id FROM users WHERE id = '${id}'`)).toBe('ACTIVE')
    expect(
      sqlValue(`SELECT count(*) FROM invitation_tokens
                 WHERE user_id = '${id}' AND used_at IS NOT NULL`),
      'the token is consumed',
    ).not.toBe('0')

    // The onboarded person can sign in with the password they just set. This is
    // the assertion that makes the whole chain mean something — every step
    // above could pass while the account remains unusable.
    const login = await anon.post('/v1/auth/login', {
      data: { email: SUBJECT_EMAIL, password: NEW_PASSWORD },
      failOnStatusCode: false,
    })
    expect(login.status(), 'the new hire can log in').toBeLessThan(300)
    await anon.dispose()

    // And the activation is on the record. `userStatusId` is in trackFields with
    // an actionMap, so this is an ACTIVATE row rather than a generic UPDATE —
    // the audit surface an inspector reads as "when did this account become
    // usable, and who made it so".
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE entity_type = 'Users' AND entity_id = '${id}' AND action = 'ACTIVATE'`,
      { label: 'an ACTIVATE audit row for the accepted invitation', timeoutMs: 30_000 },
    )
  })
})
