// TASK-T1 — a workflow raises a task, the inbox shows it, and the row links to
// the RECORD rather than to a task page.
//
// The module's structural fact, made executable. `taskInstancesTable.vue` reads
// `db.TaskInstance.where('assignedTo', userId)` and nothing else — there is no
// "all tasks" view, no assignee filter, and no `/task-instances/:id` route at
// all (`src/utils/taskRoute.js` deep-links every row to its host entity, and its
// own docstring says that path 404s). So the one thing this journey has to
// prove, before any security probe means anything, is that the pipeline works
// end to end: a real workflow mints a real row, the assignee's inbox renders it,
// and clicking it lands on the CAPA.
//
// The DB assertions alongside are the module's three side-effects — the row, the
// notification and the audit event. The audit one is not decoration: HIGH-6
// claimed nine worker producers minted tasks with no trail at all, and that
// finding died on 2026-08-17 (commit 7fde4014) without anything in the test
// suite noticing either way. The tenant-wide invariant at the end is the cheapest
// regression gate for the whole worker-GUC class.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  gotoInbox,
  inboxRow,
  mintCapaTask,
  taskRow,
  uniqueTag,
} from '../fixtures/tasks.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

test.describe('TASK-T1 — the inbox row, and where it goes', () => {
  test('a CAPA workflow task reaches its assignee’s inbox and links to the CAPA', async ({
    browser,
  }) => {
    test.setTimeout(300_000)

    // ── Mint (author) ───────────────────────────────────────────────────────
    const authorPage = await pool.page(browser, AUTH.author)
    const capa = await mintCapaTask(authorPage, uniqueTag('T1'))

    // ── The row itself ──────────────────────────────────────────────────────
    const row = taskRow(capa.taskId)
    expect(row.statusId, 'a task is born ASSIGNED — the column default and the only').toBe(
      'ASSIGNED',
    )
    expect(row.completedAt, 'and is not born completed').toBeNull()
    expect(row.assignedTo).toBe(USERS.reviewer.id)
    expect(row.entityType).toBe('Capa')
    expect(row.entityId).toBe(capa.capaId)

    // ── The notification (send_task_assigned_notification) ──────────────────
    await waitForSqlValue(
      `SELECT 1 FROM notifications
        WHERE notification_type_id = 'TASK_ASSIGNED'
          AND resource_type = 'TaskInstance' AND resource_id = '${capa.taskId}'
          AND user_id = '${USERS.reviewer.id}'`,
      { timeoutMs: 60_000, label: 'TASK_ASSIGNED notification for the reviewer' },
    )

    // ── The audit event ─────────────────────────────────────────────────────
    // `performed_by` is asserted NON-NULL here specifically because NULL is a
    // legitimate value on this table for cron-minted tasks (the system actor).
    // A workflow step raised by a user action is not one of those, so a NULL
    // here would mean the actor GUC was lost on the way — which is the exact
    // shape of the defect HIGH-6 described.
    await waitForSqlValue(
      `SELECT 1 FROM audit_logs
        WHERE entity_type = 'TaskInstances' AND entity_id = '${capa.taskId}'
          AND action = 'CREATE' AND performed_by IS NOT NULL`,
      { timeoutMs: 60_000, label: 'CREATE audit row with an attributed actor' },
    )

    // ── The inbox (reviewer) ────────────────────────────────────────────────
    const reviewerPage = await pool.page(browser, AUTH.reviewer)
    await gotoInbox(reviewerPage)

    // The list opens on the ASSIGNED filter by default (taskInstancesHome.vue),
    // which is where a freshly-minted task lives.
    const link = inboxRow(reviewerPage, capa.title)
    await expect(link.first()).toBeVisible({ timeout: 60_000 })
    await expect(link.first(), 'the CAPA number is the row subtitle').toContainText(
      capa.capaNumber,
    )
    const rowText = reviewerPage.getByRole('row').filter({ hasText: capa.title }).first()
    await expect(rowText, 'entity type column').toContainText('CAPA')
    await expect(rowText, 'and the status badge').toContainText(/assigned/i)

    // ── A task is not a page ────────────────────────────────────────────────
    // Asserted on the href rather than only by clicking, because the negative is
    // the interesting half: there is no task detail route to land on, and an
    // href that pointed at one would be a dead link the click test could not
    // distinguish from a slow navigation.
    const href = await link.first().getAttribute('href')
    expect(href, 'the row deep-links to the host record').toBe(`/capas/${capa.capaId}`)
    expect(href, 'and never to a task detail page').not.toContain('task-instances')

    await link.first().click()
    await expect(reviewerPage).toHaveURL(new RegExp(`/capas/${capa.capaId}`), { timeout: 45_000 })
  })

  test('every task in the tenant carries a CREATE audit row', async () => {
    // The single best regression gate for the whole worker-GUC class, and the
    // one assertion here that is about the module rather than about this run.
    //
    // 142 rows in `app-db` have no CREATE event; every one of them was created
    // on or before 2026-08-11, before the `if (payload.user_id)` gate came out
    // of `audit_event.js`. They are historical residue, not an open hole — so
    // the invariant is asserted from that date forward rather than over the
    // whole table, which would fail forever on rows nothing can now fix.
    const orphans = sqlValue(`
      SELECT count(*) FROM task_instances ti
       WHERE ti.created_at > '2026-08-17'
         AND NOT EXISTS (
           SELECT 1 FROM audit_logs al
            WHERE al.entity_type = 'TaskInstances' AND al.entity_id = ti.id
              AND al.action = 'CREATE')`)
    expect(
      Number(orphans),
      'a task created since the audit fix must leave a CREATE row (HIGH-6)',
    ).toBe(0)
  })
})
