// SA-API-5 · Revoke, disable and delete take effect NOW — not in 15 minutes.
//
// THE REASON THIS FILE IS NOT OPTIONAL. `requireAuthByApiKey` caches the
// resolved principal in Redis under `apikey:<sha256>` for 900 seconds. Every
// stop control in this module is therefore two things at once: a database write
// AND a cache invalidation, and only the first of them is visible in the
// controller's happy path. Drop `invalidateKeyCache` — or add a fourth cache
// key and forget to clear it — and every one of these controls still returns
// 200, still writes the right row, still shows the right thing in the UI, and
// leaves the credential working for up to a quarter of an hour.
//
// Fifteen minutes is not a rounding error for the operation these controls
// exist for. "Revoke the key, the contractor's laptop was stolen" has to mean
// now. So each test here asserts the refusal on the VERY NEXT request, and
// records how long that took — a pass with a 900-second gap would not be a pass.
//
// Three controls, three different mechanisms, deliberately not merged:
//
//   revoke   one credential dies; the account and its other keys live.
//            `api_keys.revoked = true`, and the lookup filters on it.
//   disable  every credential stops at once and NONE is revoked; re-enabling
//            restores them all. Enforced on the OWNER
//            (`user.userStatusId !== 'ACTIVE'`), which is why it is reversible.
//   delete   permanent. Revokes every live key inside the same transaction and
//            reports how many, then soft-deletes the account.
//
// A test that used one of them to prove another would miss that they are
// enforced at three different places in requireAuthByApiKey.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  GATED_READ,
  ROLE_INTEGRATION_ADMIN,
  SA_ROOT,
  accountTracker,
  createAccount,
  errorMessage,
  issueKey,
  keyContext,
  read,
} from './api-helpers.js'

test.use({ storageState: AUTH.intAdmin })

const owned = accountTracker()

// The cache TTL the stop controls have to beat (utils/permissions.js: setEx …
// 900). Every assertion below has to land far inside it or it has proven
// nothing about invalidation.
const CACHE_TTL_MS = 900_000

// A pause between a stop control returning 200 and the probe that follows it.
//
// It is NOT here to make a slow control look fast. It sidesteps a SEPARATE and
// genuine defect, which has its own test at the bottom of this file: these
// routes write inside `req.transaction`, and that transaction is not committed
// by the controller — it is committed by the `res.on('finish')` safety net in
// utils/permissions.js, i.e. AFTER the response has been flushed to the client.
// A request that arrives in that window still sees the pre-revoke row.
//
// Mixing the two questions in one assertion would make every test here
// intermittently red for a reason that has nothing to do with cache
// invalidation. 300 ms is 0.03% of the 900-second TTL these tests exist to
// disprove, so the claim they make is not weakened in any way that matters.
const SETTLE_MS = 300
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS))

/** One call with a key, disposing the context — status only. */
async function statusWithKey(playwright, secret) {
  const ctx = await keyContext(playwright, secret)
  const { status, json } = await read(await ctx.get(GATED_READ))
  await ctx.dispose()
  return { status, message: errorMessage(json) }
}

