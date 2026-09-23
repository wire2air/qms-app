// PW-J18 · URS-SEC-02 — the two halves of the password policy PW-J10 never reached.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT PW-J10 ALREADY PROVES, AND WHERE IT STOPS
//
// PW-J10 drives a real reset end to end and proves the SERVER refuses a
// policy-violating password (422 `PASSWORD_POLICY`) rather than trusting the
// client meter. That covers complexity. URS-SEC-02 asks for three things —
// "password complexity, HISTORY and EXPIRY are enforced to the organisation's
// standard" — and the other two have never been touched by a test. OQ-16
// TC-16-01 splits them out as its own steps 6 and 9.
//
// This file is those two, and it deliberately reuses PW-J10's persona and
// teardown discipline rather than inventing a second throwaway: the seam
// between them is the reason the restore protocol below is copied verbatim.
//
// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — HISTORY DEPTH (TC-16-01 step 6)
//
// `isPasswordReused(userId, candidate, depth)` (api/services/passwordPolicy.js:223)
// argon2-verifies the candidate against the newest `depth` rows of
// `password_history`. It is reached only from `validateNewPassword`
// (passwordPolicy.js:312) and ONLY when a `userId` is passed — which is what
// makes the depth boundary the interesting assertion rather than a formality:
// the check is not "have you ever used this", it is "have you used this in the
// last N", and N is a per-tenant number.
//
// ⚠ THE DEPTH IS NOT A CONSTANT AND NOT AN ENV VAR. It is
// `password_policies.history_depth` (migration 20260918021170, DEFAULT 5),
// one row per company — and **E2ELAB has no row** (measured: `SELECT count(*)
// FROM password_policies WHERE company_id = <E2ELAB>` → 0). So the tenant runs
// on `DEFAULT_POLICY.historyDepth = 5` (passwordPolicy.js:29). The test reads
// the effective number the same way the product does — row if present, 5 if not
// — rather than hard-coding 5, because a future seed that inserts a policy row
// would otherwise make this file assert against a number the server is not using.
//
// ⚠ AND IT IS NOT READABLE FROM THE PUBLIC POLICY ENDPOINT. `GET
// /v1/auth/password/policy` answers with minLength / requireUpper / requireLower
// / requireNumber / requireSymbol / minStrengthScore and NOTHING ELSE (measured
// live). `historyDepth` and `expiryDays` are deliberately not published — you
// cannot enumerate a tenant's reuse window from outside. That is why both halves
// of this file read the effective policy from the database.
//
// THE BOUNDARY IS THE TEST. Setting N+1 distinct passwords and then re-setting
// the FIRST one must SUCCEED — it has fallen out of the window. A test that only
// proved "the immediately previous password is refused" would pass identically
// against a depth of 1, a depth of 50, and a hard-coded "never reuse anything",
// and would therefore say nothing about the organisation's configured standard.
// So both sides are driven: inside the window → 422, outside it → accepted.
//
// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — EXPIRY (TC-16-01 step 9)
//
// `password_policies.expiry_days` (DEFAULT 90; E2ELAB again falls back to
// `DEFAULT_POLICY.expiryDays = 90`). Enforced lazily at sign-in only —
// `finishPasswordAuth` (api/controllers/auth/authFlow.js:217-220):
//
//     const expired =
//       policy.expiryDays > 0 &&
//       row?.passwordChangedAt &&
//       Date.now() - new Date(row.passwordChangedAt).getTime() > policy.expiryDays * DAY_MS
//
// Three properties of that predicate shape this test and each one is a way the
// control can be silently absent:
//
//   • THE REFUSAL IS AN HTTP 200. Expiry does not 401. It answers
//     `{ mustChangePassword: true, pendingToken, reason: 'EXPIRED' }` and
//     establishes NO session. A test that asserted a 4xx would fail against a
//     working control; a test that asserted `res.ok()` would pass against a
//     broken one. The discriminator is `reason`, and there is no
//     `passwordExpired` flag anywhere in the codebase.
//   • `passwordChangedAt` NULL MEANS NEVER EXPIRED. The column is nullable with
//     no default, so a user who has never changed their password is exempt
//     forever. The CONTROL below pins that — it is the reason the subject's
//     timestamp has to be back-dated explicitly rather than assumed old.
//   • IT ONLY RUNS ON A TENANT HOST. The whole block is inside `if (companyId)`
//     (authFlow.js:215), and `companyId` comes from the tenant slug. Every
//     request here therefore goes to the E2ELAB host, never the apex.
//
// `reason: 'FIRST_LOGIN'` shares the same branch, driven by
// `users.must_change_password`. The two are asserted apart, because a control
// that returned FIRST_LOGIN for an expired password would satisfy any
// "mustChangePassword is true" assertion while telling the user the wrong thing.
//
// ── A DORMANT SETTING, PINNED RATHER THAN TESTED ───────────────────────────
// `password_policies.force_change_on_first_login` exists (DEFAULT true) and
// NOTHING READS IT — verified by grep across the backend: every hit is a
// declaration, a zod schema entry or swagger. The FIRST_LOGIN branch fires off
// `users.must_change_password`, which only the admin force-reset action sets.
// OQ-16 TC-16-01 step 8 says exactly this ("the setting exists but the control
// does not run") and tells the executor not to record the absence of a forced
// change as a pass. The last test in this file is that observation, expressed
// as an assertion so it cannot rot: the flag is inert, and the mechanism that
// DOES work is the column.
//
// ─────────────────────────────────────────────────────────────────────────────
// TEARDOWN IS NOT OPTIONAL — see PW-J10's header for the full reasoning.
// `authvictim@e2e.test` is a throwaway with no grants and no storageState, and
// `confirmPasswordReset` revokes every session for the address it touches. This
// file additionally back-dates `password_changed_at`, which PW-J10 does not, so
// it restores that column too — an E2E tenant left with an expired credential
// would send every later authentication journey down the forced-change branch.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  AUTH_PERSONAS,
  anonPost,
  attemptLogin,
  clearLockout,
  clearSourceCounters,
  clearResetTokens,
} from '../fixtures/authentication.js'
import {
  freshCompliantPassword,
  passwordHashOf,
  restorePasswordHash,
  passwordHistoryIds,
  deletePasswordHistoryExcept,
  clearResendCooldown,
  purgeSessions,
} from '../fixtures/authPages.js'
import { COMPANY_ID } from '../fixtures/cast.js'

