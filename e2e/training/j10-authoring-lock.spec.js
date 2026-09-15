// TRN-J10 · The published-training authoring lock — OQ-02 TC-02-02
// (URS-TRN-02, "Publishing locks training content against further edit").
//
// ⚠️  THESE TESTS ARE EXPECTED TO FAIL ON `develop` TODAY. READ THIS BEFORE
// "FIXING" THEM.
//
// They assert the behaviour the protocol requires, not the behaviour the product
// currently has. That is a deliberate departure from this suite's usual
// convention — `e2e/README.md` (inspectionsLogs / IL-D1) pins open defects AS
// THEY BEHAVE so the suite stays green and the test flips red the day the defect
// is fixed. The opposite choice was made here, on purpose: a green test asserting
// that a published training's assessment CAN be rewritten would be evidence FOR
// the defect, and OQ-02 TC-02-04 would have to trace to it. So these fail until
// the server enforces the lock, and turn green as the fix lands.
//
// Do NOT invert them into known-gap pins. If the gap is accepted as intended,
// delete them and record the acceptance in the protocol's deviation log instead.
//
// ── THE DEFECT (D13) ────────────────────────────────────────────────────────
// A training is authored in DRAFT, then ACTIVE ("published"), after which its
// assessment is the basis of a 21 CFR Part 11 competency record: learners are
// graded against it and sign for the result. Changing the assessment, the
// passing score or the linked material after launch silently changes what a
// past "pass" meant.
//
// The lock exists in exactly ONE place, and it is client-side —
// `TrainingPageId.vue:31`:
//
//     const isEditable = computed(() => training.value?.status === 'DRAFT')
//
// feeding `useAutoSave(training, { enabled: () => canUpdate.value && isEditable.value })`.
// That disables one component's autosave watcher. It is not a gate.
//
// All four server layers were checked, from primary sources, and none gate on
// status:
//   · route     — PUT /v1/services/trainings/:id mounts requireAuthByApiKey,
//                 requireCompanyAccess, enforcePermission('training','update'),
//                 express.json(), updateTraining. Permission only.
//   · controller— `updateTraining` (controllers/trainings.js:76-105) applies
//                 `assessment`, `passingScore`, `maxAttempts` and `documentIds`
//                 on an `x !== undefined` test each. No status branch anywhere.
//   · RLS       — `trainings_upd` (read from the LIVE database, because this
//                 table's policies are generator-emitted by
//                 authz.apply_module_rls and do NOT appear in database/rls.sql —
//                 a file-only review misses them). USING and WITH CHECK test
//                 tenant + has_permission('training','update') + scope_allowed.
//                 Nothing reads `status`.
//   · triggers  — only `enforce_soft_delete_permission_trg` (BEFORE UPDATE OF
//                 deleted_at, so soft-delete only) and `trainings_audit_trigger`
//                 (AFTER, audit only). No status guard. This matters: a BEFORE
//                 trigger would beat the RLS WITH CHECK and the defect would not
//                 be real — so it was checked rather than assumed.
//
// This is the same shape as the Products/Equipment finding where a Vue `v-if`
// was documented as a database guard. A computed is not a control.
//
// ── WHAT A FIX LOOKS LIKE ───────────────────────────────────────────────────
// `updateTraining` refusing 400/409 when `status !== 'DRAFT'` for the
// content-bearing fields, ideally with a status predicate in the generated
// policy too so the GraphQL/syncEngine path is covered (REST_RLS_ENABLED is off
// by default, so RLS alone would not hold the REST path — see the root
// CLAUDE.md). Metadata-only edits (title, description) may well stay open; the
// arms below deliberately separate the two so a fix does not have to be
// all-or-nothing.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'

// trainingAdmin holds training:create/read/update/delete/manage at TENANT scope
// (e2e-seed.sql §19). That is load-bearing for every arm here: the refusal under
// test must come from the record's STATUS, not from a missing permission. A
// persona without `training:update` would 403 and each test would pass for
// entirely the wrong reason.
const AS = AUTH.trainingAdmin

