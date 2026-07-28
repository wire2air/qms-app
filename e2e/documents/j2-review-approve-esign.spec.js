// PW-J2 — Review + e-signed approval → EFFECTIVE (TC-04/05). The P0 journey:
// author submits, the assigned reviewer completes the ACTION step (comment
// required), the approver approves with an e-signature PIN, the version goes
// EFFECTIVE, a signatures row is written and the worker generates the
// hash-anchored snapshot.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ESIGN_PIN, USERS } from '../fixtures/cast.js'
import { createSopDocument, fillAllSections, submitForReview, uniqueTitle } from '../fixtures/documents.js'
import { findDocumentByTitle, versionsOf, sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.describe('PW-J2 · review → e-signed approval → effective', () => {
  test('full approval chain with e-signature and snapshot', async ({ browser }) => {
    test.setTimeout(300_000)

    // ── Author (Priya): create, fill, submit ────────────────────────────────
    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await authorCtx.newPage()
    const title = uniqueTitle('J2-approve')
    await createSopDocument(authorPage, title)
    const created = findDocumentByTitle(title)
    await fillAllSections(authorPage, created.id)
    // Each step's role has exactly one member (step 1 → Rita, step 2 → Adam),
    // so first-candidate selection is deterministic.
    await submitForReview(authorPage)

    const doc = findDocumentByTitle(title)
    const [version] = versionsOf(doc.id)
    expect(version.statusId).toBe('IN_REVIEW')
    await authorCtx.close()

    // ── Reviewer (Rita, step 1 ACTION, require_comments) ─────────────────────
    // The ACTION step's advance control is labelled "Approve" (maps to
    // COMPLETE_AND_ADVANCE).
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances WHERE entity_id = '${version.id}'
        AND assigned_to = '${USERS.reviewer.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
      { timeoutMs: 20_000, label: 'reviewer task assigned' },
    )
    const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const reviewerPage = await reviewerCtx.newPage()
    await reviewerPage.goto(`/documents/${doc.id}`)
    const completeBtn = reviewerPage.getByRole('button', { name: /^approve$/i }).first()
    await expect(completeBtn).toBeVisible({ timeout: 20_000 })
    await completeBtn.click()

    // Comment dialog (require_comments) → provide the reason and confirm.
    const reviewDialog = reviewerPage.getByRole('dialog').last()
    if (await reviewDialog.isVisible({ timeout: 4_000 }).catch(() => false)) {
      const commentBox = reviewDialog.locator('textarea, [contenteditable="true"]').first()
      if (await commentBox.isVisible().catch(() => false)) {
        await commentBox.click()
        await reviewerPage.keyboard.type('Reviewed by E2E — technically accurate.')
      }
      await reviewDialog
        .getByRole('button', { name: /approve|complete|submit|confirm|advance/i })
        .last()
        .click()
    }

    // Step 2 task must now exist for the approver.
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances ti
        WHERE ti.entity_id = '${version.id}' AND ti.assigned_to = '${USERS.approver.id}'
          AND ti.deleted_at IS NULL AND ti.status_id NOT IN ('CANCELLED')`,
      { timeoutMs: 30_000, label: 'approver task created' },
    )
    await reviewerCtx.close()

    // ── Approver (Rajesh): approve with e-sign PIN ──────────────────────────
    const approverCtx = await browser.newContext({ storageState: AUTH.approver })
    const approverPage = await approverCtx.newPage()
    await approverPage.goto(`/documents/${doc.id}`)

    const approveBtn = approverPage.getByRole('button', { name: /^approve$/i }).first()
    await expect(approveBtn).toBeVisible({ timeout: 20_000 })
    await approveBtn.click()

    // E-signature dialog ("Sign with your PIN"): anchor on the PIN input
    // directly (the headlessui dialog wrapper reports zero-size/hidden).
    const pinInput = approverPage.getByPlaceholder('Enter your e-signature PIN')
    await expect(pinInput).toBeVisible({ timeout: 10_000 })
    await pinInput.fill(ESIGN_PIN)
    await approverPage.getByRole('button', { name: 'Sign' }).click()

    // ── Outcome: EFFECTIVE + signature + snapshot ───────────────────────────
    await expect(approverPage.getByText(/effective/i).first()).toBeVisible({ timeout: 30_000 })

    const statusAfter = await waitForSqlValue(
      `SELECT status_id FROM document_versions WHERE id = '${version.id}' AND status_id = 'EFFECTIVE'`,
      { timeoutMs: 30_000, label: 'version EFFECTIVE' },
    )
    expect(statusAfter).toBe('EFFECTIVE')

    const signatures = sqlValue(
      `SELECT count(*) FROM signatures WHERE user_id = '${USERS.approver.id}' AND payload_hash IS NOT NULL
        AND created_at > NOW() - interval '10 minutes'`,
    )
    expect(Number(signatures), 'an e-signature row was written').toBeGreaterThanOrEqual(1)

    // Worker generates the immutable snapshot (Puppeteer) — poll for the hash.
    const sha = await waitForSqlValue(
      `SELECT snapshot_sha256 FROM document_versions WHERE id = '${version.id}'`,
      { timeoutMs: 120_000, label: 'snapshot sha256 stamped' },
    )
    expect(sha).toMatch(/^[0-9a-f]{64}$/)

    // The UI surfaces the audit snapshot in the rail.
    await approverPage.reload()
    await expect(approverPage.getByText(/audit snapshot/i).first()).toBeVisible({ timeout: 20_000 })

    await approverCtx.close()
  })
})
