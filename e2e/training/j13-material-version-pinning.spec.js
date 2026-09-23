// TRN-J13 · Linked documents are pinned to the version effective at launch —
// OQ-02 TC-02-09 (URS-TRN-10).
//
// The gap this file closes, verbatim from the coverage matrix: "Serving the
// pinned version after a new release is not tested." TRN-J11 launches a
// training WITH a linked document and asserts the snapshot carries
// `documentIds`, but it never revises that document and never asks which
// version a mid-flight learner is served. That second half is the whole point
// of TC-02-09's own preamble: *"a trainee must be able to prove WHICH version of
// an SOP they were trained on."*
//
// ── HOW THE PRODUCT PINS ────────────────────────────────────────────────────
// Read from primary sources, because the difference between "pinned" and
// "happens to be the latest" is invisible until the document is revised:
//
//   · `launchTraining` (controllers/trainings.js:178-206) resolves the
//     currently-EFFECTIVE version of every linked document at launch and freezes
//     a `documentVersionByDocId` map into `training_instances.snapshot`:
//
//         const effectiveVersions = await db.DocumentVersion.findAll({
//           where: { documentId: { [Op.in]: linkedDocIds }, statusId: 'EFFECTIVE' }, …
//         })
//         for (const v of effectiveVersions) documentVersionByDocId[v.documentId] = v.id
//
//   · the learner's viewer reads that map and nothing else
//     (MyTrainingPageId.vue:77):
//
//         viewingVersionId.value =
//           instance.value?.snapshot?.documentVersionByDocId?.[docId] ?? null
//
//   · `TrainingDocumentViewDialog` renders `versionId` when given one and falls
//     back to "whatever is EFFECTIVE now" only when it is null.
//
// So the pin is REAL and it is server-written at launch. This file proves that
// end to end: launch against v1.0, release v2.0 (v1.0 → SUPERSEDED via the
// product's own `document_versions_supersede_prior_effective` trigger), then
// assert the instance still names v1.0 and that a fallback to "current
// effective" would have named v2.0 — i.e. the two answers genuinely differ, so
// a passing assertion cannot be a coincidence.
//
// ── THE DEFECT THIS FILE FOUND ──────────────────────────────────────────────
// KNOWN DEFECT TRN-D17 (see the third test). The pin is correct in the data and
// unreachable in the product for the persona it exists for. The learner holds
// NO grants at all — deliberately, and it is the premise of every training
// journey here (`fixtures/cast.js`: "Learner — holds NO training grants at all
// … /my-training/:id is the one training surface with no permission guard").
// `document_version_select_rls` admits a reader on one of four branches:
//
//     company owner
//   · OR has_permission('document_control','read') AND scope AND (not DRAFT or collaborator)
//   · OR an open task_instance on THAT DocumentVersion assigned to them
//   · OR status = 'EFFECTIVE' AND a shared_with_user row on the Document
//
// A learner matches none of them. Launch routes their TRAINING task at the
// `TrainingAssignee`, not at the DocumentVersion, and links no
// `shared_with_user` row. Measured live: a learner session sees **0 of every
// document_version row in the tenant** — not the pinned one, not the current
// one, not any. The SyncEngine reads through PostGraphile as `app_user`
// (backend/api/config/postgraphile.js:32), so the learner's IndexedDB is
// likewise empty and the dialog renders its "No effective (published) version
// found for this document" empty state.
//
// That is pinned below AS IT BEHAVES rather than as the protocol wants it,
// because the two halves want opposite treatments and conflating them would
// lose both:
//   · the PIN ITSELF is correct and is asserted as a passing requirement — a
//     regression that resolved the map at view time would fail these tests.
//   · the DELIVERY is broken and is asserted as a refusal with the diagnosis
//     attached, so the day a fix lands (a share, a task on the version, or a
//     read branch for "material of a training I am assigned") this test goes
//     red and is the signal to flip it.
// Writing the delivery half the other way round — asserting the learner CAN
// read it — would produce a red test that reads as a harness problem, and
// TC-02-09 step 3 would trace to a test nobody could tell was measuring a real
// defect.
//
// Measured 2026-09-23 against the live local stack (app-db + api :4000).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID, TRAINING } from '../fixtures/cast.js'
import { sql, sqlValue, sqlAsAppUser } from '../fixtures/db.js'