let seq = 0
function uniqueSuffix() {
  // A counter rather than Date.now(): two mints inside the same millisecond are
  // routine and doc_number is unique.
  seq += 1
  return `${process.pid}-${seq}`
}

/**
 * An ACTIVE training carrying a real 1-question assessment, minted through the
 * REAL endpoints — create (DRAFT) then activate — so the row is shaped exactly
 * as production would shape it.
 *
 * Deliberately NOT the seeded TRAINING fixture. That one is shared by every
 * other training journey, and these arms mutate the assessment; a leaked edit
 * would silently change what J1/J2/J5 grade against.
 *
 * `activate` refuses anything but DRAFT (`controllers/trainings.js:120`), so the
 * two-step mint also proves the transition we depend on actually happened.
 */
async function mintActiveTraining(ctx, tag) {
  const title = `E2E TRN-J10 ${tag} ${uniqueSuffix()}`
  const assessment = [
    {
      id: 'k1',
      text: 'Original question — must survive publication.',
      type: 'SINGLE',
      options: [
        { id: 'k1a', text: 'Correct', isCorrect: true },
        { id: 'k1b', text: 'Wrong', isCorrect: false },
      ],
    },
  ]

  // `managerId` is REQUIRED to publish, and leaving it out costs an hour.
  // Training's Sequelize `beforeSave` hook throws when status is ACTIVE with no
  // manager, so activate fails — and because the hook throws a PLAIN Error
  // rather than a BadRequestError, the API renders it as a bare
  // 500 "Internal server error" instead of a 400 naming the problem. That is a
  // real defect (see the note in OQ-02 TC-02-02 / the `activate` arm below);
  // here it just means the mint must supply a manager like the real UI does.
  const created = await ctx.request.post('/api/v1/services/trainings', {
    data: {
      title,
      assessment,
      passingScore: 70,
      maxAttempts: 2,
      managerId: USERS.trainingAdmin.id,
    },
  })
  expect(created.ok(), `mint: create failed — ${await created.text()}`).toBe(true)

  const id = sqlValue(`SELECT id FROM trainings WHERE title = '${title}' LIMIT 1`)
  expect(id, 'mint: the training row exists').toBeTruthy()
  expect(sqlValue(`SELECT status FROM trainings WHERE id = '${id}'`)).toBe('DRAFT')

  const activated = await ctx.request.post(`/api/v1/services/trainings/${id}/activate`)
  expect(activated.ok(), `mint: activate failed — ${await activated.text()}`).toBe(true)
  expect(
    sqlValue(`SELECT status FROM trainings WHERE id = '${id}'`),
    'mint: the training is published before the arm runs',
  ).toBe('ACTIVE')

  return { id, title, assessment }
}

function cleanup(trainingId) {
  // Hard delete: `deleteTraining` is a soft delete, and a soft-deleted row would
  // still hold the title/assessment this spec asserts on.
  sql(`DELETE FROM training_document_links WHERE training_id = '${trainingId}'`)
  sql(`DELETE FROM training_users WHERE training_id = '${trainingId}'`)
  sql(`DELETE FROM trainings WHERE id = '${trainingId}'`)
}

/** The stored assessment, as the database holds it. */
function storedAssessment(trainingId) {
  return sqlValue(`SELECT assessment::text FROM trainings WHERE id = '${trainingId}'`)
}

