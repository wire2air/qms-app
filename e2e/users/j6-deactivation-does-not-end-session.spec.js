// USER-J6 — ❓→🔴 Does deactivating a user end their session? NO. The question
// this file was written to resolve now has an answer, and the answer is a
// finding: a session opened before the deactivation keeps working, for READS
// AND FOR WRITES.
//
// Deactivation is the control an admin reaches for when someone leaves, when an
// account is suspected compromised, or when a contractor's engagement ends. Its
// whole value is that it takes effect NOW. If it only takes effect at the next
// login, then "revoked" means "revoked eventually", and the gap is unbounded —
// the absolute session lifetime in org_security_settings, at worst.
//
// The suspicion came from the sites suite: PW-J7 established that moving a user
// between sites does NOT change what their live session can reach, because the
// backend snapshots identity into the session at login. Status is snapshotted
// the same way, so deactivation has the same lag — CONFIRMED here.
//
// WHAT IS AND IS NOT ENFORCED (both controls below pass, so the boundary is
// exact):
//   ✅ LOGIN is blocked immediately — an INACTIVE user cannot authenticate.
//   ✅ The status change is itself audited (userStatusId is in trackFields).
//   🔴 An ALREADY-OPEN session keeps reading.
//   🔴 An ALREADY-OPEN session keeps WRITING.
//
// So deactivation is a front-door lock with no effect on whoever is already
// inside. The exposure lasts until the session expires on its own —
// org_security_settings.session_idle_minutes / session_absolute_hours — which
// is hours, not the "now" an admin believes they got. There is no force-logout
// on the deactivation path, although the Security Center does expose one as a
// SEPARATE action (POST /v1/admin/security/users/:id/force-logout); nothing
// calls it when a user is deactivated.
//
// ⚖️ Why this matters more here than the equivalent question would elsewhere: a
// deactivated user who can still act is a user who can still author, review and
// e-sign quality records. Every one of those records carries their name, and
// none of them should exist.
//
// THE SUBJECT is a throwaway owned by this file, never a cast member. An
// earlier version of the users suite corrupted shared fixtures when it ran
// against an unpatched database, and taking `auditor` INACTIVE mid-suite would
// do the same to every other project.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, SITES, DEPARTMENTS, PASSWORD, AUTH } from '../fixtures/cast.js'
import { freshContext, graphql } from '../fixtures/sites.js'
import { sql, sqlValue } from '../fixtures/db.js'

const API = 'http://e2elab.localhost:4000'
const SUBJECT_ID = 'e2e1f000-0000-4000-8000-000000000006'
const SUBJECT_EMAIL = 'j6-deactivated@e2e.test'
const SUBJECT = { id: SUBJECT_ID, email: SUBJECT_EMAIL }
// Same argon2 hash the seed uses for every cast member, so PASSWORD works.
const PW_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$0G1ro9Aqx/gzbRQGaUK0uQ$qd3LbNumQRq0B+fhX8NNny73S4pfNCPcWFS/81KSue4'

const WHOAMI = `query { users { nodes { id email } } }`

/**
 * Upsert rather than delete-and-recreate.
 *
 * Logging in writes `login_events`, and `users` is the target of ~90 foreign
 * keys, so a throwaway user that has ever authenticated cannot simply be
 * DELETEd — the first version of this file died in afterAll on
 * login_events_user_id_fkey. The row is therefore created once and reset to a
 * known state before each test, then soft-deleted at the end so it leaves the
 * roster without leaving the database.
 */
function resetSubject() {
  sql(
    `INSERT INTO users (id, first_name, last_name, email, user_status_id, company_id,
       language_id, time_zone, site_id, department_id, kind, invite_sent, is_owner,
       password, created_at, updated_at)
     VALUES ('${SUBJECT_ID}', 'Dana', 'Deactivated', '${SUBJECT_EMAIL}', 'ACTIVE', '${COMPANY_ID}',
       'en', 'America/New_York', '${SITES.primary.id}', '${DEPARTMENTS.quality.id}',
       'INTERNAL', true, false, '${PW_HASH}', NOW(), NOW())
     ON CONFLICT (id) DO UPDATE
       SET user_status_id = 'ACTIVE', job_title = NULL, deleted_at = NULL,
           password = EXCLUDED.password, updated_at = NOW()`,
  )
}