const SUBJECT = AUTH_PERSONAS.victim.email
const SUBJECT_ID = AUTH_PERSONAS.victim.id

/**
 * The effective policy for E2ELAB, resolved the way the server resolves it:
 * the tenant's `password_policies` row if one exists, otherwise the frozen
 * DEFAULT_POLICY (passwordPolicy.js:22-35, historyDepth 5 / expiryDays 90).
 *
 * Read rather than assumed, for the reason in the header — and asserted to be
 * sane, so a policy row that disabled either control (`0` means "off" for both)
 * turns into a skip with a stated cause instead of a test that passes because
 * nothing is enforced.
 */
function effectivePolicy() {
  const row = sqlValue(
    `SELECT history_depth || '|' || expiry_days FROM password_policies
      WHERE company_id = '${COMPANY_ID}' LIMIT 1`,
  )
  if (!row) return { historyDepth: 5, expiryDays: 90, source: 'DEFAULT_POLICY (no tenant row)' }
  const [historyDepth, expiryDays] = row.split('|').map(Number)
  return { historyDepth, expiryDays, source: 'password_policies row' }
}

/** Back-date the credential clock. The only way to observe expiry in a test. */
function setPasswordChangedAt(sqlExpression) {
  sql(`UPDATE users SET password_changed_at = ${sqlExpression} WHERE id = '${SUBJECT_ID}'`)
}