let seq = 0
function uniqueSuffix() {
  seq += 1
  return `${process.pid}-${seq}`
}

/**
 * An EFFECTIVE v1.0 document whose single section carries a MARKER string.
 *
 * The marker is what makes "which version was served" an observable fact rather
 * than an id comparison: v1.0 and v2.0 differ in their rendered text, so a
 * viewer showing the wrong one is visible, not merely mis-identified.
 */
function seedDocumentV1(tag) {
  const suffix = uniqueSuffix()
  const title = `E2E TRN-J13 ${tag} Doc ${suffix}`
  const marker = `TRN-J13-V1-MARKER-${suffix}`
  const out = sql(`
    WITH d AS (
      INSERT INTO documents (company_id, title, doc_number, created_at, updated_at)
      VALUES ('${COMPANY_ID}', '${title}', 'ETRNJ13-${suffix}', now(), now())
      RETURNING id
    ), v AS (
      INSERT INTO document_versions
        (company_id, document_id, version_major, version_minor, status_id, is_latest, created_at, updated_at)
      SELECT '${COMPANY_ID}', d.id, 1, 0, 'EFFECTIVE', true, now(), now() FROM d
      RETURNING id, document_id
    ), s AS (
      INSERT INTO document_sections
        (company_id, document_id, document_version_id, title, content, created_by, updated_by, created_at, updated_at)
      SELECT '${COMPANY_ID}', v.document_id, v.id, 'Scope', '${marker}',
             '${USERS.trainingAdmin.id}', '${USERS.trainingAdmin.id}', now(), now()
      FROM v RETURNING id
    )
    SELECT (SELECT id FROM d), (SELECT id FROM v)
  `)
  const [id, versionId] = out.split('|')
  return { id, versionId, title, marker, suffix }
}

/**
 * Release v2.0 of a seeded document — the event TC-02-09 step 2 calls for.
 *
 * Walked along the product's own legal edges (DRAFT→IN_REVIEW→APPROVED→
 * EFFECTIVE, every one of them checked by `enforce_document_version_transition`)
 * rather than inserted straight into EFFECTIVE, so the supersede trigger fires
 * exactly as a real release fires it. `change_reason` is mandatory above v1.0 —
 * `document_versions_change_reason_required` — so omitting it would fail here,
 * not silently produce a half-legal fixture.
 */
function releaseV2(doc) {
  const marker = `TRN-J13-V2-MARKER-${doc.suffix}`
  const v2Id = sql(`
    WITH v AS (
      INSERT INTO document_versions
        (company_id, document_id, version_major, version_minor, status_id, change_reason, created_at, updated_at)
      VALUES ('${COMPANY_ID}', '${doc.id}', 2, 0, 'DRAFT', 'TRN-J13 revision for version pinning', now(), now())
      RETURNING id, document_id
    ), s AS (
      INSERT INTO document_sections
        (company_id, document_id, document_version_id, title, content, created_by, updated_by, created_at, updated_at)
      SELECT '${COMPANY_ID}', v.document_id, v.id, 'Scope', '${marker}',
             '${USERS.trainingAdmin.id}', '${USERS.trainingAdmin.id}', now(), now()
      FROM v RETURNING id
    )
    SELECT (SELECT id FROM v)
  `)
  for (const status of ['IN_REVIEW', 'APPROVED', 'EFFECTIVE']) {
    sql(`UPDATE document_versions SET status_id = '${status}' WHERE id = '${v2Id}'`)
  }
  return { id: v2Id, marker }
}

