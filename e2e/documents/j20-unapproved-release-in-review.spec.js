// PW-J20 · OQ-01 TC-01-07 (URS-DOC-07) — the UNAPPROVED state PW-J13 did not
// probe: IN_REVIEW.
//
// ── WHAT PW-J13 ALREADY COVERS, AND WHERE IT STOPS ───────────────────────────
//
// PW-J13 is thorough about ONE unapproved state. It mints a v1.0 DRAFT and
// evidences four layers against it:
//
//   1. INTERFACE — no Set Effective affordance for owner / author / approver.
//   2. HTTP (status) — POST …/setEffective as the COMPANY OWNER on a DRAFT → 409.
//   3. HTTP (actor)  — the same POST as the AUTHOR → 409 (not the company owner).
//   4. DATABASE — DRAFT→EFFECTIVE refused on BOTH trigger paths (untrusted
//      app_user AND trusted superuser), plus INSERT-already-EFFECTIVE refused.
//
// So the HTTP layer and the DB trigger layer are BOTH covered — the requested
// "if only one layer is covered, add the other" is already satisfied for DRAFT.
// What is not covered is that DRAFT is not the only unapproved state a version
// can sit in, and PW-J13's own conclusion is stated in terms of ALL of them:
// it quotes the protocol's "The database permits no direct Draft-to-Effective
// transition on any path" and its closing arm is titled for the general seal.
//
// A version that has been SUBMITTED but not yet approved is IN_REVIEW. That is
// the state a real unapproved document actually spends its life in — a DRAFT is
// unapproved because nobody has looked at it; an IN_REVIEW version is unapproved
// because the reviewers have not finished. It is the state where premature
// release does the regulatory damage, and PW-J13 never reaches it.
//
// ── WHAT THIS FILE FOUND ─────────────────────────────────────────────────────
//
// KNOWN DEFECT DOC-REL-01. `enforce_document_version_transition()`'s trusted
// transition graph contains the edge **'IN_REVIEW->EFFECTIVE'**, alongside the
// legitimate 'APPROVED->EFFECTIVE'. Read directly from the live function body
// (and asserted as such below), the legal list is:
//
//   DRAFT->IN_REVIEW, REJECTED->IN_REVIEW, CHANGES_REQUESTED->IN_REVIEW,
//   CHANGES_REQUESTED->DRAFT, IN_REVIEW->DRAFT, IN_REVIEW->REJECTED,
//   IN_REVIEW->CHANGES_REQUESTED, IN_REVIEW->APPROVED,
//   IN_REVIEW->EFFECTIVE,  ← this one
//   APPROVED->EFFECTIVE, EFFECTIVE->SUPERSEDED
//
// Measured live on 2026-09-23: an IN_REVIEW version updated to EFFECTIVE on the
// trusted path SUCCEEDS. No approval row, no signature, no completed workflow
// step. By contrast REJECTED->EFFECTIVE and CHANGES_REQUESTED->EFFECTIVE are
// both refused by the same trigger — so this is one specific open edge, not a
// trigger that is generally inert, and that distinction is what makes the
// finding actionable rather than alarmist.
//
// ── IS IT REACHABLE? THE HONEST SCOPE OF THE FINDING ─────────────────────────
//
// No REST controller uses it. `setEffective` (backend/api/controllers/documents/
// versions.js:37) refuses anything that is not APPROVED with a 409, and the
// worker's `shouldBecomeEffectiveNow` (backend/worker/services/documentVersion/
// documentVersionEffective.js:39) returns false unless `status_id === 'APPROVED'`.
// The untrusted GraphQL path cannot change status at all. So today no shipped
// caller drives this edge, and this file says so rather than overstating it.
//
// It is still a real finding, for the reason the protocol gives for testing the
// database at all: the trigger is the LAST line of defence, the one that is
// supposed to hold when a controller is wrong. Its job is to make an unapproved
// release impossible on any path; it currently makes it impossible on every
// path except one, and that one is exactly the state a document under review
// occupies. A new worker task, a data fix, a migration or a support script
// reaching it would publish an unapproved controlled document and leave a clean
// audit trail behind it.
//
// This file therefore asserts what the REQUIREMENT demands (the edge should be
// refused) as a 🔴 FAILS-TODAY gate, and separately PINS the current behaviour
// so the diagnosis is preserved either way. Both arms are present deliberately:
// the pin keeps the file informative when the gate is red, and the gate is what
// turns green the day the edge is removed.
//
// ── HOW THE FIXTURE GETS HERE ────────────────────────────────────────────────
// Same reasoning as PW-J18: the version is minted at the data layer rather than
// driven through create → submit. Nothing in TC-01-07 is about creation or
// submission (PW-J1/J12 and PW-J13 cover those), and routing through the create
// form would make this file hostage to the seeded template's approval flow —
// which is precisely what PW-J13's header records going missing mid-2026-09-22.
// Every arm below still exercises the real trigger and the real HTTP route.
// Titles start 'E2E ' so documents.setup.js purges them.
//
// Measured 2026-09-23 against the live local stack (app-db + api :4000).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID, FIXTURES } from '../fixtures/cast.js'
import { uniqueTitle } from '../fixtures/documents.js'
import { sql, sqlValue, sqlAsAppUser } from '../fixtures/db.js'

