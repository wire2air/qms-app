// PW-J5 · G3 (release condition #1) — the per-account lockout genuinely works.
//
// This is the CONSTRUCTIVE half of PW-J1, and it exists because of what doc 19
// says about G3: "verified true today but has **zero regression protection** —
// the same 'correct control, no test defending it' shape that AUTH-S1 itself was
// adjacent to before this cycle's work." AUTH-S1 was a P0. This file is the
// cheap insurance that G3 does not become the next one.
//
// The failure mode it guards against is not one bug but two opposite ones:
//
//   * the lock stops working  — a brute-forcer gets unlimited guesses. Guarded by
//     the GATEs: N failures must produce 423, and the CORRECT password must still
//     be refused afterwards (a lock that yields to the right password is theatre).
//   * the lock works too well — it becomes a denial-of-service weapon. Guarded by
//     the CONTROLs: a second account is untouched, an admin can clear it, and a
//     successful login resets the counter so ordinary typos never accumulate.
//
// The second is not hypothetical here — it IS AUTH-S1, which shipped. So the
// CONTROL that a different account is unaffected is not decoration; it is the
// assertion that distinguishes "lockout" from "outage".
//
// EVERY claim about state is checked in Redis (the authority — utils/
// loginLockout.js:6-9) or in Postgres, never from the HTTP status alone. A 423 is
// what a lock looks like from outside; the key and its TTL are what it IS.
//
// Thresholds are READ FROM THE DATABASE (`lockoutPolicy`), mirroring
// getPolicyForCompany's row → DEFAULT_POLICY resolution, so the spec cannot drift
// from the policy the API will actually apply.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  AUTH_PERSONAS,
  PASSWORD,
  API_ORIGIN,
  attemptLogin,
  anonPost,
  failLogins,
  clearAllAuthLockouts,
  clearSourceCounters,
  isLockedInRedis,
  isLockedForSource,
  lockMirror,
  loginEventCount,
} from '../fixtures/authentication.js'
import { lockTtlSeconds, lockoutPolicy, waitUntil } from '../fixtures/authGuards.js'

const TARGET = AUTH_PERSONAS.locker.email // authlocker@e2e.test — seed §27
const TARGET_ID = AUTH_PERSONAS.locker.id
const BYSTANDER = AUTH_PERSONAS.victim.email

// Documentation-range IPs (RFC 5737), one per test, so no test can spend
// another's per-source failure budget (login_ipfail:<ip>, 15 per window).
const SRC_LOCK = '203.0.113.51'
const SRC_BYSTANDER = '203.0.113.52'
const SRC_UNLOCK = '203.0.113.53'
const SRC_DENIED = '203.0.113.54'
const SRC_TTL = '203.0.113.55'
const SRC_RESET = '203.0.113.56'

const POLICY = lockoutPolicy(COMPANY_ID)
const MAX = POLICY.maxFailedAttempts
const LOCK_SECONDS = POLICY.lockoutDurationMinutes * 60

const unlockUrl = (userId) => `${API_ORIGIN}/v1/admin/security/users/${userId}/unlock`

/** Does this role hold `security:manage` in the E2E tenant? Owners bypass the check. */
function holdsSecurityManage(email) {
  return (
    Number(
      sqlValue(
        `SELECT count(*)
           FROM authz.role_module_permissions rmp
           JOIN roles_on_users ru ON ru.role_id = rmp.role_id
           JOIN users u ON u.id = ru.user_id
          WHERE rmp.company_id = '${COMPANY_ID}'
            AND rmp.module_id = 'security' AND rmp.action_id = 'manage'
            AND u.email = '${email}'`,
      ) || 0,
    ) > 0
  )
}

test.beforeAll(() => clearAllAuthLockouts())
test.afterAll(() => clearAllAuthLockouts())
test.beforeEach(() => {
  clearAllAuthLockouts()
  clearSourceCounters()
})

