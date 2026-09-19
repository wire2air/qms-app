// AE-J5 · The auditor / auditee split, the Share tab, and the direct-status
// controls (PW-AE-J8; MTC-02, MTC-21, MTC-23).
//
// One table, two surfaces: an EXTERNAL audit is the auditee's, everything else
// the auditor's. The split is enforced in app code (the list filter, the
// create dialog's type list, the detail-page redirect) and — for status — in
// updateAuditInstance's certCompletion branch.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { dateInDays, openSelectInDialog } from '../fixtures/audits.js'
import { AUDITEE, openAuditee, visibleOnTab, visibleWithResync } from '../fixtures/auditee.js'

const OPEN = AUDITEE.open

test.describe('AE-J5 · one table, two modules', () => {
  test('an EXTERNAL audit opened under /audits/instances/:id redirects to /auditee/:id', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await page.goto(`/audits/instances/${OPEN.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(new RegExp(`/auditee/${OPEN.id}`), { timeout: 45_000 })
    await visibleWithResync(page, page.getByText(OPEN.number))
    await ctx.close()
  })

  test('the auditor’s Audits list and create dialog leave certification audits out', async ({
    browser,
  }) => {
    // Read-only auditor: the list.
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const page = await ctx.newPage()
    await page.goto('/audits?tab=instances', { waitUntil: 'domcontentloaded' })
    const internal = sqlValue(
      `SELECT audit_number FROM audit_instances
        WHERE company_id = '${COMPANY_ID}' AND program_type_id = 'INTERNAL'
          AND deleted_at IS NULL AND audit_number IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    const search = page.getByPlaceholder('Search…').first()
    await expect(search).toBeVisible({ timeout: 30_000 })
    await search.fill(internal)
    await visibleWithResync(page, page.getByRole('cell', { name: internal, exact: true }))
    await search.fill(OPEN.number)
    await expect(page.getByRole('cell', { name: OPEN.number, exact: true })).toHaveCount(0)
    await ctx.close()

    // Lead auditor: the create dialog offers no EXTERNAL type.
    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await authorCtx.newPage()
    await authorPage.goto('/audits?tab=instances', { waitUntil: 'domcontentloaded' })
    await authorPage.getByRole('button', { name: 'New Audit' }).click()
    await expect(authorPage.getByRole('heading', { name: 'New Audit' })).toBeVisible({
      timeout: 20_000,
    })
    await openSelectInDialog(authorPage, 'Type')
    const options = await authorPage.getByRole('listbox').getByRole('option').allInnerTexts()
    const labels = options.map((o) => o.trim())
    expect(labels).toEqual(expect.arrayContaining(['Internal', 'Supplier']))
    expect(labels.some((l) => /external|certification/i.test(l))).toBe(false)

    // MTC-02: the standard is still required everywhere except EXTERNAL.
    const res = await authorCtx.request.post('/api/v1/services/auditInstances', {
      data: { programTypeId: 'INTERNAL', scheduledDate: dateInDays(3) },
    })
    expect(res.status()).toBe(400)
    expect(await res.text()).toContain('auditStandardId is required')
    await authorCtx.close()
  })

  test('the Share tab pre-fills the auditor’s email and is inert for a read-only user', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await openAuditee(page, OPEN.id, OPEN.number)
    const share = () => page.getByRole('button', { name: 'Share package' })
    await visibleOnTab(page, 'Share', share)
    await expect(page.getByPlaceholder('auditor@registrar.com')).toHaveValue(OPEN.email)
    await expect(share(), 'nothing selected yet').toBeDisabled()
    await ctx.close()

    const roCtx = await browser.newContext({ storageState: AUTH.auditor })
    const roPage = await roCtx.newPage()
    await openAuditee(roPage, OPEN.id, OPEN.number)
    await visibleOnTab(roPage, 'Share', () => roPage.getByRole('button', { name: 'Share package' }))
    await expect(roPage.getByRole('button', { name: 'Share package' })).toBeDisabled()
    const boxes = roPage.locator('input[type="checkbox"]').filter({ visible: true })
    const n = await boxes.count()
    for (let i = 0; i < Math.min(n, 5); i++) {
      // The package pickers; the "replace" toggle at the bottom stays enabled
      // but can send nothing without a selection.
      const label = await boxes.nth(i).evaluate((el) => el.closest('label')?.textContent || '')
      if (/Replace the recipient/.test(label)) continue
      await expect(boxes.nth(i)).toBeDisabled()
    }
    await roCtx.close()
  })

  test('direct completion is for certification audits only (MTC-23 control)', async ({
    playwright,
  }) => {
    const api = await playwright.request.newContext({ storageState: AUTH.author })
    const internal = sqlValue(
      `SELECT id FROM audit_instances
        WHERE company_id = '${COMPANY_ID}' AND program_type_id = 'INTERNAL'
          AND status_id = 'OPEN' AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(internal, 'an OPEN internal audit to probe').toBeTruthy()
    const res = await api.patch(`/api/v1/services/auditInstances/${internal}`, {
      data: { statusId: 'CLOSED' },
    })
    expect(res.status()).toBe(400)
    expect(await res.text()).toContain('workflow-engine-owned')
    expect(sqlValue(`SELECT status_id FROM audit_instances WHERE id = '${internal}'`)).toBe('OPEN')
    await api.dispose()
  })

  test('a legacy EXTERNAL audit keeps its walkthrough evidence, and no auditee screen renders it (MTC-21/22)', async ({
    browser,
  }) => {
    const LEGACY = AUDITEE.legacy
    const snapshot = () =>
      sqlValue(
        // '#' not '|': sqlValue splits psql's output on the column separator.
        `SELECT count(*) || '#' || string_agg(result_id || ':' || comments || ':' || updated_at::text, ',')
           FROM audit_requirement_responses
          WHERE audit_instance_id = '${LEGACY.id}' AND deleted_at IS NULL`,
      )
    const before = snapshot()
    expect(before.startsWith('1#CONFORMING:'), `seeded response present: ${before}`).toBe(true)

    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await page.goto(`/audits/instances/${LEGACY.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(new RegExp(`/auditee/${LEGACY.id}`), { timeout: 45_000 })
    await visibleWithResync(page, page.getByText(LEGACY.number))
    // No Requirements tab, and the response is rendered nowhere in the DOM —
    // not even in a hidden panel.
    await expect(page.getByRole('tab', { name: /Requirements/i })).toHaveCount(0)
    await expect(page.getByText(LEGACY.responseComment)).toHaveCount(0)
    await ctx.close()

    expect(snapshot(), 'the walkthrough evidence is still there, unchanged').toBe(before)
  })
})