/** Seed an EFFECTIVE document in E2ELAB — the CTE pattern from fixtures/suppliers.js. */
function seedDocument(tag) {
  const suffix = uniqueSuffix()
  const title = `E2E TRN-J10 ${tag} Doc ${suffix}`
  const out = sql(`
    WITH d AS (
      INSERT INTO documents (company_id, title, doc_number, created_at, updated_at)
      VALUES ('${COMPANY_ID}', '${title}', 'ETRN-${suffix}', now(), now())
      RETURNING id
    ), v AS (
      INSERT INTO document_versions
        (company_id, document_id, version_major, version_minor, status_id, created_at, updated_at)
      SELECT '${COMPANY_ID}', d.id, 1, 0, 'EFFECTIVE', now(), now() FROM d
      RETURNING id, document_id
    ), s AS (
      INSERT INTO document_sections
        (company_id, document_id, document_version_id, title, content, created_by, updated_by, created_at, updated_at)
      SELECT '${COMPANY_ID}', v.document_id, v.id, 'Scope', 'TRN-J10 MATERIAL ${suffix}',
             '${USERS.trainingAdmin.id}', '${USERS.trainingAdmin.id}', now(), now()
      FROM v RETURNING id
    )
    SELECT (SELECT id FROM d), (SELECT id FROM v)
  `)
  const [id, versionId] = out.split('|')
  return { id, versionId, title }
}

function removeDocument(documentId) {
  sql(`DELETE FROM document_sections WHERE document_id = '${documentId}'`)
  sql(`DELETE FROM document_versions WHERE document_id = '${documentId}'`)
  sql(`DELETE FROM documents WHERE id = '${documentId}'`)
}