test.describe('PW-J5 · the per-account lockout is real, bounded, and clearable', () => {
  test(`GATE · ${MAX} failures lock the account, and the lock refuses the CORRECT password (G3)`, async () => {
    const lockedBefore = loginEventCount(TARGET, 'ACCOUNT_LOCKED')

    const statuses = await failLogins(TARGET, MAX, { source: SRC_LOCK })
    expect(
      statuses.slice(0, MAX - 1),
      `the first ${MAX - 1} wrong guesses are ordinary 401s`,
    ).toEqual(Array(MAX - 1).fill(401))
    expect(
      statuses[MAX - 1],
      `guess #${MAX} must trip the lock (policy source: ${POLICY.source})`,
    ).toBe(423)

    // The lock is a real key with a real TTL, not just a status code.
    expect(
      isLockedForSource(TARGET, SRC_LOCK),
      'login_lock:<email>|<source> exists in Redis — Redis is the authority',
    ).toBe(true)

    // THE LOAD-BEARING ASSERTION. A lock that lets the right password through is
    // decorative: an attacker who guesses correctly on attempt N+1 still wins.
    const locked = await anonPost(
      '/v1/auth/login',
      { email: TARGET, password: PASSWORD },
      { source: SRC_LOCK },
    )
    expect(
      locked.status,
      'G3 regression: the account accepted a login while locked. The lock check must ' +
        'run BEFORE credential verification (controllers/auth/password.js getLockState).',
    ).toBe(423)
    expect(locked.body?.error?.code, 'the refusal is typed, so the UI can explain it').toBe(
      'ACCOUNT_LOCKED',
    )
    expect(locked.body?.error?.lockedUntil, 'and it tells the user when it lifts').toBeTruthy()

    // The DB mirror is written fire-and-forget (mirrorToUserRows is not awaited),
    // so it is polled, not read once.
    await waitUntil(() => lockMirror(TARGET).failedCount === MAX, {
      label: `users.failed_login_count reaches ${MAX} for ${TARGET}`,
    })
    const mirror = lockMirror(TARGET)
    expect(mirror.lockedUntil, 'users.locked_until is stamped for admin visibility').toBeTruthy()
    expect(
      new Date(mirror.lockedUntil).getTime(),
      'and it points into the future',
    ).toBeGreaterThan(Date.now())

    // The event ledger records it — this is the SOC 2 / Part 11 evidence.
    await waitUntil(() => loginEventCount(TARGET, 'ACCOUNT_LOCKED') > lockedBefore, {
      label: 'an ACCOUNT_LOCKED row lands in login_events',
    })
  })

  test('CONTROL · a second account is untouched — this is a lockout, not an outage (AUTH-S1)', async () => {
    // The single assertion that separates G3 from the P0 that shipped. If the
    // lock ever becomes global (or key-collides across accounts), this goes red
    // and the DoS is back.
    await failLogins(TARGET, MAX, { source: SRC_BYSTANDER })
    expect(isLockedInRedis(TARGET), 'the attacked account is locked').toBe(true)

    expect(
      isLockedInRedis(BYSTANDER),
      'the bystander has no lock key of any kind — the counter is keyed per account',
    ).toBe(false)
    expect(
      lockMirror(BYSTANDER).failedCount,
      'and its DB mirror never moved',
    ).toBe(0)

    // Same source, so the only difference is the account. Anything less than this
    // (a different IP too) would not prove the scoping.
    expect(
      await attemptLogin(BYSTANDER, PASSWORD, { source: SRC_BYSTANDER }),
      'the bystander logs in normally from the very source that locked the other account',
    ).toBe(302)
  })

  test('CONTROL · the lock EXPIRES — its TTL is finite and matches the tenant policy', async () => {
    // A lock with no expiry is a permanent account outage that only an admin can
    // undo. redis TTL returns -1 for "key exists, never expires", -2 for "gone".
    await failLogins(TARGET, MAX, { source: SRC_TTL })

    const ttl = lockTtlSeconds(TARGET, SRC_TTL)
    expect(ttl, 'the lock key exists').not.toBe(-2)
    expect(ttl, 'a lock that never expires is an outage, not a control').not.toBe(-1)
    expect(ttl, 'and it is bounded by the policy window').toBeGreaterThan(0)
    expect(
      ttl,
      `TTL ${ttl}s exceeds the tenant's lockoutDurationMinutes (${POLICY.lockoutDurationMinutes}min ` +
        `= ${LOCK_SECONDS}s, source: ${POLICY.source})`,
    ).toBeLessThanOrEqual(LOCK_SECONDS)
  })

  test('CONTROL · a successful login resets the counter, so ordinary typos never accumulate', async () => {
    // Without clearFailedAttempts, failures would pile up across days until a
    // legitimate user locked themselves out of an account they log into fine.
    // Proving it by re-running the SAME number of failures is what makes this
    // real: a mere "the key is gone" could also mean the key simply expired.
    await failLogins(TARGET, MAX - 1, { source: SRC_RESET })
    expect(isLockedForSource(TARGET, SRC_RESET), `${MAX - 1} failures do not lock`).toBe(false)

    expect(
      await attemptLogin(TARGET, PASSWORD, { source: SRC_RESET }),
      'the correct password still works before the threshold',
    ).toBe(302)

    await waitUntil(() => lockMirror(TARGET).failedCount === 0, {
      label: 'the DB mirror counter is reset after a successful login',
    })

    const second = await failLogins(TARGET, MAX - 1, { source: SRC_RESET })
    expect(
      second,
      `a further ${MAX - 1} failures are all plain 401s — the counter really restarted ` +
        'at zero rather than resuming where it left off',
    ).toEqual(Array(MAX - 1).fill(401))
    expect(isLockedForSource(TARGET, SRC_RESET), 'and still no lock').toBe(false)
  })

  test('GATE · an admin holding security:manage can unlock, and login works again (API-50)', async ({
    browser,
  }) => {
    expect(
      holdsSecurityManage(USERS.author.email),
      `${USERS.author.email} must hold security:manage for this journey — granted by ` +
        'e2e-seed.sql §27. Re-run the setup project if this fails.',
    ).toBe(true)

    await failLogins(TARGET, MAX, { source: SRC_UNLOCK })
    expect(isLockedForSource(TARGET, SRC_UNLOCK), 'precondition: the account is locked').toBe(true)
    const unlockedBefore = loginEventCount(TARGET, 'ACCOUNT_UNLOCKED')

    const ctx = await browser.newContext({ storageState: AUTH.author })
    try {
      const res = await ctx.request.post(unlockUrl(TARGET_ID), { failOnStatusCode: false })
      expect(res.status(), `the security:manage holder may unlock — body: ${await res.text()}`).toBe(
        200,
      )
    } finally {
      await ctx.close()
    }

    // Every scoped key, not just the one we happened to create.
    expect(isLockedInRedis(TARGET), 'no lock key survives the unlock').toBe(false)
    await waitUntil(
      () => lockMirror(TARGET).lockedUntil === null && lockMirror(TARGET).failedCount === 0,
      { label: 'the DB mirror is cleared by the admin unlock' },
    )

    expect(
      await attemptLogin(TARGET, PASSWORD, { source: SRC_UNLOCK }),
      'and the user can sign in from the very source that was locked — an unlock that ' +
        'leaves the enforced key behind would be invisible to the admin who performed it',
    ).toBe(302)

    await waitUntil(() => loginEventCount(TARGET, 'ACCOUNT_UNLOCKED') > unlockedBefore, {
      label: 'an ACCOUNT_UNLOCKED row lands in login_events',
    })
    expect(
      sqlValue(
        `SELECT actor_user_id FROM login_events
          WHERE email = '${TARGET}' AND event_type = 'ACCOUNT_UNLOCKED'
          ORDER BY created_at DESC LIMIT 1`,
      ),
      'and it names the admin who did it, not the subject',
    ).toBe(USERS.author.id)
  })

  test('GATE · a caller WITHOUT security:manage is refused AND the account stays locked', async ({
    browser,
  }) => {
    // The row assertion is the point. A 403 alone would not prove the unlock did
    // not happen — `unlockAccount` runs before any response is written, so a
    // mis-ordered guard would return 403 having already cleared the lock.
    expect(
      holdsSecurityManage(USERS.reviewer.email),
      `${USERS.reviewer.email} must NOT hold security:manage, or this test proves nothing`,
    ).toBe(false)

    await failLogins(TARGET, MAX, { source: SRC_DENIED })
    expect(isLockedForSource(TARGET, SRC_DENIED), 'precondition: the account is locked').toBe(true)

    const ctx = await browser.newContext({ storageState: AUTH.reviewer })
    try {
      const res = await ctx.request.post(unlockUrl(TARGET_ID), { failOnStatusCode: false })
      expect(
        res.status(),
        'a non-holder must not reach the security center — securityCenter.js assertCanManage',
      ).toBe(403)
    } finally {
      await ctx.close()
    }

    expect(
      isLockedForSource(TARGET, SRC_DENIED),
      'the refused call left the enforced Redis lock in place',
    ).toBe(true)
    expect(
      await attemptLogin(TARGET, PASSWORD, { source: SRC_DENIED }),
      'and the account is genuinely still locked',
    ).toBe(423)
  })
})
