// PW-J2 — RCA Templates admin: create with all four method configs, edit, and
// delete (soft, via the paranoid `rca_templates_upd` policy — the module's
// own F-13-adjacent UI/DB mismatch: the Delete button is gated on
// `rca_templates:delete` but the real path is a paranoid soft-delete governed
// by `rca_templates_upd`, which needs `:update`. `rcaAdmin` holds both, so
// this journey cannot distinguish the two — see PW-J4 in
// j4-root-causes-boundary.spec.js for the sibling table's own UPDATE-vs-DELETE
// distinction, which IS load-bearing there.
//
// /rca-templates carries NO route-level guard (permissionGuard.js's
// ADMIN_PERMISSIONS has no `rca-templates` entry — it is a template/reference
// route, deliberately tenant-public-read like Document Templates and Form
// Templates). So `noAccess` reaches the PAGE same as `rcaAdmin`; what this
// journey proves is that the WRITE controls in-page actually require the
// grant, matching the "write-gated instead" design the guard's own comment
// describes.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, RCA, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { quote } from '../fixtures/rca.js'

const NAME = 'E2E J2 New RCA Template'
const RENAMED = 'E2E J2 New RCA Template (renamed)'

test.describe('PW-J2 · RCA Templates admin', () => {
  test.beforeAll(() => {
    sqlValue(`DELETE FROM rca_templates WHERE name IN (${quote(NAME)}, ${quote(RENAMED)})`)
  })
  test.afterAll(() => {
    sqlValue(`DELETE FROM rca_templates WHERE name IN (${quote(NAME)}, ${quote(RENAMED)})`)
  })

  test('create: all four method configs persist, including one built from a blank template', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.rcaAdmin })
    const page = await ctx.newPage()
    try {
      await page.goto('/rca-templates')
      await expect(page.getByRole('heading', { name: 'RCA Templates' })).toBeVisible({
        timeout: 15_000,
      })

      await page.getByRole('button', { name: 'New Template' }).click()
      await expect(page.getByText('New RCA Template')).toBeVisible()

      await page.getByRole('textbox', { name: 'Template Name' }).fill(NAME)
      await page
        .getByPlaceholder('Optional — describe when to use this template')
        .fill('Seeded by PW-J2.')

      // 5 Whys tab — a plain BaseTextInput per prompt, robust to drive
      // (unlike the Fishbone tab's absolutely-positioned canvas inputs,
      // deliberately not driven here — see FishboneAnalysis.vue).
      await page.getByRole('tab', { name: '5 Whys' }).click()
      await page.getByPlaceholder('e.g. Describe what happened').first().fill('What happened (PW-J2)?')
      await page.getByRole('button', { name: 'Add Why' }).click()
      // The comment this replaced claimed "only the first Why uses this
      // placeholder"; measured, the 5-Whys config renders it on every prompt
      // row (6 after Add Why). Asserting the exact count pins a layout detail
      // the journey does not care about — that at least one prompt input is
      // present is the real precondition for the fill below.
      const whyInputs = page.getByPlaceholder('e.g. Why did this occur?')
      expect(await whyInputs.count()).toBeGreaterThan(0)
      // The 5-Whys prompt rows use 'e.g. Why did this occur?' — there is no
      // 'Why?' placeholder anywhere in RcaTemplateMethodConfig.vue, so the
      // original locator could never resolve.
      await whyInputs.first().fill('Why #1 (PW-J2)')

      // Is / Is Not tab.
      await page.getByRole('tab', { name: 'Is / Is Not' }).click()
      await page.getByRole('button', { name: 'Add Dimension' }).click()
      await page.getByPlaceholder('e.g. What').last().fill('Custom Dimension (PW-J2)')

      // Why Tree tab.
      await page.getByRole('tab', { name: 'Why Tree' }).click()
      await page.getByPlaceholder('e.g. Describe what happened').fill('Why Tree prompt (PW-J2)')

      await page.getByRole('button', { name: 'Create Template' }).click()
      await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 20_000 })

      const configJson = sqlValue(
        `SELECT config::text FROM rca_templates WHERE name = ${quote(NAME)} AND deleted_at IS NULL`,
      )
      expect(configJson, 'the template landed in Postgres').toBeTruthy()
      const config = JSON.parse(configJson)
      expect(config['5why'].problemPrompt).toBe('What happened (PW-J2)?')
      expect(config['5why'].whys.some((w) => w.prompt === 'Why #1 (PW-J2)')).toBe(true)
      expect(config.isnot.dimensions).toContain('Custom Dimension (PW-J2)')
      expect(config.whytree.problemPrompt).toBe('Why Tree prompt (PW-J2)')
      // Fishbone was never touched in this create — the dialog seeds the
      // default 6Ms, so the config still carries them rather than an empty
      // array (proves DEFAULT_CONFIG() survived untouched tabs).
      expect(config.fishbone.branches.map((b) => b.label)).toEqual(
        expect.arrayContaining(['People', 'Machine', 'Method', 'Material', 'Measurement', 'Environment']),
      )
    } finally {
      await ctx.close()
    }
  })

  test('edit: name, description and a method prompt update in place', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.rcaAdmin })
    const page = await ctx.newPage()
    try {
      await page.goto('/rca-templates')
      await expect(page.getByText(RCA.template.name).first()).toBeVisible({ timeout: 15_000 })

      // Two seeded templates share this name (a stale row from an earlier
      // fixture generation), so the row filter matches 2 — take the first.
      const row = page
        .locator('tr', { has: page.getByText(RCA.template.name, { exact: true }) })
        .first()
      await row.getByRole('button', { name: 'More actions' }).click()
      await page.getByRole('menuitem', { name: 'Edit' }).click()
      await expect(page.getByText('Edit RCA Template')).toBeVisible()

      const nameInput = page.getByRole('textbox', { name: 'Template Name' })
      await expect(nameInput).toHaveValue(RCA.template.name)
      await nameInput.fill(`${RCA.template.name} (temp edit PW-J2)`)
      await page.getByRole('button', { name: 'Save Changes' }).click()
      await expect(page.getByText(`${RCA.template.name} (temp edit PW-J2)`)).toBeVisible({
        timeout: 15_000,
      })

      // Restore the name — this template is shared with PW-J1's workflow
      // fixture (bound by id, not name, so the rename itself did not break
      // anything, but leaving it renamed would confuse the next run's reader).
      const rowAfter = page
        .locator('tr', {
          has: page.getByText(`${RCA.template.name} (temp edit PW-J2)`, { exact: true }),
        })
        .first()
      await rowAfter.getByRole('button', { name: 'More actions' }).click()
      await page.getByRole('menuitem', { name: 'Edit' }).click()
      await page.getByRole('textbox', { name: 'Template Name' }).fill(RCA.template.name)
      await page.getByRole('button', { name: 'Save Changes' }).click()
      await expect(page.getByText(RCA.template.name).first()).toBeVisible({ timeout: 15_000 })

      expect(
        sqlValue(`SELECT name FROM rca_templates WHERE id = '${RCA.template.id}'`),
        'restored — PW-J1 binds this template by id and depends on its config, not its name',
      ).toBe(RCA.template.name)
    } finally {
      await ctx.close()
    }
  })

  test('delete: a paranoid soft-delete, not a hard delete', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.rcaAdmin })
    const page = await ctx.newPage()
    try {
      // Arrange a disposable template rather than reusing RCA.template, which
      // PW-J1's workflow fixture is bound to by id.
      await page.goto('/rca-templates')
      await page.getByRole('button', { name: 'New Template' }).click()
      await page.getByRole('textbox', { name: 'Template Name' }).fill(RENAMED)
      await page.getByRole('button', { name: 'Create Template' }).click()
      await expect(page.getByText(RENAMED).first()).toBeVisible({ timeout: 20_000 })

      const row = page.locator('tr', { has: page.getByText(RENAMED, { exact: true }) })
      await row.getByRole('button', { name: 'More actions' }).click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await page.getByRole('button', { name: 'Delete', exact: true }).click() // confirm dialog

      await expect
        .poll(
          () => sqlValue(`SELECT deleted_at IS NOT NULL FROM rca_templates WHERE name = ${quote(RENAMED)}`),
          { timeout: 20_000 },
        )
        .toBe('t')
      // The row itself still exists — soft delete, not a real SQL DELETE.
      expect(sqlValue(`SELECT count(*) FROM rca_templates WHERE name = ${quote(RENAMED)}`)).toBe('1')
      await expect(page.getByText(RENAMED).first()).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('write controls are hidden and refused without rca_templates grants — PAGE stays reachable', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    try {
      await page.goto('/rca-templates')
      // The route carries no guard — noAccess is not bounced to /no-access.
      await expect(page.getByRole('heading', { name: 'RCA Templates' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText(RCA.template.name).first()).toBeVisible({ timeout: 15_000 })

      // But the write affordance is gone — `canCreate` is
      // isAllowed(['rca_templates:create']), and noAccess holds nothing.
      await expect(page.getByRole('button', { name: 'New Template' })).toHaveCount(0)

      // And the underlying RLS refuses the write even if something bypassed
      // the hidden button — rca_templates_ins requires rca_templates:create
      // (or isOwner), which noAccess holds neither of. Probed at the `app_user`
      // layer directly (the role PostGraphile runs every request as), the
      // same idiom every other suite's RLS regression test uses.
      const before = sqlValue('SELECT count(*) FROM rca_templates')
      const insert = sqlAsAppUser(
        `INSERT INTO rca_templates (company_id, name, config, created_by)
         VALUES ('${COMPANY_ID}', 'noAccess probe (PW-J2)', '{}'::jsonb, '${USERS.noAccess.id}');`,
        { userId: USERS.noAccess.id, companyId: COMPANY_ID },
      )
      expect(insert.ok, 'the INSERT is refused by rca_templates_ins, not merely a client bug').toBe(
        false,
      )
      expect(sqlValue('SELECT count(*) FROM rca_templates')).toBe(before)
    } finally {
      await ctx.close()
    }
  })
})
