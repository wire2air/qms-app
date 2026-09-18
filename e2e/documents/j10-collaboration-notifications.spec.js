// PW-J10 — Collaboration & notifications (NTF pipeline, side-effects).
//   The author adds a collaborator and posts a chat message; both drive the
//   worker notification pipeline. Asserted end-to-end against the DB:
//     - collaborator → users_on_documents row (sync) + a REVIEW TaskInstance
//       (entity_type=Document, source_type=DocumentCollaborator) whose creation
//       rides the task-assigned notification;
//     - chat message → comments row (sync) + a DOCUMENT_MESSAGE notification to
//       the collaborator (worker side-effect).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { createSopDocument, uniqueTitle } from '../fixtures/documents.js'
import { findDocumentByTitle, waitForSqlValue } from '../fixtures/db.js'

test.describe('PW-J10 · collaboration & notifications', () => {
  test('collaborator assignment + chat raise the notification pipeline', async ({ browser }) => {
    test.setTimeout(150_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const title = uniqueTitle('J10-notify')
    await createSopDocument(page, title)
    const doc = findDocumentByTitle(title)

    // ── Add a collaborator (Rita, the reviewer) ─────────────────────────────
    await page.goto(`/documents/${doc.id}`)
    await page.getByRole('button', { name: 'Add collaborator' }).click()
    await page.getByRole('button', { name: /Rita Reviewer/i }).click()

    // The join row is written synchronously by the mutation…
    await waitForSqlValue(
      `SELECT 1 FROM users_on_documents
         WHERE document_id = '${doc.id}' AND user_id = '${USERS.reviewer.id}'`,
      { timeoutMs: 15_000, label: 'collaborator (users_on_documents) row' },
    )
    // …and the worker raises a REVIEW task for them (which rides the
    // task-assigned notification pipeline).
    await waitForSqlValue(
      `SELECT 1 FROM task_instances
         WHERE entity_type = 'Document' AND entity_id = '${doc.id}'
           AND assigned_to = '${USERS.reviewer.id}' AND task_kind_id = 'REVIEW'
           AND source_type = 'DocumentCollaborator'`,
      { timeoutMs: 45_000, label: 'REVIEW task for collaborator' },
    )

    // ── Post a chat message (composer appears once there is a collaborator) ──
    const msg = `E2E chat ping ${Date.now()}`
    const composer = page.getByPlaceholder('Type a message...')
    await expect(composer).toBeVisible({ timeout: 15_000 })
    await composer.fill(msg)
    await composer.press('Enter')

    // The message persists synchronously as a comment…
    await waitForSqlValue(
      `SELECT 1 FROM comments
         WHERE object_id = '${doc.id}' AND body LIKE '%${msg}%' AND deleted_at IS NULL`,
      { timeoutMs: 15_000, label: 'chat comment row' },
    )
    // …and the worker delivers a DOCUMENT_MESSAGE notification to the collaborator.
    await waitForSqlValue(
      `SELECT 1 FROM notifications
         WHERE user_id = '${USERS.reviewer.id}' AND notification_type_id = 'DOCUMENT_MESSAGE'
           AND resource_id = '${doc.id}'`,
      { timeoutMs: 45_000, label: 'DOCUMENT_MESSAGE notification' },
    )
    await ctx.close()
  })
})
