// TRN-J15 · WHY the learner cannot read the pinned material, and what a fix
// would have to be — the mechanism behind defect TRN-D17 (URS-TRN-10,
// OQ-02 TC-02-09 step 3).
//
// TRN-J13 already establishes the two halves of this requirement:
//   · the PIN is correct — launch freezes `snapshot.documentVersionByDocId`
//     at the then-EFFECTIVE version, a later release does not move it, and a
//     later launch pins the newer one. That half PASSES.
//   · the DELIVERY is broken — the learner sees 0 document_version rows, the
//     material row renders unlabelled, and the viewer shows "No effective
//     (published) version found for this document". J13's third test pins that
//     SYMPTOM at the RLS layer and on the screen.
//
// This file exists because the symptom alone does not tell a reviewer whether
// TRN-D17 is "a wire that was never connected" or "a capability the product
// does not have". Those are different defects with different remediation, and
// a validation package that cannot tell them apart cannot schedule the fix.
// Every assertion below is a MECHANISM assertion, measured live rather than
// argued, and each one is written so that the day the mechanism changes the
// test turns red and names what changed.
//
// ── WHAT THE POLICY ACTUALLY SAYS ───────────────────────────────────────────
// Read from `qms/database/rls.sql:3177-3186` and re-read live from pg_policy on
// 2026-09-23 (they agree verbatim). `document_version_select_rls` is PERMISSIVE
// FOR SELECT TO app_user, and after the mandatory tenant predicate it admits a
// reader on exactly FOUR branches:
//
//   B1  current_setting('app.current_user_is_owner') = true
//   B2  has_permission('document_control','read')
//         AND document_version_scope_allowed(document_id)
//         AND (status_id <> 'DRAFT' OR is_document_collaborator_or_owner(document_id))
//   B3  EXISTS a live task_instances row with
//         entity_type = 'DocumentVersion' AND entity_id = <THIS VERSION>
//         AND assigned_to = me
//   B4  status_id = 'EFFECTIVE'
//         AND EXISTS a live shared_with_user row
//              (entity_type = 'Document', entity_id = <the parent document>, user_id = me)
//
// Two structural facts follow, and both matter for the fix:
//
//   · `is_document_collaborator_or_owner` — the "I am on this document" escape
//     hatch — sits INSIDE B2, behind the `has_permission` conjunct. It is not a
//     branch of its own. So being named on a document grants nothing on its
//     VERSIONS unless you separately hold document_control:read.
//   · B4 is the only branch reachable without either a grant or a task, and it
//     is gated on `status_id = 'EFFECTIVE'` — which is precisely the status the
//     pinned version STOPS having the moment TC-02-09 step 2 releases its
//     successor (`document_versions_supersede_prior_effective` flips v1.0 to
//     SUPERSEDED). The one open branch closes exactly when the requirement
//     needs it.
//
// `document_sections` — the table that holds the text a learner would actually
// read — has no independent opinion at all:
//
//   document_section_select_rls:
//     company_id = app.current_company_id
//     AND EXISTS (SELECT 1 FROM document_versions dv
//                  WHERE dv.id = document_sections.document_version_id LIMIT 1)
//
// That inner EXISTS runs under `document_versions`' own RLS, so section
// visibility is a strict function of version visibility. There is no second
// door. A fix at the version layer fixes the content; nothing else will.
//
// ── WHAT LAUNCH WRITES, AND WHAT IT DOES NOT ────────────────────────────────
// `launchTraining` (qms/backend/api/controllers/trainings.js:178-281) writes,
// in one transaction: the TrainingInstance + snapshot, the TrainingAssessmentKey,
// the TrainingAssignee rows, and one TaskInstance per assignee —
//
//     entityType: 'TrainingAssignee',   entityId: a.id,
//     sourceType: 'TrainingInstance',   sourceId: instance.id,
//     taskKindId: 'TRAINING',
//
// …and nothing else. No `shared_with_user` row (B4), no task pointed at the
// DocumentVersion (B3), no grant (B2). The task it DOES write is pointed at the
// TrainingAssignee, which no document policy has ever heard of.
//
// ── IS THERE ANY OTHER PATH? MEASURED: NO ───────────────────────────────────
// Searched `qms/backend` for a material-serving route, a signed URL, or a
// service-layer read that bypasses RLS on the learner's behalf. There is none:
//
//   · `api/routes/trainings.js` and `api/routes/trainingInstances.js` expose 9
//     and 9 routes respectively (list/get/create/update/delete/activate/launch/
//     archive and list/get/assessment-key/cancel/start/answers/submit/
//     remove-assignee/verify). Not one of them returns document content, a
//     version body, or a URL to either.
//   · The learner's viewer does not call REST for the material at all.
//     `TrainingDocumentViewDialog.vue` resolves the version from IndexedDB
//     ONLY — `db.DocumentVersion.findByPk(pinnedVersionId)`, then a fallback
//     scan for an EFFECTIVE one — and IndexedDB is filled by the SyncEngine
//     over PostGraphile as `app_user`, i.e. through the very policy above. So
//     the REST-bypasses-RLS escape that exists elsewhere in this product is not
//     wired here, and the dialog's "No effective (published) version found"
//     empty state is what a learner gets by construction.
//
// ── SO WHICH KIND OF DEFECT IS IT? ──────────────────────────────────────────
// Measured below, with the DB rolled back: it is a NOT-WIRED defect for the
// current version and a MISSING-CAPABILITY defect for the pinned one.
//
//   · Write a `shared_with_user` row (B4) — an entity type the CHECK constraint
//     already admits, RLS already honours, and `POST /v1/services/sharing`
//     already writes — and the learner immediately reads the document, the
//     EFFECTIVE version and its sections. Launch simply never calls it.
//   · But that same share yields ZERO on a SUPERSEDED version, because B4 is
//     status-gated. And SUPERSEDED is exactly what the pinned version becomes
//     in TC-02-09. So the cheap fix would make the learner read the WRONG
//     (current) version — which is the failure mode the pin exists to prevent.
//   · Only B3 — a task_instances row pointed at the DocumentVersion itself — is
//     status-agnostic and admits the pinned SUPERSEDED version together with its
//     document and its sections.
//
// That is the actionable finding, and it is why this file is worth its runtime:
// the obvious remediation for TRN-D17 is measurably insufficient for
// URS-TRN-10, and the record should say so before someone ships it.
//
// ── HOW THIS FILE IS WRITTEN ────────────────────────────────────────────────
// Current behaviour is pinned AS IT IS, with the diagnosis attached, exactly as
// TRN-J13 does — so the suite stays green on a known defect and turns red the
// day the product changes. The last test is the tripwire: it asserts launch
// writes NEITHER a share NOR a version task, and will fail the moment either is
// added, at which point TRN-D17 is fixed and this file (and TC-02-09 step 3)
// should be re-graded rather than repaired.
//
// Every probe carries a CONTROL arm. "0 rows" and "the query never reached the
// table" are the same observation from the outside, and without a control this
// entire file could pass vacuously against a broken harness.
//
// Measured 2026-09-23 against the live local stack (app-db). The two "what would
// a fix look like" probes run inside an explicit BEGIN … ROLLBACK, so this spec
// leaves no rows behind beyond its own seeded fixtures, which it cleans up.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID, TRAINING } from '../fixtures/cast.js'
import { sql, sqlValue, sqlAsAppUser, siteGucSql } from '../fixtures/db.js'
import { execFileSync } from 'node:child_process'

