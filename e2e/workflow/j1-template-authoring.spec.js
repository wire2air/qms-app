// PW-J1 · Author a template end to end (Designer, J-01/J-02).
//
// The whole template-authoring surface had never been driven by a test. Every
// prior workflow assertion in the program rode a SEEDED template — so the four
// tables the designer actually writes (`workflows`, `workflow_versions`,
// `workflow_steps`, `workflow_step_roles` + `allowed_outcomes_on_steps`) were
// only ever read back, never written, by automation.
//
// This journey runs the real 4-step guided wizard as a designer and asserts the
// resulting DESIGN GRAPH in the database: a mixed ACTION/ACTION/APPROVAL/DELAY
// sequence, a multi-role pool on one step, the DELAY window and its extension
// cap, the standard task form on the work steps and NOT on the approval gate,
// and the outcome set seeded per step.
//
// The second half is the negative the pack asked for: **no REST write is
// observed at any point**. `backend/api/routes/workflows.js` exposes five write
// endpoints — POST /v1/services/workflows, PUT …/:id, PUT …/:id/versions/
// :versionId, POST …/:id/versions, DELETE …/:id — and the finding under test is
// that the UI reaches none of them; every write goes through SyncEngine →
// PostGraphile → RLS. That matters far beyond tidiness: the RLS policies and the
// 20260731120000 trust-boundary triggers only bind the `app_user` role that
// GraphQL uses. Anything routed through REST/Sequelize connects as the DB
// superuser and bypasses both (REST_RLS_ENABLED is off by default). "The UI
// never uses REST here" is therefore a load-bearing security property, not a
// style note — so it is asserted, not assumed.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ROLES } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  findWorkflowByName,
  workflowVersionsOf,
  templateStepsOf,
  purgeWorkflowsNamed,
  watchRestWrites,
} from '../fixtures/workflow.js'

// The five REST write endpoints, as one path family. Deliberately anchored on
// `/v1/services/workflows` + a boundary so it cannot accidentally also match
// `/v1/services/workflowStatuses` or `/v1/services/workflowInstances`, which the
// app does legitimately call.
const WORKFLOWS_REST = /\/v1\/services\/workflows(\/|\?|$)/

const NAME_PREFIX = 'E2E WF-J1'

// `owner` is the only cast member who can author a template: the seed grants
// `workflows_templates:read` widely but `:create`/`:update` to nobody, and both
// `workflows_ins` (RLS) and the frontend `isAllowed` fall through to the
// company-owner bypass. Using the owner is therefore the honest persona here,
// not a shortcut — a create-capable non-owner does not exist in this tenant.
test.use({ storageState: AUTH.owner })

// The wizard is ~25 UI interactions; re-running it per test would triple the
// runtime for no extra coverage. The follow-on assertions inspect the SAME
// draft this one produced, so the file runs serially and a failed authoring run
// correctly skips the rest instead of reporting three unrelated failures.
test.describe.configure({ mode: 'serial' })

let authored = null // { name, workflowId, versionId, steps }

test.beforeAll(() => {
  purgeWorkflowsNamed(NAME_PREFIX)
})

test.afterAll(() => {
  // Authoring journeys mint real templates. An ACTIVE workflow with a PUBLISHED
  // version becomes a second candidate in every record-create workflow picker,
  // and the CR fixture (which three other workflow specs depend on) asserts its
  // picker auto-fills with exactly one named template. Leave nothing behind.
  purgeWorkflowsNamed(NAME_PREFIX)
})

/** The open wizard. HeadlessUI marks everything else `aria-hidden`. */
function wizard(page) {
  return page.locator('[role="dialog"]')
}

/** The first combobox that follows a field label, inside a given scope. */
function comboAfter(scope, labelText) {
  return scope
    .getByText(labelText, { exact: true })
    .first()
    .locator('xpath=following::*[@role="combobox"][1]')
}

/**
 * Open a BaseSelect and choose options by visible name.
 *
 * Types into the popover's own search box before each click rather than
 * scanning the rendered list: the role list is long and virtualized, and
 * `E2E Author` / `E2E Auditor` / `E2E Approver` are near-prefixes of each other,
 * so a non-exact match is a real hazard here.
 */