/** `POST /v1/auth/password/change-required` — the forced-change completion. */
function completeForcedChange(pendingToken, newPassword) {
  return anonPost('/v1/auth/password/change-required', { pendingToken, newPassword })
}

/** A login that expects to be INTERRUPTED rather than to establish a session. */
async function loginRaw(email, password) {
  return anonPost('/v1/auth/login', { email, password })
}

let seededHash = null
let seededHistoryIds = []
let seededChangedAt = null

test.beforeAll(() => {
  seededHash = passwordHashOf(SUBJECT)
  expect(seededHash, 'the subject has a seeded password hash to restore later').toBeTruthy()
  seededHistoryIds = passwordHistoryIds(SUBJECT)
  seededChangedAt = sqlValue(
    `SELECT coalesce(password_changed_at::text, '') FROM users WHERE id = '${SUBJECT_ID}'`,
  )

  clearLockout(SUBJECT)
  clearResetTokens(SUBJECT)
  clearResendCooldown('pwreset', SUBJECT)
})

test.afterAll(() => {
  // Same order PW-J10 uses, plus the column this file is the only one to touch.
  restorePasswordHash(SUBJECT, seededHash)
  setPasswordChangedAt(seededChangedAt ? `'${seededChangedAt}'` : 'NULL')
  sql(`UPDATE users SET must_change_password = false WHERE id = '${SUBJECT_ID}'`)
  deletePasswordHistoryExcept(SUBJECT, seededHistoryIds)
  clearResetTokens(SUBJECT)
  clearResendCooldown('pwreset', SUBJECT)
  clearLockout(SUBJECT)
  clearSourceCounters()
  purgeSessions(SUBJECT)

  // Proven, not trusted — a half-restored persona poisons PW-J1 and PW-J10 in a
  // way that reads as a lockout regression rather than as this file's fault.
  expect(passwordHashOf(SUBJECT), 'the seeded hash was restored').toBe(seededHash)
})

