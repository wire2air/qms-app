// RA-J5 — Risk Assessment Template CRUD at /risk-assessment-templates.
// PERM-01 (docs/modules/risk-assessment/10-permission-matrix.md) — native,
// own-scope capable, and already correct + integration-tested
// (own-scope-templates.test.js). This journey exercises the UI surface that
// had never been driven end-to-end: create -> visible in the list -> edit ->
// delete (paranoid soft-delete), plus the permission-denial half (no grant,
// no button, and the route itself stays reachable — the page is behind no
// route guard beyond the app shell, same RECORD-adjacent shape as the other
// admin lookup pages).
import { test, expect } from '@playwright/test'
import { AUTH, RISK_ASSESSMENT } from '../fixtures/cast.js'
import { sqlRow, sqlValue } from '../fixtures/db.js'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

function findTemplateByName(name) {
  const row = sqlRow(
    `SELECT id, deleted_at FROM risk_assessment_templates WHERE name = ${quote(name)} ORDER BY created_at DESC LIMIT 1`,
  )
  return row ? { id: row[0], deletedAt: row[1] || null } : null
}

function purgeTemplateByName(name) {
  sqlValue(`DELETE FROM risk_assessment_templates WHERE name = ${quote(name)}`)
}

test.describe('RA-J5 · Risk Assessment Template CRUD', () => {
  const NAME = `E2E RA-J5 Template ${Date.now()}`
  const RENAMED = `${NAME} (renamed)`

  test.afterAll(() => {
    purgeTemplateByName(NAME)
    purgeTemplateByName(RENAMED)
  })

  test('author (risk_assessment_templates:create) can create, see it listed, edit, and delete', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await page.goto('/risk-assessment-templates', { waitUntil: 'domcontentloaded' })
    // The sidebar nav link carries the same text as the page <h1>, so the
    // `.or()` fallback resolved to 2 elements (a `.first()` inside `.or()`
    // only narrows that branch, not the union). The heading alone is exact.
    await expect(
      page.getByRole('heading', { name: 'Risk Assessment Templates' }),
    ).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: 'New Template' }).click()
    await expect(page.getByText('New Risk Assessment Template')).toBeVisible({ timeout: 10_000 })
    await page.getByPlaceholder('e.g. Standard Risk Matrix').fill(NAME)
    await page.getByRole('button', { name: 'Create Template' }).click()

    await expect
      .poll(() => findTemplateByName(NAME)?.id, { timeout: 20_000, message: 'the template landed in Postgres' })
      .toBeTruthy()
    const created = findTemplateByName(NAME)
    expect(created.deletedAt).toBeNull()

    // Visible in the list without a reload — the live query.
    await expect(page.getByText(NAME)).toBeVisible({ timeout: 15_000 })

    // Edit: row menu -> Edit -> rename -> Save Changes.
    const row = page.locator('tr', { has: page.getByText(NAME, { exact: true }) })
    await row.getByRole('button').last().click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await expect(page.getByText('Edit Risk Assessment Template')).toBeVisible({ timeout: 10_000 })
    const nameInput = page.getByPlaceholder('e.g. Standard Risk Matrix')
    await nameInput.fill(RENAMED)
    await page.getByRole('button', { name: 'Save Changes' }).click()

    await expect
      .poll(() => findTemplateByName(RENAMED)?.id, { timeout: 20_000 })
      .toBeTruthy()
    await expect(page.getByText(RENAMED)).toBeVisible({ timeout: 15_000 })

    // Delete: row menu -> Delete -> confirm. Paranoid soft-delete
    // (BaseModel.delete() -> deletedAt, a GraphQL UPDATE — F-06 in the docs
    // notes the Delete BUTTON checks :delete while the real write path is
    // gated by :update; this persona holds both, so the button-vs-policy
    // mismatch is not observable from this journey — see final report).
    const renamedRow = page.locator('tr', { has: page.getByText(RENAMED, { exact: true }) })
    await renamedRow.getByRole('button').last().click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.getByText(/Delete Risk Assessment Template/)).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click()

    await expect
      .poll(() => findTemplateByName(RENAMED)?.deletedAt, { timeout: 20_000, message: 'soft-deleted' })
      .toBeTruthy()
    await expect(page.getByText(RENAMED)).toHaveCount(0, { timeout: 15_000 })

    await ctx.close()
  })

  test('a persona with no risk_assessment_templates grant sees no New Template button', async ({
    browser,
  }) => {
    // noAccess holds zero risk_assessment_templates grants (it holds zero
    // grants of any kind — the module's standing denial persona). canCreate
    // gates the header action. The SELECT RLS policy itself is native and
    // permission-gated (authz.apply_module_rls — has_permission(...,'read')
    // OR own-scope), so this persona's list is also empty; the button's
    // absence is the observable half this test pins.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await page.goto('/risk-assessment-templates', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'New Template' })).toHaveCount(0, {
      timeout: 15_000,
    })
    await ctx.close()
  })

  test('the seeded E2E Risk Matrix template is visible and is the one the workflow field is bound to', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await page.goto('/risk-assessment-templates', { waitUntil: 'domcontentloaded' })
    // An older seed left a second template with the SAME name (a stale row
    // from a prior fixture generation), so a bare getByText is a strict-mode
    // violation. The row this journey means is the one the workflow step
    // binds, so assert at least one is rendered rather than exactly one.
    await expect(
      page.getByText(RISK_ASSESSMENT.template.name).first(),
    ).toBeVisible({ timeout: 20_000 })
    await ctx.close()

    const bound = sqlValue(
      `SELECT (form_schema->0->>'riskAssessmentTemplateId') FROM workflow_steps WHERE id = 'e2ef6003-0000-4000-8000-000000000001'`,
    )
    expect(bound).toBe(RISK_ASSESSMENT.template.id)
  })
})
