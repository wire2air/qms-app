// PW-J3 · "Create draft" preserves the full step definition (J-03).
//
// A published version is immutable, so every revision of a live template starts
// with a clone: `WorkflowEditor.vue`'s `createDraftMutation` copies the newest
// version's steps into a fresh DRAFT. Everything a designer ever configured
// rides on that copy being complete — and the module has already lost a field
// there once. The `stepType` line in that mutation carries its own scar:
//
//     // stepType was silently dropped here before the DELAY feature —
//     // APPROVAL/DELAY steps reverted to ACTION on every version bump.
//
// An APPROVAL step silently demoted to ACTION is a controlled-record approval
// gate that stops being a gate: no `require_esignature` enforcement, no
// mandatory-gate protection, no cancel/reopen refusal — all four of which key
// off that string matching exactly. Nothing in either repository would have
// noticed. This journey is the standing guard on the whole copy.
//
// It is a GREEN release gate, and deliberately the contrast case to the REST
// clone path (F-14, `POST /v1/services/workflows/:id/versions`), which drops
// `stepType`, the delay configuration, `formSchema` and `parentStepId`. Two
// implementations of one operation disagree; this pins the one users actually
// reach, so a later attempt to unify them cannot quietly level down.
//
// The source template is seeded in SQL rather than authored through the wizard:
// what is under test is the COPY, not the authoring (that is PW-J1), and a
// hand-built source can carry the awkward shapes a wizard cannot produce — a
// nested child step, a legacy named-user assignment, a per-step outcome subset,
// and a send-back target row.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, ROLES, USERS } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  findWorkflowByName,
  workflowVersionsOf,
  templateStepsOf,
  purgeWorkflowsNamed,
} from '../fixtures/workflow.js'

const NAME_PREFIX = 'E2E WF-J3'

// Fixed ids so the seed is idempotent and the teardown is exact.
const WF = 'e2ef9001-0000-4000-8000-000000000001'
const VER = 'e2ef9002-0000-4000-8000-000000000001'
const S1 = 'e2ef9003-0000-4000-8000-000000000001' // ACTION, root, allow_child_steps
const S2 = 'e2ef9003-0000-4000-8000-000000000002' // APPROVAL, root, e-sign, ANY
const S3 = 'e2ef9003-0000-4000-8000-000000000003' // DELAY, root
const S1C = 'e2ef9003-0000-4000-8000-000000000004' // child of S1

const FORM_ACTION = JSON.stringify([
  { name: 'findings', label: 'Findings', type: 'textEditor', required: true },
  { name: 'evidence', label: 'Evidence', type: 'file', required: false, multiple: true },
])
const FORM_DELAY = JSON.stringify([
  { name: 'effective', label: 'Was it effective?', type: 'select', options: ['Yes', 'No'] },
])
const FORM_CHILD = JSON.stringify([{ name: 'note', label: 'Sub-task note', type: 'text' }])

const name = `${NAME_PREFIX} Source`

/**
 * The source template.
 *
 * `status_id = 'ARCHIVED'` is load-bearing, not decoration: `WorkflowVersionSelect`
 * lists ACTIVE workflows that have a PUBLISHED version, so an ACTIVE source here
 * would appear as a second CAPA candidate in the record-create picker and break
 * the `capas` suite. Archived keeps it out of every picker while leaving the
 * editor — and therefore Reopen for Editing — fully functional.
 */
