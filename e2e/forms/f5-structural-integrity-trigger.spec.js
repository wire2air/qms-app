// FORMS-F5 — `enforce_form_template_integrity`, SQLSTATE QMSFT, probed as the
// superuser on purpose.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS TRIGGER IS FOR (F-05, F-06, and the database half of F-01/F-02)
//
// Four jobs, one BEFORE INSERT OR UPDATE trigger (migration 20260902101000):
//
//   1. Publication is SERVER-OWNED.  `public_token` is minted here and nowhere
//      else, and destroyed the moment a form stops being public.
//   2. Leaving ACTIVE REVOKES, and restoring does not republish.
//   3. Structural fields are write-once: company_id, kind, internal_name,
//      is_module, version.
//   4. The status machine has edges. One of the six moves is refused.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THESE PROBES RUN AS THE SUPERUSER, AND WHY THAT IS THE STRONGER TEST
//
// Most guards in this schema open with `v_trusted := current_user <> 'app_user'`
// so server code may do what a raw GraphQL mutation may not. This one
// deliberately has NO such split, and the migration says why: F-06 is a finding
// ABOUT THE REST PATH — `updateFormTemplate` accepted any `statusId` string and
// wrote it — so a guard that trusted the superuser connection would exempt
// exactly the caller the finding names.
//
// Sequelize connects as the superuser. `REST_RLS_ENABLED` is false by default,
// so on the REST path RLS does not fire at all and this trigger is the ONLY
// thing standing there. Probing it through `app_user` would therefore be
// probing the easy half. Every statement below runs on the superuser
// connection — the real REST connection — and every one of them is refused.
//
// A refusal here RAISES, unlike an RLS filter, so these are `ok === false` with
// the SQLSTATE checked. That difference is deliberate and is stated at each site.
//
// ─────────────────────────────────────────────────────────────────────────────
// MEASURED (app-db, superuser connection, 2026-09-01)
//
//   kind FORM→BLOCK / BLOCK→FORM   ERROR QMSFT  "cannot change kind"
//   internal_name rewrite          ERROR QMSFT  "…is permanent"
//   version 3 → 2                  ERROR QMSFT  "cannot go backwards"
//   version 3 → 4                  UPDATE 1     (monotonic, not frozen)
//   company_id move                ERROR QMSFT  "cannot be moved between companies"
//   is_public on a BLOCK           ERROR QMSFT  "Only an active standalone form…"
//   is_public on a DRAFT           ERROR QMSFT  the same message
//   ACTIVE → DRAFT                 ERROR QMSFT  "Illegal form template transition"
//   caller-supplied public_token   UPDATE 1, column UNCHANGED  ← silent, not an error
//   soft delete of an ACTIVE form  ERROR (form_templates_protect_referenced)
//   hard DELETE of an ACTIVE form  ERROR (the same guard, the DELETE branch)
//
// The ninth line is the one worth reading twice: supplying a token is NOT an
// error, it is silently ignored. It has to be — the SyncEngine client sends
// every declared property on every save, so a client that has never seen the
// token would send NULL and unpublish the form. Refusing would break ordinary
// saves; overwriting is the only behaviour that is both safe and usable. A test
// that asserted a raise there would be asserting a bug.
import { test, expect } from '@playwright/test'
import { ALT_COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  FORMS,
  ensureFormsFixtures,
  liveToken,
  publicationOf,
  sqlstateOf,
  superuserWrite,
} from '../fixtures/forms.js'

const STRUCT = FORMS.structural // FORM, DRAFT, carries an internal_name
const BLOCK = FORMS.block // BLOCK, ACTIVE
const LIVE = FORMS.published // FORM, ACTIVE, published

/** Assert a statement was refused BY THIS TRIGGER, and say so with its message. */
function expectQmsft(statement, reason) {
  const res = superuserWrite(statement)
  expect(res.ok, `${reason} — the statement must be REFUSED, it succeeded instead`).toBe(false)
  expect(sqlstateOf(res), `${reason} — refused with QMSFT (stderr: ${res.error})`).toBe('QMSFT')
  return res.error
}