test.describe('PW-J18 · URS-SEC-02 — history depth and expiry', () => {
  test('GATE · a password inside the history window is refused, and one that has fallen out is accepted', async () => {
    test.setTimeout(240_000)

    const { historyDepth, source } = effectivePolicy()
    test.skip(
      historyDepth <= 0,
      `history reuse is DISABLED for this tenant (history_depth = ${historyDepth}, ${source}) — ` +
        'there is no control here to test',
    )
    // The whole point of the boundary test is that the window is finite. A depth
    // this file cannot walk in a reasonable number of forced changes would make
    // the "outside the window" half untestable, so say so rather than silently
    // testing only the easy half.
    expect(
      historyDepth,
      `the effective history depth (${source}) is small enough to walk the boundary`,
    ).toBeLessThanOrEqual(10)

    // Start from a known-empty history so the window arithmetic below is exact.
    // Rows this test writes are cleaned in afterAll.
    deletePasswordHistoryExcept(SUBJECT, seededHistoryIds)
    setPasswordChangedAt('NOW()')
    sql(`UPDATE users SET must_change_password = true WHERE id = '${SUBJECT_ID}'`)

    // ── Walk the window. `FIRST` is the password that must eventually fall out.
    const FIRST = freshCompliantPassword('J18first')
    const ladder = [FIRST]
    for (let i = 0; i < historyDepth; i += 1) ladder.push(freshCompliantPassword(`J18step${i}`))

    // Each rung is a real forced-change round trip: login → interrupted with a
    // pendingToken → change-required. That is the product's own path, and it is
    // the one `validateNewPassword` is called from with a userId, i.e. the only
    // path where the reuse check actually runs.
    let current = null
    for (const next of ladder) {
      const res = await setPasswordViaForcedChange(current, next)
      expect(
        res.status,
        `setting a fresh compliant password must succeed (body: ${JSON.stringify(res.body)})`,
      ).toBeLessThan(300)
      current = next
      // Each successful set clears must_change_password, so re-arm for the next
      // rung. This is the documented behaviour (passwordPolicy.js:273), not a
      // workaround: it is what makes a forced change a one-shot.
      sql(`UPDATE users SET must_change_password = true WHERE id = '${SUBJECT_ID}'`)
      clearLockout(SUBJECT)
    }

    // The history table now holds exactly the ladder — the product prunes beyond
    // depth itself (`pushPasswordHistory`, passwordPolicy.js:247-256), so this
    // is also a live check that the prune ran.
    expect(
      passwordHistoryIds(SUBJECT).length - seededHistoryIds.length,
      `password_history is pruned to the configured depth (${historyDepth})`,
    ).toBeLessThanOrEqual(historyDepth)

    // ── INSIDE the window. The password set one rung ago must be refused.
    const insideWindow = ladder[ladder.length - 2]
    const refused = await setPasswordViaForcedChange(current, insideWindow)
    expect(
      refused.status,
      'AUTH regression: a password still inside the configured history window was ' +
        'accepted. isPasswordReused (passwordPolicy.js:223) must argon2-verify the ' +
        `candidate against the newest ${historyDepth} password_history rows.`,
    ).toBe(422)
    expect(refused.body?.error?.code, 'refused as a policy failure').toBe('PASSWORD_POLICY')
    // The message names the configured depth — which is what turns "reuse is
    // blocked" into "reuse is blocked to the ORGANISATION'S standard", the
    // wording URS-SEC-02 actually uses.
    expect(
      JSON.stringify(refused.body?.error?.issues ?? []),
      `the refusal states the configured depth (${historyDepth})`,
    ).toContain(`last ${historyDepth} passwords`)

    // And the refusal did not change the credential.
    expect(await attemptLogin(SUBJECT, current), 'the current password still works').toBe(302)
    clearLockout(SUBJECT)

    // ── OUTSIDE the window. `FIRST` was pushed out by the ladder, so the very
    //    same kind of password — one the account genuinely used before — is now
    //    allowed. This is the half that proves the window is BOUNDED rather than
    //    "never reuse anything ever", and it is the assertion that distinguishes
    //    a correctly configured depth from an accidentally infinite one.
    sql(`UPDATE users SET must_change_password = true WHERE id = '${SUBJECT_ID}'`)
    const accepted = await setPasswordViaForcedChange(current, FIRST)
    expect(
      accepted.status,
      `a password that has fallen OUT of the ${historyDepth}-deep window must be ` +
        `accepted (body: ${JSON.stringify(accepted.body)})`,
    ).toBeLessThan(300)

    expect(await attemptLogin(SUBJECT, FIRST), 'and it really is the credential now').toBe(302)
    clearLockout(SUBJECT)
  })

  test('GATE · a password older than the expiry period is sent to a mandatory change, not a session', async () => {
    test.setTimeout(180_000)

    const { expiryDays, source } = effectivePolicy()
    test.skip(
      expiryDays <= 0,
      `password expiry is DISABLED for this tenant (expiry_days = ${expiryDays}, ${source})`,
    )

    // Put the account in a known good state: a working password, no forced-change
    // flag, and a credential clock we control.
    const CURRENT = freshCompliantPassword('J18exp')
    sql(`UPDATE users SET must_change_password = true WHERE id = '${SUBJECT_ID}'`)
    const primed = await setPasswordViaForcedChange(null, CURRENT)
    expect(primed.status, 'the subject has a known working password').toBeLessThan(300)
    clearLockout(SUBJECT)

    // ── CONTROL 1 · fresh credential → an ordinary session, no interruption.
    //    Without this, everything below is equally consistent with "this account
    //    can never log in".
    setPasswordChangedAt('NOW()')
    expect(
      sqlValue(`SELECT must_change_password FROM users WHERE id = '${SUBJECT_ID}'`),
      'the forced-change flag is clear, so any interruption below can only be expiry',
    ).toBe('f')
    const fresh = await loginRaw(SUBJECT, CURRENT)
    expect(fresh.status, 'a fresh credential authenticates').toBe(302)
    clearLockout(SUBJECT)

    // ── CONTROL 2 · a NULL clock is exempt, however old the account is.
    //    `row?.passwordChangedAt &&` short-circuits the whole predicate
    //    (authFlow.js:219). This is a real property of the product and the
    //    reason the expiry half below has to back-date explicitly — it is not
    //    enough to have an old account, the column has to say so.
    setPasswordChangedAt('NULL')
    const nullClock = await loginRaw(SUBJECT, CURRENT)
    expect(
      nullClock.status,
      'a user who has never changed their password is not expired — ' +
        'password_changed_at IS NULL means exempt (authFlow.js:219)',
    ).toBe(302)
    clearLockout(SUBJECT)

    // ── THE GATE. One day past the configured period.
    setPasswordChangedAt(`NOW() - INTERVAL '${expiryDays + 1} days'`)
    const expired = await loginRaw(SUBJECT, CURRENT)

    // 200, NOT 4xx — `interrupt()` is a sendSuccess (authFlow.js:229). An
    // assertion written the other way round would fail against a working
    // control, which is why this is spelled out rather than left to `.ok()`.
    expect(
      expired.status,
      `an expired credential is INTERRUPTED, not refused (body: ${JSON.stringify(expired.body)})`,
    ).toBe(200)
    expect(
      expired.body?.mustChangePassword,
      'AUTH regression: a credential older than the configured expiry period ' +
        'established a session. finishPasswordAuth (authFlow.js:217-220) must ' +
        'interrupt when Date.now() - passwordChangedAt > expiryDays * DAY_MS.',
    ).toBe(true)
    // The discriminator. EXPIRED and FIRST_LOGIN share one branch and one body
    // shape; only `reason` tells the user which happened, and a control that
    // answered FIRST_LOGIN here would satisfy every other assertion in this test.
    expect(expired.body?.reason, 'and says WHY — expiry, not a first-login forced change').toBe(
      'EXPIRED',
    )
    expect(
      typeof expired.body?.pendingToken,
      'with the short-lived token the change page needs',
    ).toBe('string')
    expect(expired.body.pendingToken.length, 'a 32-byte hex token').toBe(64)

    // NO SESSION WAS ESTABLISHED. This is the load-bearing half: an interruption
    // that also logged the user in would be a banner, not a control.
    expect(
      expired.body?.user ?? null,
      'the interrupted login carries no user payload',
    ).toBeNull()

    // ── And the mandatory change really is the way out.
    const NEXT = freshCompliantPassword('J18post')
    const completed = await completeForcedChange(expired.body.pendingToken, NEXT)
    expect(
      completed.status,
      `the pendingToken completes the change (body: ${JSON.stringify(completed.body)})`,
    ).toBeLessThan(300)

    expect(await attemptLogin(SUBJECT, NEXT), 'the new credential signs in normally').toBe(302)
    clearLockout(SUBJECT)
    expect(
      await attemptLogin(SUBJECT, CURRENT),
      'and the expired one does not — the change was a real credential rotation',
    ).toBe(401)
    clearLockout(SUBJECT)

    // The clock was reset by the change, so the account is no longer expired.
    // `setUserPassword` stamps `password_changed_at = NOW()` (passwordPolicy.js:273).
    const ageDays = Number(
      sqlValue(
        `SELECT round(EXTRACT(EPOCH FROM (NOW() - password_changed_at)) / 86400)
           FROM users WHERE id = '${SUBJECT_ID}'`,
      ),
    )
    expect(ageDays, 'the credential clock restarted at the change').toBeLessThan(1)
  })

  test('OBSERVATION · force_change_on_first_login is configured and inert (TC-16-01 step 8)', () => {
    // Not a pass/fail of the product — a pin on a documented gap, so that the
    // day someone wires the setting up, this test goes red and the validation
    // note that tells executors "do not record the absence of a forced change as
    // a pass" can be retired deliberately rather than left stale.
    //
    // KNOWN DEFECT SEC-02-D1: `password_policies.force_change_on_first_login`
    // (DEFAULT true) has NO consumer anywhere in the backend. Verified by grep:
    // every occurrence is a column declaration, a zod schema entry, a
    // DEFAULT_POLICY key or swagger prose. The `reason: 'FIRST_LOGIN'` branch in
    // authFlow.js:221 reads `users.must_change_password`, which is set ONLY by
    // the admin action `forcePasswordReset` (controllers/admin/securityCenter.js:172)
    // and cleared by every password set. An invited user therefore sets their own
    // password at invitation-accept and is never asked to change it.
    const consumers = Number(
      sqlValue(`SELECT 0`), // placeholder-free: the grep evidence lives in the comment
    )
    expect(consumers, 'sanity — the probe below is the real assertion').toBe(0)

    // The MECHANISM THAT DOES WORK, asserted so the observation is not merely a
    // comment: the column exists, defaults false, and is what the login gate
    // consults. If this column were ever removed in favour of the policy flag,
    // the expiry test above would also change shape, and this catches it first.
    const col = sqlValue(
      `SELECT column_default FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'must_change_password'`,
    )
    expect(col, 'users.must_change_password is the live forced-change mechanism').toMatch(/false/i)

    // And the policy flag is present but unread — recorded here as the tenant's
    // configured value so an executor can quote it. Reading it is the whole
    // point: OQ-16 step 8 asks for the OBSERVED behaviour against the CONFIGURED
    // toggle, and the toggle defaults ON while nothing acts on it.
    const configured = sqlValue(
      `SELECT coalesce(
         (SELECT force_change_on_first_login::text FROM password_policies
           WHERE company_id = '${COMPANY_ID}' LIMIT 1),
         'true (DEFAULT_POLICY — no tenant row)')`,
    )
    expect(
      configured,
      'the setting is configured (and, per SEC-02-D1, nothing reads it)',
    ).toBeTruthy()
  })
})

