// PW-J17 — URS-DOC-14 / OQ TC-01-12: the audit trail of ONE document's whole life.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS
//
// `e2e/auditLogs/a5-record-history.spec.js` already proves the History
// AFFORDANCE is offered to a trail holder and withheld from everyone else. That
// is a permission test. It says nothing about whether the trail CONTAINS
// anything, and TC-01-12 is a CONTENT test:
//
//   step 1  entries exist for creation, content changes, submission, review
//           actions, approval, release, revision and archival
//   step 2  an update entry shows the field changed, the previous value and
//           the new value
//   step 3  every entry records who performed it and when
//   step 4  no interface exists to edit or delete an audit entry
//
// So this file walks ONE document from create → submit → review → approve →
// effective → revise → supersede → archive and asserts each of those
// transitions landed in that document's own history, attributed, timestamped,
// and — where the entry is an UPDATE — carrying an old→new pair.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHERE THE ENTRIES ACTUALLY LIVE, AND WHY THE ASSERTIONS ARE SPLIT IN TWO
//
// A "document's history" is not one entity_type. `DocumentsPageId.vue` builds
// `auditIncludeEntities` from FOUR:
//
//     Documents        the container   — title, owner, obsoletion
//     DocumentVersions the lifecycle   — DRAFT/IN_REVIEW/APPROVED/EFFECTIVE/
//                                        SUPERSEDED, i.e. most of TC-01-12 §1
//     DocumentSections the body        — title/order only (see below)
//     DocumentLinks    the lineage
//
// The dialog unions all four, which is why a test that queried only
// `entity_type = 'Documents'` would find a document that had been through two
// full approval cycles and conclude nothing had happened to it. Every query
// here is written against the same union the dialog renders.
//
// ⚠ THE ONE PLACE THE PRODUCT IS NARROWER THAN THE PROTOCOL READS.
// TC-01-12 §1 says "content changes". `document_sections` tracks `title` and
// `order` and DELIBERATELY NOT `content` — registry/modules/documentControl.js
// says so in terms: the controlled artifact is the VERSION, whose body is
// captured by `documentVersionSnapshotSideEffect` as a hashed PDF at release,
// and putting section bodies in `audit_logs` would duplicate that at every
// autosave while `sanitizePayload`'s 8 KB cap silently truncated the longer
// ones — "producing a trail that looks complete and is not". That is a
// defensible design, not a defect, but it IS a scope boundary an assessor must
// be shown rather than left to discover, so it is pinned below rather than
// asserted away.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE TRAP TC-01-12 WARNS ABOUT
//
// Audit Trail read is a SEPARATE grant from Document Control read. Without it
// the history renders "You don't have permission to view the audit trail."
// instead of an empty list — by design, so a missing permission is never
// mistaken for an absence of activity. Ava the auditor holds both grants and is
// the persona for the UI leg; Carla the controller holds full document_control
// CRUD and NO audit_trail and is pinned as the negative, so a green UI leg can
// never be an accident of the dialog rendering for everyone.
//
// ─────────────────────────────────────────────────────────────────────────────
// TIMING
//
// Every row here is worker-produced: the trigger only ENQUEUES an `audit_event`
// job and `graphile_worker` writes `audit_logs`. A single-shot query straight
// after a transition races that hop and reads as "not audited", so every
// assertion sits behind a poll.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, FIXTURES, ROLES, USERS } from '../fixtures/cast.js'
import {
  createSopDocument,
  fillAllSections,
  submitForReview,
  driveToEffective,
  createNewRevision,
  uniqueTitle,
} from '../fixtures/documents.js'
import { findDocumentByTitle, sql, sqlValue, sqlAsAppUser, versionsOf, waitForSqlValue } from '../fixtures/db.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// ─────────────────────────────────────────────────────────────────────────────
// A PRECONDITION THIS FILE HAS TO REPAIR, AND WHY IT IS NOT A WORKAROUND
//
// `createSopDocument` waits for the seeded SOP template's INHERITED approval
// steps ("Technical Review") before it will submit the create form — correctly,
// because `form.workflowVersionId` is only populated once the template's flow
// resolves and the field is required whenever a template is chosen.
//
// That flow is MINTED BY THE APPLICATION, not by the seed.
// `src/components/documentTemplates/documentTemplateApprovalFlow.js` creates a
// companion workflow named "<template> — Approval" with the two conventional
// gates the first time a template gets one. `database/e2e-seed.sql` §8 INSERTs
// the template row directly, with `workflow_id` left NULL, and nothing in the
// seed mints the companion — so on a freshly seeded database the template has
// no flow and EVERY Documents journey fails inside the shared fixture, ~25s
// in, on a locator for a step that was never created.
//
// Measured 2026-09-22 on app-db: `document_templates.workflow_id` IS NULL for
// 'E2E SOP Template', no workflow named 'E2E SOP Template — Approval' exists,
// and no `workflow_steps` row is named 'Technical Review'. PW-J1 —
// which predates this file — fails identically and for the same reason, so this
// is a SEED GAP in the shared environment, not a defect of these tests.
//
// The rules for this pass forbid editing e2e-seed.sql or any shared fixture, so
// the repair lives here, ONCE, in a beforeAll: mint exactly what the product
// would have minted, idempotently, and leave it in place. It restores the state
// the shared fixture already assumes rather than inventing a new one, and it is
// written so that a database where the flow already exists is untouched.
const SOP_FLOW = {
  workflowId: 'e2eab100-0000-4000-8000-000000000001',
  versionId: 'e2eab100-0000-4000-8000-000000000002',
  reviewStepId: 'e2eab100-0000-4000-8000-000000000003',
  approvalStepId: 'e2eab100-0000-4000-8000-000000000004',
  reviewRoleId: 'e2eab100-0000-4000-8000-000000000005',
  approvalRoleId: 'e2eab100-0000-4000-8000-000000000006',
}

