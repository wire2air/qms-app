// Workflow screenshots · S1 — the DESIGN side of the engine.
//   The template list, the 4-step guided create wizard (basics → structure →
//   reviews → the plan it is about to write), the designer canvas it lands on,
//   a step's configuration + assignee surfaces, and the published-and-locked
//   banner a live template shows instead.
//
// Every step, selector and persona is PW-J1's (authoring) and PW-J3's (the
// published-version lock): `owner` is the only cast member who may author a
// template — the seed grants `workflows_templates:create/update` to nobody and
// both RLS and the frontend `isAllowed` fall through to the company-owner
// bypass — and the wizard flow below is J1's, unchanged, so the states captured
// here are the ones that spec asserts.
//
// The template this file authors is REAL, so it is purged before and after:
// an ACTIVE workflow with a PUBLISHED version becomes a second candidate in
// every record-create workflow picker, and the CR/CAPA/NCR fixtures assert
// theirs auto-selects with exactly one match (see purgeWorkflowsNamed).
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, FIXTURES, ROLES } from '../../fixtures/cast.js'
import { findWorkflowByName, purgeWorkflowsNamed } from '../../fixtures/workflow.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('workflow')

const NAME_PREFIX = 'E2E WF-S1'

test.use({ storageState: AUTH.owner })

// The designer captures inspect the draft the wizard test produced.
test.describe.configure({ mode: 'serial' })

let authoredId = null

/** The open wizard. HeadlessUI marks everything else `aria-hidden`. (PW-J1) */
function wizard(page) {
  return page.locator('[role="dialog"]')
}

/** The first combobox that follows a field label, inside a given scope. (PW-J1) */
function comboAfter(scope, labelText) {
  return scope
    .getByText(labelText, { exact: true })
    .first()
    .locator('xpath=following::*[@role="combobox"][1]')
}

/**
 * Open a BaseSelect and choose options by visible name. Lifted verbatim from
 * PW-J1: the role list is long and virtualized, and `E2E Author` /
 * `E2E Auditor` / `E2E Approver` are near-prefixes of each other, so the
 * popover's own search box is used before each click.
 */
async function pickOptions(page, combo, names, { multiple = false } = {}) {
  const listboxId = await combo.getAttribute('aria-controls')
  const listbox = page.locator(`[id="${listboxId}"]`)
  await expect(async () => {
    if (!(await listbox.isVisible().catch(() => false))) await combo.click()
    await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })

  for (const name of names) {
    const search = page.getByPlaceholder('Search…').last()
    if (await search.isVisible().catch(() => false)) await search.fill(name)
    await listbox.getByRole('option', { name, exact: true }).first().click()
  }
  if (multiple) await page.keyboard.press('Escape')
}

