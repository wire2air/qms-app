// TRN-J11 · Material review must precede a signed completion — OQ-02 TC-02-04
// (URS-TRN-04, "Trainees must review all required material before assessment").
//
// ⚠️  THE FIRST TWO TESTS ARE EXPECTED TO FAIL ON `develop` TODAY. READ THIS
// BEFORE "FIXING" THEM.
//
// Same deliberate departure as TRN-J10: they assert the behaviour the protocol
// requires, not what the product does. This suite's usual convention
// (`e2e/README.md`, inspectionsLogs / IL-D1) is to pin an open defect AS IT
// BEHAVES so the suite stays green. That choice is wrong here — a green test
// asserting "a completion can be signed without opening the material" would be
// evidence FOR the defect, and OQ-02 TC-02-06 would trace to it. So these fail
// until the server enforces the gate, and go green as the fix lands.
//
// Do NOT invert them into known-gap pins. If the gap is accepted as intended,
// delete them and record the acceptance in the protocol's deviation log.
//
// ── THE DEFECT (D14) ────────────────────────────────────────────────────────
// "Read and understood" is the entire point of a read-and-understood training:
// the learner opens the SOP, then signs that they read it. The signature is a
// 21 CFR Part 11 record attesting competency against specific material.
//
// The material-review requirement exists ONLY in the learner's browser.
// `MyTrainingPageId.vue:63`:
//
//     const allMaterialViewed = computed(() => {
//       const docs = instance.value?.snapshot?.documentIds ?? []
//       const links = instance.value?.snapshot?.externalLinks ?? []
//       return (
//         docs.every((id) => viewedDocIds.value.includes(id)) &&
//         links.every((l) => viewedLinkUrls.value.includes(l.url))
//       )
//     })
//
// and it gates exactly one thing: `:disabled="!allMaterialViewed"` on the
// "Proceed to Assessment" / "Mark Complete & Submit" button (template ~:448).
//
// Server-side there is nothing. Checked from primary sources:
//   · `__interactions` — the key the UI records viewing under — appears NOWHERE
//     in backend/. All four occurrences are in MyTrainingPageId.vue (:91 restore,
//     :114 and :243 write, :188 strip-before-grade). No server code reads it.
//   · `submitAssessment` (controllers/trainingInstances.js:183-267) verifies the
//     e-signature, checks assignment, COMPLETED and attempt count, then grades
//     from `snapshot.assessment` + the posted answers. It never looks at
//     material, documents, or interactions.
//   · POST /trainingInstances/:id/submit mounts requireAuthByApiKey,
//     requireCompanyAccess, express.json(), submitAssessment — no
//     enforcePermission at all (by design: the learner holds no training grants,
//     and reaches their own record through RLS self-scope).
//   · `startTraining` is NOT a prerequisite. `submitAssessment` refuses only
//     COMPLETED and exhausted-FAILED, so an ASSIGNED assignee can submit
//     directly, skipping even the pretence of opening the page. This is not a
//     loophole being exploited: `enforce_training_assignee_integrity`'s trusted
//     transition list blesses 'ASSIGNED->COMPLETED' outright, commented
//     "assessment submitted (pass / fail), from any pre-terminal state". The
//     schema deliberately anticipates a submit with no /start. Nothing anywhere
//     anticipates a submit with no material.
//   · the two integrity guards on training_assignees / training_instances were
//     read in full (they are the reason PW-J5 exists). Between them they freeze
//     status, score, signed_at, signature_method, completed_at, started_at,
//     attempt_count, snapshot, manager_id, training_id, due_date, created_by and
//     deleted_at against untrusted writes. NEITHER mentions documents,
//     interactions or viewing — checked rather than assumed, because a BEFORE
//     trigger would have beaten the controller and made this a non-defect.
//   · the interactions blob is learner-WRITABLE and unvalidated:
//     `saveAnswers` (:136-152) writes `assessmentAnswers: answers ?? {}`
//     wholesale with no shape check. So even a server that DID read
//     `__interactions` would be trusting learner-supplied data — the fix has to
//     record viewing server-side, not read it back from the client.
//
// Why this went unnoticed: the seeded TRAINING links no documents at all (no
// `training_document_links` rows are seeded anywhere), so `allMaterialViewed` is
// vacuously true and `fixtures/training.js:82-84` says as much — "the seeded
// training links no documents, so it is enabled immediately". Every existing
// training journey therefore passes through this gate without ever testing it.
// That is why this spec mints its own training WITH linked material.
//
// ── WHAT A FIX LOOKS LIKE ───────────────────────────────────────────────────
// There is nowhere authoritative to record material review today:
// `training_assignees` has no viewed/interactions column (its columns are id,
// company_id, training_instance_id, user_id, status, assessment_answers, score,
// started_at, completed_at, reminder_count, last_reminder_at, created_at,
// updated_at, attempt_count, removed_at, removal_reason, signed_at,
// signature_method). So a fix needs a server-written record of viewing — a
// column or a table — and `submitAssessment` refusing when the instance snapshot
// lists material the learner has no recorded view of. That is why the arms below
// assert a REFUSAL rather than asserting a stored value: the value has no home
// yet.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, COMPANY_ID, ESIGN_PIN, TRAINING } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { findAssignee } from '../fixtures/training.js'