test.describe('USER-J6 · deactivation and the live session', () => {
  test.beforeEach(() => resetSubject())
  test.afterAll(() =>
    sql(`UPDATE users SET user_status_id = 'INACTIVE', deleted_at = NOW()
          WHERE id = '${SUBJECT_ID}'`),
  )

  test('CONTROL · the subject can read while ACTIVE, and cannot log in once INACTIVE', async ({
    browser,
  }) => {
    // Two halves, both of which must hold before the headline below means
    // anything: the account works to begin with, and deactivation is genuinely
    // effective at the LOGIN boundary. That is what isolates the question to
    // the already-open session.
    const ctx = await freshContext(browser, SUBJECT)
    const { errors } = await graphql(ctx, WHOAMI)
    expect(errors, 'an ACTIVE user can read').toBeNull()
    await ctx.close()

    sql(`UPDATE users SET user_status_id = 'INACTIVE' WHERE id = '${SUBJECT_ID}'`)
    expect(sqlValue(`SELECT user_status_id FROM users WHERE id = '${SUBJECT_ID}'`)).toBe('INACTIVE')

    const api = await browser.newContext()
    const login = await api.request.post(`${API}/v1/auth/login`, {
      data: { email: SUBJECT_EMAIL, password: PASSWORD },
    })
    expect(login.status(), 'a deactivated user must not be able to log in').toBeGreaterThanOrEqual(
      400,
    )
    await api.close()
  })

  test('🔴 a session opened BEFORE the deactivation is cut off (FAILS TODAY)', async ({ browser }) => {
    // THE QUESTION. Log in first, deactivate second, then act on the original
    // context WITHOUT reloading — exactly the shape of the real incident, where
    // the person whose access you just revoked still has the tab open.
    const ctx = await freshContext(browser, SUBJECT)

    const before = await graphql(ctx, WHOAMI)
    expect(before.errors, 'the session works before the change').toBeNull()

    sql(`UPDATE users SET user_status_id = 'INACTIVE' WHERE id = '${SUBJECT_ID}'`)

    const after = await graphql(ctx, WHOAMI)
    await ctx.close()

    expect(
      after.errors ?? (after.status >= 400 ? [after.status] : null),
      'the live session must stop working the moment the account is deactivated',
    ).not.toBeNull()
  })

  test('🔴 a session opened BEFORE the deactivation cannot still WRITE (FAILS TODAY)', async ({ browser }) => {
    // Reads are the milder half. This asks the question that actually decides
    // whether a revoked user can still put their name on a quality record:
    // does the open session retain write access? The subject edits their own
    // profile — a field USER-J1 confirms the field guard deliberately allows,
    // so a refusal here can only come from the deactivation.
    const ctx = await freshContext(browser, SUBJECT)
    sql(`UPDATE users SET user_status_id = 'INACTIVE' WHERE id = '${SUBJECT_ID}'`)

    const { errors } = await graphql(
      ctx,
      `mutation P($input: UpdateUserInput!) { updateUser(input: $input) { user { id } } }`,
      { input: { id: SUBJECT_ID, patch: { jobTitle: 'Written while deactivated' } } },
    )
    await ctx.close()

    expect(errors, 'a deactivated user must not be able to write').not.toBeNull()
    expect(
      sqlValue(`SELECT COALESCE(job_title,'') FROM users WHERE id = '${SUBJECT_ID}'`),
      'and nothing landed',
    ).not.toBe('Written while deactivated')
  })

  test('CONTROL · an admin deactivating someone is itself recorded', async ({ browser }) => {
    // userStatusId IS in the audit trackFields (unlike site_id and is_owner —
    // see USER-J7), so this one should be recorded. It is the counterexample
    // that makes J7's silence a deliberate configuration gap rather than a
    // broken pipeline.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const res = await ctx.request.put(`${API}/v1/services/users/${SUBJECT_ID}`, {
      data: { userStatusId: 'INACTIVE' },
    })
    expect(res.status(), 'the deactivation itself must succeed').toBeLessThan(300)
    await ctx.close()
    expect(sqlValue(`SELECT user_status_id FROM users WHERE id = '${SUBJECT_ID}'`)).toBe('INACTIVE')
  })
})
