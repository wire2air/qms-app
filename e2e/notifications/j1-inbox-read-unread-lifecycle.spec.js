// PW-J1 — Inbox read/unread lifecycle (MTC-01, 02, 03, 05, 06).
//
// docs/modules/notifications/14-playwright-journeys.md names
// documents/j10-collaboration-notifications.spec.js as the closest prior art
// — it drives the exact worker pipeline this journey needs (collaborator add
// -> TASK_ASSIGNED, chat message -> DOCUMENT_MESSAGE) but only ever asserts
// the `notifications` row directly, never opens the bell/panel/inbox UI. This
// spec is that missing UI layer, reusing the same real-flow fixture pattern
// rather than a raw INSERT (see e2e-seed.sql §48 and fixtures/notifications.js
// for why `notifyRecipient` — not `reviewer` — is the target).
//
// TWO CORRECTIONS TO THE ROADMAP DOC, found by reading current code rather
// than assuming the doc: (1) its suggested "unrouted" fixture,
// resourceType='Nonconformance', is no longer unrouted — notificationRoutes.js
// registers it. `AnalyticsWidget` is the type deliberately left unregistered
// today. (2) clicking an unrouted notification does NOT no-op as the doc
// claims — NotificationsItem.vue's fallbackTarget() still navigates, to
// /analytics/dashboards or /notifications depending on the canonical type.
// Both assertions below are written against the CURRENT behaviour, not the
// doc's.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { createSopDocument, uniqueTitle } from '../fixtures/documents.js'
import { findDocumentByTitle, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { purgeAllNotificationsFor, insertUnroutedNotification } from '../fixtures/notifications.js'

const UNROUTED_TITLE = `E2E J1 Unrouted Notification ${Date.now()}`
const UNROUTED_ID = 'e2eee000-0000-4000-8000-0000000000f1'

function unreadCountOf(userId) {
  return sqlValue(
    `SELECT count(*) FROM notifications WHERE user_id = '${userId}' AND is_read = false AND deleted_at IS NULL`,
  )
}

test.describe('PW-J1 · Notifications inbox read/unread lifecycle', () => {
  test.beforeAll(() => purgeAllNotificationsFor(USERS.notifyRecipient.id))
  test.afterAll(() => purgeAllNotificationsFor(USERS.notifyRecipient.id))

  test('bell badge, panel preview, click-to-read+navigate, mark-all-read, All/Unread tabs, unrouted fallback', async ({
    browser,
  }) => {
    test.setTimeout(180_000)

    // ── Seed two REAL notifications for notifyRecipient (never used by any
    // other suite, so its inbox starts genuinely empty) ─────────────────────
    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await authorCtx.newPage()
    const title = uniqueTitle('NTF-J1')
    await createSopDocument(authorPage, title)
    const doc = findDocumentByTitle(title)

    await authorPage.goto(`/documents/${doc.id}`)
    await authorPage.getByRole('button', { name: 'Add collaborator' }).click()
    await authorPage.getByRole('button', { name: /Nina NotifyRecipient/i }).click()
    // The join row first (mirrors documents/j10) — narrows a failure here to
    // "the UI add never landed" vs. "the worker never raised the task",
    // rather than one timeout that could mean either.
    await waitForSqlValue(
      `SELECT 1 FROM users_on_documents WHERE document_id = '${doc.id}' AND user_id = '${USERS.notifyRecipient.id}'`,
      { timeoutMs: 15_000, label: 'collaborator (users_on_documents) row' },
    )
    // Then the worker-raised REVIEW task's notification (resourceType=TaskInstance).
    await waitForSqlValue(
      `SELECT 1 FROM notifications WHERE user_id = '${USERS.notifyRecipient.id}' AND notification_type_id = 'TASK_ASSIGNED'`,
      { timeoutMs: 45_000, label: 'TASK_ASSIGNED notification for notifyRecipient' },
    )

    const msg1 = `E2E notify ping one ${Date.now()}`
    const msg2 = `E2E notify ping two ${Date.now()}`
    const composer = authorPage.getByPlaceholder('Type a message...')
    await expect(composer).toBeVisible({ timeout: 15_000 })
    await composer.fill(msg1)
    await composer.press('Enter')
    await waitForSqlValue(
      `SELECT 1 FROM notifications WHERE user_id = '${USERS.notifyRecipient.id}'
         AND notification_type_id = 'DOCUMENT_MESSAGE' AND resource_id = '${doc.id}'
         AND message LIKE '%${msg1}%'`,
      { timeoutMs: 45_000, label: 'first DOCUMENT_MESSAGE notification' },
    )
    await composer.fill(msg2)
    await composer.press('Enter')
    await waitForSqlValue(
      `SELECT 1 FROM notifications WHERE user_id = '${USERS.notifyRecipient.id}'
         AND notification_type_id = 'DOCUMENT_MESSAGE' AND resource_id = '${doc.id}'
         AND message LIKE '%${msg2}%'`,
      { timeoutMs: 45_000, label: 'second DOCUMENT_MESSAGE notification' },
    )
    await authorCtx.close()
    expect(unreadCountOf(USERS.notifyRecipient.id)).toBe('3')

    // ── notifyRecipient's session ────────────────────────────────────────
    const ctx = await browser.newContext({ storageState: AUTH.notifyRecipient })
    const page = await ctx.newPage()
    try {
      await page.goto('/dashboard')
      const bell = page.getByRole('button', { name: 'Notifications' })
      await expect(bell.locator('span')).toHaveText('3', { timeout: 20_000 })

      // ── Panel: header, preview, Mark all read control ──────────────────
      await bell.click()
      await expect(page.getByText('Notifications', { exact: true })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('button', { name: 'Mark all read', exact: true })).toBeVisible()
      await expect(page.getByText(msg1)).toBeVisible()
      await expect(page.getByText(msg2)).toBeVisible()

      // ── Click one item: marks read AND navigates (routed: Document) ────
      await page.getByText(msg2).click()
      await expect(page).toHaveURL(new RegExp(`/documents/${doc.id}$`), { timeout: 20_000 })
      await expect
        .poll(
          () =>
            sqlValue(
              `SELECT is_read::text FROM notifications
                 WHERE user_id = '${USERS.notifyRecipient.id}' AND message LIKE '%${msg2}%'`,
            ),
          { timeout: 15_000, message: 'clicked notification marked read' },
        )
        .toBe('true')
      expect(unreadCountOf(USERS.notifyRecipient.id)).toBe('2')

      // ── Mark all read from the panel ────────────────────────────────────
      await bell.click()
      await page.getByRole('button', { name: 'Mark all read', exact: true }).click()
      await expect
        .poll(() => unreadCountOf(USERS.notifyRecipient.id), { timeout: 15_000, message: 'all read' })
        .toBe('0')
      await expect(bell.locator('span')).toHaveCount(0, { timeout: 10_000 })

      // ── Full inbox page: All/Unread tabs ────────────────────────────────
      await page.goto('/notifications')
      await expect(page.getByRole('tab', { name: 'All' })).toBeVisible({ timeout: 15_000 })
      await page.getByRole('tab', { name: 'Unread' }).click()
      await expect(page.getByText('No unread notifications')).toBeVisible({ timeout: 10_000 })
      await page.getByRole('tab', { name: 'All' }).click()
      await expect(page.getByText(msg1)).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(msg2)).toBeVisible()

      // ── Unrouted fallback regression pin ────────────────────────────────
      // AnalyticsWidget has no registered RESOURCE_ROUTES entry; clicking it
      // must land on /analytics/dashboards (fallbackTarget's Analytics* branch),
      // not no-op as the roadmap doc's stale claim would have it.
      insertUnroutedNotification({
        id: UNROUTED_ID,
        companyId: COMPANY_ID,
        userId: USERS.notifyRecipient.id,
        title: UNROUTED_TITLE,
      })
      // Generous: `notifications` is directly logically-replicated (see
      // fixtures/notifications.js's header comment), so a raw-SQL insert
      // still reaches the live bell via replication -> sync broadcast -> IDB
      // write — that path has a beat of lag a same-session mutation doesn't.
      await expect(page.getByText(UNROUTED_TITLE)).toBeVisible({ timeout: 45_000 })
      await page.getByText(UNROUTED_TITLE).click()
      await expect(page).toHaveURL(/\/analytics\/dashboards$/, { timeout: 20_000 })
      await expect
        .poll(
          () => sqlValue(`SELECT is_read::text FROM notifications WHERE id = '${UNROUTED_ID}'`),
          { timeout: 15_000, message: 'unrouted notification marked read on click' },
        )
        .toBe('true')
    } finally {
      await ctx.close()
    }
  })
})