let seq = 0
function uniqueSuffix() {
  seq += 1
  return `${process.pid}-${seq}`
}

/** The e-sign body every signing path in the product speaks: { method, token }. */
const ESIGN = { method: 'PIN', token: ESIGN_PIN }

/** Seed an EFFECTIVE document in E2ELAB — the CTE pattern from fixtures/suppliers.js. */
function seedDocument(tag) {
  const suffix = uniqueSuffix()
  const title = `E2E TRN-J11 ${tag} Doc ${suffix}`
  const out = sql(`
    WITH d AS (
      INSERT INTO documents (company_id, title, doc_number, created_at, updated_at)
      VALUES ('${COMPANY_ID}', '${title}', 'ETRNJ11-${suffix}', now(), now())
      RETURNING id
    ), v AS (
      INSERT INTO document_versions
        (company_id, document_id, version_major, version_minor, status_id, created_at, updated_at)
      SELECT '${COMPANY_ID}', d.id, 1, 0, 'EFFECTIVE', now(), now() FROM d
      RETURNING id, document_id
    ), s AS (
      INSERT INTO document_sections
        (company_id, document_id, document_version_id, title, content, created_by, updated_by, created_at, updated_at)
      SELECT '${COMPANY_ID}', v.document_id, v.id, 'Scope', 'TRN-J11 MATERIAL ${suffix}',
             '${USERS.trainingAdmin.id}', '${USERS.trainingAdmin.id}', now(), now()
      FROM v RETURNING id
    )
    SELECT (SELECT id FROM d), (SELECT id FROM v)
  `)
  const [id, versionId] = out.split('|')
  return { id, versionId, title }
}

/**
 * A published training with ONE linked EFFECTIVE document and the seeded
 * training's 2-question assessment, launched to the learner.
 *
 * The assessment is copied from the TRAINING fixture rather than left empty for
 * a load-bearing reason: `gradeAssessment` returns **100 for an empty
 * assessment** (shared/utils/trainingAssessment.js:59). A material-gate arm
 * against a question-less training would pass vacuously — the learner would
 * "score 100" having answered nothing, and the test could not tell a working
 * gate from a broken one.
 *
 * Minted through the real endpoints (create → link → activate → launch) so the
 * instance snapshot carries `documentIds` exactly as production builds it —
 * which is what `allMaterialViewed` reads, and what a server-side fix would
 * read too.
 */