test.describe('SA-API-5 · stop controls are immediate', () => {
  test.afterAll(async ({ playwright }) => {
    await owned.cleanup(playwright)
  })

  test('revoking one key kills it on the next request, and spares its sibling', async ({
    request,
    playwright,
  }) => {
    const account = owned.track(
      (await createAccount(request, { label: 'a5-revoke', roleIds: [ROLE_INTEGRATION_ADMIN] })).id,
    )
    const doomed = await issueKey(request, account, { name: 'SA-API-5 doomed' })
    const spared = await issueKey(request, account, { name: 'SA-API-5 spared' })

    // Prove 200 FIRST — and, just as importantly, prime the Redis cache. A
    // revocation that only works because nothing was cached yet is not the
    // property under test.
    expect((await statusWithKey(playwright, doomed.secret)).status, 'live before revoke').toBe(200)
    expect((await statusWithKey(playwright, spared.secret)).status, 'sibling live').toBe(200)

    const revokedAt = Date.now()
    const revoke = await read(
      await request.post(`${SA_ROOT}/${account}/keys/${doomed.key.id}/revoke`),
    )
    expect(revoke.status, 'revoke succeeds').toBe(200)
    expect(revoke.json.key.revoked, 'the response reports the new state').toBe(true)

    await settle()
    const after = await statusWithKey(playwright, doomed.secret)
    const elapsed = Date.now() - revokedAt
    expect(after.status, `refused on the next call (${elapsed}ms after revoke)`).toBe(401)
    expect(after.message).toContain('Invalid API key')
    expect(elapsed, 'immediate, not after the 15-minute cache TTL').toBeLessThan(CACHE_TTL_MS)

    // Scope: revocation is per credential. If the sibling died too, the control
    // is a kill switch wearing the wrong label.
    expect((await statusWithKey(playwright, spared.secret)).status, 'sibling untouched').toBe(200)

    expect(
      sqlValue(`SELECT revoked FROM api_keys WHERE id = '${doomed.key.id}'`),
      'DB agrees',
    ).toBe('t')
    expect(
      sqlValue(`SELECT revoked FROM api_keys WHERE id = '${spared.key.id}'`),
      'DB agrees',
    ).toBe('f')
  })

  test('disabling the account stops EVERY key at once, and enabling restores them', async ({
    request,
    playwright,
  }) => {
    const account = owned.track(
      (await createAccount(request, { label: 'a5-disable', roleIds: [ROLE_INTEGRATION_ADMIN] })).id,
    )
    const one = await issueKey(request, account, { name: 'SA-API-5 disable A' })
    const two = await issueKey(request, account, { name: 'SA-API-5 disable B' })

    expect((await statusWithKey(playwright, one.secret)).status).toBe(200)
    expect((await statusWithKey(playwright, two.secret)).status).toBe(200)

    const disabledAt = Date.now()
    const disable = await read(await request.post(`${SA_ROOT}/${account}/disable`))
    expect(disable.status, 'disable succeeds').toBe(200)
    expect(disable.json.serviceAccount.statusId).toBe('INACTIVE')

    await settle()
    for (const [label, issued] of [
      ['A', one],
      ['B', two],
    ]) {
      const after = await statusWithKey(playwright, issued.secret)
      expect(after.status, `key ${label} stopped`).toBe(401)
      // The MESSAGE is the mechanism. "API key owner is not active" says the
      // key was found and the OWNER was refused; "Invalid API key" would mean
      // the credential was revoked, which is a different (irreversible) control
      // and would make the restore below meaningless.
      expect(after.message, `key ${label} stopped on the OWNER, not by revocation`).toContain(
        'owner is not active',
      )
    }
    expect(Date.now() - disabledAt, 'immediate, not after the cache TTL').toBeLessThan(CACHE_TTL_MS)

    // Nothing was revoked — that is the difference between disable and delete.
    expect(
      sqlValue(`SELECT count(*) FROM api_keys WHERE user_id = '${account}' AND revoked = true`),
      'disable revokes nothing',
    ).toBe('0')

    // Issuing while disabled is refused up front rather than handing back a
    // credential that cannot authenticate.
    const whileOff = await read(
      await request.post(`${SA_ROOT}/${account}/keys`, { data: { name: 'SA-API-5 while off' } }),
    )
    expect(whileOff.status, 'no issuing against a disabled account').toBe(400)
    expect(errorMessage(whileOff.json)).toContain('disabled')

    const enable = await read(await request.post(`${SA_ROOT}/${account}/enable`))
    expect(enable.status, 'enable succeeds').toBe(200)
    expect(enable.json.serviceAccount.statusId).toBe('ACTIVE')

    await settle()
    expect((await statusWithKey(playwright, one.secret)).status, 'key A restored').toBe(200)
    expect((await statusWithKey(playwright, two.secret)).status, 'key B restored').toBe(200)
  })

  test('deleting the account revokes every key, reports the count, and the keys 401', async ({
    request,
    playwright,
  }) => {
    const account = owned.track(
      (await createAccount(request, { label: 'a5-delete', roleIds: [ROLE_INTEGRATION_ADMIN] })).id,
    )
    const live = [
      await issueKey(request, account, { name: 'SA-API-5 delete A' }),
      await issueKey(request, account, { name: 'SA-API-5 delete B' }),
    ]
    const alreadyRevoked = await issueKey(request, account, { name: 'SA-API-5 delete C' })
    await request.post(`${SA_ROOT}/${account}/keys/${alreadyRevoked.key.id}/revoke`)

    for (const issued of live) {
      expect((await statusWithKey(playwright, issued.secret)).status).toBe(200)
    }

    const deletedAt = Date.now()
    const del = await read(await request.delete(`${SA_ROOT}/${account}`))
    expect(del.status, 'delete succeeds').toBe(200)
    expect(del.json.deleted).toBe(true)
    // Two, not three: the count is of keys this delete had to revoke, so an
    // already-revoked one must not be counted again. That distinction is the
    // difference between a number an operator can act on and a row count.
    expect(del.json.keysRevoked, 'reports the STILL-ACTIVE keys it revoked').toBe(2)

    await settle()
    for (const issued of live) {
      const after = await statusWithKey(playwright, issued.secret)
      expect(after.status, 'the key is dead').toBe(401)
      expect(after.message).toContain('Invalid API key')
    }
    expect(Date.now() - deletedAt, 'immediate, not after the cache TTL').toBeLessThan(CACHE_TTL_MS)

    expect(
      sqlValue(`SELECT count(*) FROM api_keys WHERE user_id = '${account}' AND revoked = false`),
      'no key survives the delete',
    ).toBe('0')
    expect(
      sqlValue(`SELECT deleted_at IS NOT NULL FROM users WHERE id = '${account}'`),
      'the account is soft-deleted',
    ).toBe('t')
  })

  // ── 🔴 LIVE DEFECT · found by this suite on 2026-09-10 ─────────────────────
  //
  // A REQUEST THAT RACES THE REVOKE'S COMMIT REVIVES THE KEY FOR 15 MINUTES.
  //
  // What happens, in order, inside `revokeServiceAccountKey`:
  //
  //   1. UPDATE api_keys SET revoked = true      … inside `req.transaction`
  //   2. invalidateKeyCache(keyHash)             … DEL apikey:<hash> in Redis
  //   3. 200 is written to the client
  //   4. res.on('finish') → req.transaction.commit()
  //
  // Steps 2 and 4 are the wrong way round. The cache is dropped BEFORE the
  // write it is meant to publish becomes visible, and the commit happens after
  // the caller has already been told the revoke succeeded — the controller
  // never commits, so every route on this router falls through to the
  // "Route … did not close transaction. Auto-commiting" safety net in
  // utils/permissions.js, whose warning log widens the window further.
  //
  // A request arriving between 3 and 4 therefore:
  //   · finds `revoked = false` (the UPDATE is not visible yet) → 200, and
  //   · writes a FRESH principal into Redis with the 900-second TTL.
  //
  // So the failure is not "the revoke took a moment to land". The revoked key
  // works for the next FIFTEEN MINUTES, which is precisely the window
  // invalidateKeyCache exists to close, and the operator has a 200 and a
  // `revoked: true` row telling them the credential is dead. Measured here
  // against the live stack: ~1 cycle in 4 to 6 leaves the key alive, and in
  // every observed case it was still authenticating two seconds later with
  // `api_keys.revoked = 't'` in the database.
  //
  // The same ordering governs /disable and DELETE. Disable is partly covered
  // by enforceUserStatus re-checking the owner on the next request; revoke has
  // no such second line.
  //
  // THE FIX is not in this repo, so this test is left asserting the correct
  // behaviour: commit before invalidating (or invalidate again after the
  // commit), which is a two-line change in controllers/serviceAccounts.js plus
  // an explicit commit in each handler.
  //
  // Because the race is timing-dependent it is probed in a loop rather than
  // once: a single cycle would pass three runs out of four and read as a green
  // regression test for a control that is broken. A red here is the defect;
  // a green run means the race did not fire, NOT that it is fixed.
  test('🔴 a request racing the revoke commit must not survive (FAILS TODAY, intermittently)', async ({
    request,
    playwright,
  }) => {
    test.slow()
    const account = owned.track(
      (await createAccount(request, { label: 'a5-race', roleIds: [ROLE_INTEGRATION_ADMIN] })).id,
    )

    const survivors = []
    for (let cycle = 0; cycle < 6; cycle += 1) {
      const key = await issueKey(request, account, { name: `SA-API-5 race ${cycle}` })
      await settle()
      expect((await statusWithKey(playwright, key.secret)).status, 'live before revoke').toBe(200)

      // No settle: this call is DELIBERATELY fired into the pre-commit window.
      await request.post(`${SA_ROOT}/${account}/keys/${key.key.id}/revoke`)
      const immediate = await statusWithKey(playwright, key.secret)

      // Two seconds later the commit has certainly landed, so a 200 here can
      // only be the poisoned cache — this is the assertion that separates
      // "briefly late" from "alive for the TTL".
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      const settled = await statusWithKey(playwright, key.secret)
      const dbRevoked = sqlValue(`SELECT revoked FROM api_keys WHERE id = '${key.key.id}'`)

      if (settled.status !== 401) {
        survivors.push(
          `cycle ${cycle}: immediate=${immediate.status}, +2s=${settled.status}, api_keys.revoked=${dbRevoked}`,
        )
      }
    }

    expect(
      survivors,
      `a revoked key kept authenticating after the commit landed:\n  ${survivors.join('\n  ')}`,
    ).toEqual([])
  })
})