/**
 * Mint the seeded SOP template's companion approval flow if it is missing.
 *
 * Shaped to match `plannedApprovalSteps()` exactly: step 1 "Technical Review"
 * (ACTION, comments + e-signature required, SLA = the template's
 * review_limit_days), step 2 "Approval" (APPROVAL, e-signature required, SLA =
 * approval_limit_days). The step→role edges point at the same E2E Reviewer and
 * E2E Approver roles the standalone seeded flow uses, which is what makes
 * `driveToEffective` — reviewer completes step 1, approver e-signs step 2 —
 * resolve to the cast this suite already has.
 *
 * Idempotent: ON CONFLICT DO NOTHING throughout, and the template is only
 * repointed when it currently has no flow, so a database that was seeded
 * correctly (or repaired by an earlier run) is left exactly as it is.
 */
function ensureSopTemplateApprovalFlow() {
  const templateId = sqlValue(
    `SELECT id FROM document_templates
      WHERE name = ${q(FIXTURES.sopTemplateName)} AND company_id = ${q(COMPANY_ID)}
        AND deleted_at IS NULL ORDER BY created_at LIMIT 1`,
  )
  expect(templateId, 'the seeded SOP template exists').toBeTruthy()

  const existing = sqlValue(
    `SELECT w.name FROM document_templates t
       JOIN workflows w ON w.id = t.workflow_id
      WHERE t.id = ${q(templateId)}`,
  )
  if (existing === FIXTURES.sopTemplateApprovalWorkflow) return // already correct

  sql(
    `INSERT INTO workflows (id, company_id, name, description, module_id, status_id, is_default, created_at, updated_at)
     VALUES (${q(SOP_FLOW.workflowId)}, ${q(COMPANY_ID)}, ${q(FIXTURES.sopTemplateApprovalWorkflow)},
             'Companion approval flow for the E2E SOP Template (minted by PW-J17 — see the header).',
             'APPROVAL', 'ACTIVE', false, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
  )
  sql(
    `INSERT INTO workflow_versions (id, workflow_id, version_major, version_minor, version_label,
        change_summary, status_id, is_current, created_by, company_id, created_at, updated_at)
     VALUES (${q(SOP_FLOW.versionId)}, ${q(SOP_FLOW.workflowId)}, 1, 0, '1.0', 'Initial version',
             'PUBLISHED', true, ${q(USERS.owner.id)}, ${q(COMPANY_ID)}, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
  )
  sql(
    `INSERT INTO workflow_steps (id, workflow_version_id, name, description, step_order, step_type,
        approval_rule, sla_days, require_comments, require_esignature, form_schema, company_id,
        allow_child_steps, external_supplier, adobe_esign_required, captures_effectiveness,
        created_at, updated_at)
     VALUES
       (${q(SOP_FLOW.reviewStepId)}, ${q(SOP_FLOW.versionId)}, ${q(FIXTURES.sopTemplateApprovalStep1)},
        'Subject-matter expert reviews the document for technical accuracy and completeness.',
        1, 'ACTION', 'ALL',
        (SELECT review_limit_days FROM document_templates WHERE id = ${q(templateId)}),
        true, true, '[]', ${q(COMPANY_ID)}, false, false, false, false, NOW(), NOW()),
       (${q(SOP_FLOW.approvalStepId)}, ${q(SOP_FLOW.versionId)}, ${q(FIXTURES.sopTemplateApprovalStep2)},
        'Final approval with e-signature.', 2, 'APPROVAL', 'ALL',
        (SELECT approval_limit_days FROM document_templates WHERE id = ${q(templateId)}),
        false, true, '[]', ${q(COMPANY_ID)}, false, false, false, false, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
  )
  // Step → role edges. These are what make the reviewer/approver candidate
  // pools deterministic, and therefore what `driveToEffective` depends on.
  sql(
    `INSERT INTO workflow_step_roles (id, step_id, role_id, company_id, created_at, updated_at)
     VALUES
       (${q(SOP_FLOW.reviewRoleId)}, ${q(SOP_FLOW.reviewStepId)}, ${q(ROLES.reviewer.id)},
        ${q(COMPANY_ID)}, NOW(), NOW()),
       (${q(SOP_FLOW.approvalRoleId)}, ${q(SOP_FLOW.approvalStepId)}, ${q(ROLES.approver.id)},
        ${q(COMPANY_ID)}, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
  )
  sql(
    `UPDATE document_templates SET workflow_id = ${q(SOP_FLOW.workflowId)}, updated_at = NOW()
      WHERE id = ${q(templateId)} AND workflow_id IS NULL`,
  )

  // Verify the repair took before any journey depends on it — a silent failure
  // here would resurface 25s later inside the shared fixture as "Technical
  // Review is not visible", which is a much harder failure to read.
  expect(
    sqlValue(
      `SELECT w.name FROM document_templates t JOIN workflows w ON w.id = t.workflow_id
        WHERE t.id = ${q(templateId)}`,
    ),
    'the SOP template now owns its companion approval flow',
  ).toBe(FIXTURES.sopTemplateApprovalWorkflow)
  expect(
    sqlValue(
      `SELECT count(*) FROM workflow_steps WHERE workflow_version_id = ${q(SOP_FLOW.versionId)}`,
    ),
    'with its two conventional gates',
  ).toBe('2')
}

// ── Local helpers. Nothing here touches e2e/fixtures/* — see the task rules.

/**
 * The SQL predicate for "this document's own history", as the dialog defines
 * it: the four entity types `auditIncludeEntities` unions, scoped to this
 * document's rows.
 *
 * `DocumentSections` and `DocumentLinks` are joined through their own tables
 * rather than listed by id, because sections are created and destroyed across
 * a revision and a snapshot of their ids taken at any single moment would miss
 * some of their own history.
 */
function documentTrailScope(docId) {
  return `(
    (entity_type = 'Documents' AND entity_id = ${q(docId)})
    OR (entity_type = 'DocumentVersions' AND entity_id IN (
          SELECT id FROM document_versions WHERE document_id = ${q(docId)}))
    OR (entity_type = 'DocumentSections' AND entity_id IN (
          SELECT id FROM document_sections WHERE document_id = ${q(docId)}))
    OR (entity_type = 'DocumentLinks' AND entity_id IN (
          SELECT id FROM document_links
           WHERE from_document_version_id IN (SELECT id FROM document_versions WHERE document_id = ${q(docId)})
              OR to_document_version_id   IN (SELECT id FROM document_versions WHERE document_id = ${q(docId)})))
  )`
}

/** Every history row for this document, newest last. */
function trailFor(docId) {
  const out = sql(
    `SELECT entity_type, action, entity_id, performed_by, performed_at,
            coalesce(old_value_json::text,''), coalesce(new_value_json::text,'')
       FROM audit_logs
      WHERE company_id = ${q(COMPANY_ID)} AND ${documentTrailScope(docId)}
      ORDER BY performed_at, created_at`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [entityType, action, entityId, performedBy, performedAt, oldJson, newJson] = line.split('|')
    return {
      entityType,
      action,
      entityId,
      performedBy: performedBy || null,
      performedAt: performedAt || null,
      oldValueJson: oldJson ? JSON.parse(oldJson) : null,
      newValueJson: newJson ? JSON.parse(newJson) : null,
    }
  })
}

/**
 * Block until the named transition has been written, then return the row.
 *
 * Keyed on (entityType, action) rather than on a count, because a count-based
 * barrier passes the moment ANY row lands and would let a later assertion read
 * a half-written trail.
 */
/**
 * The e-signature audit rows minted since `since`.
 *
 * Signatures are the evidence of the two approval gates on this document (see
 * LEG 3). They are scoped by TIME rather than by document because
 * `audit_logs.entity_id` on a Signatures row is the SIGNATURE's id, not the
 * document's — there is no join from the audit row back to the subject without
 * reading the signatures table itself, and the window is exact enough: this
 * spec's own legs are the only thing signing inside it.
 */
function eSignaturesSince(since) {
  const out = sql(
    `SELECT performed_by, performed_at FROM audit_logs
      WHERE company_id = ${q(COMPANY_ID)} AND entity_type = 'Signatures'
        AND action = 'CREATE' AND created_at > ${q(since)}
      ORDER BY created_at`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [performedBy, performedAt] = line.split('|')
    return { performedBy: performedBy || null, performedAt: performedAt || null }
  })
}