function seedSource() {
  purgeWorkflowsNamed(NAME_PREFIX)
  // Belt-and-braces teardown by ID as well as by name. A run killed between its
  // seed and its `afterAll` (which is what a shared dev stack and a Ctrl-C
  // produce) leaves these fixed-id rows behind, and one of them cannot simply be
  // re-inserted over: `steps_send_back_targets_unique_constraint` is a
  // NON-partial unique index on (step_id, target_step_id, company_id), so any
  // surviving row — including a soft-deleted one, since the index does not
  // exclude `deleted_at` — permanently owns that key and the next seed dies on a
  // duplicate. Deleting by id first makes the seed idempotent whatever state the
  // previous run left. (The non-partial index on a paranoid table is itself the
  // shape F-03's recreate-loop collision comes from — noted, not fixed here.)
  sql(`
    DELETE FROM steps_send_back_targets
     WHERE step_id IN ('${S1}','${S2}','${S3}','${S1C}')
        OR target_step_id IN ('${S1}','${S2}','${S3}','${S1C}');
    DELETE FROM workflows WHERE id = '${WF}';
  `)
  sql(`
    INSERT INTO workflows (id, company_id, name, description, module_id, status_id, is_default, created_at, updated_at)
    VALUES ('${WF}', '${COMPANY_ID}', '${name}', 'PW-J3 clone source.', 'CAPA', 'ARCHIVED', false, NOW(), NOW());

    INSERT INTO workflow_versions (id, workflow_id, version_major, version_minor, version_label, status_id, is_current, created_by, company_id, created_at, updated_at)
    VALUES ('${VER}', '${WF}', 1, 0, '1.0', 'PUBLISHED', true, '${USERS.owner.id}', '${COMPANY_ID}', NOW(), NOW());

    INSERT INTO workflow_steps
      (id, workflow_version_id, name, description, step_order, step_type, approval_rule, sla_days,
       require_comments, require_esignature, allow_child_steps, parent_step_id,
       delay_days, delay_until_date, max_delay_extensions, form_schema, company_id, created_at, updated_at)
    VALUES
      ('${S1}',  '${VER}', 'Investigate',        'Root work step.',   1, 'ACTION',   'ALL', 7, true,  false, true,  NULL,    NULL, NULL, NULL, '${FORM_ACTION}'::jsonb, '${COMPANY_ID}', NOW(), NOW()),
      ('${S2}',  '${VER}', 'Approve',            'E-signed gate.',    2, 'APPROVAL', 'ANY', 5, false, true,  false, NULL,    NULL, NULL, NULL, '[]'::jsonb,             '${COMPANY_ID}', NOW(), NOW()),
      ('${S3}',  '${VER}', 'Effectiveness Check','Delayed re-check.', 3, 'DELAY',    'ALL', 3, false, false, false, NULL,    30,   NULL, 2,    '${FORM_DELAY}'::jsonb,  '${COMPANY_ID}', NOW(), NOW()),
      ('${S1C}', '${VER}', 'Collect Samples',    'Nested sub-task.',  4, 'ACTION',   'ALL', 2, false, false, false, '${S1}', NULL, NULL, NULL, '${FORM_CHILD}'::jsonb,  '${COMPANY_ID}', NOW(), NOW());

    INSERT INTO workflow_step_roles (id, step_id, role_id, company_id, created_at, updated_at) VALUES
      ('e2ef9004-0000-4000-8000-000000000001', '${S1}',  '${ROLES.reviewer.id}', '${COMPANY_ID}', NOW(), NOW()),
      ('e2ef9004-0000-4000-8000-000000000002', '${S1}',  '${ROLES.author.id}',   '${COMPANY_ID}', NOW(), NOW()),
      ('e2ef9004-0000-4000-8000-000000000003', '${S2}',  '${ROLES.approver.id}', '${COMPANY_ID}', NOW(), NOW()),
      ('e2ef9004-0000-4000-8000-000000000004', '${S1C}', '${ROLES.reviewer.id}', '${COMPANY_ID}', NOW(), NOW());

    -- A LEGACY named-user assignment. The template designer has offered roles
    -- only since 2026-05-27 (WorkflowEditor.vue:96-104), but reviewer
    -- resolution still honours these rows and the clone still copies them, so a
    -- pre-2026-05 template that loses them on its next version bump loses its
    -- assignees outright. Nothing else in the suite covers that path.
    INSERT INTO workflow_step_users (id, step_id, user_id, company_id, created_at, updated_at) VALUES
      ('e2ef9005-0000-4000-8000-000000000001', '${S2}', '${USERS.approver.id}', '${COMPANY_ID}', NOW(), NOW());

    -- Per-step outcome SUBSETS, not the full catalogue: a clone that seeded
    -- "all outcomes" on every new step would pass a set-equality check against a
    -- source that also had all of them, and silently widen a narrowed step.
    INSERT INTO allowed_outcomes_on_steps (id, step_id, outcome_id, company_id, created_at, updated_at) VALUES
      ('e2ef9006-0000-4000-8000-000000000001', '${S1}',  'COMPLETE_AND_ADVANCE', '${COMPANY_ID}', NOW(), NOW()),
      ('e2ef9006-0000-4000-8000-000000000002', '${S1}',  'SEND_BACK',            '${COMPANY_ID}', NOW(), NOW()),
      ('e2ef9006-0000-4000-8000-000000000003', '${S2}',  'SEND_BACK',            '${COMPANY_ID}', NOW(), NOW()),
      ('e2ef9006-0000-4000-8000-000000000004', '${S3}',  'EXTEND_DELAY',         '${COMPANY_ID}', NOW(), NOW()),
      ('e2ef9006-0000-4000-8000-000000000005', '${S1C}', 'REQUEST_INFO',         '${COMPANY_ID}', NOW(), NOW());
  `)
  // NOTE: `steps_send_back_targets` is deliberately NOT inserted here. Since
  // migrations 20260807101000/102000 (F-03 gate 1) the rows are materialised by
  // a DATABASE TRIGGER — `allowed_outcomes_seed_send_back_targets` fires on the
  // SEND_BACK outcome rows above and calls `seed_step_send_back_targets` for
  // their (PUBLISHED) version. Inserting them by hand collides with the
  // trigger's own row on the non-partial unique index. Which of them the source
  // ends up with is asserted below, precisely because the interaction between
  // that new seeding and this clone path is exactly the sort of thing neither
  // change's own tests would look at.
}

