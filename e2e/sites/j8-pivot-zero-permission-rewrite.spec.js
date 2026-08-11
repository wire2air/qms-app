// PW-J8 — Zero-permission rewrite of the site↔log-book pivot.
//
// ✅ RESOLVED — `sites_on_log_books_update_rls` now carries the same
// `log_books:update` check as its INSERT and DELETE siblings, in BOTH the USING
// and the WITH CHECK halves. The 🔴 assertions below now pass and are kept as
// the standing regression guard: the finding is closed only for as long as they
// stay green. The mechanism description that follows documents the ORIGINAL
// defect — read it as history, not as current behaviour.
//
// ONE THING CHANGED SHAPE WITH THE FIX, and it matters for how the guards are
// written. The refusal is SILENT. Postgres enforces UPDATE's USING half by
// filtering the row out of the statement's scope rather than raising, so the
// mutation touches zero rows, PostGraphile reports no GraphQL error, and the
// attacker gets a null payload back. Stronger protection than an error, but an
// `expect(errors).not.toBeNull()` guard would go red on it. The two probes
// therefore assert "the write did not apply" — durable row state first, then a
// response that shows nothing landed — rather than "an error was raised".
//
// `sites_on_log_books` has four RLS policies. Two are right and two are not,
// and the disagreement between siblings IS the finding — a reviewer who saw
// only the failures below could conclude the pivot has no RLS at all. It does:
//
//   sites_on_log_books_insert_rls   company_id AND (owner OR log_books:update)  ✅
//   sites_on_log_books_delete_rls   company_id AND (owner OR log_books:update)  ✅
//   sites_on_log_books_update_rls   company_id                                  ❌
//   sites_on_log_books_select_rls   company_id                                  ❌ (read, less severe)
//
// So a member holding ZERO permissions of any kind cannot add a site to a log
// book and cannot remove one — but can silently repoint an existing link to a
// different site, or set deleted_at and make it vanish. Which site a log book
// belongs to determines who is expected to fill it in and where its records are
// filed; rewriting that is materially the same as removing the link, achieved
// through the one verb nobody gated.
//
// Both probes run at two layers on purpose: raw GraphQL (the path an attacker
// actually has — the SPA's permission computeds are not in it) and the policy
// itself (so a red result is unambiguous about which layer decided).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, SITES, LOG_BOOK, COMPANY_ID } from '../fixtures/cast.js'
import { graphql, expectMutationExists, asAppUser } from '../fixtures/sites.js'
import { sql, sqlValue } from '../fixtures/db.js'

const PIVOT = LOG_BOOK.pivotId
const UPDATE_PIVOT = `
  mutation UpdateSitesOnLogBook($input: UpdateSitesOnLogBookInput!) {
    updateSitesOnLogBook(input: $input) {
      sitesOnLogBook { id siteId deletedAt }
    }
  }`

function pivotState() {
  const row = sql(
    `SELECT site_id, coalesce(deleted_at::text,'') FROM sites_on_log_books WHERE id = '${PIVOT}'`,
  )
  const [siteId, deletedAt] = row.split('|')
  return { siteId, deletedAt: deletedAt || null }
}

/**
 * The mutation's own answer to "did this write apply?", as a pair.
 *
 * Two ways a raw-GraphQL write can be refused, and the pivot uses the quieter
 * one: either the request errors, or it comes back with no record (RLS filtered
 * the row out of the UPDATE's scope, so zero rows matched and there is nothing
 * to return). Anything else — a record echoed back carrying the attacker's
 * value — means the write landed.
 */
function applied({ errors, body }) {
  return { errored: errors !== null, record: body?.data?.updateSitesOnLogBook?.sitesOnLogBook ?? null }
}

/** Put the seeded pivot row back the way §15c left it. */
function restorePivot() {
  sql(
    `UPDATE sites_on_log_books SET site_id = '${SITES.primary.id}', deleted_at = NULL WHERE id = '${PIVOT}'`,
  )
}