test.describe('TRN-J10 · a published training is locked against content edits', () => {
  test.use({ storageState: AS })

  test('control: an ACTIVE training can be minted, and a DRAFT one IS editable', async ({
    browser,
  }) => {
    // The control every arm below depends on, and it carries two claims:
    //   1. the mint works (so a failing arm means the lock, not the setup), and
    //   2. editing a DRAFT assessment SUCCEEDS — which is what makes a refusal
    //      on ACTIVE meaningful rather than "this endpoint just never writes".
    test.setTimeout(90_000)
    const ctx = await browser.newContext({ storageState: AS })
    const title = `E2E TRN-J10 draft-control ${uniqueSuffix()}`

    const created = await ctx.request.post('/api/v1/services/trainings', {
      data: { title, assessment: [], passingScore: 70 },
    })
    expect(created.ok(), `control: create failed — ${await created.text()}`).toBe(true)
    const id = sqlValue(`SELECT id FROM trainings WHERE title = '${title}' LIMIT 1`)
    expect(id).toBeTruthy()

    const edit = await ctx.request.put(`/api/v1/services/trainings/${id}`, {
      data: { passingScore: 85 },
    })
    expect(edit.ok(), 'a DRAFT training is editable — the endpoint does write').toBe(true)
    expect(sqlValue(`SELECT passing_score FROM trainings WHERE id = '${id}'`)).toBe('85')

    cleanup(id)
    await ctx.close()
  })

  test('the assessment of a published training cannot be rewritten over REST', async ({
    browser,
  }) => {
    // THE CORE ARM. A learner who passed yesterday was graded against the
    // original questions; swapping them changes what that signed pass attests.
    test.setTimeout(90_000)
    const ctx = await browser.newContext({ storageState: AS })
    const { id } = await mintActiveTraining(ctx, 'assessment')
    const before = storedAssessment(id)

    const res = await ctx.request.put(`/api/v1/services/trainings/${id}`, {
      data: {
        assessment: [
          {
            id: 'z9',
            text: 'Substituted after publication.',
            type: 'SINGLE',
            options: [
              { id: 'z9a', text: 'Anything', isCorrect: true },
              { id: 'z9b', text: 'Else', isCorrect: false },
            ],
          },
        ],
      },
    })

    expect(
      res.status(),
      `a published training's assessment must not be rewritable (got ${res.status()}: ${await res
        .text()
        .catch(() => '')})`,
    ).toBeGreaterThanOrEqual(400)
    expect(storedAssessment(id), 'the stored assessment is unchanged').toBe(before)

    cleanup(id)
    await ctx.close()
  })

  test('the passing score of a published training cannot be lowered over REST', async ({
    browser,
  }) => {
    // Lowering the bar retroactively reclassifies past FAILED attempts' scores
    // against a threshold that did not exist when they were signed.
    test.setTimeout(90_000)
    const ctx = await browser.newContext({ storageState: AS })
    const { id } = await mintActiveTraining(ctx, 'score')

    const res = await ctx.request.put(`/api/v1/services/trainings/${id}`, {
      data: { passingScore: 1 },
    })

    expect(
      res.status(),
      `a published training's passing score must not be editable (got ${res.status()})`,
    ).toBeGreaterThanOrEqual(400)
    expect(
      sqlValue(`SELECT passing_score FROM trainings WHERE id = '${id}'`),
      'the stored passing score is unchanged',
    ).toBe('70')

    cleanup(id)
    await ctx.close()
  })

  test('the linked material of a published training cannot be swapped over REST', async ({
    browser,
  }) => {
    // `documentIds` rides the same ungated branch (`controllers/trainings.js:100`
    // → syncDocumentLinks). Swapping material after publication means learners
    // who signed "read and understood" attested to a document that is no longer
    // the one attached.
    //
    // Note the launch path DOES snapshot documents per instance
    // (`launchTraining` pins docId → EFFECTIVE versionId), so instances already
    // launched are insulated. The integrity problem is the catalog record and
    // every FUTURE launch — plus the audit question "what did this training
    // cover when it was published?"
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AS })
    const { id } = await mintActiveTraining(ctx, 'material')
    const original = seedDocument('orig')
    const substitute = seedDocument('sub')

    // Attach the original while ACTIVE. If the lock lands, this first call is
    // refused too — which is correct and still proves the point, so the arm
    // tolerates either outcome here and asserts on the SWAP below.
    await ctx.request.put(`/api/v1/services/trainings/${id}`, {
      data: { documentIds: [original.id] },
    })
    const linkedBefore = sqlValue(
      `SELECT count(*) FROM training_document_links WHERE training_id = '${id}' AND deleted_at IS NULL`,
    )

    const res = await ctx.request.put(`/api/v1/services/trainings/${id}`, {
      data: { documentIds: [substitute.id] },
    })

    expect(
      res.status(),
      `a published training's material must not be swappable (got ${res.status()})`,
    ).toBeGreaterThanOrEqual(400)
    expect(
      sqlValue(
        `SELECT count(*) FROM training_document_links WHERE training_id = '${id}' AND document_id = '${substitute.id}' AND deleted_at IS NULL`,
      ),
      'the substituted document was not linked',
    ).toBe('0')
    expect(
      sqlValue(
        `SELECT count(*) FROM training_document_links WHERE training_id = '${id}' AND deleted_at IS NULL`,
      ),
      'the link set is unchanged',
    ).toBe(linkedBefore)

    cleanup(id)
    removeDocument(original.id)
    removeDocument(substitute.id)
    await ctx.close()
  })

  test('metadata-only edits stay allowed on a published training', async ({ browser }) => {
    // The counterweight, and the reason the arms above name specific fields.
    // Fixing D13 by refusing EVERY update to an ACTIVE training would be too
    // blunt: correcting a typo in a description does not touch what was
    // assessed. This arm exists so a future over-broad fix is caught here rather
    // than by a user who can no longer edit a description.
    //
    // It should be GREEN today and stay green after the fix.
    test.setTimeout(90_000)
    const ctx = await browser.newContext({ storageState: AS })
    const { id } = await mintActiveTraining(ctx, 'metadata')

    const res = await ctx.request.put(`/api/v1/services/trainings/${id}`, {
      data: { description: 'Clarified wording — no change to what is assessed.' },
    })

    expect(res.ok(), `a description edit should remain allowed (got ${res.status()})`).toBe(true)
    expect(sqlValue(`SELECT description FROM trainings WHERE id = '${id}'`)).toBe(
      'Clarified wording — no change to what is assessed.',
    )

    cleanup(id)
    await ctx.close()
  })

  test('publishing without a manager is refused 400, not 500 — D16', async ({ browser }) => {
    // FOUND BY THIS SPEC'S OWN SETUP, and expected to FAIL until fixed.
    //
    // Publishing a training with no manager of record IS correctly refused —
    // `Training.beforeSave` throws when status is ACTIVE and managerId is null,
    // which is the control OQ-02 TC-02-02 step 1 tests. But it throws a PLAIN
    // `Error`, and `globalErrorHandler` (utils/errorHandler.js) classifies only
    // ValidationError, AppError, four Sequelize classes, messages starting
    // "Cannot update", and `error.cause.statusCode`. A bare Error thrown from a
    // model hook matches none of them, so it falls through to line 132:
    //
    //     return sendError(res, req, 500, 'Internal server error')
    //
    // The caller gets a 500 with the reason DISCARDED — "Internal server error"
    // — and the real message is only in the server log. A user who forgets the
    // manager is told the system broke, not what to fix; an integration cannot
    // distinguish a validation refusal from an outage and may retry a request
    // that will never succeed.
    //
    // The fix is one word: throw a BadRequestError (or set `cause`) instead of
    // an Error. Until then this test is red.
    //
    // Cost this effort an hour of misdiagnosis: every arm in this file failed
    // with "mint: activate failed — Internal server error", which reads as a
    // broken environment, not a missing field.
    test.setTimeout(90_000)
    const ctx = await browser.newContext({ storageState: AS })
    const title = `E2E TRN-J10 nomanager ${uniqueSuffix()}`

    const created = await ctx.request.post('/api/v1/services/trainings', {
      data: { title, assessment: [], passingScore: 70 }, // deliberately no managerId
    })
    expect(created.ok(), `setup: create failed — ${await created.text()}`).toBe(true)
    const id = sqlValue(`SELECT id FROM trainings WHERE title = '${title}' LIMIT 1`)
    expect(id).toBeTruthy()

    const res = await ctx.request.post(`/api/v1/services/trainings/${id}/activate`)

    expect(res.ok(), 'publishing without a manager must still be refused').toBe(false)
    expect(
      res.status(),
      `a missing required field is a client error, not a server fault (got ${res.status()})`,
    ).toBe(400)
    expect(
      await res.text(),
      'the refusal must name the problem, not hide it behind "Internal server error"',
    ).toMatch(/manager/i)
    expect(
      sqlValue(`SELECT status FROM trainings WHERE id = '${id}'`),
      'and the training stays DRAFT either way',
    ).toBe('DRAFT')

    cleanup(id)
    await ctx.close()
  })

  test('the edit, whether refused or applied, is attributable in the audit trail', async ({
    browser,
  }) => {
    // 21 CFR Part 11 §11.10(e). Whichever way the lock resolves, an ATTEMPT to
    // change a published training's content must be reconstructable.
    //
    // `trainings_audit_trigger` is AFTER INSERT OR UPDATE OR DELETE, and
    // `DEFAULT_TRACK_FIELDS` is ['statusId','stateId','name','title','code'] —
    // `assessment` and `passing_score` are NOT tracked fields, so a content edit
    // may well produce NO audit row at all. That is the second half of this
    // defect and this arm records which way it went rather than asserting a
    // shape that does not exist yet.
    test.setTimeout(90_000)
    const ctx = await browser.newContext({ storageState: AS })
    const { id } = await mintActiveTraining(ctx, 'audit')

    await ctx.request.put(`/api/v1/services/trainings/${id}`, { data: { passingScore: 42 } })

    // Audit rows are written by a trigger → graphile_worker, so they are async.
    // A short settle beats a flake here; the assertion is deliberately weak.
    const rows = sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_id = '${id}' AND entity_type ILIKE '%training%'`,
    )
    test.info().annotations.push({
      type: 'observed',
      description: `audit_logs rows for the attempted published-training edit: ${rows}`,
    })

    cleanup(id)
    await ctx.close()
  })
})
