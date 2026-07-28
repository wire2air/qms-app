// PW-J8 — Document template lifecycle (PG-04/05/06, journey J-15 / BS-27).
//   The Document Controller (full document_templates CRUD) creates a template,
//   the live prefix-uniqueness check blocks a duplicate, and the template is
//   published (DRAFT → PUBLISHED). The Own-scope author (tenant read, no create)
//   sees the list read-only. Facts asserted against the DB.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { uniqueTitle } from '../fixtures/documents.js'
import { sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'

const SEEDED_TEMPLATE = 'E2E SOP Template'
const SEEDED_PREFIX = 'ESOP'

function templateByName(name) {
  const row = sqlRow(
    `SELECT id, status_id, created_by, prefix FROM document_templates
       WHERE name = '${name}' ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return { id: row[0], statusId: row[1], createdBy: row[2], prefix: row[3] }
}

async function openCreateForm(page) {
  await page.goto('/document-templates')
  await page.getByRole('button', { name: 'Create Template' }).first().click()
  await expect(page).toHaveURL(/\/document-templates\/create/, { timeout: 15_000 })
}

/** Fill the prefix and wait for the debounced live uniqueness check to resolve. */
async function fillPrefix(page, prefix) {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/documentTemplates/checkPrefix/'), { timeout: 15_000 }),
    page.getByPlaceholder('DOC', { exact: true }).fill(prefix),
  ])
}

test.describe.serial('PW-J8 · document template lifecycle', () => {
  let name, prefix

  test('controller creates a template → DRAFT', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.controller })
    const page = await ctx.newPage()
    name = uniqueTitle('J8-tmpl')
    prefix = `J8${String(Date.now()).slice(-5)}`

    await openCreateForm(page)
    await page.getByPlaceholder('e.g. Standard Operating Procedure').fill(name)
    await fillPrefix(page, prefix)
    // Default section ("Purpose") satisfies the min-one-section rule.
    await page.getByRole('button', { name: 'Create Template' }).click()

    await expect(page).toHaveURL(/\/document-templates\/(?!create)[0-9a-f-]{36}/, { timeout: 20_000 })
    const t = templateByName(name)
    expect(t, 'template row created').not.toBeNull()
    expect(t.statusId).toBe('DRAFT')
    expect(t.createdBy).toBe(USERS.controller.id)
    expect(t.prefix).toBe(prefix)
    await ctx.close()
  })

  test('live prefix check blocks a duplicate prefix', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.controller })
    const page = await ctx.newPage()
    const dupName = uniqueTitle('J8-dup')

    await openCreateForm(page)
    await page.getByPlaceholder('e.g. Standard Operating Procedure').fill(dupName)
    await fillPrefix(page, SEEDED_PREFIX) // "ESOP" already exists → unavailable

    // Submitting is blocked while the prefix is unavailable: no navigation, and
    // no row is written. (Exactly one ESOP-prefixed template — the seed's.)
    await page.getByRole('button', { name: 'Create Template' }).click()
    await expect(page).toHaveURL(/\/document-templates\/create/)
    expect(templateByName(dupName), 'duplicate not persisted').toBeNull()
    const esopCount = sqlValue(
      `SELECT count(*) FROM document_templates WHERE prefix = '${SEEDED_PREFIX}'
         AND company_id = 'e2e00001-0000-4000-8000-000000000001' AND deleted_at IS NULL`,
    )
    expect(esopCount).toBe('1')
    await ctx.close()
  })

  test('publish moves the template DRAFT → PUBLISHED', async ({ browser }) => {
    test.setTimeout(120_000)
    const t0 = templateByName(name)
    expect(t0?.statusId, 'starts DRAFT').toBe('DRAFT')

    const ctx = await browser.newContext({ storageState: AUTH.controller })
    const page = await ctx.newPage()
    await page.goto(`/document-templates/${t0.id}`)
    // Trigger → confirm dialog (okLabel "Publish"). The headlessui dialog wrapper
    // reports hidden to Playwright, so target the confirm button directly (it is
    // the second "Publish" — the first is the action-bar trigger).
    await page.getByRole('button', { name: /^publish$/i }).first().click()
    const confirmPublish = page.getByRole('button', { name: /^publish$/i }).last()
    await expect(confirmPublish).toBeVisible({ timeout: 10_000 })
    await confirmPublish.click()

    await waitForSqlValue(
      `SELECT status_id FROM document_templates WHERE id = '${t0.id}' AND status_id = 'PUBLISHED'`,
      { timeoutMs: 20_000, label: 'template PUBLISHED' },
    )
    await ctx.close()
  })

  test('own-scope author sees the templates list read-only (no create)', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.ownAuthor })
    const page = await ctx.newPage()
    await page.goto('/document-templates')
    // Tenant read → the list renders (the seeded template is visible)…
    await expect(page.getByText(SEEDED_TEMPLATE).first()).toBeVisible({ timeout: 20_000 })
    // …but there is no create affordance (no document_templates:create).
    await expect(page.getByRole('button', { name: 'Create Template' })).toHaveCount(0)
    await ctx.close()
  })
})