async function launchTrainingWithMaterial(adminCtx, tag) {
  const title = `E2E TRN-J11 ${tag} ${uniqueSuffix()}`
  const doc = seedDocument(tag)

  const assessment = JSON.parse(
    sqlValue(`SELECT assessment::text FROM trainings WHERE id = '${TRAINING.id}'`),
  )

  const created = await adminCtx.request.post('/api/v1/services/trainings', {
    data: {
      title,
      instructions: 'Open the linked SOP, then answer both questions.',
      assessment,
      passingScore: TRAINING.passingScore,
      maxAttempts: TRAINING.maxAttempts,
      requireManagerVerification: false,
      documentIds: [doc.id],
    },
  })
  expect(created.ok(), `setup: create failed — ${await created.text()}`).toBe(true)

  const trainingId = sqlValue(`SELECT id FROM trainings WHERE title = '${title}' LIMIT 1`)
  expect(trainingId, 'setup: the training row exists').toBeTruthy()
  expect(
    sqlValue(
      `SELECT count(*) FROM training_document_links WHERE training_id = '${trainingId}' AND document_id = '${doc.id}' AND deleted_at IS NULL`,
    ),
    'setup: the document is linked — without this the gate has nothing to gate',
  ).toBe('1')

  const activated = await adminCtx.request.post(
    `/api/v1/services/trainings/${trainingId}/activate`,
  )
  expect(activated.ok(), `setup: activate failed — ${await activated.text()}`).toBe(true)

  const launched = await adminCtx.request.post(
    `/api/v1/services/trainings/${trainingId}/launch`,
    { data: { userIds: [USERS.learner.id], reason: 'TRN-J11 material gate' } },
  )
  expect(launched.status(), `setup: launch failed — ${await launched.text()}`).toBe(201)
  const instanceId = (await launched.json())?.trainingInstance?.id
  expect(instanceId, 'setup: launch returned an instance id').toBeTruthy()

  // The snapshot is what the gate reads. If launch ever stops snapshotting
  // documents, these arms would silently test nothing — so assert it.
  expect(
    sqlValue(
      `SELECT jsonb_array_length(snapshot->'documentIds') FROM training_instances WHERE id = '${instanceId}'`,
    ),
    'setup: the instance snapshot carries the linked document',
  ).toBe('1')

  return { trainingId, instanceId, doc }
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

test.describe('TRN-J11 · a completion signature requires the material to have been reviewed', () => {
  test('control: the same submit SUCCEEDS once the material has been viewed', async ({
    browser,
  }) => {
    // The control, and it is what makes the two arms below meaningful. Without
    // it a refusal could mean "the gate works" or "this submit never works" —
    // e.g. a bad e-sign body, an unassigned learner, a mis-shaped answers map.
    //
    // Viewing is recorded the only way the product records it: the learner's own
    // PUT .../answers carrying __interactions. That is the client's mechanism,
    // not a server one — which is precisely the defect — but it is the honest
    // "material was viewed" state for today's product, and after a fix this
    // control should still pass (the fix must keep a genuine review working).
    test.setTimeout(150_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const setup = await launchTrainingWithMaterial(adminCtx, 'control')
    const learnerCtx = await browser.newContext({ storageState: AUTH.learner })

    try {
      await learnerCtx.request.post(
        `/api/v1/services/trainingInstances/${setup.instanceId}/start`,
      )
      const saved = await learnerCtx.request.put(
        `/api/v1/services/trainingInstances/${setup.instanceId}/answers`,
        {
          data: {
            answers: {
              ...TRAINING.correctAnswers,
              __interactions: { docs: [setup.doc.id], links: [] },
            },
          },
        },
      )
      expect(saved.ok(), `control: saving progress failed — ${await saved.text()}`).toBe(true)

      const res = await learnerCtx.request.post(
        `/api/v1/services/trainingInstances/${setup.instanceId}/submit`,
        { data: { answers: TRAINING.correctAnswers, esign: ESIGN } },
      )
      expect(
        res.ok(),
        `control: a reviewed-and-answered submit must succeed (got ${res.status()}: ${await res
          .text()
          .catch(() => '')})`,
      ).toBe(true)

      const assignee = findAssignee(setup.instanceId)
      expect(assignee?.status, 'control: the learner passed').toBe('COMPLETED')
      expect(assignee?.score, 'control: both answers correct scores 100').toBe(100)
      expect(assignee?.signed, 'control: the completion is signed').toBe(true)
    } finally {
      cleanup(setup)
      await learnerCtx.close()
      await adminCtx.close()
    }
  })

  test('a submit with NO material opened is refused, and writes no signed record', async ({
    browser,
  }) => {
    // THE CORE ARM. Straight to /submit from ASSIGNED — no /start, no
    // /answers, no document ever opened — with a valid e-signature and correct
    // answers. Today this returns 200 and writes a COMPLETED, score-100,
    // e-signed competency record for a learner who never opened the SOP.
    test.setTimeout(150_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const setup = await launchTrainingWithMaterial(adminCtx, 'nomaterial')
    const learnerCtx = await browser.newContext({ storageState: AUTH.learner })

    try {
      expect(
        findAssignee(setup.instanceId)?.status,
        'the learner has not started, let alone read anything',
      ).toBe('ASSIGNED')

      const res = await learnerCtx.request.post(
        `/api/v1/services/trainingInstances/${setup.instanceId}/submit`,
        { data: { answers: TRAINING.correctAnswers, esign: ESIGN } },
      )

      expect(
        res.status(),
        `a completion must not be signable without reviewing the linked material (got ${res.status()}: ${await res
          .text()
          .catch(() => '')})`,
      ).toBeGreaterThanOrEqual(400)

      const assignee = findAssignee(setup.instanceId)
      expect(assignee?.status, 'no completion was recorded').not.toBe('COMPLETED')
      expect(assignee?.signed, 'no signature was written').toBe(false)
      expect(assignee?.score, 'no score was written').toBeNull()
    } finally {
      cleanup(setup)
      await learnerCtx.close()
      await adminCtx.close()
    }
  })

  test('a submit claiming review of a document that is not linked is refused', async ({
    browser,
  }) => {
    // The second half of the defect, and the reason a fix cannot simply read
    // `__interactions` back. `saveAnswers` writes the blob wholesale with no
    // validation, so a learner can assert they viewed anything at all —
    // including a random uuid, or the document ids of someone else's training.
    //
    // A server that trusted this key would be satisfied by a forged claim. The
    // gate has to rest on something the SERVER observed.
    test.setTimeout(150_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const setup = await launchTrainingWithMaterial(adminCtx, 'forged')
    const learnerCtx = await browser.newContext({ storageState: AUTH.learner })

    try {
      await learnerCtx.request.post(
        `/api/v1/services/trainingInstances/${setup.instanceId}/start`,
      )
      // A plausible-looking but unrelated uuid — never linked to this training.
      const forged = '00000000-0000-4000-8000-0000000000ff'
      const saved = await learnerCtx.request.put(
        `/api/v1/services/trainingInstances/${setup.instanceId}/answers`,
        {
          data: {
            answers: {
              ...TRAINING.correctAnswers,
              __interactions: { docs: [forged], links: [] },
            },
          },
        },
      )
      expect(saved.ok(), 'the progress save itself is not what is under test').toBe(true)

      const res = await learnerCtx.request.post(
        `/api/v1/services/trainingInstances/${setup.instanceId}/submit`,
        { data: { answers: TRAINING.correctAnswers, esign: ESIGN } },
      )

      expect(
        res.status(),
        `a forged review claim must not satisfy the gate (got ${res.status()})`,
      ).toBeGreaterThanOrEqual(400)
      expect(findAssignee(setup.instanceId)?.status, 'no completion was recorded').not.toBe(
        'COMPLETED',
      )
    } finally {
      cleanup(setup)
      await learnerCtx.close()
      await adminCtx.close()
    }
  })

  test('the e-signature is still verified — a bad PIN is refused', async ({ browser }) => {
    // A guard on the guard. If a fix to the material gate ever short-circuits
    // BEFORE `authenticateTrainingSignature`, the arms above would go green for
    // the wrong reason: every submit refused, including ones refused for an
    // unrelated cause.
    //
    // This should be GREEN today and stay green — `submitAssessment` verifies
    // identity before any write, which is itself a previously-fixed defect
    // (see the comment block above `authenticateTrainingSignature`).
    test.setTimeout(150_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const setup = await launchTrainingWithMaterial(adminCtx, 'badpin')
    const learnerCtx = await browser.newContext({ storageState: AUTH.learner })

    try {
      const res = await learnerCtx.request.post(
        `/api/v1/services/trainingInstances/${setup.instanceId}/submit`,
        { data: { answers: TRAINING.correctAnswers, esign: { method: 'PIN', token: '000000' } } },
      )

      expect(res.ok(), `a wrong PIN must not sign a completion (got ${res.status()})`).toBe(false)
      expect(findAssignee(setup.instanceId)?.signed, 'nothing was signed').toBe(false)
    } finally {
      cleanup(setup)
      await learnerCtx.close()
      await adminCtx.close()
    }
  })
})