/** …and its opposite: a statement of the same shape that must go through. */
function expectAccepted(statement, reason) {
  const res = superuserWrite(statement)
  expect(res.ok, `${reason} — it was refused: ${res.error}`).toBe(true)
  return res.output
}

test.beforeAll(() => {
  ensureFormsFixtures()
  expect(
    sqlValue(`SELECT internal_name FROM form_templates WHERE id = '${STRUCT.id}'`),
    'the write-once probes need a row that already carries an internal_name',
  ).toBe(STRUCT.internalName)
  expect(publicationOf(LIVE.id).isPublic, 'the publication probes need a published form').toBe(true)
})

test.describe('FORMS-F5 — structural fields are write-once, on every connection', () => {
  test('kind is immutable in both directions', () => {
    // F-05. FORM ⇄ BLOCK is not an edit, it is a different object: a FORM owns
    // records, a counter and possibly a public link; a BLOCK is a fragment
    // embedded in workflow steps and QC checklists. Flipping it strands
    // whichever half the row had — and, since F-04, moves the row between two
    // different RLS families in one statement.
    const forward = expectQmsft(
      `UPDATE form_templates SET kind = 'BLOCK' WHERE id = '${STRUCT.id}';`,
      'a FORM cannot become a BLOCK',
    )
    expect(forward, 'and the error explains the remedy').toMatch(/Clone it as the other kind/i)

    expectQmsft(
      `UPDATE form_templates SET kind = 'FORM' WHERE id = '${BLOCK.id}';`,
      'a BLOCK cannot become a FORM',
    )

    // PAIRED. Without this the two refusals above are equally consistent with
    // "no UPDATE on this table succeeds at all".
    expectAccepted(
      `UPDATE form_templates SET title = title WHERE id = '${STRUCT.id}';`,
      'an ordinary edit to the same row, on the same connection, still works',
    )
    expect(sqlValue(`SELECT kind FROM form_templates WHERE id = '${STRUCT.id}'`)).toBe('FORM')
    expect(sqlValue(`SELECT kind FROM form_templates WHERE id = '${BLOCK.id}'`)).toBe('BLOCK')
  })

  test('internal_name is write-once and company_id is immutable', () => {
    // `internal_name` is the module route, the `authz.modules` id and the
    // workflow resourceType all at once. Renaming it silently disagrees with
    // every grant that names it — which is a permission failure that presents as
    // a 404 on a nav link.
    expectQmsft(
      `UPDATE form_templates SET internal_name = 'e2erenamed' WHERE id = '${STRUCT.id}';`,
      'a promoted module cannot be renamed',
    )
    expectQmsft(
      `UPDATE form_templates SET internal_name = NULL WHERE id = '${STRUCT.id}';`,
      'nor un-named — NULL is "different", not "unset"',
    )
    // The permitted direction: NULL → value is promotion, and it must still work.
    // Applied and reverted through a rolled-back transaction so the fixture is
    // untouched.
    expectAccepted(
      `BEGIN;
       UPDATE form_templates SET internal_name = 'e2epromoted' WHERE id = '${FORMS.rlsForm.id}';
       ROLLBACK;`,
      'NULL → value is promotion and stays legal',
    )

    expectQmsft(
      `UPDATE form_templates SET company_id = '${ALT_COMPANY_ID}' WHERE id = '${STRUCT.id}';`,
      'a template cannot be moved between tenants',
    )
  })

  test('version is monotonic — pinned in direction, not in cadence', () => {
    const before = Number(
      sqlValue(`SELECT version FROM form_templates WHERE id = '${STRUCT.id}'`),
    )
    expect(before, 'the fixture has a version to move').toBeGreaterThanOrEqual(1)

    expectQmsft(
      `UPDATE form_templates SET version = ${before - 1} WHERE id = '${STRUCT.id}';`,
      'version cannot go backwards — records freeze template_version at submission',
    )

    // The pair, and the reason it is a pair rather than a second refusal: the
    // rule pinned here is the DIRECTION, not the cadence. `FormBlocksTab` bumps
    // the version only when a block is already ACTIVE, so editing a DRAFT's
    // schema legitimately leaves the version alone — a "version must increase
    // with schema" rule would break the builder, and is deliberately absent.
    expectAccepted(
      `BEGIN;
       UPDATE form_templates SET version = ${before + 1} WHERE id = '${STRUCT.id}';
       UPDATE form_templates SET schema = schema WHERE id = '${STRUCT.id}';
       ROLLBACK;`,
      'forwards is fine, and a schema edit at an unchanged version is fine too',
    )
    expect(
      Number(sqlValue(`SELECT version FROM form_templates WHERE id = '${STRUCT.id}'`)),
      'the probe left the fixture where it found it',
    ).toBe(before)
  })

  test('the status machine refuses exactly one edge, and permits the other five', () => {
    // F-06 asked for ARCHIVED → ACTIVE to be refused. That was declined, and the
    // reason is in the migration: that edge IS the product's Restore action, in
    // two places. Refusing it would break a working feature to fix a problem
    // that is not about the status machine — decoupling publication from status
    // answers the real complaint and is strictly stronger.
    //
    // The one refused move is ACTIVE → DRAFT: no caller in either repository
    // performs it, and a live form quietly reverting to Draft disappears from
    // every picker while its records keep pointing at it.
    expectQmsft(
      `UPDATE form_templates SET status_id = 'DRAFT' WHERE id = '${LIVE.id}';`,
      'ACTIVE → DRAFT is the one illegal edge',
    )

    // All five legal edges, walked in one rolled-back transaction on a row
    // nothing else in the suite depends on. Five acceptances beside one refusal
    // is what makes the refusal a MAP rather than a wall.
    expectAccepted(
      `BEGIN;
       UPDATE form_templates SET status_id = 'ACTIVE'   WHERE id = '${STRUCT.id}';  -- DRAFT->ACTIVE
       UPDATE form_templates SET status_id = 'ARCHIVED' WHERE id = '${STRUCT.id}';  -- ACTIVE->ARCHIVED
       UPDATE form_templates SET status_id = 'DRAFT'    WHERE id = '${STRUCT.id}';  -- ARCHIVED->DRAFT
       UPDATE form_templates SET status_id = 'ARCHIVED' WHERE id = '${STRUCT.id}';  -- DRAFT->ARCHIVED
       UPDATE form_templates SET status_id = 'ACTIVE'   WHERE id = '${STRUCT.id}';  -- ARCHIVED->ACTIVE (Restore)
       ROLLBACK;`,
      'the other five edges are all legal',
    )
    expect(
      sqlValue(`SELECT status_id FROM form_templates WHERE id = '${STRUCT.id}'`),
      'and the walk was rolled back',
    ).toBe('DRAFT')
  })

  test('only an ACTIVE standalone FORM can be published, and the token is server-owned', () => {
    // The eligibility half. A BLOCK is a fragment embedded in CAPA/CR child
    // steps and is never publicly fillable; a DRAFT is not live. Both refusals
    // are EXPLICIT errors rather than silent no-ops, because the caller asked
    // for something impossible and the Share dialog would otherwise report
    // success over a link that does not exist.
    expectQmsft(
      `UPDATE form_templates SET is_public = true WHERE id = '${BLOCK.id}';`,
      'a form BLOCK can never be published',
    )
    expectQmsft(
      `UPDATE form_templates SET is_public = true WHERE id = '${STRUCT.id}';`,
      'nor a DRAFT form',
    )
    expect(liveToken(BLOCK.id), 'and neither of them acquired a token').toBeNull()
    expect(liveToken(STRUCT.id)).toBeNull()

    // The ownership half, and it is SILENT rather than an error — see the header.
    const original = liveToken(LIVE.id)
    expect(original).toMatch(/^[0-9a-f]{64}$/)

    expectAccepted(
      `UPDATE form_templates SET public_token = '${'a'.repeat(64)}',
              public_published_at = '2000-01-01', public_published_by = NULL
         WHERE id = '${LIVE.id}';`,
      'a caller may SEND these columns — the SyncEngine sends every declared property on every save',
    )
    expect(
      liveToken(LIVE.id),
      'and the trigger carries the real token forward untouched: a token can never be CHOSEN, ' +
        'which is why it can never be guessed',
    ).toBe(original)
    expect(
      publicationOf(LIVE.id).publishedAt,
      'the stamp survives an ordinary edit too',
    ).not.toContain('2000-01-01')
  })

  test('leaving ACTIVE revokes, and restoring does not republish', () => {
    // The property that replaced "archive the form to withdraw the link".
    // Exercised on the live fixture and put back, because the assertion is about
    // a sequence rather than a single statement.
    const before = liveToken(LIVE.id)
    expect(before).toMatch(/^[0-9a-f]{64}$/)

    expectAccepted(
      `UPDATE form_templates SET status_id = 'ARCHIVED' WHERE id = '${LIVE.id}';`,
      'archiving is permitted',
    )
    const archived = publicationOf(LIVE.id)
    expect(archived.isPublic, 'archiving revokes — silently, because it was not a refusal').toBe(
      false,
    )
    expect(archived.token, 'and the token is destroyed, not parked').toBeNull()

    expectAccepted(
      `UPDATE form_templates SET status_id = 'ACTIVE' WHERE id = '${LIVE.id}';`,
      'Restore keeps working — that is why F-06’s requested edge refusal was declined',
    )
    const restored = publicationOf(LIVE.id)
    expect(restored.statusId, 'the form is live again').toBe('ACTIVE')
    expect(
      restored.isPublic,
      'and NOT republished — republishing is a separate, separately-audited act',
    ).toBe(false)
    expect(restored.token).toBeNull()

    // Put the fixture back, and confirm the new link is a DIFFERENT one.
    const reissued = sqlValue(
      `UPDATE form_templates SET is_public = true WHERE id = '${LIVE.id}' RETURNING public_token`,
    )
    expect(reissued).toMatch(/^[0-9a-f]{64}$/)
    expect(reissued, 'the archived form’s old URL is dead forever').not.toBe(before)
  })

  test('an ACTIVE template cannot be deleted at all — the module’s strongest guarantee', () => {
    // `form_templates_protect_referenced` predates this pass and had no test.
    // It is load-bearing for the whole module: archived rows ARE the version
    // history, and every record and workflow built from a template keeps
    // referencing it by id, so a delete is a dangling reference in a quality
    // record. Both branches are probed — the soft delete Sequelize's
    // `paranoid: true` performs, and the hard DELETE.
    //
    // These are NOT QMSFT: a different trigger, a different error class. The
    // distinction is worth keeping because a future refactor that folded this
    // rule into `enforce_form_template_integrity` should show up here as a
    // changed SQLSTATE, not pass silently.
    const soft = superuserWrite(
      `UPDATE form_templates SET deleted_at = NOW() WHERE id = '${LIVE.id}';`,
    )
    expect(soft.ok, 'a published ACTIVE form cannot be soft-deleted').toBe(false)
    expect(soft.error).toMatch(/archive them instead/i)

    const hard = superuserWrite(`DELETE FROM form_templates WHERE id = '${LIVE.id}';`)
    expect(hard.ok, 'nor hard-deleted').toBe(false)
    expect(hard.error).toMatch(/archive them instead/i)

    expect(publicationOf(LIVE.id).deleted, 'the row is untouched').toBe(false)

    // ── The pair, and it carries a finding of its own ───────────────────────
    // Deletion is reachable ONLY from DRAFT, and only for a template with no
    // `internal_name` and code <> 'TASK'. Combined with the publication rules —
    // which allow `is_public` only on an ACTIVE FORM, and force it false on the
    // way out of ACTIVE — a PUBLISHED template can never be soft-deleted. The
    // two guards compose: the archive-only rule gets there first, every time.
    //
    // So "soft-deleted" is not a distinct revocation path on this surface. It is
    // still probed in f2 as a refused *lookup* (the resolver's `deleted_at IS
    // NULL`), which is the only way it can be reached.
    const draftId = FORMS.softDeleted.id
    expect(
      publicationOf(draftId).statusId,
      'the deletable fixture is a DRAFT — the only status the guard admits',
    ).toBe('DRAFT')
    expect(
      publicationOf(draftId).deleted,
      'and it IS deleted, so the guard is a rule and not a blanket ban',
    ).toBe(true)
  })
})