const API = 'http://e2elab.localhost:4000'
const setEffectiveUrl = (docId, versionId) =>
  `${API}/v1/services/documents/${docId}/versions/${versionId}/setEffective`

const SEED_SOP_TEMPLATE_ID = 'e2e50000-0000-4000-8000-000000000001'
const SEED_WORKFLOW_VERSION_ID = 'e2ef0002-0000-4000-8000-000000000001'

/**
 * Mint a document whose v1.0 is IN_REVIEW — i.e. submitted, not yet approved.
 *
 * LOCAL helper, deliberately not added to e2e/fixtures/documents.js. Written as
 * the superuser psql connection, which is the TRUSTED trigger path — so the
 * DRAFT→IN_REVIEW hop the fixture needs is itself a legal edge and is performed
 * by the same guard the tests then probe. That is a fixture, not a bypass: the
 * version genuinely transits the lifecycle rather than being conjured into
 * IN_REVIEW by an INSERT the guard would have refused.
 *
 * `is_latest` is left to the demote trigger. `doc_number` is left NULL because
 * numbering is deferred to submission by the real path and nothing here depends
 * on it.
 */
function seedInReviewVersion(tag) {
  const title = uniqueTitle(tag)
  const out = sql(`
    WITH d AS (
      INSERT INTO documents (
        id, company_id, title, status_id, author_id, user_id, department_id, site_id, prefix,
        document_template_id, workflow_version_id, periodic_review_months,
        auto_effective_on_approval, applies_all_sites, created_at, updated_at)
      SELECT gen_random_uuid(), '${COMPANY_ID}', '${title}', 'ACTIVE',
             '${USERS.author.id}', '${USERS.author.id}', u.department_id, u.site_id,
             '${FIXTURES.sopTemplatePrefix}', '${SEED_SOP_TEMPLATE_ID}',
             '${SEED_WORKFLOW_VERSION_ID}', 12, true, true, now(), now()
        FROM users u WHERE u.id = '${USERS.author.id}'
      RETURNING id
    ), v AS (
      INSERT INTO document_versions (
        id, company_id, document_id, version_major, version_minor, status_id, is_latest,
        created_at, updated_at)
      SELECT gen_random_uuid(), '${COMPANY_ID}', d.id, 1, 0, 'DRAFT', true, now(), now() FROM d
      RETURNING id, document_id
    )
    SELECT v.document_id || '|' || v.id FROM v;
  `)
  const [documentId, versionId] = out.trim().split('|')
  expect(documentId, 'the fixture document really was written').toMatch(/^[0-9a-f-]{36}$/)

  // The legal DRAFT→IN_REVIEW hop, through the guard itself.
  sql(`UPDATE document_versions SET status_id = 'IN_REVIEW' WHERE id = '${versionId}'`)
  expect(
    statusOf(versionId),
    'the fixture version is IN_REVIEW — submitted, and NOT approved',
  ).toBe('IN_REVIEW')
  return { documentId, versionId, title }
}

/** Status of one version, straight from the database. */
function statusOf(versionId) {
  return sqlValue(`SELECT status_id FROM document_versions WHERE id = '${versionId}'`)
}

/** The live transition-graph source, so assertions cite the product not a memory. */
function transitionFunctionBody() {
  return sqlValue(
    `SELECT pg_get_functiondef(oid) FROM pg_proc
      WHERE proname = 'enforce_document_version_transition'`,
  )
}

/**
 * Try one trusted-path status write inside a rolled-back transaction.
 * Returns `{ accepted, error }` — the interesting outcome is usually a refusal,
 * so this reports rather than throws.
 */