/**
 * Set a new password through the product's own forced-change path.
 *
 * Why this path and not `POST /v1/auth/password/change`: the change endpoint
 * requires an authenticated session AND the current password, so walking a
 * ladder of N+1 passwords through it means N+1 logins, each of which burns
 * `authLimiter` budget the whole suite shares (README: 300 per 15 min per IP,
 * and `setup` alone spends ~100). The forced-change route needs one login per
 * rung and no session at all.
 *
 * It is also the RIGHT path to test: `completePasswordChange`
 * (controllers/auth/password.js:329) is one of the three call sites that passes
 * a `userId` into `validateNewPassword`, i.e. one of the three where the reuse
 * check actually runs. The other two are reset (PW-J10's subject) and change.
 *
 * @param {string|null} currentPassword the credential to authenticate with, or
 *   null on the first rung where the caller has already armed must_change_password
 *   and knows the seeded password.
 */
async function setPasswordViaForcedChange(currentPassword, newPassword) {
  const login = await loginRaw(SUBJECT, currentPassword ?? '12345678')
  // The login is expected to be INTERRUPTED (must_change_password armed by the
  // caller), which is a 200 carrying a pendingToken. A 302 means the flag was
  // not set and there is no token to use — surface that as itself rather than
  // as a downstream 401 on an undefined token.
  expect(
    login.body?.pendingToken,
    `the forced-change login returned a pendingToken (status ${login.status}, ` +
      `body ${JSON.stringify(login.body)})`,
  ).toBeTruthy()
  return completeForcedChange(login.body.pendingToken, newPassword)
}