/** Launch a training linking `doc`, to the learner, through the real endpoints. */
async function launchTrainingLinking(adminCtx, doc, tag) {
  const title = `E2E TRN-J13 ${tag} ${uniqueSuffix()}`
  const assessment = JSON.parse(
    sqlValue(`SELECT assessment::text FROM trainings WHERE id = '${TRAINING.id}'`),
  )

  const created = await adminCtx.request.post('/api/v1/services/trainings', {
    data: {
      title,
      instructions: 'Read the linked SOP, then answer both questions.',
      assessment,
      passingScore: TRAINING.passingScore,
      maxAttempts: TRAINING.maxAttempts,
      requireManagerVerification: false,
      // Mandatory to reach ACTIVE — without it `activate` throws a bare 500
      // (see TRN-J11's note on the model's beforeSave hook).
      managerId: USERS.trainingAdmin.id,
      documentIds: [doc.id],
    },
  })
  expect(created.ok(), `setup: create failed — ${await created.text()}`).toBe(true)

  const trainingId = sqlValue(`SELECT id FROM trainings WHERE title = '${title}' LIMIT 1`)
  expect(trainingId, 'setup: the training row exists').toBeTruthy()

  const activated = await adminCtx.request.post(`/api/v1/services/trainings/${trainingId}/activate`)
  expect(activated.ok(), `setup: activate failed — ${await activated.text()}`).toBe(true)

  const launched = await adminCtx.request.post(`/api/v1/services/trainings/${trainingId}/launch`, {
    data: { userIds: [USERS.learner.id], reason: 'TRN-J13 version pinning' },
  })
  expect(launched.status(), `setup: launch failed — ${await launched.text()}`).toBe(201)
  const instanceId = (await launched.json())?.trainingInstance?.id
  expect(instanceId, 'setup: launch returned an instance id').toBeTruthy()

  return { trainingId, instanceId }
}

/** The pinned version id the instance snapshot names for a document. */
function pinnedVersionFor(instanceId, documentId) {
  return sqlValue(
    `SELECT snapshot->'documentVersionByDocId'->>'${documentId}'
       FROM training_instances WHERE id = '${instanceId}'`,
  )
}

/** Whichever version of a document is EFFECTIVE right now. */
function currentEffectiveVersion(documentId) {
  return sqlValue(
    `SELECT id FROM document_versions
      WHERE document_id = '${documentId}' AND status_id = 'EFFECTIVE' AND deleted_at IS NULL`,
  )
}

function cleanup({ trainingId, instanceId, doc }) {
  if (instanceId) {
    sql(`DELETE FROM task_instances WHERE entity_id IN (
           SELECT id FROM training_assignees WHERE training_instance_id = '${instanceId}')`)
    sql(`DELETE FROM training_assignees WHERE training_instance_id = '${instanceId}'`)
    sql(`DELETE FROM training_assessment_keys WHERE training_instance_id = '${instanceId}'`)
    sql(`DELETE FROM training_instances WHERE id = '${instanceId}'`)
  }
  if (trainingId) {
    sql(`DELETE FROM training_document_links WHERE training_id = '${trainingId}'`)
    sql(`DELETE FROM training_users WHERE training_id = '${trainingId}'`)
    sql(`DELETE FROM trainings WHERE id = '${trainingId}'`)
  }
  if (doc?.id) {
    sql(`DELETE FROM document_sections WHERE document_id = '${doc.id}'`)
    sql(`DELETE FROM document_versions WHERE document_id = '${doc.id}'`)
    sql(`DELETE FROM documents WHERE id = '${doc.id}'`)
  }
}