test.describe('PW-J8 · the pivot UPDATE policy is gated on log_books:update', () => {
  test.beforeEach(() => restorePivot())
  test.afterAll(() => restorePivot())

  test('PRECONDITION · the probe subject exists and is owned by the primary site', () => {
    const state = pivotState()
    expect(state.siteId).toBe(SITES.primary.id)
    expect(state.deletedAt).toBeNull()
    // And the actor really does hold nothing.
    expect(
      Number(sqlValue(`SELECT count(*) FROM roles_on_users WHERE user_id = '${USERS.noAccess.id}'`)),
      'the noAccess persona holds no roles',
    ).toBe(0)
  })

  test('a zero-permission member cannot soft-delete the link (regression guard)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    await expectMutationExists(ctx, 'updateSitesOnLogBook')

    const response = await graphql(ctx, UPDATE_PIVOT, {
      input: { id: PIVOT, patch: { deletedAt: new Date().toISOString() } },
    })

    // The durable state is the primary assertion and comes first. A mutation
    // that "errors" after committing would satisfy a response-only assertion
    // while the row was already gone.
    expect(pivotState().deletedAt, 'the link must survive the attempt').toBeNull()

    // And the response must show the write never applied. Not "must raise an
    // error": the refusal is silent (see the header), so this asks the weaker,
    // true question — no record came back carrying the attacker's deletedAt.
    const { errored, record } = applied(response)
    expect(
      errored || record === null || record.deletedAt === null,
      `the mutation must not have applied — got ${errored ? 'an error' : JSON.stringify(record)}`,
    ).toBe(true)
    await ctx.close()
  })

  test('a zero-permission member cannot repoint the link to another site (regression guard)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    await expectMutationExists(ctx, 'updateSitesOnLogBook')

    const response = await graphql(ctx, UPDATE_PIVOT, {
      input: { id: PIVOT, patch: { siteId: SITES.secondary.id } },
    })

    expect(pivotState().siteId, 'the link must still point at the primary site').toBe(SITES.primary.id)

    const { errored, record } = applied(response)
    expect(
      errored || record === null || record.siteId === SITES.primary.id,
      `the mutation must not have applied — got ${errored ? 'an error' : JSON.stringify(record)}`,
    ).toBe(true)
    await ctx.close()
  })

  test('MECHANISM · the UPDATE policy itself matches nothing for a zero-permission actor', () => {
    const updated = asAppUser(
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
      `UPDATE sites_on_log_books SET site_id = '${SITES.secondary.id}' WHERE id = '${PIVOT}' RETURNING 1`,
    )
    // RLS silently filters non-matching rows rather than raising, so "no rows
    // updated" is what a correctly gated policy looks like from here.
    expect(updated, 'the policy must match zero rows for an actor with no grants').toBe('')
  })

  test('CONTROL · INSERT is correctly refused (must pass today)', () => {
    let raised = null
    try {
      asAppUser(
        { userId: USERS.noAccess.id, companyId: COMPANY_ID },
        `INSERT INTO sites_on_log_books (id, company_id, log_book_id, site_id, created_at, updated_at)
         VALUES (gen_random_uuid(), '${COMPANY_ID}', '${LOG_BOOK.id}', '${SITES.secondary.id}', NOW(), NOW())`,
      )
    } catch (err) {
      raised = String(err.stderr || err.message)
    }
    // A WITH_CHECK violation is a hard error, unlike the silent filtering above.
    expect(raised, 'INSERT must be rejected by the row-level security policy').toMatch(
      /row-level security/i,
    )
  })

  test('CONTROL · hard DELETE is correctly refused (must pass today)', () => {
    const deleted = asAppUser(
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
      `DELETE FROM sites_on_log_books WHERE id = '${PIVOT}' RETURNING 1`,
    )
    expect(deleted, 'DELETE must match zero rows for an actor with no grants').toBe('')
    expect(pivotState().siteId, 'and the row is still there').toBe(SITES.primary.id)
  })

  test('CONTROL · a log_books:update holder CAN legitimately repoint it (must pass today)', () => {
    // The gate the other three verbs use is real and satisfiable. This is what
    // stops the fix from being "deny everyone".
    const updated = asAppUser(
      { userId: USERS.siteAdmin.id, companyId: COMPANY_ID },
      `UPDATE sites_on_log_books SET site_id = '${SITES.secondary.id}' WHERE id = '${PIVOT}' RETURNING 1`,
    )
    expect(updated.trim(), 'log_books:update must still permit the legitimate edit').toBe('1')
  })

  test('🔴 a repoint leaves an audit trail at all (FAILS TODAY)', async ({ browser }) => {
    // The audit *trigger* is attached to sites_on_log_books — that much is
    // fine. What is missing is downstream: the table has no entry in the
    // worker's audit registry, so it falls through to DEFAULT_CONFIG, whose
    // trackFields are ['statusId','stateId','name','title','code']. The pivot
    // has none of those columns, hasRelevantChanges() returns false, and the
    // handler drops the event. No row is written, and nothing logs an error.
    //
    // So the change of record — which site a log book is filed under — is
    // untraceable even when performed legitimately, which is why this is
    // asserted against the LEGITIMATE path rather than the exploit.
    const before = Number(sqlValue(`SELECT count(*) FROM audit_logs WHERE entity_id = '${PIVOT}'`))

    const ctx = await browser.newContext({ storageState: AUTH.siteAdmin })
    const { errors } = await graphql(ctx, UPDATE_PIVOT, {
      input: { id: PIVOT, patch: { siteId: SITES.secondary.id } },
    })
    expect(errors, 'the legitimate repoint itself must succeed').toBeNull()
    await ctx.close()

    // The pipeline is asynchronous (trigger → graphile job → audit_event.js),
    // so poll rather than reading once; asserting an absence immediately would
    // be true for the wrong reason.
    const deadline = Date.now() + 20_000
    let after = before
    while (Date.now() < deadline && after === before) {
      await new Promise((r) => setTimeout(r, 1_500))
      after = Number(sqlValue(`SELECT count(*) FROM audit_logs WHERE entity_id = '${PIVOT}'`))
    }

    expect(after, 'repointing a log book to a different site must be auditable').toBeGreaterThan(before)

    const row = sql(
      `SELECT coalesce(old_value_json::text,''), coalesce(new_value_json::text,'')
         FROM audit_logs WHERE entity_id = '${PIVOT}' ORDER BY performed_at DESC LIMIT 1`,
    )
    const [oldJson, newJson] = row ? row.split('|') : ['', '']
    expect(oldJson, 'the entry records the previous site_id').toContain(SITES.primary.id)
    expect(newJson, 'the entry records the new site_id').toContain(SITES.secondary.id)
  })
})
