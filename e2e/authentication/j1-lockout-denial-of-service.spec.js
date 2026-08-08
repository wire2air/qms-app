// PW-J1 · AUTH-S1 (P0, release condition C1) — lockout must not be a weapon.
//
// HISTORY: this file's first version was 🔴 FAILS-TODAY. It reproduced the defect —
// five wrong passwords from an unauthenticated stranger locked the victim out of
// their own account, and with `authLimiter` a no-op one IP could do that to every
// user in the tenant. C1 has since been fixed, so these are now GREEN RELEASE
// GATES: if any of them goes red, the DoS is back.
//
// The fix (backend/api/utils/loginLockout.js):
//   * failure/lock keys are scoped to (email, source), not email alone — so a
//     brute-forcer is still stopped where they are, but the real owner signing in
//     from their own network is unaffected;
//   * a per-source failure ceiling across ALL accounts (`login_ipfail:<ip>`, 15 per
//     15 min) bounds horizontal spray, which the per-account counter never could.
//
// Distinct sources are simulated with X-Forwarded-For — the API sets
// `trust proxy` (app.js:25) so that becomes `req.ip`. Without it the "attacker"
// and the "victim" are one machine and the fix is invisible.
import { test, expect } from '@playwright/test'
import {
  AUTH_PERSONAS,
  PASSWORD,
  attemptLogin,
  failLogins,
  clearLockout,
  clearAllAuthLockouts,
  clearSourceCounters,
  isLockedInRedis,
  isLockedForSource,
  lockMirror,
} from '../fixtures/authentication.js'

const VICTIM = AUTH_PERSONAS.victim.email
const OTHER = AUTH_PERSONAS.locker.email

// Documentation-range IPs (RFC 5737) so these can never collide with a real one.
const ATTACKER = '203.0.113.9'
const VICTIM_HOME = '198.51.100.4'
const SPRAYER = '192.0.2.77'

// The horizontal-spray probe below invents its own identities rather than using
// personas, and `clearAllAuthLockouts()` only walks `AUTH_PERSONAS` — so nothing
// was clearing these. They must be cleared explicitly.
//
// ⚠️ THIS MADE THE C1 GATE FAIL ON EVERY SECOND RUN INSIDE 15 MINUTES, and the
// failure pointed away from its cause. The spray leaves all eight of these
// accounts LOCKED for the lockout TTL. On a re-run, `getLockState` short-circuits
// each attempt to 423 BEFORE `registerFailedAttempt` is reached, so the per-source
// counter never increments, never reaches 15, and no 429 is ever produced — the
// test then reports "the sprayer is eventually refused" as broken while the
// ceiling it is testing works perfectly. Verified by hand: 18 sprays against a
// clean source give `401 ×15, 429 ×3` and `login_ipfail:<src> = 15`.
//
// Note also how tight the probe is: 16 attempts against a threshold of 15 expects
// exactly ONE 429. Any single attempt that fails to increment the counter takes it
// to zero, which is precisely what stale locks did.
const SPRAY_EMAILS = Array.from({ length: 8 }, (_, i) => `spray-${i}@e2e.test`)

function clearSprayIdentities() {
  for (const email of SPRAY_EMAILS) clearLockout(email)
}

test.beforeAll(() => {
  clearAllAuthLockouts()
  clearSprayIdentities()
})
test.afterAll(() => {
  clearAllAuthLockouts()
  clearSprayIdentities()
})
test.beforeEach(() => {
  clearAllAuthLockouts()
  clearSprayIdentities()
  clearSourceCounters()
})

test.describe('PW-J1 · a stranger cannot deny a user their login', () => {
  test('GATE · five wrong guesses from a stranger do NOT lock the owner out (C1)', async () => {
    expect(
      await attemptLogin(VICTIM, PASSWORD, { source: VICTIM_HOME }),
      'baseline: the owner can log in from their own network',
    ).toBe(302)
    clearAllAuthLockouts()

    // The attack that used to work.
    const statuses = await failLogins(VICTIM, 5, { source: ATTACKER })
    expect(statuses.slice(0, 4), 'the first four guesses are ordinary failures').toEqual([
      401, 401, 401, 401,
    ])
    expect(statuses[4], 'the fifth locks the ATTACKER out').toBe(423)

    // THE GATE. Before C1 this was 423 — the victim was denied their own account.
    expect(
      await attemptLogin(VICTIM, PASSWORD, { source: VICTIM_HOME }),
      'AUTH-S1 regression: a stranger has locked the owner out of their own account. ' +
        'The lockout must stay scoped to (email, source) — see loginLockout.js scopedKey.',
    ).toBe(302)
  })

  test('GATE · brute force from the attacker’s own source is still stopped (C1 must not over-correct)', async () => {
    // The other half of the fix: it must not have simply disabled the lockout.
    await failLogins(VICTIM, 5, { source: ATTACKER })

    expect(isLockedForSource(VICTIM, ATTACKER), 'the attacking source is locked').toBe(true)
    expect(
      await attemptLogin(VICTIM, PASSWORD, { source: ATTACKER }),
      'and it stays locked even when it finally sends the CORRECT password — ' +
        'otherwise the lock would be decorative',
    ).toBe(423)
  })

  test('GATE · one source spraying many accounts is cut off (C1)', async () => {
    // The per-account counter never bounded this: locking one account per victim
    // costs 5 requests, so N victims cost 5N. The per-source ceiling is what stops it.
    const statuses = []
    for (let i = 0; i < 16; i += 1) {
      statuses.push(
        await attemptLogin(`spray-${Math.floor(i / 2)}@e2e.test`, 'wrong', { source: SPRAYER }),
      )
    }
    expect(statuses.filter((s) => s === 429).length, 'the sprayer is eventually refused').toBeGreaterThan(0)

    expect(
      await attemptLogin(VICTIM, PASSWORD, { source: SPRAYER }),
      'and that source cannot then reach a real account either',
    ).toBe(429)
    expect(
      await attemptLogin(VICTIM, PASSWORD, { source: VICTIM_HOME }),
      'while an unrelated source is unaffected — the ceiling is per-source, not global',
    ).toBe(302)
  })

  test('CONTROL · the lock is per-account, not global (must pass today)', async () => {
    await failLogins(VICTIM, 5, { source: ATTACKER })
    expect(isLockedInRedis(VICTIM), 'the target is locked for that source').toBe(true)
    expect(isLockedInRedis(OTHER), 'an untouched account is not collaterally locked').toBe(false)
    expect(await attemptLogin(OTHER, PASSWORD, { source: VICTIM_HOME }), 'and can log in').toBe(302)
  })

  test('CONTROL · lockout state is recoverable, so this suite cannot poison the run', async () => {
    await failLogins(VICTIM, 5, { source: ATTACKER })
    expect(isLockedInRedis(VICTIM)).toBe(true)

    clearLockout(VICTIM)

    expect(isLockedInRedis(VICTIM), 'every scoped key cleared').toBe(false)
    expect(lockMirror(VICTIM).failedCount, 'DB mirror reset').toBe(0)
    expect(await attemptLogin(VICTIM, PASSWORD, { source: ATTACKER }), 'login works again').toBe(302)
  })
})
