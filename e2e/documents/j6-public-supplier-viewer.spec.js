// PW-J6 — Public supplier document viewer (PG-07 / API-30, journey J-14 / BS-32).
//   The token link `/supplier-document/:token` is a PUBLIC, read-only view of a
//   shared document version — no login. The token is the only credential.
//   Coverage:
//     (a) a valid token renders the document read-only to an anonymous visitor,
//         with the public shell (no app nav, no edit affordances);
//     (b) an unknown token leaks nothing (not-found);
//     (c) a revoked (soft-deleted) share returns "no longer available" (410).
//
// Share *creation* is owned by the Supplier module; here we provision the
// supplier + token row directly (the runtime equivalent of that flow) because
// the Documents module owns the *viewer* under test, and no token is seeded.
import { test, expect } from '../../video/fixtures/videoTest.js'
import crypto from 'node:crypto'
import { AUTH } from '../fixtures/cast.js'
import { createSopDocument, fillAllSections, uniqueTitle } from '../fixtures/documents.js'
import { findDocumentByTitle, versionsOf, sql, sqlRow } from '../fixtures/db.js'

/** Author creates + fills a doc, then a supplier + token share is provisioned. */
async function provisionShare(browser, tag) {
  const ctx = await browser.newContext({ storageState: AUTH.author })
  const page = await ctx.newPage()
  const title = uniqueTitle(tag)
  await createSopDocument(page, title)
  const doc = findDocumentByTitle(title)
  await fillAllSections(page, doc.id)
  await ctx.close()

  const [version] = versionsOf(doc.id)
  const company = sqlRow(
    `SELECT c.id, c.name FROM companies c JOIN documents d ON d.company_id = c.id WHERE d.id = '${doc.id}'`,
  )
  const [companyId, companyName] = company

  const supplierId = crypto.randomUUID()
  // suppliers.code is varchar(10); keep it short + unique per run.
  const code = `SUP${String(Date.now()).slice(-7)}`
  sql(
    `INSERT INTO suppliers (id, company_id, name, code, category, created_at, updated_at)
       VALUES ('${supplierId}', '${companyId}', 'E2E Supplier Co', '${code}', 'MANUFACTURER', NOW(), NOW())`,
  )
  const token = crypto.randomBytes(32).toString('hex')
  sql(
    `INSERT INTO supplier_documents (id, supplier_id, document_version_id, company_id, token, created_at, updated_at)
       VALUES (gen_random_uuid(), '${supplierId}', '${version.id}', '${companyId}', '${token}', NOW(), NOW())`,
  )
  return { doc, version, token, companyName, title }
}

test.describe.serial('PW-J6 · public supplier document viewer', () => {
  let share

  test('valid token renders the shared document read-only, no login required', async ({ browser }) => {
    test.setTimeout(120_000)
    share = await provisionShare(browser, 'J6-share')

    // Anonymous context — NO storageState — proves the path needs no session.
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`/supplier-document/${share.token}`)

    // The read-only content renders: title + filled section bodies. (doc_number
    // is stamped later in the lifecycle, so a fresh draft has none — don't assert
    // on it here.)
    await expect(page.getByText(share.title).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/E2E-FILLED section 1 content/i).first()).toBeVisible()
    await expect(page.getByText(/E2E-FILLED section 3 content/i).first()).toBeVisible()

    // Public shell: owning company name + "Shared Document" banner.
    await expect(page.getByText(share.companyName, { exact: false }).first()).toBeVisible()
    await expect(page.getByText(/shared document/i).first()).toBeVisible()

    // It is NOT the authenticated app — no sidebar nav, no edit affordances.
    await expect(page.getByRole('link', { name: /document control/i })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: /submit for review|create new draft|archive|more actions/i }),
    ).toHaveCount(0)
    await ctx.close()
  })

  test('unknown token → not found, no document leaked', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const bogus = crypto.randomBytes(32).toString('hex')
    await page.goto(`/supplier-document/${bogus}`)
    await expect(page.getByText(/something went wrong|not found/i).first()).toBeVisible({ timeout: 20_000 })
    // Nothing from a real document surfaces.
    await expect(page.getByText(/E2E-FILLED/i)).toHaveCount(0)
    await ctx.close()
  })

  test('revoked (soft-deleted) share → link no longer available (410)', async ({ browser }) => {
    expect(share?.token, 'share provisioned by the first test').toBeTruthy()
    // Revoke = soft-delete the share row (isTokenValid() ⇔ deletedAt === null).
    sql(`UPDATE supplier_documents SET deleted_at = NOW() WHERE token = '${share.token}'`)

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`/supplier-document/${share.token}`)
    await expect(page.getByText(/no longer available|revoked/i).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/E2E-FILLED/i)).toHaveCount(0)
    await ctx.close()
  })
})