async function pickOptions(page, combo, names, { multiple = false } = {}) {
  const listboxId = await combo.getAttribute('aria-controls')
  const listbox = page.locator(`[id="${listboxId}"]`)
  // Re-click only while the panel is shut — a click while open toggles it away.
  // Options arrive async from IDB, so the two conditions need separate handling.
  await expect(async () => {
    if (!(await listbox.isVisible().catch(() => false))) await combo.click()
    await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })

  for (const name of names) {
    const search = page.getByPlaceholder('Search…').last()
    if (await search.isVisible().catch(() => false)) await search.fill(name)
    await listbox.getByRole('option', { name, exact: true }).first().click()
  }
  // A `multiple` select keeps its popover open after each pick (BaseSelect only
  // auto-closes single selects), so it must be dismissed before the next field.
  if (multiple) await page.keyboard.press('Escape')
}

test.describe('PW-J1 · authoring a workflow template through the guided wizard', () => {
  test('the 4-step wizard writes a mixed ACTION/APPROVAL/DELAY design graph — entirely over SyncEngine', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    // Attach BEFORE the first navigation: the claim under test covers the whole
    // flow, including whatever the list page does on load.
    const rest = watchRestWrites(page)

    const name = `${NAME_PREFIX} ${Date.now()}`

    await page.goto('/workflow-templates')
    // Barrier on the list having rendered a SEEDED template before opening the
    // wizard. Every picker inside it (module, roles) reads IndexedDB, which
    // syncEngine fills asynchronously on install — opening the dialog before
    // bootstrap lands gives empty option lists and a 30s dead wait for options
    // that will never arrive on this page load.
    await expect(page.getByText('E2E CAPA Review & Approval').first()).toBeVisible({
      timeout: 60_000,
    })

    await page.getByRole('button', { name: 'Create Workflow' }).click()

    const dlg = wizard(page)
    await expect(dlg.getByText('Workflow name', { exact: true })).toBeVisible({ timeout: 20_000 })

    // ── 1. Basics ───────────────────────────────────────────────────────────
    await dlg.getByPlaceholder('e.g. Default CAPA Workflow').fill(name)
    await pickOptions(page, comboAfter(dlg, 'Module'), ['CAPA'])
    await dlg.getByPlaceholder('When should this workflow be used?').fill('PW-J1 authored template.')
    await dlg.getByRole('button', { name: 'Next' }).click()

    // ── 2. Structure — staged, so the design is genuinely multi-step ────────
    await dlg.getByText('Break it into stages', { exact: true }).click()
    const stage1 = dlg.getByPlaceholder('Stage 1 name — e.g. Investigation')
    await expect(stage1).toBeVisible({ timeout: 10_000 })
    await stage1.fill('Investigation')
    await dlg.getByPlaceholder('Stage 2 name — e.g. Investigation').fill('Implementation')

    // A POOL of two roles on stage 1 — one role would not distinguish "the pool
    // was written" from "a role was written".
    await pickOptions(
      page,
      stage1.locator('xpath=following::*[@role="combobox"][1]'),
      [ROLES.reviewer.name, ROLES.author.name],
      { multiple: true },
    )
    await dlg.getByRole('button', { name: 'Next' }).click()

    // ── 3. Reviews & checks ─────────────────────────────────────────────────
    // `needApproval` defaults on; the e-signature switch does not.
    await expect(dlg.getByText('Who approves?', { exact: true })).toBeVisible({ timeout: 10_000 })
    await pickOptions(page, comboAfter(dlg, 'Who approves?'), [ROLES.approver.name], {
      multiple: true,
    })
    await dlg
      .locator('label')
      .filter({ hasText: 'Require e-signature (regulated sign-off)' })
      .getByRole('switch')
      .click()

    await dlg
      .locator('label')
      .filter({ hasText: 'Need a follow-up effectiveness check?' })
      .getByRole('switch')
      .click()
    await expect(dlg.getByText('Check after', { exact: true })).toBeVisible({ timeout: 10_000 })
    await dlg.getByRole('button', { name: '90 days', exact: true }).click()
    await pickOptions(page, comboAfter(dlg, 'Who verifies?'), [ROLES.auditor.name], {
      multiple: true,
    })
    await dlg.getByRole('button', { name: 'Next' }).click()

    // ── 4. Review — the wizard's own plan, before anything is written ───────
    await expect(dlg.getByText('4 steps · created as a draft you can refine in the builder')).toBeVisible()
    await expect(dlg.getByText('Investigation', { exact: true })).toBeVisible()
    await expect(dlg.getByText('Final Approval', { exact: true })).toBeVisible()
    await expect(dlg.getByText('Effectiveness Check', { exact: true })).toBeVisible()

    await dlg.getByRole('button', { name: 'Create as Draft' }).click()

    // Lands on the new draft in the builder.
    await expect(page).toHaveURL(/\/workflow-templates\/[0-9a-f-]{36}/, { timeout: 45_000 })

    // ── The design graph, at the database ───────────────────────────────────
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_steps s
         JOIN workflow_versions v ON v.id = s.workflow_version_id
         JOIN workflows w ON w.id = v.workflow_id
        WHERE w.name = '${name}' AND s.deleted_at IS NULL`,
      { timeoutMs: 45_000, label: 'wizard wrote its steps' },
    )

    const workflow = findWorkflowByName(name)
    expect(workflow, 'the wizard created the workflow header').toBeTruthy()
    expect(workflow.moduleId).toBe('CAPA')
    expect(workflow.statusId, 'the workflow itself is ACTIVE; the VERSION is what stays draft').toBe(
      'ACTIVE',
    )

    const versions = workflowVersionsOf(workflow.id)
    expect(versions.length, 'exactly one version is minted').toBe(1)
    expect(versions[0].label).toBe('1.0')
    expect(versions[0].statusId, 'nothing runs until it is published').toBe('DRAFT')

    const steps = templateStepsOf(versions[0].id)
    expect(steps.length).toBe(4)
    expect(
      steps.map((s) => s.stepType),
      'the answers to "stages / final approval / effectiveness check" become the step TYPES',
    ).toEqual(['ACTION', 'ACTION', 'APPROVAL', 'DELAY'])
    expect(steps.map((s) => s.name)).toEqual([
      'Investigation',
      'Implementation',
      'Final Approval',
      'Effectiveness Check',
    ])
    expect(steps.map((s) => s.stepOrder)).toEqual([1, 2, 3, 4])

    const [investigation, implementation, approval, check] = steps

    // Role pool — the point of the multi-select on stage 1.
    expect(investigation.roleIds.sort(), 'stage 1 carries the whole pool, not just one role').toEqual(
      [ROLES.reviewer.id, ROLES.author.id].sort(),
    )
    expect(implementation.roleIds, 'stage 2 was deliberately left role-less').toEqual([])
    expect(approval.roleIds).toEqual([ROLES.approver.id])
    expect(check.roleIds).toEqual([ROLES.auditor.id])

    // E-signature landed on the approval gate and nowhere else.
    expect(approval.requireEsignature, 'the e-signature switch wrote through').toBe(true)
    expect(investigation.requireEsignature).toBe(false)
    expect(check.requireEsignature).toBe(false)

    // DELAY configuration — the whole reason DELAY is a distinct step type.
    expect(check.delayDays, 'the 90-day preset wrote through').toBe(90)
    expect(check.delayUntilDate, 'a relative window and a fixed date are mutually exclusive').toBeNull()
    expect(check.maxDelayExtensions, 'DELAY steps get an extension cap; other types do not').toBe(1)
    for (const s of [investigation, implementation, approval]) {
      expect(s.delayDays, `${s.name} has no delay window`).toBeNull()
      expect(s.maxDelayExtensions, `${s.name} has no extension cap`).toBeNull()
    }

    // Task form — attached to the steps that CAPTURE something, and pointedly
    // not to the approval gate, which is comment-only by design.
    expect(investigation.formFieldCount, 'standard task form: description + attachments').toBe(2)
    expect(implementation.formFieldCount).toBe(2)
    expect(check.formFieldCount, 'a DELAY step captures its effectiveness evidence').toBe(2)
    expect(approval.formFieldCount, 'APPROVAL steps are comment-only — no form').toBe(0)
    expect(
      sqlValue(
        `SELECT string_agg(f->>'name', ',' ORDER BY f->>'name')
           FROM workflow_steps s, jsonb_array_elements(s.form_schema) f
          WHERE s.id = '${investigation.id}'`,
      ),
      'the seeded schema is the standard task form, not an arbitrary two fields',
    ).toBe('attachments,description')

    // Outcomes — one row per catalogued outcome, on every step.
    const catalog = sql(`SELECT id FROM workflow_step_outcomes ORDER BY id`).split('\n')
    for (const s of steps) {
      expect(s.outcomeIds.sort(), `${s.name} has the full outcome set`).toEqual(catalog.sort())
    }

    // ── The negative: not one REST write ────────────────────────────────────
    const restWrites = rest.matching(WORKFLOWS_REST)
    expect(
      restWrites,
      `the five REST write endpoints are UI-orphaned; observed: ${JSON.stringify(restWrites)}`,
    ).toEqual([])
    // …and the flow was not simply inert: it really did write, over GraphQL.
    // Without this the assertion above would also pass for a wizard that never
    // saved anything at all.
    expect(rest.graphql().length, 'the writes went through SyncEngine/GraphQL').toBeGreaterThan(0)

    authored = { name, workflowId: workflow.id, versionId: versions[0].id, steps }
  })

  test('the builder shows the authored design and refuses to widen it beyond role pools', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    expect(authored, 'depends on the authoring test').toBeTruthy()

    const rest = watchRestWrites(page)
    await page.goto(`/workflow-templates/${authored.workflowId}`)

    // The version banner: a DRAFT is editable, which is what makes the
    // roles-only finding below a statement about the UI rather than about
    // read-only mode.
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('4 Steps')).toBeVisible({ timeout: 20_000 })

    // Open the APPROVAL step and walk to its assignee surface.
    await page.getByText('Final Approval', { exact: true }).first().click()
    await expect(page.getByRole('heading', { name: /Step Configuration: Final Approval/ })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('tab', { name: /Assignees/ }).click()
    await expect(page.getByText('E2E Approver').first()).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Manage Assignees' }).click()
    await expect(page.getByRole('heading', { name: 'Manage Step Assignees' })).toBeVisible({
      timeout: 15_000,
    })

    // 14-playwright-journeys.md asks this journey to "assign a role pool to one
    // step and a NAMED USER to another". That surface no longer exists, and the
    // removal is deliberate and documented at WorkflowEditor.vue:96-104 —
    // `stepApproversTab` is pinned to `'roles'` for every module, so
    // WorkflowStepAssigneesDialog renders only WorkflowRoleSelector and the
    // BY ROLE / BY USERS tab strip never mounts. Templates bind ROLES; the named
    // reviewer is chosen per record at submit time (that is PW-J4).
    //
    // The schema and the clone path both still carry `workflow_step_users`, so
    // this is pinned rather than assumed: if a BY USERS tab ever reappears, or
    // if some other path starts writing that table from the template designer,
    // the reviewer-pool contract PW-J4 relies on has changed and this fails.
    await expect(
      page.getByRole('button', { name: 'BY USERS' }),
      'the template designer has no named-user surface — reviewers are picked per record',
    ).toHaveCount(0)
    await expect(
      page.getByText('Select Roles', { exact: true }),
      'the only assignee surface the dialog offers is the role selector',
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: `Toggle role ${ROLES.approver.name}` })).toBeVisible()

    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM workflow_step_users u
             JOIN workflow_steps s ON s.id = u.step_id
            WHERE s.workflow_version_id = '${authored.versionId}' AND u.deleted_at IS NULL`,
        ),
      ),
      'no named-user rows exist on a template the designer just authored',
    ).toBe(0)

    // The outcome editor is rendered but permanently `v-show="false"`
    // (WorkflowStepEditor.vue's "Allowed Outcomes" block). Outcomes are seeded
    // by the create path — asserted above — and there is no way for an author to
    // narrow them, which is the configuration half of F-10.
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(
      page.getByRole('heading', { name: 'Allowed Outcomes' }),
      'the outcome configuration editor is present in the component but never shown',
    ).toBeHidden()

    expect(rest.matching(WORKFLOWS_REST), 'the builder is REST-free too').toEqual([])
  })

  test('CONTROL: editing a step in the builder still writes — the roles-only rule is not a frozen page', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    expect(authored, 'depends on the authoring test').toBeTruthy()

    const rest = watchRestWrites(page)
    await page.goto(`/workflow-templates/${authored.workflowId}`)
    await expect(page.getByText('4 Steps')).toBeVisible({ timeout: 30_000 })

    await page.getByText('Implementation', { exact: true }).first().click()
    // Anchor on the editor heading, not just the input: the step-name/SLA
    // controls are already mounted for whichever step auto-selected on load, and
    // WorkflowStepEditor's autosave watcher deliberately skips its first fire
    // after a step switch — a fill that lands mid-swap is silently discarded.
    await expect(
      page.getByRole('heading', { name: 'Step Configuration: Implementation' }),
    ).toBeVisible({ timeout: 20_000 })
    const sla = page.getByPlaceholder('e.g. 5')
    await expect(sla).toBeVisible({ timeout: 20_000 })
    await sla.fill('12')

    // The step editor autosaves on an 800ms debounce.
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_steps
        WHERE workflow_version_id = '${authored.versionId}'
          AND name = 'Implementation' AND sla_days = 12 AND deleted_at IS NULL`,
      { timeoutMs: 30_000, label: 'step edit autosaved' },
    )

    expect(rest.matching(WORKFLOWS_REST), 'the step edit did not touch REST either').toEqual([])
    expect(rest.graphql().length, 'it went through GraphQL').toBeGreaterThan(0)
  })
})