let seq = 0
function uniqueSuffix() {
  seq += 1
  return `${process.pid}-${seq}`
}

/**
 * An EFFECTIVE v1.0 document with one section carrying a marker string.
 *
 * Deliberately the same shape TRN-J13 seeds, so the two files are measuring the
 * same fixture and a divergence between them is a real disagreement rather than
 * an artefact of two different documents.
 */
function seedDocumentV1(tag) {
  const suffix = uniqueSuffix()
  const title = `E2E TRN-J15 ${tag} Doc ${suffix}`
  const marker = `TRN-J15-V1-MARKER-${suffix}`
  const out = sql(`
    WITH d AS (
      INSERT INTO documents (company_id, title, doc_number, created_at, updated_at)
      VALUES ('${COMPANY_ID}', '${title}', 'ETRNJ15-${suffix}', now(), now())
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
 * Release v2.0 along the product's own legal edges, so v1.0 is superseded by the
 * real trigger rather than by a hand-written UPDATE. `change_reason` is
 * mandatory above v1.0 (`document_versions_change_reason_required`).
 */
function releaseV2(doc) {
  const marker = `TRN-J15-V2-MARKER-${doc.suffix}`
  const v2Id = sql(`
    WITH v AS (
      INSERT INTO document_versions
        (company_id, document_id, version_major, version_minor, status_id, change_reason, created_at, updated_at)
      VALUES ('${COMPANY_ID}', '${doc.id}', 2, 0, 'DRAFT', 'TRN-J15 revision for readability probe', now(), now())
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

/** Launch a training linking `doc` to the learner, through the real endpoints. */
async function launchTrainingLinking(adminCtx, doc, tag) {
  const title = `E2E TRN-J15 ${tag} ${uniqueSuffix()}`
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
      // Mandatory to reach ACTIVE — without it `activate` throws a bare 500.
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
    data: { userIds: [USERS.learner.id], reason: 'TRN-J15 material readability' },
  })
  expect(launched.status(), `setup: launch failed — ${await launched.text()}`).toBe(201)
  const instanceId = (await launched.json())?.trainingInstance?.id
  expect(instanceId, 'setup: launch returned an instance id').toBeTruthy()

  return { trainingId, instanceId }
}

/**
 * Read a scalar as `userId` through the real `app_user` role.
 *
 * `sqlAsAppUser` prepends a DO block, a SET ROLE and three `set_config` SELECTs,
 * each of which prints a line, so the probe's own answer is the LAST line — not
 * the whole output. Reading the whole output turns "0" into a multi-line string
 * that compares unequal to everything and passes a `.not.toBe()` for the wrong
 * reason.
 */
function asUser(userId, query, label) {
  const res = sqlAsAppUser(query, { userId, companyId: COMPANY_ID })
  expect(res.ok, `${label}: the probe itself ran — ${res.error}`).toBe(true)
  const lines = res.output.trim().split('\n')
  return lines[lines.length - 1].trim()
}

/**
 * Run a throwaway experiment inside BEGIN … ROLLBACK: write rows as the
 * superuser, then read them back as `app_user`.
 *
 * Used by the two "what would a fix look like" tests. `setupSql` has to run on
 * the SUPERUSER connection — it writes a share / a task the learner could never
 * write for themselves, and `document_version_select_rls` is exactly what we
 * are trying to measure, so writing through it would beg the question. Only
 * after the setup does the session `SET LOCAL ROLE app_user` and adopt the
 * learner's GUCs to run `probeSql`.
 *
 * This deliberately does NOT go through `sqlAsAppUser`, which issues its own
 * session-level `SET ROLE app_user` BEFORE the caller's SQL — under that helper
 * the setup INSERTs would themselves run as the learner and be refused, and the
 * probe would read "0" for a reason that has nothing to do with the policy.
 * That is the exact false negative this whole file exists to avoid, so the
 * psql invocation is spelled out here instead.
 *
 * `siteGucSql(..., true)` — isLocal = true — because we are inside an explicit
 * transaction, unlike `sqlAsAppUser`'s session-level script.
 *
 * The ROLLBACK is unconditional and is what makes writing acceptable at all:
 * nothing these two tests invent survives the statement.
 */
function rollbackProbe({ setupSql, probeSql, userId }) {
  const script = `BEGIN;
${setupSql}
${siteGucSql(userId, COMPANY_ID, true)}
SET LOCAL ROLE app_user;
SELECT set_config('app.current_user_id', '${userId}', true);
SELECT set_config('app.current_company_id', '${COMPANY_ID}', true);
SELECT set_config('app.current_user_is_owner', 'false', true);
${probeSql}
ROLLBACK;`
  const container = process.env.E2E_PSQL_CONTAINER || 'qms-postgres-1'
  const pgUser = process.env.E2E_PSQL_USER || 'postgres'
  const pgDb = process.env.E2E_PSQL_DB || 'app-db'
  try {
    const output = execFileSync(
      'docker',
      ['exec', '-i', container, 'psql', '-U', pgUser, '-d', pgDb, '-v', 'ON_ERROR_STOP=1', '-tA'],
      { encoding: 'utf8', timeout: 15_000, input: script },
    )
    return { ok: true, output: output.trim(), error: '' }
  } catch (err) {
    return { ok: false, output: err.stdout ?? '', error: `${err.stderr ?? ''}` }
  }
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

test.describe('TRN-J15 · TRN-D17 — why the learner cannot read the pinned material', () => {
  test('KNOWN DEFECT TRN-D17 · a launched learner reads NOTHING of the linked document — and the control proves the probe works', async () => {
    // The baseline, restated at the tenant level rather than row by row, which
    // is a stronger statement than TRN-J13's per-row counts: it is not that the
    // learner is missing THIS document, it is that the learner's window onto
    // document_versions / documents / document_sections is empty tenant-wide.
    // A fix that widened only the seeded row would still leave this true; a fix
    // that opened the training path would not.
    test.setTimeout(150_000)
    const doc = seedDocumentV1('baseline')
    const setup = { doc }

    try {
      const learnerVersions = asUser(
        USERS.learner.id,
        'SELECT count(*) FROM document_versions',
        'learner/versions',
      )
      const learnerDocs = asUser(
        USERS.learner.id,
        'SELECT count(*) FROM documents',
        'learner/documents',
      )
      const learnerSections = asUser(
        USERS.learner.id,
        'SELECT count(*) FROM document_sections',
        'learner/sections',
      )

      expect(
        learnerVersions,
        'KNOWN DEFECT TRN-D17: the learner sees zero document_versions in the whole tenant',
      ).toBe('0')
      expect(learnerDocs, 'and zero documents').toBe('0')
      expect(
        learnerSections,
        'and zero document_sections — section RLS is a bare EXISTS on document_versions, so it can never be wider',
      ).toBe('0')

      // CONTROL. The identical three queries, identical helper, identical role,
      // a persona the policy admits. Without this, the three zeros above are
      // indistinguishable from "the session never reached the tables".
      expect(
        Number(asUser(USERS.author.id, 'SELECT count(*) FROM document_versions', 'ctrl/versions')),
        'CONTROL: a document_control:read holder DOES see document_versions through the same probe',
      ).toBeGreaterThan(0)
      expect(
        Number(asUser(USERS.author.id, 'SELECT count(*) FROM documents', 'ctrl/documents')),
        'CONTROL: …and documents',
      ).toBeGreaterThan(0)
      expect(
        Number(asUser(USERS.author.id, 'SELECT count(*) FROM document_sections', 'ctrl/sections')),
        'CONTROL: …and document_sections',
      ).toBeGreaterThan(0)

      // And the learner is not simply locked out of the database: the training
      // side of the same session reads fine. This separates "RLS withholds
      // documents from this persona" from "this persona has no session at all",
      // which is the misdiagnosis a bare count of zero invites.
      expect(
        Number(
          asUser(USERS.learner.id, 'SELECT count(*) FROM training_instances', 'learner/instances'),
        ),
        'CONTROL: the SAME learner session reads training_instances — the session is real, the documents are withheld',
      ).toBeGreaterThan(0)
    } finally {
      cleanup(setup)
    }
  })

  test('TRN-D17 mechanism · none of the four branches of document_version_select_rls is reachable after launch', async ({
    browser,
  }) => {
    // The diagnosis, asserted rather than asserted-about. Each of the four
    // branches is measured against the launched fixture, so a future change that
    // opens ANY of them turns exactly one of these assertions red and names
    // which door opened.
    test.setTimeout(150_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const doc = seedDocumentV1('branches')
    let setup = { doc }

    try {
      setup = { ...(await launchTrainingLinking(adminCtx, doc, 'branches')), doc }
      const v2 = releaseV2(doc)

      expect(
        sqlValue(
          `SELECT snapshot->'documentVersionByDocId'->>'${doc.id}'
             FROM training_instances WHERE id = '${setup.instanceId}'`,
        ),
        'premise: the instance pins v1.0 (TRN-J13 proves the pin in full)',
      ).toBe(doc.versionId)
      expect(
        sqlValue(`SELECT status_id FROM document_versions WHERE id = '${doc.versionId}'`),
        'premise: and v1.0 is now SUPERSEDED, which is what closes branch B4',
      ).toBe('SUPERSEDED')

      // B1 — the learner is not the company owner.
      expect(
        sqlValue(`SELECT is_owner FROM users WHERE id = '${USERS.learner.id}'`),
        'B1 closed: the learner is not a company owner',
      ).not.toBe('t')

      // B2 — no document_control grant of any action. Asserted on the module and
      // not on `document_control:read` specifically, because authz.has_permission
      // matches ANY action on a module when the requested action is 'read'
      // (see cast.js's teamsOnly note) — so a grant of document_control:create
      // would quietly satisfy B2's first conjunct.
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM roles_on_users rou
               JOIN authz.role_module_permissions rmp ON rmp.role_id = rou.role_id
              WHERE rou.user_id = '${USERS.learner.id}' AND rmp.module_id = 'document_control'`,
          ),
        ),
        'B2 closed: the learner holds no document_control grant of any action',
      ).toBe(0)

      // …and the collaborator escape hatch inside B2 is closed too, which is
      // worth stating separately because it is the one people reach for: it is
      // NOT a branch of its own, it is a conjunct behind has_permission, so
      // adding the learner to users_on_documents alone would still grant nothing.
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM users_on_documents
              WHERE document_id = '${doc.id}' AND user_id = '${USERS.learner.id}'`,
          ),
        ),
        'B2 closed: the learner is not a document collaborator either (and it would not help — the arm sits behind has_permission)',
      ).toBe(0)

      // B3 — launch writes a task, but points it at the TrainingAssignee.
      const taskEntity = sqlValue(
        `SELECT DISTINCT ti.entity_type FROM task_instances ti
           JOIN training_assignees ta ON ta.id = ti.entity_id
          WHERE ta.training_instance_id = '${setup.instanceId}'
            AND ti.assigned_to = '${USERS.learner.id}' AND ti.deleted_at IS NULL`,
      )
      expect(
        taskEntity,
        'launch DOES write the learner a task — so the absence below is a target problem, not a missing task',
      ).toBe('TrainingAssignee')
      for (const versionId of [doc.versionId, v2.id]) {
        expect(
          Number(
            sqlValue(
              `SELECT count(*) FROM task_instances
                WHERE entity_type = 'DocumentVersion' AND entity_id = '${versionId}'
                  AND assigned_to = '${USERS.learner.id}' AND deleted_at IS NULL`,
            ),
          ),
          `B3 closed: no task points at version ${versionId} — the TRAINING task names the TrainingAssignee`,
        ).toBe(0)
      }

      // B4 — no share, and even a share would be status-gated (next test).
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM shared_with_user
              WHERE entity_type = 'Document' AND entity_id = '${doc.id}'
                AND user_id = '${USERS.learner.id}' AND deleted_at IS NULL`,
          ),
        ),
        'B4 closed: launch writes no shared_with_user row for the linked document',
      ).toBe(0)

      // The consequence, measured on the fixture rather than inferred: both
      // versions AND the sections behind them are invisible.
      expect(
        asUser(
          USERS.learner.id,
          `SELECT count(*) FROM document_versions WHERE document_id = '${doc.id}'`,
          'learner/fixture-versions',
        ),
        'with all four branches closed, the learner reads neither the pinned v1.0 nor the current v2.0',
      ).toBe('0')
      expect(
        asUser(
          USERS.learner.id,
          `SELECT count(*) FROM document_sections WHERE document_id = '${doc.id}'`,
          'learner/fixture-sections',
        ),
        'nor either version’s content',
      ).toBe('0')

      // CONTROL on the same fixture rows, so "0" cannot mean "this document does
      // not exist" or "the seed failed".
      expect(
        asUser(
          USERS.author.id,
          `SELECT count(*) FROM document_versions WHERE document_id = '${doc.id}'`,
          'ctrl/fixture-versions',
        ),
        'CONTROL: the same two rows are readable by a document_control:read holder',
      ).toBe('2')
    } finally {
      cleanup(setup)
      await adminCtx.close()
    }
  })

  test('TRN-D17 remediation · a Document share unblocks the CURRENT version — and is measurably NOT enough for the pinned one', async ({
    browser,
  }) => {
    // The finding this file exists for.
    //
    // The obvious fix for TRN-D17 is "have launch share the linked documents
    // with the assignees". That mechanism already exists end to end — the
    // `shared_with_user_entity_type_chk` CHECK admits 'Document',
    // `document_version_select_rls` branch B4 honours it, and
    // `POST /v1/services/sharing` already writes it — so it is a wire, not a
    // feature. This test proves the wire works…
    //
    // …and then proves it does not satisfy URS-TRN-10, because B4 reads
    // `status_id = 'EFFECTIVE'` and the pinned version is SUPERSEDED by the time
    // step 3 is performed. A share-based fix would show the learner the CURRENT
    // version — the exact substitution the pin exists to prevent — while looking
    // like a fix from the outside. That is worth a failing-loudly test.
    //
    // Both arms run inside BEGIN … ROLLBACK: the share rows below never commit.
    test.setTimeout(150_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const doc = seedDocumentV1('share')
    let setup = { doc }

    try {
      setup = { ...(await launchTrainingLinking(adminCtx, doc, 'share')), doc }
      const v2 = releaseV2(doc)
      expect(
        sqlValue(`SELECT status_id FROM document_versions WHERE id = '${doc.versionId}'`),
        'premise: the pinned v1.0 is SUPERSEDED',
      ).toBe('SUPERSEDED')
      expect(
        sqlValue(`SELECT status_id FROM document_versions WHERE id = '${v2.id}'`),
        'premise: v2.0 is the EFFECTIVE one',
      ).toBe('EFFECTIVE')

      const shareSql = `INSERT INTO shared_with_user
          (company_id, entity_type, entity_id, user_id, granted_by, granted_via, created_at, updated_at)
        VALUES ('${COMPANY_ID}', 'Document', '${doc.id}', '${USERS.learner.id}',
                '${USERS.trainingAdmin.id}', 'MANUAL', now(), now());`

      const res = rollbackProbe({
        userId: USERS.learner.id,
        setupSql: shareSql,
        probeSql: `
          SELECT 'pinned=' || count(*) FROM document_versions WHERE id = '${doc.versionId}';
          SELECT 'current=' || count(*) FROM document_versions WHERE id = '${v2.id}';
          SELECT 'document=' || count(*) FROM documents WHERE id = '${doc.id}';
          SELECT 'sections=' || count(*) FROM document_sections WHERE document_version_id = '${v2.id}';`,
      })
      expect(res.ok, `the share experiment ran — ${res.error}`).toBe(true)
      const out = res.output

      // The wire works — this is the "not wired up" half of the diagnosis, and
      // it is the good news: no new RLS, no new capability, launch just has to
      // call something that already exists.
      expect(
        out,
        'a Document share DOES open the current version to the learner — the mechanism exists and is simply never invoked at launch',
      ).toContain('current=1')
      expect(out, '…along with the parent document').toContain('document=1')
      expect(out, '…and its section content').toContain('sections=1')

      // The bad news, and the reason a share is not the fix for THIS requirement.
      expect(
        out,
        'but the PINNED v1.0 stays invisible: branch B4 is gated on EFFECTIVE, and the pinned version is SUPERSEDED',
      ).toContain('pinned=0')

      // Stated as the contrast it is, so the record cannot be misread as "the
      // share fixed it": under the same share, in the same transaction, the
      // learner is served the WRONG version — the one the pin was created to
      // prevent them being served.
      expect(
        out.includes('current=1') && out.includes('pinned=0'),
        'a share-only remediation would serve the learner the CURRENT version while withholding the pinned one — TC-02-09’s exact failure mode',
      ).toBe(true)
    } finally {
      cleanup(setup)
      await adminCtx.close()
    }
  })

  test('TRN-D17 remediation · only a task on the DocumentVersion admits the pinned SUPERSEDED version', async ({
    browser,
  }) => {
    // The other half of the remediation analysis, and the one that would
    // actually make URS-TRN-10 Covered.
    //
    // Branch B3 is the only one of the four with no status predicate, so it is
    // the only mechanism that can serve a SUPERSEDED version to a non-grant
    // holder. Proved here with a task row pointed at the pinned version —
    // again inside BEGIN … ROLLBACK, so nothing commits.
    //
    // Note what this implies for the fix: the existing TRAINING task already
    // exists and already belongs to the learner; what is missing is a SECOND
    // task (or a widened policy branch) that names the DocumentVersion. Either
    // is a product change. There is no configuration of today's product — no
    // grant a customer could assign, no share an admin could write — that makes
    // step 3 pass without also over-granting the learner the whole document
    // module. That is what makes this Product-non-conformant rather than a
    // deployment or seeding defect.
    test.setTimeout(150_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const doc = seedDocumentV1('task')
    let setup = { doc }

    try {
      setup = { ...(await launchTrainingLinking(adminCtx, doc, 'task')), doc }
      releaseV2(doc)
      expect(
        sqlValue(`SELECT status_id FROM document_versions WHERE id = '${doc.versionId}'`),
        'premise: the pinned v1.0 is SUPERSEDED',
      ).toBe('SUPERSEDED')

      const taskSql = `INSERT INTO task_instances
          (company_id, entity_type, entity_id, assigned_to, task_kind_id, created_at, updated_at)
        VALUES ('${COMPANY_ID}', 'DocumentVersion', '${doc.versionId}', '${USERS.learner.id}',
                'TRAINING', now(), now());`

      const res = rollbackProbe({
        userId: USERS.learner.id,
        setupSql: taskSql,
        probeSql: `
          SELECT 'pinned=' || count(*) FROM document_versions WHERE id = '${doc.versionId}';
          SELECT 'document=' || count(*) FROM documents WHERE id = '${doc.id}';
          SELECT 'sections=' || count(*) FROM document_sections WHERE document_version_id = '${doc.versionId}';`,
      })
      expect(res.ok, `the task experiment ran — ${res.error}`).toBe(true)
      const out = res.output

      expect(
        out,
        'a task pointed at the DocumentVersion admits the pinned SUPERSEDED version — B3 has no status predicate',
      ).toContain('pinned=1')
      expect(
        out,
        '…and the parent document too, via documents_sel’s own task_instances arm',
      ).toContain('document=1')
      expect(
        out,
        '…and the section content, which is what the learner would actually read',
      ).toContain('sections=1')
    } finally {
      cleanup(setup)
      await adminCtx.close()
    }
  })

  test('TRIPWIRE · launch still writes neither a Document share nor a DocumentVersion task — re-grade TC-02-09 when this fails', async ({
    browser,
  }) => {
    // The flip signal. Everything above pins a defect; this pins the ABSENCE
    // that causes it, in the narrowest form that a fix must contradict.
    //
    // When TRN-D17 is fixed — whichever of the two mechanisms is chosen — this
    // test fails, and that failure is the instruction to re-run TC-02-09 step 3
    // as written and move URS-TRN-10 from Partial to Covered. It is not a test
    // to repair; it is a test to retire.
    test.setTimeout(150_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const doc = seedDocumentV1('tripwire')
    let setup = { doc }

    try {
      setup = { ...(await launchTrainingLinking(adminCtx, doc, 'tripwire')), doc }

      const shares = Number(
        sqlValue(
          `SELECT count(*) FROM shared_with_user
            WHERE entity_type = 'Document' AND entity_id = '${doc.id}'
              AND user_id = '${USERS.learner.id}' AND deleted_at IS NULL`,
        ),
      )
      const versionTasks = Number(
        sqlValue(
          `SELECT count(*) FROM task_instances
            WHERE entity_type = 'DocumentVersion' AND entity_id = '${doc.versionId}'
              AND assigned_to = '${USERS.learner.id}' AND deleted_at IS NULL`,
        ),
      )

      expect(
        shares + versionTasks,
        'TRIPWIRE: launch grants the learner NO read path to the linked material. ' +
          'If this fails, TRN-D17 has been fixed — re-execute OQ-02 TC-02-09 step 3 and re-grade URS-TRN-10.',
      ).toBe(0)

      // CONTROL: the launch itself succeeded and the linkage is real, so the
      // zero above means "no read path was granted" and not "nothing happened".
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM training_document_links WHERE training_id = '${setup.trainingId}'`,
          ),
        ),
        'CONTROL: the training really does link the document',
      ).toBe(1)
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM task_instances ti
               JOIN training_assignees ta ON ta.id = ti.entity_id
              WHERE ta.training_instance_id = '${setup.instanceId}'
                AND ti.assigned_to = '${USERS.learner.id}' AND ti.deleted_at IS NULL`,
          ),
        ),
        'CONTROL: and the learner really does hold the TRAINING task — it just names the TrainingAssignee',
      ).toBe(1)
    } finally {
      cleanup(setup)
      await adminCtx.close()
    }
  })
})