test.describe('TRN-J13 · a launched training serves the document version effective at launch', () => {
  test('TC-02-09 steps 1-2 · launch pins v1.0, and releasing v2.0 does not move the pin', async ({
    browser,
  }) => {
    // The core arm. Steps 1 and 2 in one test on purpose: "the pin did not
    // move" is a statement about a BEFORE and an AFTER, and a test that only
    // saw the after could not tell a working pin from a map that happened to
    // name the version that is current anyway.
    test.setTimeout(150_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const doc = seedDocumentV1('pin')
    let setup = { doc }

    try {
      // ── Step 1 · "Note the version of the linked document at launch." ────
      expect(
        currentEffectiveVersion(doc.id),
        'premise: v1.0 is the effective version when the training launches',
      ).toBe(doc.versionId)

      setup = { ...(await launchTrainingLinking(adminCtx, doc, 'pin')), doc }

      expect(
        pinnedVersionFor(setup.instanceId, doc.id),
        'launch froze v1.0 into the instance snapshot — this is the "version recorded" step 1 asks for',
      ).toBe(doc.versionId)

      // ── Step 2 · "Release a NEW effective version of that document." ─────
      const v2 = releaseV2(doc)

      expect(
        currentEffectiveVersion(doc.id),
        'v2.0 is now the effective version',
      ).toBe(v2.id)
      expect(
        sqlValue(`SELECT status_id FROM document_versions WHERE id = '${doc.versionId}'`),
        'and the product superseded v1.0 itself — document_versions_supersede_prior_effective',
      ).toBe('SUPERSEDED')

      // ── The assertion the whole case exists for. ─────────────────────────
      const pinned = pinnedVersionFor(setup.instanceId, doc.id)
      expect(pinned, 'the launched instance STILL names v1.0 after the revision').toBe(
        doc.versionId,
      )
      // …and it is a different answer from "whatever is effective now", so the
      // assertion above is not satisfiable by an unpinned product.
      expect(pinned, 'the pin and the current effective version genuinely differ').not.toBe(v2.id)

      // The pin is the version, not just the document: the snapshot's
      // `documentIds` half is unchanged too, so a viewer reading either key
      // reaches the same document with a v1.0 version attached.
      expect(
        sqlValue(
          `SELECT snapshot->'documentIds'->>0 FROM training_instances WHERE id = '${setup.instanceId}'`,
        ),
        'the linked document itself is unchanged by the revision',
      ).toBe(doc.id)
    } finally {
      cleanup(setup)
      await adminCtx.close()
    }
  })

  test('a training launched AFTER the release pins v2.0 — the pin tracks launch time, not a constant', async ({
    browser,
  }) => {
    // The control, and the reason it is not optional. Every assertion above is
    // "the snapshot still says v1.0", which a product that wrote the FIRST
    // version it ever saw — or a hardcoded id, or a stale cache — would also
    // satisfy. This proves the map is resolved fresh at each launch: same
    // document, second launch, and the pin is v2.0.
    test.setTimeout(150_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const doc = seedDocumentV1('tracks')
    let first = { doc }
    let second = {}

    try {
      first = { ...(await launchTrainingLinking(adminCtx, doc, 'tracks-a')), doc }
      expect(pinnedVersionFor(first.instanceId, doc.id)).toBe(doc.versionId)

      const v2 = releaseV2(doc)
      second = await launchTrainingLinking(adminCtx, doc, 'tracks-b')

      expect(
        pinnedVersionFor(second.instanceId, doc.id),
        'a launch after the release pins the NEW effective version',
      ).toBe(v2.id)
      expect(
        pinnedVersionFor(first.instanceId, doc.id),
        'and the earlier cohort is untouched — two cohorts, two different pinned versions',
      ).toBe(doc.versionId)
    } finally {
      cleanup(second)
      cleanup(first)
      await adminCtx.close()
    }
  })

  test('KNOWN DEFECT TRN-D17 · TC-02-09 step 3 is NOT executable: the learner cannot read the pinned version at all', async ({
    browser,
  }) => {
    // Step 3 — "As a trainee still working through the launched training, open
    // the material: the ORIGINALLY LINKED VERSION is presented" — cannot be
    // performed by the persona it is written for. The pin is correct (proved
    // above); the delivery is not.
    //
    // Asserted as the refusal it is, with both layers measured, so the shape of
    // the defect is in the record and not just its symptom.
    test.setTimeout(150_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const doc = seedDocumentV1('rls')
    let setup = { doc }

    try {
      setup = { ...(await launchTrainingLinking(adminCtx, doc, 'rls')), doc }
      const v2 = releaseV2(doc)
      expect(pinnedVersionFor(setup.instanceId, doc.id), 'premise: v1.0 is pinned').toBe(
        doc.versionId,
      )

      // ── Layer 1 · RLS. The learner's own session, through the same role
      // PostGraphile uses for every GraphQL request.
      //
      // `sqlAsAppUser` prepends the session set-up (a DO block, SET ROLE and
      // three set_config SELECTs), each of which prints a line of its own, so
      // the probe's own answer is the LAST line — not the whole output. Getting
      // this wrong reads as "the count was 5", which is not a count at all.
      const asLearnerCount = (query) => {
        const res = sqlAsAppUser(query, { userId: USERS.learner.id, companyId: COMPANY_ID })
        expect(res.ok, `the probe itself ran — ${res.error}`).toBe(true)
        const lines = res.output.trim().split('\n')
        return lines[lines.length - 1].trim()
      }

      expect(
        asLearnerCount(`SELECT count(*) FROM document_versions WHERE id = '${doc.versionId}'`),
        'KNOWN DEFECT TRN-D17: the pinned v1.0 is invisible to the learner it was pinned for',
      ).toBe('0')

      // Not a SUPERSEDED-only problem — the CURRENT version is invisible too,
      // which is what tells us this is a missing read path rather than a
      // status predicate. A fix that only un-hid SUPERSEDED rows would leave
      // the feature just as broken.
      expect(
        asLearnerCount(`SELECT count(*) FROM document_versions WHERE id = '${v2.id}'`),
        'nor is the current v2.0 — the learner holds no document_control:read, no task on the version, and no share',
      ).toBe('0')

      // And the section content behind it, which is what actually renders.
      expect(
        asLearnerCount(`SELECT count(*) FROM document_sections WHERE document_id = '${doc.id}'`),
        'the material’s own content is unreachable too',
      ).toBe('0')

      // The probe is not vacuous: the SAME query under the SAME helper returns
      // a real count for a persona the policy admits. Without this, "0" could
      // equally mean the session never reached the table.
      const asAuthorCount = (query) => {
        const res = sqlAsAppUser(query, { userId: USERS.author.id, companyId: COMPANY_ID })
        expect(res.ok, `the control probe ran — ${res.error}`).toBe(true)
        const lines = res.output.trim().split('\n')
        return lines[lines.length - 1].trim()
      }
      expect(
        asAuthorCount(`SELECT count(*) FROM document_versions WHERE id = '${v2.id}'`),
        'CONTROL: a document_control:read holder DOES see the same row through the same probe',
      ).toBe('1')

      // The diagnosis, pinned as facts rather than prose: the learner holds no
      // document grant, and launch wrote neither a share nor a task on the
      // version — the three branches of document_version_select_rls a
      // non-owner could have matched.
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM roles_on_users rou
               JOIN authz.role_module_permissions rmp ON rmp.role_id = rou.role_id
              WHERE rou.user_id = '${USERS.learner.id}' AND rmp.module_id = 'document_control'`,
          ),
        ),
        'branch 2 — no document_control grant of any kind',
      ).toBe(0)
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM task_instances
              WHERE entity_type = 'DocumentVersion' AND entity_id = '${doc.versionId}'
                AND assigned_to = '${USERS.learner.id}' AND deleted_at IS NULL`,
          ),
        ),
        'branch 3 — launch routes the TRAINING task at the TrainingAssignee, not at the version',
      ).toBe(0)
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM shared_with_user
              WHERE entity_type = 'Document' AND entity_id = '${doc.id}'
                AND user_id = '${USERS.learner.id}' AND deleted_at IS NULL`,
          ),
        ),
        'branch 4 — launch links no share either',
      ).toBe(0)

      // ── Layer 2 · the screen, which is where the defect is actually felt.
      // The viewer reads IndexedDB, which the SyncEngine fills over the same
      // RLS'd GraphQL, so nothing about the document reaches the learner:
      // neither its TITLE in the material list nor either version's CONTENT in
      // the viewer. Asserted through the product's own markup and copy so a fix
      // that starts serving the document — pinned or not — turns this red.
      const learnerCtx = await browser.newContext({ storageState: AUTH.learner })
      const page = await learnerCtx.newPage()
      await page.goto(`/my-training/${setup.instanceId}`)

      const start = page.getByRole('button', { name: 'Start Training' })
      const cont = page.getByRole('button', { name: 'Continue to Material' })
      await expect(start.or(cont).first()).toBeVisible({ timeout: 40_000 })
      await ((await start.isVisible().catch(() => false)) ? start : cont).click()

      // The material row itself DOES render — `documentIds` comes from the
      // instance snapshot, which the learner can read. It is the document
      // BEHIND the id that is withheld. Anchored on the row's own aria-label
      // rather than on a title that (per the defect) never appears.
      const materialRow = page.getByLabel('View reference document').first()
      await expect(
        materialRow,
        'the material row renders — its id comes from the snapshot, which the learner CAN read',
      ).toBeVisible({ timeout: 40_000 })

      // …but unlabelled. `DocumentBadgeById` renders nothing at all when the
      // Document is not in IndexedDB, so the learner is offered a nameless row.
      await expect(
        page.getByText(doc.title, { exact: false }),
        'KNOWN DEFECT TRN-D17: the material is listed without a title — the Document row is RLS-withheld',
      ).toHaveCount(0)

      await materialRow.click()

      await expect(
        page.getByText('No effective (published) version found for this document'),
        'KNOWN DEFECT TRN-D17: the learner is shown an empty viewer, not the pinned v1.0',
      ).toBeVisible({ timeout: 25_000 })

      // Neither version's content reaches the screen — stated explicitly so the
      // test cannot be read as "it showed the wrong one".
      await expect(page.getByText(doc.marker)).toHaveCount(0)
      await expect(page.getByText(v2.marker)).toHaveCount(0)

      await learnerCtx.close()
    } finally {
      cleanup(setup)
      await adminCtx.close()
    }
  })

  test('TC-02-09 step 4 · the completed record identifies the version trained on — via the instance snapshot, not the assignee row', async ({
    browser,
  }) => {
    // Step 4 asks that "the completed training record identifies the document
    // version trained on". It does — but one level up from where an auditor
    // would look first, and that distinction is the evidence, so it is asserted
    // rather than summarised.
    //
    // `training_assignees` carries NO document or version column (TRN-J11's
    // header enumerates the full column list for the same reason). The version
    // of record lives on the parent `training_instances.snapshot`, which is
    // frozen at launch and shared by every assignee in the cohort. That is
    // sufficient for the requirement — the cohort trained on one version — and
    // is worth pinning because a future per-assignee material flow would break
    // the inference silently.
    test.setTimeout(150_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const doc = seedDocumentV1('record')
    let setup = { doc }

    try {
      setup = { ...(await launchTrainingLinking(adminCtx, doc, 'record')), doc }
      const v2 = releaseV2(doc)

      // Complete it as the learner, so the record under inspection is a
      // COMPLETED one rather than an open assignment.
      const learnerCtx = await browser.newContext({ storageState: AUTH.learner })
      const submitted = await learnerCtx.request.post(
        `/api/v1/services/trainingInstances/${setup.instanceId}/submit`,
        { data: { answers: TRAINING.correctAnswers, esign: { method: 'PIN', token: '12345678' } } },
      )
      expect(
        submitted.ok(),
        `setup: the completion should be graded — ${await submitted.text()}`,
      ).toBe(true)
      await learnerCtx.close()

      const assigneeStatus = sqlValue(
        `SELECT status FROM training_assignees
          WHERE training_instance_id = '${setup.instanceId}' AND user_id = '${USERS.learner.id}'`,
      )
      // VERIFIED because this training sets requireManagerVerification:false —
      // the auto-verify shortcut TRN-J11's control documents.
      expect(assigneeStatus).toMatch(/^(COMPLETED|VERIFIED)$/)

      // The version of record, on the completed training's instance.
      expect(
        pinnedVersionFor(setup.instanceId, doc.id),
        'the completed record identifies v1.0 — the version effective when the learner was assigned',
      ).toBe(doc.versionId)
      expect(pinnedVersionFor(setup.instanceId, doc.id)).not.toBe(v2.id)

      // And the assignee row itself carries no version — the fact that makes
      // the sentence above "via the instance snapshot".
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM information_schema.columns
              WHERE table_name = 'training_assignees'
                AND (column_name LIKE '%version%' OR column_name LIKE '%document%')`,
          ),
        ),
        'training_assignees has no document/version column — the version of record is the instance’s',
      ).toBe(0)
    } finally {
      cleanup(setup)
      await adminCtx.close()
    }
  })
})