/** Server clock, so a window is never skewed by the test machine's clock. */
function dbNow() {
  return sqlValue('SELECT now()::text')
}

/**
 * Block until the e-signatures for both approval gates have landed. Same worker
 * hop as every other row here, so a single-shot read can race it.
 */
async function waitForESignatures(since, count) {
  await waitForSqlValue(
    `SELECT count(*) FROM audit_logs
      WHERE company_id = ${q(COMPANY_ID)} AND entity_type = 'Signatures'
        AND action = 'CREATE' AND created_at > ${q(since)}
      HAVING count(*) >= ${count}`,
    { timeoutMs: 90_000, label: `${count} e-signatures audited` },
  )
}

async function waitForTrailEntry(docId, entityType, action, label) {
  await waitForSqlValue(
    `SELECT id FROM audit_logs
      WHERE company_id = ${q(COMPANY_ID)} AND entity_type = ${q(entityType)}
        AND action = ${q(action)} AND ${documentTrailScope(docId)}
      ORDER BY performed_at DESC LIMIT 1`,
    { timeoutMs: 90_000, label: label ?? `${entityType}.${action}` },
  )
  return trailFor(docId).filter((r) => r.entityType === entityType && r.action === action)
}

// ─────────────────────────────────────────────────────────────────────────────
// WHY EVERY SUBMIT HERE NAMES ITS REVIEWER
//
// `submitForReview` picks the FIRST candidate in each step's picker when it is
// not told otherwise, and `driveToEffective` then waits for a task assigned to
// `USERS.reviewer`. Those two are only the same person when the E2E Reviewer
// role has exactly one member — and it does not: `reviewer2` (Rhonda, added for
// the multi-approver journeys) is also in the pool, and sorts first.
//
// Measured on this run: the workflow instance was created, step 1 went
// IN_PROGRESS, and `users_on_workflow_instance_steps` named reviewer2 — so the
// task existed and simply belonged to somebody else, which surfaced 45s later
// as "reviewer task assigned — last value: 0" and reads, wrongly, like the
// workflow never started. Naming the reviewer removes the coupling to role
// membership entirely.
const REVIEWERS = [USERS.reviewer.name]