test.describe('Workflow screenshots · templates, wizard, designer', () => {
  test.beforeAll(() => {
    purgeWorkflowsNamed(NAME_PREFIX)
  })

  test.afterAll(() => {
    purgeWorkflowsNamed(NAME_PREFIX)
  })

  test('the template list and the four wizard steps', async ({ page }) => {
    test.setTimeout(300_000)

    const name = `${NAME_PREFIX} ${Date.now()}`

    await page.goto('/workflow-templates')
    // Barrier on a SEEDED template having rendered before opening the wizard:
    // every picker inside it reads IndexedDB, which syncEngine fills
    // asynchronously on install (PW-J1).
    await expect(page.getByText(FIXTURES.crWorkflowName).first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Create Workflow' })).toBeVisible()
    await shot(page, 'templates-list')

    await page.getByRole('button', { name: 'Create Workflow' }).click()

    // ── 1. Basics ───────────────────────────────────────────────────────────
    const dlg = wizard(page)
    await expect(dlg.getByText('Workflow name', { exact: true })).toBeVisible({ timeout: 20_000 })
    await dlg.getByPlaceholder('e.g. Default CAPA Workflow').fill(name)
    await pickOptions(page, comboAfter(dlg, 'Module'), ['CAPA'])
    await dlg
      .getByPlaceholder('When should this workflow be used?')
      .fill('Screenshot run — the same mixed ACTION/APPROVAL/DELAY design PW-J1 authors.')
    await shot(page, 'wizard-1-basics')
    await dlg.getByRole('button', { name: 'Next' }).click()

    // ── 2. Structure — staged, with a two-role pool on stage 1 ──────────────
    await dlg.getByText('Break it into stages', { exact: true }).click()
    const stage1 = dlg.getByPlaceholder('Stage 1 name — e.g. Investigation')
    await expect(stage1).toBeVisible({ timeout: 10_000 })
    await stage1.fill('Investigation')
    await dlg.getByPlaceholder('Stage 2 name — e.g. Investigation').fill('Implementation')
    await pickOptions(
      page,
      stage1.locator('xpath=following::*[@role="combobox"][1]'),
      [ROLES.reviewer.name, ROLES.author.name],
      { multiple: true },
    )
    await shot(page, 'wizard-2-structure')
    await dlg.getByRole('button', { name: 'Next' }).click()

    // ── 3. Reviews & checks — e-signature + a 90-day effectiveness delay ────
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
    await shot(page, 'wizard-3-reviews')
    await dlg.getByRole('button', { name: 'Next' }).click()

    // ── 4. Review — the wizard's own plan, before anything is written ───────
    await expect(
      dlg.getByText('4 steps · created as a draft you can refine in the builder'),
    ).toBeVisible({ timeout: 15_000 })
    await expect(dlg.getByText('Effectiveness Check', { exact: true })).toBeVisible()
    await shot(page, 'wizard-4-review')

    await dlg.getByRole('button', { name: 'Create as Draft' }).click()

    // Lands on the new draft in the builder.
    await expect(page).toHaveURL(/\/workflow-templates\/[0-9a-f-]{36}/, { timeout: 45_000 })
    authoredId = page.url().match(/workflow-templates\/([0-9a-f-]{36})/)[1]
    // The step-list header renders "<n> Steps" once the wizard's writes land.
    await expect(page.getByText('4 Steps')).toBeVisible({ timeout: 60_000 })
    await shot(page, 'designer-draft')
  })

  test('the designer canvas — step configuration and the assignee surface', async ({ page }) => {
    test.setTimeout(180_000)
    expect(authoredId, 'depends on the wizard test').toBeTruthy()

    // A full-canvas designer: it fills the viewport with its own panes and
    // scroll regions (exempt from the page-layout rules), so a full-page
    // capture is still the right frame — it just is not a scrolling document.
    await page.goto(`/workflow-templates/${authoredId}`)
    await expect(page.getByText('4 Steps')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible({ timeout: 30_000 })

    await page.getByText('Final Approval', { exact: true }).first().click()
    await expect(
      page.getByRole('heading', { name: 'Step Configuration: Final Approval' }),
    ).toBeVisible({ timeout: 20_000 })
    await shot(page, 'designer-step-config')

    await page.getByRole('tab', { name: /Assignees/ }).click()
    await expect(page.getByText(ROLES.approver.name).first()).toBeVisible({ timeout: 15_000 })
    await shot(page, 'designer-step-assignees')

    // Templates bind ROLES, never named users — WorkflowEditor pins
    // `stepApproversTab` to 'roles', so the dialog renders only the role
    // selector (PW-J1 asserts that contract; this captures it).
    await page.getByRole('button', { name: 'Manage Assignees' }).click()
    await expect(page.getByRole('heading', { name: 'Manage Step Assignees' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText('Select Roles', { exact: true })).toBeVisible({ timeout: 15_000 })
    await shot(page, 'designer-manage-assignees-dialog')
    await page.getByRole('button', { name: 'Done' }).click()
  })

  test('a published version is locked — the state every revision starts from', async ({ page }) => {
    test.setTimeout(180_000)

    // The seeded CR template: ACTIVE workflow, one PUBLISHED version, three
    // steps. Looked up by name rather than hard-coded so the capture follows
    // the seed (e2e-seed.sql §CR).
    const workflow = findWorkflowByName(FIXTURES.crWorkflowName)
    expect(workflow?.id, 'the seeded CR template exists').toBeTruthy()

    await page.goto(`/workflow-templates/${workflow.id}`)
    await expect(page.getByText('3 Steps')).toBeVisible({ timeout: 60_000 })
    await expect(
      page.getByText('This version is published and locked. Reopen it for editing to make changes.'),
    ).toBeVisible({ timeout: 20_000 })
    await shot(page, 'designer-published-locked')
  })
})