test.use({ storageState: AUTH.owner })

// The second test asserts against the draft the first one produced.
test.describe.configure({ mode: 'serial' })

test.describe('PW-J3 · create-draft clones the full step definition', () => {
  test.beforeAll(() => {
    seedSource()
  })

  test.afterAll(() => {
    purgeWorkflowsNamed(NAME_PREFIX)
    sql(`
      DELETE FROM steps_send_back_targets
       WHERE step_id IN ('${S1}','${S2}','${S3}','${S1C}')
          OR target_step_id IN ('${S1}','${S2}','${S3}','${S1C}');
      DELETE FROM workflows WHERE id = '${WF}';
    `)
  })

  test('the UI clone path carries stepType, delay config, formSchema, parentStepId, roles, users and outcomes', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    const workflow = findWorkflowByName(name)
    expect(workflow?.id, 'the source template seeded').toBe(WF)

    const sourceSteps = templateStepsOf(VER)
    expect(sourceSteps.length, 'source has 3 root steps + 1 nested child').toBe(4)

    await page.goto(`/workflow-templates/${WF}`)
    await expect(page.getByText('4 Steps')).toBeVisible({ timeout: 60_000 })
    // The published-version lock banner: this is the state a real revision
    // starts from, and it is why Reopen for Editing exists at all.
    await expect(
      page.getByText('This version is published and locked. Reopen it for editing to make changes.'),
    ).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: 'Reopen for Editing' }).click()

    // Barrier on the CLONE'S STEPS, not just the new version row: the mutation
    // creates the version first and then saves each step in turn, so reading
    // the step list the moment the version appears is a race that would report
    // a partial copy as a dropped field.
    await waitForSqlValue(
      `SELECT count(*) = 4 FROM workflow_steps s
         JOIN workflow_versions v ON v.id = s.workflow_version_id
        WHERE v.workflow_id = '${WF}' AND v.status_id = 'DRAFT'
          AND s.deleted_at IS NULL AND v.deleted_at IS NULL`,
      { timeoutMs: 60_000, label: 'clone wrote all four steps' },
    )
    // …and on the SECOND pass, which is what remaps parentStepId. Without this
    // the nested-child assertion below reads a step that is correct in every
    // other field and simply has not been re-parented yet.
    await waitForSqlValue(
      `SELECT count(*) = 1 FROM workflow_steps s
         JOIN workflow_versions v ON v.id = s.workflow_version_id
        WHERE v.workflow_id = '${WF}' AND v.status_id = 'DRAFT'
          AND s.parent_step_id IS NOT NULL AND s.deleted_at IS NULL`,
      { timeoutMs: 60_000, label: 'clone remapped the child step parent' },
    )

    const versions = workflowVersionsOf(WF)
    expect(versions.length, 'the source version plus exactly one new draft').toBe(2)
    const draft = versions.find((v) => v.statusId === 'DRAFT')
    expect(draft, 'a DRAFT version exists').toBeTruthy()
    expect(draft.label, 'a minor bump off the published 1.0').toBe('1.1')

    const cloneSteps = templateStepsOf(draft.id)
    expect(cloneSteps.length).toBe(4)

    // Ids must be NEW — a "clone" that re-pointed the same step rows at a new
    // version would satisfy every field comparison below while leaving the
    // published version editable through its own draft.
    const sourceIds = new Set(sourceSteps.map((s) => s.id))
    for (const c of cloneSteps) {
      expect(sourceIds.has(c.id), `${c.name} is a new row, not a re-parented source row`).toBe(false)
    }

    // ── Field-by-field, per step, in step order ─────────────────────────────
    for (let i = 0; i < sourceSteps.length; i += 1) {
      const src = sourceSteps[i]
      const cln = cloneSteps[i]
      const where = `step ${src.stepOrder} (${src.name})`

      expect(cln.name, `${where}: name`).toBe(src.name)
      expect(cln.stepOrder, `${where}: stepOrder`).toBe(src.stepOrder)

      // THE regression this journey exists for.
      expect(cln.stepType, `${where}: stepType survives the version bump`).toBe(src.stepType)

      expect(cln.approvalRule, `${where}: approvalRule`).toBe(src.approvalRule)
      expect(cln.requireEsignature, `${where}: requireEsignature`).toBe(src.requireEsignature)
      expect(cln.requireComments, `${where}: requireComments`).toBe(src.requireComments)
      expect(cln.slaDays, `${where}: slaDays`).toBe(src.slaDays)
      expect(cln.allowChildSteps, `${where}: allowChildSteps`).toBe(src.allowChildSteps)

      // Delay configuration — all three fields, so a partial copy fails.
      expect(cln.delayDays, `${where}: delayDays`).toBe(src.delayDays)
      expect(cln.delayUntilDate, `${where}: delayUntilDate`).toBe(src.delayUntilDate)
      expect(cln.maxDelayExtensions, `${where}: maxDelayExtensions`).toBe(src.maxDelayExtensions)

      // Form schema — compared by content hash, not field count: a clone that
      // wrote `[]` and a clone that wrote the wrong two fields both have to fail.
      expect(cln.formFieldCount, `${where}: formSchema field count`).toBe(src.formFieldCount)
      expect(cln.formSchemaHash, `${where}: formSchema content`).toBe(src.formSchemaHash)

      expect(cln.roleIds.sort(), `${where}: role pool`).toEqual(src.roleIds.sort())
      expect(cln.userIds.sort(), `${where}: legacy named-user assignments`).toEqual(
        src.userIds.sort(),
      )
      expect(cln.outcomeIds.sort(), `${where}: allowed outcome subset`).toEqual(
        src.outcomeIds.sort(),
      )
    }

    // ── The nested child, specifically ──────────────────────────────────────
    const srcChild = sourceSteps.find((s) => s.parentStepId)
    const clnChild = cloneSteps.find((s) => s.parentStepId)
    expect(srcChild?.name).toBe('Collect Samples')
    expect(clnChild, 'the child step came across as a child, not as a root').toBeTruthy()
    expect(clnChild.name).toBe('Collect Samples')

    const clnRoot = cloneSteps.find((s) => s.name === 'Investigate')
    expect(
      clnChild.parentStepId,
      'parentStepId is REMAPPED to the clone parent — not left pointing into the published version',
    ).toBe(clnRoot.id)
    expect(clnChild.parentStepId).not.toBe(srcChild.parentStepId)

    expect(
      cloneSteps.filter((s) => !s.parentStepId).length,
      'three roots and one child, same shape as the source',
    ).toBe(3)

    // ── Send-back targets: derived per version, never copied ────────────────
    // The clone does not copy `steps_send_back_targets`, and since F-03 gate 1
    // (migrations 20260807101000/102000) it does not need to: the rows are
    // materialised by a trigger when a version becomes — or is inserted as —
    // PUBLISHED, and again whenever a SEND_BACK outcome is added to a published
    // version's step. The seed above never wrote one; the source has them
    // because the trigger ran.
    //
    // Both halves are asserted because the two features meet here and neither
    // one's own tests look at the join. If the clone ever started copying the
    // rows they would point at the SOURCE's step ids, and a send-back on the new
    // version would validate its target against steps belonging to a different
    // version — the failure mode the count-of-zero below rules out.
    const sourceTargets = sql(
      `SELECT src.name || '->' || tgt.name
         FROM steps_send_back_targets t
         JOIN workflow_steps src ON src.id = t.step_id
         JOIN workflow_steps tgt ON tgt.id = t.target_step_id
        WHERE src.workflow_version_id = '${VER}' AND t.deleted_at IS NULL
        ORDER BY 1`,
    )
    expect(
      sourceTargets,
      'the publish-time trigger derived the one legal target on the source (Approve can go back to Investigate)',
    ).toBe('Approve->Investigate')

    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM steps_send_back_targets t
             JOIN workflow_steps s ON s.id = t.step_id
            WHERE s.workflow_version_id = '${draft.id}' AND t.deleted_at IS NULL`,
        ),
      ),
      'a DRAFT clone carries no send-back targets — they are derived at publish, not copied',
    ).toBe(0)

    // ── The published source is untouched ───────────────────────────────────
    const sourceAfter = templateStepsOf(VER)
    expect(
      sourceAfter,
      'cloning a published version must not mutate it — including its step ids',
    ).toEqual(sourceSteps)
    expect(sqlValue(`SELECT status_id FROM workflow_versions WHERE id = '${VER}'`)).toBe('PUBLISHED')
  })

  test('the cloned draft is editable while the published source stays locked', async ({ page }) => {
    test.setTimeout(120_000)

    // The clone only earns its name if the copy is actually usable — a draft
    // whose steps came across but which the editor still renders read-only
    // would satisfy every DB assertion above and help nobody.
    const draft = workflowVersionsOf(WF).find((v) => v.statusId === 'DRAFT')
    expect(draft, 'depends on the clone test').toBeTruthy()

    await page.goto(`/workflow-templates/${WF}?version=${draft.label}`)
    await expect(page.getByText('4 Steps')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible({ timeout: 20_000 })
    await expect(
      page.getByText('This version is published and locked. Reopen it for editing to make changes.'),
    ).toBeHidden()

    // Editing the clone's APPROVAL step writes; the source's does not move.
    await page.getByText('Approve', { exact: true }).first().click()
    // Wait for the editor to actually be showing THIS step before typing. The
    // step-name input is already on screen for whichever step auto-selected on
    // load, and WorkflowStepEditor's autosave watcher deliberately skips its
    // first fire after a step switch (`oldStep === undefined`) — so a fill that
    // lands during the swap is silently dropped and then overwritten when the
    // new step resolves. Anchoring on the heading is the only signal that the
    // editor and the selection agree.
    await expect(page.getByRole('heading', { name: 'Step Configuration: Approve' })).toBeVisible({
      timeout: 20_000,
    })
    const stepName = page.getByPlaceholder('e.g. Peer Review')
    await expect(stepName).toHaveValue('Approve', { timeout: 20_000 })
    await stepName.fill('Approve (revised)')

    await waitForSqlValue(
      `SELECT count(*) FROM workflow_steps
        WHERE workflow_version_id = '${draft.id}' AND name = 'Approve (revised)' AND deleted_at IS NULL`,
      { timeoutMs: 30_000, label: 'draft step rename autosaved' },
    )
    expect(
      sqlValue(`SELECT name FROM workflow_steps WHERE id = '${S2}'`),
      'the published version keeps its own copy — the clone is a copy, not an alias',
    ).toBe('Approve')
  })
})
