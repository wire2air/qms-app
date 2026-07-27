// PW-J5 · Convert to supplier-facing (TC-13) — owner.
import { test, expect } from '@playwright/test'
import {
  AUTH,
  USERS,
  FIXTURES,
  SUPPLIER_IDS,
  SUPPLIER_PORTAL_USER_ID as SUPPLIER_USER_ID,
} from '../fixtures/cast.js'
import { raiseNc, openNc, convertToSupplierFacing, uniqueTitle } from '../fixtures/nonconformances.js'
import { findNcByTitle, sqlValue, sqlRow, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J5 · convert an internal NC to supplier-facing', () => {
  test('owner converts an UNDER_REVIEW NC — reassignment + banner', async ({ page }) => {
    test.setTimeout(90_000)
    const title = uniqueTitle('J5')
    await raiseNc(page, title)
    const nc = findNcByTitle(title)
    await openNc(page, nc.id)

    await convertToSupplierFacing(page, FIXTURES.ncrSupplierWithPortal)

    await waitForSqlValue(
      `SELECT 1 FROM nonconformances WHERE id = '${nc.id}' AND is_supplier_facing = true LIMIT 1`,
      { timeoutMs: 20_000, label: 'converted to supplier-facing' },
    )
    const ncRow = sqlRow(
      `SELECT is_supplier_facing, supplier_id, status_id FROM nonconformances WHERE id = '${nc.id}'`,
    )
    expect(ncRow[0]).toBe('t')
    expect(ncRow[1]).toBe(SUPPLIER_IDS.withPortal)
    expect(ncRow[2], 'status unchanged by conversion').toBe('UNDER_REVIEW')

    // UI banner. NOTE: a plain reload doesn't reliably pick this up — the
    // controller's own AuditLog.create() for this action uses entityType
    // 'Nonconformance' (singular), unlike this same NC's CREATE/UNDER_REVIEW
    // rows which use the table-derived plural 'Nonconformances'; if the sync
    // service resolves entity_type -> table for the live socket broadcast,
    // that mismatch would silently drop the push (a real gap, flagged
    // separately) and the client's 5-minutes-fresh bootstrap gate then skips
    // a full resync too. Force a genuinely fresh bootstrap past that gate.
    await page.evaluate(async () => {
      localStorage.clear()
      const dbs = await indexedDB.databases()
      await Promise.all(
        dbs.map(
          (d) =>
            new Promise((resolve) => {
              const req = indexedDB.deleteDatabase(d.name)
              req.onsuccess = req.onerror = req.onblocked = () => resolve()
            }),
        ),
      )
    })
    await page.goto(`/nonconformances/${nc.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Supplier-facing/).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('This NC is shared with the supplier.')).toBeVisible()

    // The reviewer's active assignment on the (non-approval) step is parked
    // REASSIGNED, and the supplier user gets a fresh ASSIGNED row + task.
    const reviewerRow = sqlRow(`
      SELECT uowis.status_id FROM users_on_workflow_instance_steps uowis
      JOIN workflow_instance_steps wis ON wis.id = uowis.workflow_instance_step_id
      JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Nonconformance' AND wi.resource_id = '${nc.id}'
        AND uowis.user_id = '${USERS.reviewer.id}'
    `)
    expect(reviewerRow[0]).toBe('REASSIGNED')

    const supplierRow = sqlRow(`
      SELECT uowis.status_id FROM users_on_workflow_instance_steps uowis
      JOIN workflow_instance_steps wis ON wis.id = uowis.workflow_instance_step_id
      JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Nonconformance' AND wi.resource_id = '${nc.id}'
        AND uowis.user_id = '${SUPPLIER_USER_ID}'
    `)
    expect(supplierRow[0]).toBe('ASSIGNED')

    const reviewerTask = sqlRow(
      `SELECT status_id, reassigned_to_user_id FROM task_instances
        WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}' AND assigned_to = '${USERS.reviewer.id}'`,
    )
    expect(reviewerTask[0]).toBe('REASSIGNED')
    expect(reviewerTask[1]).toBe(SUPPLIER_USER_ID)

    const supplierTaskCount = sqlValue(
      `SELECT 1 FROM task_instances
        WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}'
          AND assigned_to = '${SUPPLIER_USER_ID}' AND status_id = 'ASSIGNED' LIMIT 1`,
    )
    expect(supplierTaskCount).toBe('1')
  })

  test('negative: a DRAFT NC rejects conversion', async ({ page }) => {
    const title = uniqueTitle('J5-draft')
    await raiseNc(page, title)
    const nc = findNcByTitle(title)
    expect(nc.statusId).toBe('DRAFT')

    const res = await page.request.post(`/api/v1/services/nonconformances/${nc.id}/convertSupplierFacing`, {
      data: { supplierId: SUPPLIER_IDS.withPortal },
    })
    expect(res.ok(), 'DRAFT NC must reject conversion').toBeFalsy()
    expect([400, 409]).toContain(res.status())
  })

  test('negative: a supplier with no active portal user rejects conversion', async ({ page }) => {
    test.setTimeout(60_000)
    const title = uniqueTitle('J5-noportal')
    await raiseNc(page, title)
    const nc = findNcByTitle(title)
    await openNc(page, nc.id)

    const res = await page.request.post(`/api/v1/services/nonconformances/${nc.id}/convertSupplierFacing`, {
      data: { supplierId: SUPPLIER_IDS.noPortal },
    })
    expect(res.ok(), 'supplier with no portal user must reject conversion').toBeFalsy()
    expect(res.status()).toBe(400)

    const stillInternal = sqlValue(
      `SELECT 1 FROM nonconformances WHERE id = '${nc.id}' AND is_supplier_facing = false LIMIT 1`,
    )
    expect(stillInternal).toBe('1')
  })
})
