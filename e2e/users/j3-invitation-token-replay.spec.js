// USER-J3 — ❓→🟢 Invitation token replay and expiry. WRITTEN TO RESOLVE A QUESTION.
//
// This is the one journey in the pack whose outcome was NOT known when it was
// specified. `invitation_tokens` carries `used_at` and `expires_at`, but
// whether anything enforced them had not been established — and "we do not know
// whether an invitation link can be replayed" is a worse state to ship in than
// any of the confirmed findings, because the answer decides whether account
// takeover is one forwarded email away.
//
// THE ANSWER IS GOOD. backend/api/controllers/auth/invitation.js selects with
//
//     where: { tokenHash, usedAt: null, expiresAt: { [Op.gt]: new Date() } }
//
// and stamps `usedAt` BEFORE setting the password, so both properties hold and
// the stamp is not contingent on the rest of the flow succeeding. These tests
// pin that, because it is the kind of correctness a later refactor removes by
// accident while every other invitation test stays green.
//
// HOW THE TOKEN IS MINTED. Only the sha256 hash is stored, and the raw token
// only ever exists in the outbound email — so a test cannot read one back out
// of the database. It mints its own instead: pick a random secret, insert the
// row with sha256(secret), and hold the secret. That is the same shape the real
// invite writes, so accepting it exercises the real code path.
//
// The subject is a throwaway user created and destroyed by this file. Nothing
// here touches a shared cast member — a test that leaves a fixture user in an
// unexpected state takes the whole suite down with it (see the afterAll).
//
// The subject is seeded INACTIVE, which is what the real create path writes
// (controllers/users.js) — acceptance is what flips them to ACTIVE. An earlier
// version seeded 'INVITED', a status nothing has ever written; migration
// 20260807141000 added the FK to `user_statuses` and the insert started failing
// loudly, which is the FK doing exactly its job.
import { test, expect } from '../../video/fixtures/videoTest.js'
import crypto from 'node:crypto'
import { COMPANY_ID, SITES, DEPARTMENTS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'

const API = 'http://e2elab.localhost:4000'
// Own id space (e2e1f...), so it cannot collide with a seeded cast member —
// including the ones other branches add. See the …15/…16 collision this branch
// already hit between the seed file and leftover training-branch rows.
const SUBJECT_ID = 'e2e1f000-0000-4000-8000-000000000003'
const SUBJECT_EMAIL = 'j3-invitee@e2e.test'
// Must clear the tenant password policy; the accept endpoint 422s otherwise and
// a 422 would look like a rejection, quietly turning the replay probe green.
const NEW_PASSWORD = 'E2E-Invite-Str0ng!2026'

/**
 * Mint a token and return BOTH halves.
 *
 * The hash matters as much as the secret, because this user does not have
 * exactly one token. Inserting a `users` row fires the audit trigger, whose
 * userCreatedSideEffect issues an invitation of its own — verified: a bare
 * INSERT with no invite call produces one token asynchronously. So every
 * assertion here is scoped by token_hash. An earlier version filtered by
 * user_id, picked whichever row psql returned first, and reported the freshly
 * used token as unused.
 */
function mintToken({ expiresInMinutes = 60 } = {}) {
  const secret = crypto.randomBytes(24).toString('hex')
  const hash = crypto.createHash('sha256').update(secret).digest('hex')
  sql(
    `INSERT INTO invitation_tokens (id, user_id, token_hash, expires_at, created_at, updated_at)
     VALUES (gen_random_uuid(), '${SUBJECT_ID}', '${hash}',
             NOW() + INTERVAL '${expiresInMinutes} minutes', NOW(), NOW())`,
  )
  return { secret, hash }
}

function usedAtSet(hash) {
  return sqlValue(`SELECT used_at IS NOT NULL FROM invitation_tokens WHERE token_hash = '${hash}'`)
}

async function accept(request, token) {
  return request.post(`${API}/v1/auth/invitation/accept`, {
    data: { token, password: NEW_PASSWORD },
  })
}

test.describe('USER-J3 · invitation tokens are single-use and time-boxed', () => {
  test.beforeEach(() => {
    // Rebuilt per test rather than once for the file: Playwright restarts the
    // worker after a failed test and re-runs beforeAll, which silently rewinds
    // shared setup mid-file. A per-test subject cannot be rewound out from
    // under a later assertion.
    //
    // UPSERT, not delete-and-recreate. Since 2026-08-07 the activation is
    // audited (F-09) and the invitee is the `performed_by` of their own
    // ACTIVATE row — `audit_logs.performed_by` is FK'd with RESTRICT, so a
    // user who has ever accepted an invitation can no longer be hard-deleted.
    // That is correct on both counts: audit rows are immutable, and the
    // application soft-deletes users anyway (controllers/users.js destroy()).
    // Only this fixture ever tried to remove one outright.
    sql(`DELETE FROM invitation_tokens WHERE user_id = '${SUBJECT_ID}'`)
    sql(
      `INSERT INTO users (id, first_name, last_name, email, user_status_id, company_id,
         language_id, time_zone, site_id, department_id, kind, invite_sent, is_owner, created_at, updated_at)
       VALUES ('${SUBJECT_ID}', 'Ivy', 'Invitee', '${SUBJECT_EMAIL}', 'INACTIVE', '${COMPANY_ID}',
         'en', 'America/New_York', '${SITES.primary.id}', '${DEPARTMENTS.quality.id}',
         'INTERNAL', true, false, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
         SET user_status_id = 'INACTIVE', email = EXCLUDED.email,
             password = NULL, deleted_at = NULL, updated_at = NOW()`,
    )
  })

  test.afterAll(() => {
    // Soft delete + email tombstone, for the FK reason above.
    // `users_company_email_unique` is partial on `deleted_at IS NULL`, so this
    // frees the address without removing the audit subject.
    sql(`DELETE FROM invitation_tokens WHERE user_id = '${SUBJECT_ID}'`)
    sql(
      `UPDATE users SET deleted_at = NOW(), user_status_id = 'INACTIVE',
          email = 'j3-purged-' || id || '@e2e.test'
        WHERE id = '${SUBJECT_ID}'`,
    )
  })

  test('🟢 CONTROL · a fresh token is accepted and activates the user', async ({ request }) => {
    // Establishes that the mint→accept path works at all. Without it, the two
    // rejection probes below would pass even if every accept were broken.
    const { secret, hash } = mintToken()
    const res = await accept(request, secret)
    expect(res.status(), `accept should succeed, got ${res.status()}`).toBeLessThan(300)

    expect(sqlValue(`SELECT user_status_id FROM users WHERE id = '${SUBJECT_ID}'`)).toBe('ACTIVE')
    expect(usedAtSet(hash), 'the token that was used is stamped used').toBe('t')
  })

  test('🟢 a token cannot be replayed', async ({ request }) => {
    const { secret, hash } = mintToken()

    const first = await accept(request, secret)
    expect(first.status(), 'the first use must succeed').toBeLessThan(300)
    expect(usedAtSet(hash), 'the first use consumed it').toBe('t')

    const replay = await accept(request, secret)
    expect(replay.status(), 'the SAME token must be refused the second time').toBe(400)

    // The rejection must come from used_at, not from a race that left the user
    // half-activated — assert the durable state too.
    expect(sqlValue(`SELECT user_status_id FROM users WHERE id = '${SUBJECT_ID}'`)).toBe('ACTIVE')
  })

  test('🟢 an expired token is refused', async ({ request }) => {
    const { secret, hash } = mintToken()
    sql(
      `UPDATE invitation_tokens SET expires_at = NOW() - INTERVAL '1 minute'
        WHERE token_hash = '${hash}'`,
    )

    const res = await accept(request, secret)
    expect(res.status(), 'an expired token must be refused').toBe(400)

    // Still INACTIVE — an expired link must not activate anyone.
    expect(sqlValue(`SELECT user_status_id FROM users WHERE id = '${SUBJECT_ID}'`)).toBe('INACTIVE')
    expect(usedAtSet(hash), 'a refused token is not consumed').toBe('f')
  })

  test('🟢 a token for a different secret does not open the account', async ({ request }) => {
    // Guards the obvious implementation slip: matching on user_id, or on a
    // truncated/unsalted comparison, rather than on the full hash.
    mintToken()
    const res = await accept(request, crypto.randomBytes(24).toString('hex'))
    expect(res.status(), 'an unrelated token must be refused').toBe(400)
    expect(sqlValue(`SELECT user_status_id FROM users WHERE id = '${SUBJECT_ID}'`)).toBe('INACTIVE')
  })
})