function trustedTransition(versionId, toStatus) {
  try {
    sql(
      `BEGIN; UPDATE document_versions SET status_id = '${toStatus}' WHERE id = '${versionId}'; ROLLBACK;`,
    )
    return { accepted: true, error: '' }
  } catch (err) {
    return { accepted: false, error: `${err.stderr ?? ''}` }
  }
}

// ── Worker-discard guard ────────────────────────────────────────────────────
// Playwright discards a worker after a failing test and RUNS the file's pending
// `afterAll` before continuing in a fresh one, but the `beforeAll` of an
// already-entered describe does NOT re-run. Here `beforeAll` seeds the IN_REVIEW document and `afterAll` hard-deletes it,
// so a discard would leave later tests probing a document row that no longer
// exists and reading the 404 as an unapproved-release finding.
//
// Serial mode makes Playwright SKIP the remainder instead of replaying it
// against torn-down state, so one real failure stays one failure instead of
// printing as several. See complaints/j11 for the alternative fix (arrange per
// describe), which suits files whose tests can cheaply own their fixtures.
test.describe.configure({ mode: 'serial' })

test.describe('PW-J20 · TC-01-07 · an IN_REVIEW (submitted, unapproved) version cannot be released', () => {
  let documentId
  let versionId

  test.beforeAll(() => {
    ;({ documentId, versionId } = seedInReviewVersion('J20-inreview'))
  })

  test.afterAll(() => {
    // Leave the tenant as found. The fixture is a real row (the probes roll
    // back, the fixture does not), so this file cleans up after itself rather
    // than relying on the next run's purge.
    if (documentId) {
      sql(`DELETE FROM document_sections WHERE document_id = '${documentId}'`)
      sql(`DELETE FROM document_versions WHERE document_id = '${documentId}'`)
      sql(`DELETE FROM documents WHERE id = '${documentId}'`)
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // PREMISE — the version really is unapproved, by every measure that counts.
  // ─────────────────────────────────────────────────────────────────────────

  test('PREMISE · the fixture is genuinely unapproved — IN_REVIEW, never APPROVED, with no signature and no completed approval step', () => {
    // Every arm below means nothing unless the subject is actually unapproved,
    // and "status says IN_REVIEW" is the weakest of the available evidence. So
    // all four independent facts are asserted, and each is a different table.
    expect(statusOf(versionId), 'the version is IN_REVIEW').toBe('IN_REVIEW')

    // It never passed through APPROVED or EFFECTIVE — read from the audit trail,
    // which is the record an auditor would consult. Note the column names: this
    // table is `entity_type`/`entity_id`/`action` with `old_value_json` /
    // `new_value_json`, and lifecycle events are recorded as the ACTION verb
    // ('APPROVE', 'SET_EFFECTIVE', 'SUBMIT_FOR_REVIEW', 'SUPERSEDE'), NOT as a
    // status_id inside the JSON — a `new_value_json->>'status_id'` filter here
    // matches nothing on any row and would pass vacuously.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE entity_type = 'DocumentVersions' AND entity_id = '${versionId}'
              AND action IN ('APPROVE', 'SET_EFFECTIVE')`,
        ),
      ),
      'the audit trail records no approval and no release for this version',
    ).toBe(0)

    // No e-signature is attached to it by either route the signatures table
    // offers for a document version. `workflow_instances` keys its subject as
    // `resource_type`/`resource_id` (not `entity_id`, which is the
    // `task_instances` spelling) — the two tables genuinely differ.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM signatures s
            WHERE s.deleted_at IS NULL
              AND (s.task_instance_id IN (SELECT id FROM task_instances WHERE entity_id = '${versionId}')
                OR s.workflow_instance_step_id IN (
                     SELECT wis.id FROM workflow_instance_steps wis
                      JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
                      WHERE wi.resource_id = '${versionId}'))`,
        ),
      ),
      'no e-signature exists against this version',
    ).toBe(0)

    // And no approval task was ever completed against it.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM task_instances
            WHERE entity_id = '${versionId}' AND status_id = 'APPROVED' AND deleted_at IS NULL`,
        ),
      ),
      'no approval task against this version has been completed',
    ).toBe(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // LAYER: HTTP — covered for DRAFT by PW-J13, extended here to IN_REVIEW.
  // ─────────────────────────────────────────────────────────────────────────

  test('HTTP · the company owner is refused 409 when releasing an IN_REVIEW version, and the message names the actual status', async ({
    browser,
  }) => {
    // PW-J13 proves this for DRAFT. The controller's check is
    // `version.statusId !== APPROVED` (controllers/documents/versions.js:37),
    // so IN_REVIEW should be refused identically — asserted rather than assumed,
    // because a status-specific allowance is exactly the kind of thing that gets
    // added to a controller for a support case and never noticed.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const res = await ctx.request.post(setEffectiveUrl(documentId, versionId), { data: {} })
    expect(res.status(), 'company owner + IN_REVIEW ⇒ 409 Conflict').toBe(409)
    const body = await res.text()
    expect(body).toMatch(/only APPROVED versions can be set to EFFECTIVE/i)
    expect(
      body,
      'and the refusal names the status it actually found — IN_REVIEW, not DRAFT',
    ).toMatch(/IN_REVIEW/)
    expect(statusOf(versionId), 'nothing was written').toBe('IN_REVIEW')
    await ctx.close()
  })

  test('HTTP · the Author is refused 409 on an IN_REVIEW version — the owner-only actor gate fires first', async ({
    browser,
  }) => {
    // The author holds document_control:update, so `enforcePermission` ADMITS
    // them; the refusal is the controller's separate `user.isOwner !== true`
    // gate, which runs BEFORE the status check. Asserted on the message, so that
    // a reordering of those two gates (which would change which failure a
    // non-owner sees) is visible here.
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const res = await ctx.request.post(setEffectiveUrl(documentId, versionId), { data: {} })
    expect(res.status(), 'non-owner ⇒ 409 Conflict').toBe(409)
    expect(await res.text()).toMatch(/only the company owner can make a version effective/i)
    expect(statusOf(versionId), 'nothing was written').toBe('IN_REVIEW')
    await ctx.close()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // LAYER: DATABASE, untrusted — sealed, as PW-J13 found for DRAFT.
  // ─────────────────────────────────────────────────────────────────────────

  test('DATABASE (untrusted) · IN_REVIEW→EFFECTIVE is refused on the raw-GraphQL path', () => {
    // app_user is the role every PostGraphile mutation runs as. The untrusted
    // arm of the guard refuses ANY status change regardless of edge, so this is
    // expected to hold — and it is asserted anyway, because it is the layer that
    // makes the trusted-path finding below survivable: the open edge is not
    // reachable by a hand-rolled mutation.
    //
    // The AUTHOR is used deliberately: they pass `document_version_update_rls`
    // (update grant + collaborator on their own document), so the statement
    // REACHES the trigger. A persona RLS filters out would produce a silent
    // 0-row UPDATE that reads exactly like a passing guard.
    const r = sqlAsAppUser(
      `BEGIN; UPDATE document_versions SET status_id = 'EFFECTIVE' WHERE id = '${versionId}'; ROLLBACK;`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(r.ok, 'the statement was REJECTED, not silently applied').toBe(false)
    expect(r.error).toMatch(
      /status cannot be changed directly \(attempted IN_REVIEW -> EFFECTIVE\)/i,
    )
    expect(statusOf(versionId)).toBe('IN_REVIEW')

    // CONTROL — the same persona, the same table, a write the policy DOES admit.
    // Without it, the refusal above is indistinguishable from "this persona can
    // write nothing here", which would make the guard look effective when RLS
    // was doing all the work.
    const allowed = sqlAsAppUser(
      `BEGIN; UPDATE document_versions SET change_summary = 'J20 control write'
         WHERE id = '${versionId}'; ROLLBACK;`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(
      allowed.ok,
      `CONTROL: the same persona CAN write a non-lifecycle column, so the refusal above is the guard. stderr: ${allowed.error}`,
    ).toBe(true)
    expect(allowed.output, 'and it really affected the row').toMatch(/UPDATE 1/)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // LAYER: DATABASE, trusted — THE FINDING.
  // ─────────────────────────────────────────────────────────────────────────

  test('🔴 DOC-REL-01 (FAILS TODAY) · DATABASE (trusted) · IN_REVIEW→EFFECTIVE must be refused — an unapproved version must not be publishable on ANY path', () => {
    // 🔴 THIS TEST IS EXPECTED TO FAIL against current code. It asserts what
    // URS-DOC-07 / TC-01-07 DEMANDS, not what the product does, per the honesty
    // rule: the requirement is that no path can release an unapproved version,
    // and the protocol's own note is that the restriction is "enforced at the
    // server, not merely hidden in the interface. The database permits no direct
    // Draft-to-Effective transition on any path."
    //
    // IN_REVIEW is unapproved. The trusted transition graph permits
    // IN_REVIEW->EFFECTIVE. So the seal the protocol describes does not hold for
    // the one unapproved state a submitted document actually occupies.
    //
    // It goes GREEN the day 'IN_REVIEW->EFFECTIVE' is removed from
    // enforce_document_version_transition(). Until then the pin below records
    // what actually happens, so the file stays diagnostic while this is red.
    const r = trustedTransition(versionId, 'EFFECTIVE')
    expect(
      r.accepted,
      'an unapproved (IN_REVIEW) version must NOT be publishable on the trusted path either',
    ).toBe(false)
    expect(r.error).toMatch(/Illegal document version status transition: IN_REVIEW -> EFFECTIVE/i)
  })

  test('PIN · the actual behaviour today: the trusted path ACCEPTS IN_REVIEW→EFFECTIVE, publishing an unapproved version', () => {
    // The diagnostic twin of the gate above. Pinned rather than merely described
    // so the finding survives in executable form: this is the measurement, and
    // it is what turns RED when the fix lands (at which point this test is
    // deleted and the 🔴 gate above becomes the permanent guard).
    //
    // Run inside BEGIN … ROLLBACK, so the fixture is untouched and no unapproved
    // document is ever actually published by this suite.
    const before = statusOf(versionId)
    const out = sql(`
      BEGIN;
      UPDATE document_versions SET status_id = 'EFFECTIVE' WHERE id = '${versionId}';
      SELECT status_id FROM document_versions WHERE id = '${versionId}';
      ROLLBACK;`)
    expect(
      out.trim().split('\n').pop(),
      'KNOWN DEFECT DOC-REL-01: the version reached EFFECTIVE with no approval, no signature, no completed step',
    ).toBe('EFFECTIVE')
    expect(statusOf(versionId), 'the rollback held — the fixture is unchanged').toBe(before)

    // The source of the defect, cited from the live function rather than from a
    // memory of it, so the diagnosis cannot go stale without failing.
    expect(
      transitionFunctionBody(),
      "the trusted transition graph literally contains the 'IN_REVIEW->EFFECTIVE' edge",
    ).toContain("'IN_REVIEW->EFFECTIVE'")
  })

  test('CONTROL · the trigger is NOT generally inert — REJECTED→EFFECTIVE and CHANGES_REQUESTED→EFFECTIVE are both refused', () => {
    // THIS IS THE ARM THAT MAKES DOC-REL-01 CREDIBLE. A finding of the form
    // "the database let an illegal transition through" is worthless if the
    // trigger turns out to be detached, mis-armed or SECURITY DEFINER-neutered
    // — a failure mode this codebase has hit before (a Quality Events lifecycle
    // guard sat inert for eight days). If the guard were dead, EVERY edge would
    // be accepted and DOC-REL-01 would be a symptom, not the disease.
    //
    // Both sibling unapproved states are probed on the same fixture, through the
    // same trusted path. Both are refused. So the guard is live, the graph is
    // being consulted, and IN_REVIEW->EFFECTIVE is ONE SPECIFIC OPEN EDGE.

    // Move the fixture to REJECTED (a legal edge) and probe, then put it back.
    sql(`UPDATE document_versions SET status_id = 'REJECTED' WHERE id = '${versionId}'`)
    expect(statusOf(versionId), 'fixture parked at REJECTED for the probe').toBe('REJECTED')
    const fromRejected = trustedTransition(versionId, 'EFFECTIVE')
    expect(fromRejected.accepted, 'REJECTED→EFFECTIVE is REFUSED').toBe(false)
    expect(fromRejected.error).toMatch(
      /Illegal document version status transition: REJECTED -> EFFECTIVE/i,
    )

    sql(`UPDATE document_versions SET status_id = 'IN_REVIEW' WHERE id = '${versionId}'`)
    sql(`UPDATE document_versions SET status_id = 'CHANGES_REQUESTED' WHERE id = '${versionId}'`)
    const fromChanges = trustedTransition(versionId, 'EFFECTIVE')
    expect(fromChanges.accepted, 'CHANGES_REQUESTED→EFFECTIVE is REFUSED').toBe(false)
    expect(fromChanges.error).toMatch(
      /Illegal document version status transition: CHANGES_REQUESTED -> EFFECTIVE/i,
    )

    // Restore the fixture for any later arm, and prove the restore took.
    sql(`UPDATE document_versions SET status_id = 'IN_REVIEW' WHERE id = '${versionId}'`)
    expect(statusOf(versionId), 'fixture restored to IN_REVIEW').toBe('IN_REVIEW')

    // And the positive control on the guard itself: the one edge that SHOULD be
    // legal from here still is, so the refusals above are the graph and not a
    // blanket freeze on the row.
    const legal = trustedTransition(versionId, 'APPROVED')
    expect(
      legal.accepted,
      `CONTROL: IN_REVIEW→APPROVED (a legal edge) is still ACCEPTED. stderr: ${legal.error}`,
    ).toBe(true)
    expect(statusOf(versionId), 'and it rolled back').toBe('IN_REVIEW')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // The reachability question, answered honestly in both directions.
  // ─────────────────────────────────────────────────────────────────────────

  test('SCOPE · the open edge has no shipped caller — the HTTP route refuses every non-APPROVED status, probed state by state', async ({
    browser,
  }) => {
    // The finding's blast radius, measured rather than argued. DOC-REL-01 is a
    // hole in the LAST line of defence; whether it is also a live release path
    // depends entirely on whether any shipped caller can drive it. Today none
    // can, and this test is where a change to that is caught.
    //
    // THE ONLY CALLER THAT CAN SET EFFECTIVE OVER HTTP is `setEffective`
    // (backend/api/controllers/documents/versions.js), whose check is
    // `version.statusId !== APPROVED` → 409. Rather than trust one status, the
    // fixture is walked through EVERY unapproved state the lifecycle can reach
    // from here and the owner's release attempt is refused at each one. A
    // status-specific allowance added to that controller for a support case
    // would show up here as a single green-that-should-be-red.
    //
    // NOTE ON WHY THIS IS NOT AN AUDIT-TRAIL QUERY. The obvious form of this
    // test — "no EFFECTIVE version in this tenant lacks an APPROVE row in
    // audit_logs" — is unsound HERE, and measurably so: every released version
    // in the E2E tenant was written by a seed or a fixture rather than driven
    // through the product, so all five carry ZERO `audit_logs` rows of any
    // action. That query returns a comfortable-looking pass built entirely on
    // records that never had a trail to begin with, which is the vacuous pass
    // this file is required not to manufacture.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    try {
      for (const status of ['IN_REVIEW', 'REJECTED', 'CHANGES_REQUESTED', 'DRAFT']) {
        // Park the fixture at each state through legal edges only, so the guard
        // itself does the moving and nothing is conjured past it.
        if (statusOf(versionId) !== 'IN_REVIEW') {
          sql(`UPDATE document_versions SET status_id = 'IN_REVIEW' WHERE id = '${versionId}'`)
        }
        if (status !== 'IN_REVIEW') {
          sql(`UPDATE document_versions SET status_id = '${status}' WHERE id = '${versionId}'`)
        }
        expect(statusOf(versionId), `fixture parked at ${status}`).toBe(status)

        const res = await ctx.request.post(setEffectiveUrl(documentId, versionId), { data: {} })
        expect(res.status(), `the company owner is refused 409 on a ${status} version`).toBe(409)
        expect(await res.text()).toMatch(/only APPROVED versions can be set to EFFECTIVE/i)
        expect(statusOf(versionId), `and the ${status} version was not written`).toBe(status)
      }

      // CONTROL — the route is not simply refusing everything. From APPROVED,
      // the same owner, the same request, SUCCEEDS. Without this arm the four
      // refusals above would be equally consistent with a broken endpoint, and
      // the scope claim ("no caller can drive the open edge") would rest on a
      // route that cannot drive anything at all.
      sql(`UPDATE document_versions SET status_id = 'IN_REVIEW' WHERE id = '${versionId}'`)
      sql(`UPDATE document_versions SET status_id = 'APPROVED' WHERE id = '${versionId}'`)
      const ok = await ctx.request.post(setEffectiveUrl(documentId, versionId), { data: {} })
      expect(
        ok.status(),
        `CONTROL: an APPROVED version IS released by the same route (body: ${await ok
          .text()
          .catch(() => '')})`,
      ).toBe(200)
      expect(statusOf(versionId), 'and the release really happened').toBe('EFFECTIVE')
    } finally {
      await ctx.close()
    }
  })
})
