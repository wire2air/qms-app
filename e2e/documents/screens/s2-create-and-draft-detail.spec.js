// Documents screenshots · S2 — create form and the DRAFT detail page.
//   Create: blank form, the validation summary on an empty submit, the filled
//   Properties tab plus the Content and Training Assessment tabs.
//   Detail (DRAFT): the record page, the completeness gate dialog, the version
//   picker, the Training tab, the overflow menu, Audit Log, Revision History,
//   collaboration (collaborator + chat), and the printable view.
//
// Drives the same fixtures the journeys use (createSopDocument + its
// beforeSubmit hook); the collaborator/chat steps mirror PW-J10.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../../fixtures/cast.js'
import { createSopDocument, uniqueTitle } from '../../fixtures/documents.js'
import { findDocumentByTitle, waitForSqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('documents')

test.describe.serial('Documents screenshots · create + draft detail', () => {
  test('create form: blank, validation, filled, content and training tabs', async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    // ── Blank create form (Properties tab) ─────────────────────────────────
    await page.goto('/documents/create')
    await expect(page.getByPlaceholder('e.g. Clean Room Sterilization Protocol')).toBeVisible({
      timeout: 20_000,
    })
    await shot(page, 'create')

    // ── Submitting an empty form → BaseForm's validation summary ───────────
    await page.getByRole('button', { name: 'Create Document' }).click()
    await expect(page.getByText(/please fix \d+ issues? before continuing/i)).toBeVisible({
      timeout: 10_000,
    })
    await shot(page, 'create-validation')

    // ── Completed form + its other two tabs, captured just before submit ───
    const title = uniqueTitle('S2-create')
    await createSopDocument(page, title, {
      async beforeSubmit(p) {
        await shot(p, 'create-filled')

        await p.getByRole('tab', { name: 'Content' }).click()
        await expect(p.getByRole('tab', { name: 'Content' })).toHaveAttribute(
          'aria-selected',
          'true',
        )
        await shot(p, 'create-content-tab')

        await p.getByRole('tab', { name: 'Training Assessment' }).click()
        await expect(p.getByRole('tab', { name: 'Training Assessment' })).toHaveAttribute(
          'aria-selected',
          'true',
        )
        await shot(p, 'create-training-tab')

        await p.getByRole('tab', { name: 'Properties' }).click()
        await expect(p.getByRole('tab', { name: 'Properties' })).toHaveAttribute(
          'aria-selected',
          'true',
        )
      },
    })

    // ── The new record: DRAFT 1.0 detail page ──────────────────────────────
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: /submit for review/i })).toBeVisible({
      timeout: 20_000,
    })
    await shot(page, 'detail-draft')

    await ctx.close()
  })

  test('draft detail: gate dialog, version picker, tabs, dialogs, collaboration, print', async ({
    browser,
  }) => {
    test.setTimeout(420_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    // Stub the print dialog before any page exists — the print view calls
    // window.print() on load (as in audits/PW-J8).
    await ctx.addInitScript(() => {
      window.print = () => {}
    })
    const page = await ctx.newPage()

    const title = uniqueTitle('S2-detail')
    await createSopDocument(page, title)
    const doc = findDocumentByTitle(title)

    // ── Completeness gate: submitting an empty draft ───────────────────────
    await page.getByRole('button', { name: /submit for review/i }).click()
    await expect(page.getByText('Finish all sections')).toBeVisible({ timeout: 10_000 })
    await shot(page, 'detail-submit-incomplete-gate')
    await page.getByRole('button', { name: /^got it$/i }).click()
    await expect(page.getByText('Finish all sections')).toBeHidden({ timeout: 10_000 })

    // ── Version picker popover (document history) ──────────────────────────
    await page.getByRole('button', { name: /^Version:/ }).click()
    await expect(page.getByText('Document History')).toBeVisible({ timeout: 10_000 })
    await shot(page, 'detail-version-picker')
    await page.keyboard.press('Escape')

    // ── Training tab (panel-mode tab on the detail layout) ─────────────────
    await page.getByRole('tab', { name: 'Training' }).click()
    await expect(page.getByRole('tab', { name: 'Training' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await shot(page, 'detail-training-tab')
    await page.getByRole('tab', { name: 'Content' }).click()
    await expect(page.getByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true')

    // ── Overflow ("More actions") menu ─────────────────────────────────────
    await page.getByRole('button', { name: /more actions/i }).click()
    await expect(page.getByRole('menuitem', { name: /audit log/i })).toBeVisible({ timeout: 10_000 })
    await shot(page, 'detail-more-actions-menu')

    // ── Audit Log dialog ───────────────────────────────────────────────────
    await page.getByRole('menuitem', { name: /audit log/i }).click()
    await expect(page.getByText(new RegExp(`Audit Log — ${title}`))).toBeVisible({ timeout: 15_000 })
    await shot(page, 'detail-audit-log')
    await page.keyboard.press('Escape')

    // ── Revision History dialog ────────────────────────────────────────────
    await page.getByRole('button', { name: /more actions/i }).click()
    await page.getByRole('menuitem', { name: /revision history/i }).click()
    await expect(page.getByText('Revision History').first()).toBeVisible({ timeout: 15_000 })
    await shot(page, 'detail-revision-history')
    await page.keyboard.press('Escape')

    // ── Collaboration: add a collaborator, then post a chat message ────────
    await page.getByRole('button', { name: 'Add collaborator' }).click()
    await page.getByRole('button', { name: /Rita Reviewer/i }).click()
    await waitForSqlValue(
      `SELECT 1 FROM users_on_documents
         WHERE document_id = '${doc.id}' AND user_id = '${USERS.reviewer.id}'`,
      { timeoutMs: 20_000, label: 'collaborator row' },
    )
    const composer = page.getByPlaceholder('Type a message...')
    await expect(composer).toBeVisible({ timeout: 20_000 })
    await shot(page, 'detail-collaborators')

    const msg = `Screenshot chat ping ${Date.now()}`
    await composer.fill(msg)
    await composer.press('Enter')
    await expect(page.getByText(msg).first()).toBeVisible({ timeout: 20_000 })
    await shot(page, 'detail-collaboration-chat')

    // ── Printable view (opens in a popup) ──────────────────────────────────
    const [printPage] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Print', exact: true }).first().click(),
    ])
    await printPage.waitForLoadState('domcontentloaded')
    await expect(printPage.locator('.doc-print-body')).toBeVisible({ timeout: 45_000 })
    await shot(printPage, 'detail-print-view')
    await printPage.close()

    await ctx.close()
  })
})