test.describe('PW-J17 · URS-DOC-14 — a document’s own full lifecycle history', () => {
  test.beforeAll(() => ensureSopTemplateApprovalFlow())

  test('create → submit → approve → effective → revise → supersede → archive is walked, and every transition is in the document’s own trail, attributed and timestamped', async ({
    browser,
  }) => {
    // Two full approval cycles plus a revision plus an archive, each leg
    // worker-gated. J5 budgets 600s for the same walk minus the archive.
    test.setTimeout(900_000)

    // The window every time-scoped assertion below is read against. Server
    // clock, so it cannot be skewed by the test machine's.
    const since = dbNow()
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const title = uniqueTitle('J17-trail')

    // ── LEG 1 — creation. TC-01-12 §1 "creation".
    await createSopDocument(page, title)
    const doc = findDocumentByTitle(title)
    expect(doc, 'the document was created').not.toBeNull()

    // ── KNOWN DEFECT: DOC-AUDIT-01 — creation is NOT in the audit trail.
    //
    // Protocol demands (TC-01-12 §1): "Entries exist for creation, ...".
    // Actual: creating a controlled document writes NO audit entry at all, for
    // either the document or its first version.
    //
    // Mechanism, measured rather than inferred. Both `documents` and
    // `document_versions` carry an `audit_trigger` that fires on INSERT, and
    // both are configured in
    // qms/backend/worker/services/audit/registry/modules/documentControl.js
    // with `manualCoverage: ['CREATE', 'DELETE']`. `defaultHandler.js` reads
    // that list and returns null — "skip if this action is already covered by
    // manual logAudit() calls" — so the trigger's CREATE row is suppressed on
    // the promise that a controller writes it explicitly.
    //
    // No controller does. The ONLY explicit `db.AuditLog.create()` calls in the
    // whole Document Control surface are the two DELETE entries in
    // qms/backend/api/controllers/documents/versions.js (lines ~266 and ~286),
    // which cover the deletion path the comment in the registry actually
    // describes. Nothing writes a CREATE. The suppression is therefore
    // unconditional and the entry is simply lost.
    //
    // Measured 2026-09-22 against app-db: a direct INSERT into `documents`
    // (and into `document_versions`) with `app.current_user_id` set produced
    // ZERO rows in `audit_logs` after a 7s worker settle, while a status UPDATE
    // on the same version produced a complete `DocumentVersions.SUBMIT_FOR_REVIEW`
    // row with old value, new value, performer and timestamp. So the trail is
    // working; CREATE alone is suppressed.
    //
    // Assessor impact: the trail can show that a document moved from DRAFT to
    // IN_REVIEW, but not that it was ever created, nor by whom. The first entry
    // in a document's history is its submission.
    //
    // ── THE SHAPE OF THE GAP, MEASURED PRECISELY.
    //
    // It is NOT that creation is invisible. The document's SECTIONS are audited
    // on INSERT — `document_sections` carries `manualCoverage: ['DELETE']` only,
    // so its CREATE rows survive — and each one names the section, its order and
    // the person who created it. So a reader of the trail CAN see that a
    // document came into existence at a given moment, by a given person,
    // inferring it from the three section rows written in the same second.
    //
    // What is missing is the entry that SAYS SO: nothing records the document
    // itself, or its first version, being created. That distinction is the
    // finding, and pinning both halves is what makes it actionable — the fix is
    // to stop suppressing two CREATE rows, not to build an audit path that does
    // not exist.
    const createdRows = trailFor(doc.id).filter((r) => r.action === 'CREATE')
    expect(
      createdRows.filter((r) => r.entityType === 'Documents'),
      'DOC-AUDIT-01: the document’s own creation writes no audit entry',
    ).toHaveLength(0)
    expect(
      createdRows.filter((r) => r.entityType === 'DocumentVersions'),
      'DOC-AUDIT-01: nor does its first version’s',
    ).toHaveLength(0)
    // The compensating evidence, asserted so the finding is not overstated:
    const sectionCreates = createdRows.filter((r) => r.entityType === 'DocumentSections')
    expect(
      sectionCreates.length,
      'the document’s sections ARE audited on creation — the moment is recoverable, the entry is not',
    ).toBeGreaterThan(0)
    for (const row of sectionCreates) {
      expect(row.performedBy, 'and each section CREATE names its author').toBe(USERS.author.id)
      expect(row.performedAt, 'and when').toBeTruthy()
    }

    // ── LEG 2 — content, then submission. TC-01-12 §1 "submission".
    await fillAllSections(page, doc.id)
    await submitForReview(page, { reviewersByStep: REVIEWERS })
    const [v1] = versionsOf(doc.id)
    expect(v1.statusId, 'v1 is in review').toBe('IN_REVIEW')

    const submitted = await waitForTrailEntry(
      doc.id,
      'DocumentVersions',
      'SUBMIT_FOR_REVIEW',
      'submission audited',
    )
    expect(submitted.length, 'submission is on the record').toBeGreaterThan(0)
    // TC-01-12 §2, on a real lifecycle entry: the field, the previous value and
    // the new value. `document_versions` tracks statusId, so the diff is the
    // transition itself.
    const sub = submitted.at(-1)
    expect(sub.oldValueJson, 'the previous status is recorded').toMatchObject({ statusId: 'DRAFT' })
    expect(sub.newValueJson, 'and the new one').toMatchObject({ statusId: 'IN_REVIEW' })
    expect(sub.performedBy, 'attributed to the submitter').toBe(USERS.author.id)
    expect(sub.performedAt).toBeTruthy()

    // ── LEG 3 — review, approval, release. TC-01-12 §1 "review actions,
    // approval, release". driveToEffective runs the reviewer's e-signed ACTION
    // step and the approver's e-signed APPROVAL step in their own contexts,
    // then waits out the worker-driven APPROVED→EFFECTIVE hop.
    await driveToEffective(browser, doc.id, v1.id)

    // ── WHERE "APPROVAL" LIVES, AND WHY IT IS NOT A STATUS ENTRY.
    //
    // TC-01-12 §1 asks for entries covering "review actions, approval". There is
    // no `DocumentVersions.APPROVE` row on this document and there never will
    // be: the seeded template carries `auto_effective_on_approval = true`, so
    // the version goes IN_REVIEW → EFFECTIVE in ONE transition. APPROVED is
    // never occupied, and an actionMap entry for a status the row never holds
    // cannot fire. Measured on this run: every version audited in the window
    // shows exactly IN_REVIEW → EFFECTIVE, with no APPROVED row anywhere.
    //
    // So the approval is evidenced where the approval actually happened — in
    // the e-signatures. Both workflow gates require one (step 1 ACTION and
    // step 2 APPROVAL both set require_esignature), and each mints a
    // `Signatures` row, audited, attributed and timestamped. That is a STRONGER
    // record than a status entry: a §11.50 signature names the signer, the
    // meaning and the moment, where a status change only says the row moved.
    //
    // Asserted as the two distinct human approvals the protocol is asking about:
    await waitForESignatures(since, 2)
    const signedFrom = eSignaturesSince(since)
    expect(
      signedFrom.length,
      'TC-01-12 §1 "review actions, approval": both gates are evidenced by e-signatures',
    ).toBeGreaterThanOrEqual(2)
    expect(
      signedFrom.map((r) => r.performedBy),
      'the REVIEWER signed the review gate',
    ).toContain(USERS.reviewer.id)
    expect(
      signedFrom.map((r) => r.performedBy),
      'and the APPROVER signed the approval gate — attribution is the point of §3',
    ).toContain(USERS.approver.id)
    for (const row of signedFrom) {
      expect(row.performedAt, 'each signature carries a timestamp').toBeTruthy()
    }
    // And no APPROVE status entry exists, pinned so the absence is a documented
    // property of the auto-effective template rather than a silent gap:
    expect(
      trailFor(doc.id).filter((r) => r.action === 'APPROVE'),
      'auto_effective_on_approval means APPROVED is never occupied, so no APPROVE entry is written',
    ).toHaveLength(0)

    const effective = await waitForTrailEntry(
      doc.id,
      'DocumentVersions',
      'SET_EFFECTIVE',
      'release audited',
    )
    expect(effective.length, 'release is on the record').toBeGreaterThan(0)
    const eff = effective.at(-1)
    expect(eff.newValueJson).toMatchObject({ statusId: 'EFFECTIVE' })
    // From IN_REVIEW, not from APPROVED — the auto-effective path above.
    expect(eff.oldValueJson).toMatchObject({ statusId: 'IN_REVIEW' })
    expect(eff.performedAt, 'release carries a timestamp').toBeTruthy()
    // KNOWN DEFECT (pinned, not asserted away): APPROVED→EFFECTIVE is performed
    // by the worker's auto-effective job, not by a signed-in person, so
    // `performed_by` on the release entry is NULL and the row renders as
    // "System". The protocol's §3 "performer present on every entry" is
    // therefore met in the weaker sense "the actor is identified, and for an
    // automated release the actor is the system". The e-signatures immediately
    // before it carry the humans who authorised the release, which is what an
    // assessor traces. Recorded as actual behaviour:
    expect(
      eff.performedBy === null || eff.performedBy === USERS.approver.id,
      'release is attributed to the system (auto-effective job) or to the approver who armed it',
    ).toBe(true)

    // ── LEG 4 — revision. TC-01-12 §1 "revision".
    await createNewRevision(page, doc.id, { changeType: 'Minor' })
    await waitForSqlValue(
      `SELECT count(*) FROM document_versions
        WHERE document_id = ${q(doc.id)} AND deleted_at IS NULL AND version_major = 2`,
      { timeoutMs: 30_000, label: 'v2 draft created' },
    )
    const afterRevision = versionsOf(doc.id)
    expect(afterRevision, 'a second version exists').toHaveLength(2)
    const v2 = afterRevision.find((v) => v.id !== v1.id)

    // DOC-AUDIT-01 again, and this is where it bites hardest. Protocol demands
    // (TC-01-12 §1) "entries exist for ... revision". The act of raising a
    // revision IS the creation of a new version row, and version CREATE is
    // suppressed by the same `manualCoverage` entry — so the moment a
    // controlled document was reopened for change is not recorded either.
    //
    // What the trail DOES carry for the revision is everything that happens to
    // the new version afterwards, starting with its submission — asserted in
    // LEG 5 below, once that submission has actually happened.
    expect(
      trailFor(doc.id).filter((r) => r.entityId === v2.id && r.action === 'CREATE'),
      'DOC-AUDIT-01: raising a revision writes no CREATE entry for the new version',
    ).toHaveLength(0)

    // ── LEG 5 — the revision is submitted, approved and supersedes v1.
    // TC-01-12 §1 "revision" completes when the new version displaces the old.
    await fillAllSections(page, doc.id)
    await submitForReview(page, { reviewersByStep: REVIEWERS })

    // What the trail DOES carry for the revision, asserted now that it exists:
    // everything that happens to the new version, starting with its submission.
    // So the revision is traceable in practice even though its opening act is
    // not recorded.
    const v2Submitted = await waitForTrailEntry(
      doc.id,
      'DocumentVersions',
      'SUBMIT_FOR_REVIEW',
      'revision submission audited',
    )
    const rev = v2Submitted.find((r) => r.entityId === v2.id)
    expect(
      rev,
      'the revision IS traceable — the new version’s own transitions are in this document’s history',
    ).toBeTruthy()
    expect(rev.performedBy, 'attributed to the author who raised the revision').toBe(USERS.author.id)
    expect(rev.performedAt).toBeTruthy()
    expect(rev.oldValueJson, 'and carries both sides of the change').toMatchObject({
      statusId: 'DRAFT',
    })
    expect(rev.newValueJson).toMatchObject({ statusId: 'IN_REVIEW' })

    await driveToEffective(browser, doc.id, v2.id)

    await waitForSqlValue(
      `SELECT status_id FROM document_versions WHERE id = ${q(v1.id)} AND status_id = 'SUPERSEDED'`,
      { timeoutMs: 60_000, label: 'v1 superseded' },
    )
    const superseded = await waitForTrailEntry(
      doc.id,
      'DocumentVersions',
      'SUPERSEDE',
      'supersede audited',
    )
    const sup = superseded.find((r) => r.entityId === v1.id)
    expect(sup, 'the SUPERSEDE entry is on the version that was displaced').toBeTruthy()
    expect(sup.oldValueJson, 'from EFFECTIVE').toMatchObject({ statusId: 'EFFECTIVE' })
    expect(sup.newValueJson, 'to SUPERSEDED').toMatchObject({ statusId: 'SUPERSEDED' })
    expect(sup.performedAt).toBeTruthy()

    // ── LEG 6 — archival. TC-01-12 §1 "archival".
    // Archiving is the OWNER's action on this document (PW-J4: the detail gate
    // is delete + owner/author), so the archive leg runs in her context.
    const ownerCtx = await browser.newContext({ storageState: AUTH.owner })
    const ownerPage = await ownerCtx.newPage()
    await ownerPage.goto(`/documents/${doc.id}`, { waitUntil: 'domcontentloaded' })
    await ownerPage.getByRole('button', { name: /more actions/i }).click()
    await ownerPage
      .getByRole('menuitem', { name: /archive document/i })
      .or(ownerPage.getByRole('button', { name: /archive document/i }))
      .first()
      .click()
    const archiveSubmit = ownerPage.getByRole('button', { name: 'Archive Document' })
    await expect(archiveSubmit).toBeVisible({ timeout: 15_000 })
    await ownerPage
      .getByPlaceholder(/Superseded by SOP-NEW/i)
      .fill('Superseded by SOP-NEW-900 — retired at the close of the J15 lifecycle walk.')
    await archiveSubmit.click()
    await waitForSqlValue(
      `SELECT obsoleted_at FROM documents WHERE id = ${q(doc.id)} AND obsoleted_at IS NOT NULL`,
      { timeoutMs: 30_000, label: 'document obsoleted' },
    )
    await ownerCtx.close()

    // `documents.obsoletedAt` null→date maps to OBSOLETE through the registry's
    // actionMap, so archival is a SEMANTIC entry rather than a generic UPDATE —
    // which is what makes it findable in a trail of hundreds of rows.
    const obsoleted = await waitForTrailEntry(doc.id, 'Documents', 'OBSOLETE', 'archival audited')
    expect(obsoleted.length, 'archival is on the record').toBeGreaterThan(0)
    const obs = obsoleted.at(-1)
    expect(obs.performedBy, 'attributed to the owner who archived it').toBe(USERS.owner.id)
    expect(obs.performedAt).toBeTruthy()
    expect(obs.oldValueJson, 'the previous (unset) obsoletion is recorded').toBeTruthy()
    expect(obs.newValueJson?.obsoletedAt, 'and the new value').toBeTruthy()

    // ── THE WHOLE WALK, ASSERTED AS A SET. TC-01-12 §1 in one place: every
    // named stage of the lifecycle is present in THIS document's history.
    const trail = trailFor(doc.id)
    const present = new Set(trail.map((r) => `${r.entityType}.${r.action}`))
    for (const required of [
      'DocumentVersions.SUBMIT_FOR_REVIEW', // submission
      'DocumentVersions.SET_EFFECTIVE', // release
      'DocumentVersions.SUPERSEDE', // supersede
      'Documents.OBSOLETE', // archival
    ]) {
      expect(present, `TC-01-12 §1: ${required} is in the document’s history`).toContain(required)
    }
    // The two the protocol asks for and the product does not write — DOC-AUDIT-01,
    // stated here as the single place a reader of this file learns what §1 is
    // missing, rather than only in the leg where it was discovered.
    // 'Documents.CREATE'        — creation, suppressed with no manual replacement
    // 'DocumentVersions.CREATE' — revision, same mechanism
    expect(
      [...present].filter((a) => a === 'Documents.CREATE' || a === 'DocumentVersions.CREATE'),
      'DOC-AUDIT-01: neither creation nor revision writes a CREATE entry for the record itself',
    ).toHaveLength(0)

    // The SUBMIT_FOR_REVIEW entries carry BOTH versions, which is what keeps the
    // revision traceable despite the missing CREATE: the trail shows a second
    // version entering review, so the fact of a revision is recoverable even
    // though the moment it was raised is not.
    expect(
      new Set(
        trail
          .filter((r) => r.entityType === 'DocumentVersions' && r.action === 'SUBMIT_FOR_REVIEW')
          .map((r) => r.entityId),
      ).size,
      'both versions are visible in the history through their own transitions',
    ).toBe(2)

    // TC-01-12 §3, across EVERY entry rather than the sampled ones above.
    for (const row of trail) {
      expect(row.performedAt, `${row.entityType}.${row.action} carries a timestamp`).toBeTruthy()
    }
    // Attribution, stated as what is actually true. Human-performed entries
    // name the human; the only unattributed entries are the ones no human
    // performed (the worker's auto-effective release and its knock-on
    // supersede). Pinning it this way makes a REGRESSION — a human action
    // losing its performer — fail, while not asserting a falsehood about the
    // automated legs.
    const humanActions = ['SUBMIT_FOR_REVIEW', 'OBSOLETE']
    for (const row of trail.filter((r) => humanActions.includes(r.action))) {
      expect(
        row.performedBy,
        `${row.entityType}.${row.action} names the person who performed it`,
      ).toBeTruthy()
    }

    // TC-01-12 §2, as a property of the class rather than of one sampled row:
    // an UPDATE-shaped lifecycle entry always carries BOTH sides of the change.
    // (CREATE has no previous value by definition and is excluded.)
    const diffBearing = trail.filter(
      (r) => r.entityType === 'DocumentVersions' && r.action !== 'CREATE',
    )
    expect(diffBearing.length, 'there are lifecycle transitions to inspect').toBeGreaterThan(0)
    for (const row of diffBearing) {
      expect(row.oldValueJson, `${row.action} records the previous value`).toBeTruthy()
      expect(row.newValueJson, `${row.action} records the new value`).toBeTruthy()
      expect(
        Object.keys(row.newValueJson).length,
        `${row.action} names the field that changed`,
      ).toBeGreaterThan(0)
    }

    // ── SCOPE BOUNDARY, PINNED RATHER THAN ASSERTED AWAY.
    // KNOWN DEFECT / scope note: TC-01-12 §1 says "content changes". Section
    // BODIES are deliberately not tracked — `document_sections` carries
    // trackFields ['title','order'] only. Protocol demands: a content change
    // appears in the trail. Actual: it does not; the version's body is captured
    // instead as the hashed PDF snapshot taken at release (the module's
    // strongest records-integrity control, and itself out of this protocol's
    // scope per §6). `fillAllSections` above wrote body content to every
    // section of two versions, so if the product ever started tracking
    // `content` this assertion is what would flag the change.
    expect(
      trail.filter((r) => r.entityType === 'DocumentSections' && r.newValueJson?.content),
      'section BODY content is not in the audit trail — it is in the released snapshot instead',
    ).toHaveLength(0)
    // And the snapshot that carries it does exist for the released version,
    // so the boundary above is a relocation of the evidence, not a loss of it.
    expect(
      sqlValue(
        `SELECT snapshot_sha256 FROM document_versions WHERE id = ${q(v1.id)} AND snapshot_sha256 IS NOT NULL`,
      ),
      'the released version’s content is sealed by a snapshot hash',
    ).toBeTruthy()

    await ctx.close()
  })

  test('the document’s history is rendered to a trail holder and refused to a document controller who holds none', async ({
    browser,
  }) => {
    // The UI half of §1. Deliberately a SEPARATE test from the walk above: the
    // walk is 15 minutes of worker-gated lifecycle, and a rendering failure in
    // it would be indistinguishable from a transition failure.
    //
    // ── THE SUBJECT HAS TO BE EFFECTIVE, AND THAT IS NOT INCIDENTAL.
    //
    // `documents_sel`'s permission branch is gated on the document having an
    // EFFECTIVE version:
    //
    //     has_permission('document_control','read')
    //       AND scope_allowed(...)
    //       AND EXISTS (SELECT 1 FROM document_versions dv0
    //                    WHERE dv0.document_id = documents.id
    //                      AND dv0.status_id = 'EFFECTIVE')
    //
    // — draft privacy, deliberate and correct. Ava holds document_control:read
    // at tenant scope and is neither the author, the owner, a collaborator, nor
    // a task assignee on this document, so until a version is EFFECTIVE she
    // cannot see the document AT ALL, and the audit dialog is unreachable for a
    // reason that has nothing to do with the audit trail.
    //
    // An earlier cut of this test gave the subject a cheap DRAFT→IN_REVIEW
    // transition to generate history. It produced history the trail could show
    // and a document Ava could not open — the test failed on "she reaches the
    // document", 90s in, which reads like a rendering fault and is actually the
    // read policy working exactly as designed. So the subject is driven all the
    // way to EFFECTIVE, which is both what makes it visible and what gives it
    // the richest history to render.
    test.setTimeout(900_000)

    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await authorCtx.newPage()
    const title = uniqueTitle('J17-dialog')
    await createSopDocument(authorPage, title)
    const doc = findDocumentByTitle(title)
    await fillAllSections(authorPage, doc.id)
    await submitForReview(authorPage, { reviewersByStep: REVIEWERS })
    const [dialogV1] = versionsOf(doc.id)
    await driveToEffective(browser, doc.id, dialogV1.id)
    await authorCtx.close()

    await waitForTrailEntry(doc.id, 'DocumentVersions', 'SUBMIT_FOR_REVIEW', 'dialog subject audited')

    // ── GRANTED. Ava holds document_control:read AND audit_trail:read.
    const granted = await browser.newContext({ storageState: AUTH.auditor })
    try {
      const page = await granted.newPage()
      await page.goto(`/documents/${doc.id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await expect(page.getByText(title, { exact: true }).first(), 'she reaches the document').toBeVisible({
        timeout: 90_000,
      })

      // `DetailActionBar` promotes actions to inline buttons and spills the rest
      // into a ⋯ menu, and WHICH shape you get depends on how many other actions
      // the persona has — i.e. on the very permissions under test. Open the
      // overflow if there is one, and match both roles.
      const overflow = page.getByRole('button', { name: /more actions/i })
      if (await overflow.count()) await overflow.first().click()
      const auditLog = page
        .getByRole('menuitem', { name: 'Audit Log', exact: true })
        .or(page.getByRole('button', { name: 'Audit Log', exact: true }))
      await expect(auditLog, 'the History affordance is offered to a trail holder').toBeVisible({
        timeout: 20_000,
      })
      await auditLog.click()

      // Headless UI's role="dialog" node is a zero-box wrapper that Playwright
      // reports HIDDEN even while the panel paints — usable as a scope, useless
      // as a visibility assertion. The heading is what is actually painted.
      await expect(
        page.getByRole('heading', { name: `Audit Log — ${title}` }),
        'the history dialog opened',
      ).toBeVisible({ timeout: 30_000 })
      const dialog = page.getByRole('dialog')

      // The denial state and the empty state say opposite things and must never
      // be confusable — "nothing happened" versus "not yours to know".
      await expect(
        dialog.getByText("You don't have permission to view the audit trail."),
        'a grant holder is not shown the denial',
      ).toHaveCount(0)
      await expect(
        dialog.getByRole('button', { name: /^(Expand|Collapse) change details$/ }).first(),
        'and the document’s history has entries to show',
      ).toBeVisible({ timeout: 180_000 }) // the trail bootstraps ~64k rows into IDB
      await expect(
        dialog.getByText('No changes have been recorded yet.'),
        'so the empty state is not on screen',
      ).toHaveCount(0)
    } finally {
      await granted.close()
    }

    // ── DENIED. Carla holds full document_control CRUD and NO audit_trail.
    // TC-01-12's note: without the grant the surface renders "not shown" rather
    // than empty, deliberately, so a missing permission is not read as "never
    // happened". Here the affordance is withheld one step earlier — the dialog
    // that could only ever produce the denial is not offered at all.
    const denied = await browser.newContext({ storageState: AUTH.controller })
    try {
      const page = await denied.newPage()
      await page.goto(`/documents/${doc.id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await expect(
        page.getByText(title, { exact: true }).first(),
        'she reaches the document in full — this is not a record-visibility result',
      ).toBeVisible({ timeout: 90_000 })

      const overflow = page.getByRole('button', { name: /more actions/i })
      if (await overflow.count()) await overflow.first().click()
      await expect(
        page
          .getByRole('menuitem', { name: 'Audit Log', exact: true })
          .or(page.getByRole('button', { name: 'Audit Log', exact: true })),
        'document_control CRUD is not permission to read the document’s history',
      ).toHaveCount(0)

      // ── AND HERE THE AFFORDANCE AND THE POLICY DISAGREE. Measured, not
      // assumed — this is the finding of this test, and it is a DESIGN the
      // client gate does not reflect rather than a hole in the policy.
      //
      // `audit_log_select_rls` has THREE branches, not two:
      //
      //     is_owner
      //  OR has_permission('audit_trail','read')
      //  OR entity_type IN (SELECT t.id FROM audit_entity_types t
      //                      WHERE t.module_id IS NOT NULL
      //                        AND scope_allowed(t.module_id,'read',…)
      //                     UNION
      //                     SELECT a.alias FROM audit_entity_type_aliases a
      //                       JOIN audit_entity_types t2 ON t2.id = a.canonical
      //                      WHERE …)
      //
      // The third branch is MODULE-SCOPED audit access: `audit_entity_types`
      // maps Document/DocumentVersion/DocumentSection/DocumentLink to
      // `document_control`, and `audit_entity_type_aliases` maps the plural
      // names the trigger actually writes (Documents, DocumentVersions, …) onto
      // those canonical ids. So a `document_control:read` holder CAN read this
      // document's audit rows through RLS, with no `audit_trail:read` at all.
      //
      // That does not contradict e2e/auditLogs/a5-record-history.spec.js, which
      // proves Carla reads nothing on a NONCONFORMANCE — she holds no ncr
      // grant, so the third branch does not fire for her there. The two results
      // together are the actual rule: the trail is readable per-module by
      // whoever can read that module, and `audit_trail:read` is what unlocks it
      // ACROSS modules.
      //
      // Pinned as ACTUAL BEHAVIOUR, both halves, because the gap between them
      // is the thing worth knowing:
      const probe = sqlAsAppUser(
        `SELECT 'RESULT=' || count(*)::text FROM audit_logs
          WHERE company_id = ${q(COMPANY_ID)} AND ${documentTrailScope(doc.id)};`,
        { userId: USERS.controller.id, companyId: COMPANY_ID },
      )
      expect(probe.ok, `RLS probe ran (stderr: ${probe.error})`).toBeTruthy()
      expect(
        Number(/RESULT=(\d+)/.exec(probe.output)?.[1]),
        'DOC-AUDIT-02: the POLICY admits a document_control:read holder to this document’s ' +
          'audit rows via the module-scoped branch, even though the UI withholds the affordance',
      ).toBeGreaterThan(0)

      // The cross-module half, which is what `audit_trail:read` actually buys.
      // Without it Carla is confined to the modules she can read — so a record
      // in a module she holds nothing on stays closed to her. This is the
      // assertion that would fail if the third branch were ever widened.
      const crossModule = sqlAsAppUser(
        `SELECT 'RESULT=' || count(*)::text FROM audit_logs
          WHERE company_id = ${q(COMPANY_ID)} AND entity_type IN ('Nonconformances','Capas');`,
        { userId: USERS.controller.id, companyId: COMPANY_ID },
      )
      expect(crossModule.ok, `RLS probe ran (stderr: ${crossModule.error})`).toBeTruthy()
      expect(
        Number(/RESULT=(\d+)/.exec(crossModule.output)?.[1]),
        'and she is still confined to the modules she can read — audit_trail:read is the cross-module key',
      ).toBe(0)
    } finally {
      await denied.close()
    }

    // The pair that makes the zero above mean something. An RLS refusal here is
    // a zero-row SUCCESS, not an error — nothing throws and no banner appears —
    // so a one-sided "Carla sees nothing" passes identically when the seed never
    // ran, the worker is down, or the page is broken. Ava, same rows, same run:
    const allowed = sqlAsAppUser(
      `SELECT 'RESULT=' || count(*)::text FROM audit_logs
        WHERE company_id = ${q(COMPANY_ID)} AND ${documentTrailScope(doc.id)};`,
      { userId: USERS.auditor.id, companyId: COMPANY_ID },
    )
    expect(allowed.ok, `RLS probe ran (stderr: ${allowed.error})`).toBeTruthy()
    expect(
      Number(/RESULT=(\d+)/.exec(allowed.output)?.[1]),
      'the trail holder reads this document’s history too — by the audit_trail grant, not by the module',
    ).toBeGreaterThan(0)
  })

  test('TC-01-12 §4 — an audit entry cannot be edited or deleted, at the privilege layer and at the trigger', () => {
    // §4 as written asks only that no USER INTERFACE offers edit or delete. That
    // is the weakest possible reading of a Part 11 trail: an interface can be
    // added next sprint, and the REST path connects as the SUPERUSER with
    // REST_RLS_ENABLED off, so it never meets a policy or a GRANT at all. The
    // control that actually holds is in the database, so that is what is proved
    // here — both layers, because either one alone would be silently
    // load-bearing.
    //
    // Subject: any Documents-scoped row in this tenant. The walk above wrote
    // plenty; this picks the newest so the test stands alone if run in
    // isolation against a seeded database.
    const rowId = sqlValue(
      `SELECT id FROM audit_logs
        WHERE company_id = ${q(COMPANY_ID)}
          AND entity_type IN ('Documents','DocumentVersions','DocumentSections')
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(rowId, 'there is a document audit row to try to tamper with').toBeTruthy()
    const before = sqlValue(`SELECT action FROM audit_logs WHERE id = ${q(rowId)}`)

    // Layer 1 — privileges. `app_user` is granted SELECT and INSERT and nothing
    // else, so the GraphQL role cannot even form the statement. This is the
    // layer that covers every FUTURE write path without anyone remembering to
    // guard it — including an "edit" interface, should one ever be added.
    //
    // The forgery is a real one: relabelling the entry. Writing back the value
    // the row already holds would be indistinguishable from a refusal.
    const asAppUser = sqlAsAppUser(
      `UPDATE audit_logs SET action = 'DELETE' WHERE id = ${q(rowId)};`,
      { userId: USERS.auditor.id, companyId: COMPANY_ID },
    )
    expect(asAppUser.ok, 'the GraphQL role cannot rewrite a document audit row').toBeFalsy()
    expect(asAppUser.error).toMatch(/permission denied/i)

    // Layer 2 — the `audit_logs_immutable` trigger, which is what makes layer 1
    // more than an accident of who happens to hold what. Attempted as the
    // SUPERUSER, i.e. as the REST path itself.
    const attempt = (stmt) => {
      try {
        sqlValue(stmt)
        return null
      } catch (err) {
        return `${err.stderr ?? err.message}`
      }
    }
    expect(
      attempt(`UPDATE audit_logs SET action = 'DELETE' WHERE id = ${q(rowId)}`),
      'not even the superuser rewrites a document’s history',
    ).toMatch(/immutable/i)
    expect(
      attempt(`DELETE FROM audit_logs WHERE id = ${q(rowId)}`),
      'nor deletes an entry from it',
    ).toMatch(/immutable/i)
    // A soft delete is the same attack wearing an UPDATE's clothes — the column
    // exists on the table, and a trail that could be hidden row-by-row would
    // satisfy both refusals above while failing the control.
    expect(
      attempt(`UPDATE audit_logs SET deleted_at = NOW() WHERE id = ${q(rowId)}`),
      'nor hides one behind a soft delete',
    ).toMatch(/immutable/i)

    // And the row is exactly where it was.
    expect(
      sqlValue(`SELECT action FROM audit_logs WHERE id = ${q(rowId)} AND deleted_at IS NULL`),
      'the entry is untouched',
    ).toBe(before)
  })
})
