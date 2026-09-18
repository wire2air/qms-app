// Documents screenshots · S6 — document templates (the module's authoring half).
//   Controller: list, create form, the live duplicate-prefix block, the DRAFT
//   template detail, the publish confirm and the PUBLISHED state.
//   Own-scope author: the same list, read-only (no create affordance).
// Selectors and personas are PW-J8's.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH } from '../../fixtures/cast.js'
import { uniqueTitle } from '../../fixtures/documents.js'
import { sqlRow, waitForSqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('documents')

const SEEDED_TEMPLATE = 'E2E SOP Template'
const SEEDED_PREFIX = 'ESOP'

function templateByName(name) {
  const row = sqlRow(
    `SELECT id, status_id FROM document_templates WHERE name = '${name}'
       ORDER BY created_at DESC LIMIT 1`,
  )
  return row ? { id: row[0], statusId: row[1] } : null
}

/** Fill the prefix, wait for the debounced live uniqueness check, return it. */
async function fillPrefix(page, prefix) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/documentTemplates/checkPrefix/'), {
      timeout: 20_000,
    }),
    page.getByPlaceholder('DOC', { exact: true }).fill(prefix),
  ])
  return res
}

test.describe.serial('Documents screenshots · document templates', () => {
  let name

  test('templates list, create form and the duplicate-prefix block', async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ storageState: AUTH.controller })
    const page = await ctx.newPage()

    await page.goto('/document-templates')
    await expect(page.getByRole('button', { name: 'Create Template' }).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText(SEEDED_TEMPLATE).first()).toBeVisible({ timeout: 20_000 })
    await shot(page, 'templates-list')

    await page.getByRole('button', { name: 'Create Template' }).first().click()
    await expect(page).toHaveURL(/\/document-templates\/create/, { timeout: 20_000 })
    await expect(page.getByPlaceholder('e.g. Standard Operating Procedure')).toBeVisible({
      timeout: 20_000,
    })
    await shot(page, 'templates-create')

    // A prefix that already exists (the seeded ESOP) is refused live. The block
    // is icon-only: a red ⊗ replaces the green tick beside the field label, and
    // onSubmit returns early while it shows.
    await page.getByPlaceholder('e.g. Standard Operating Procedure').fill(uniqueTitle('S6-dup'))
    const taken = await fillPrefix(page, SEEDED_PREFIX)
    expect((await taken.json()).available, `${SEEDED_PREFIX} is already taken`).toBe(false)
    await expect(page.locator('svg[class*="text-red-500"]').first()).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'templates-create-duplicate-prefix')

    // A free prefix → green tick → the template is created as DRAFT.
    name = uniqueTitle('S6-tmpl')
    await page.getByPlaceholder('e.g. Standard Operating Procedure').fill(name)
    const free = await fillPrefix(page, `S6${String(Date.now()).slice(-5)}`)
    expect((await free.json()).available, 'a fresh prefix is available').toBe(true)
    await shot(page, 'templates-create-filled')
    await page.getByRole('button', { name: 'Create Template' }).click()
    await expect(page).toHaveURL(/\/document-templates\/(?!create)[0-9a-f-]{36}/, {
      timeout: 30_000,
    })
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 })
    await shot(page, 'templates-detail-draft')

    await ctx.close()
  })

  test('publish confirm → PUBLISHED template', async ({ browser }) => {
    test.setTimeout(180_000)
    const t0 = templateByName(name)
    expect(t0?.statusId, 'starts DRAFT').toBe('DRAFT')

    const ctx = await browser.newContext({ storageState: AUTH.controller })
    const page = await ctx.newPage()
    await page.goto(`/document-templates/${t0.id}`)
    await expect(page.getByRole('button', { name: /^publish$/i }).first()).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: /^publish$/i }).first().click()
    // The confirm's own "Publish" is the last one on the page.
    const confirmPublish = page.getByRole('button', { name: /^publish$/i }).last()
    await expect(confirmPublish).toBeVisible({ timeout: 15_000 })
    await shot(page, 'templates-publish-confirm')
    await confirmPublish.click()

    await waitForSqlValue(
      `SELECT status_id FROM document_templates WHERE id = '${t0.id}' AND status_id = 'PUBLISHED'`,
      { timeoutMs: 30_000, label: 'template PUBLISHED' },
    )
    await expect(async () => {
      await page.reload()
      await expect(page.getByText(/published/i).first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 40_000 })
    await shot(page, 'templates-detail-published')
    await ctx.close()
  })

  test('own-scope author sees the templates list read-only', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.ownAuthor })
    const page = await ctx.newPage()
    await page.goto('/document-templates')
    await expect(page.getByText(SEEDED_TEMPLATE).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Create Template' })).toHaveCount(0)
    await shot(page, 'templates-list-readonly')
    await ctx.close()
  })
})
