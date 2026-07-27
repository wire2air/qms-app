// PW-J1 · Owner: raise → draft → open (TC-01/04/05)
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'
import { raiseNc, openNc, uniqueTitle } from '../fixtures/nonconformances.js'
import { findNcByTitle, sqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J1 · owner raises an NC, it opens for review', () => {
  test('raise NC (DRAFT) → Open NC (UNDER_REVIEW), workflow instantiated', async ({ page }) => {
    const title = uniqueTitle('J1')
    const counterBefore = Number(
      sqlValue(
        `SELECT current_value FROM nc_counters WHERE company_id = 'e2e00001-0000-4000-8000-000000000001' AND prefix = 'NC-HQ-QA'`,
      ) || 0,
    )

    await raiseNc(page, title)

    const nc = findNcByTitle(title)
    expect(nc, 'NC row exists').toBeTruthy()
    expect(nc.statusId).toBe('DRAFT')
    // \d{3,} — the sequence is zero-padded to 3 but this dev DB accumulates NCs
    // across every run, so it legitimately grows past 999.
    expect(nc.ncNumber).toMatch(/^NC-HQ-QA-\d{3,}$/)
    await expect(page.getByText(nc.ncNumber).first()).toBeVisible()

    const counterAfter = Number(
      sqlValue(
        `SELECT current_value FROM nc_counters WHERE company_id = 'e2e00001-0000-4000-8000-000000000001' AND prefix = 'NC-HQ-QA'`,
      ) || 0,
    )
    expect(counterAfter, 'counter incremented').toBeGreaterThan(counterBefore)

    await openNc(page, nc.id)

    const statusAfterOpen = sqlValue(`SELECT status_id FROM nonconformances WHERE id = '${nc.id}'`)
    expect(statusAfterOpen).toBe('UNDER_REVIEW')

    const wfInstanceCount = sqlValue(
      `SELECT count(*) FROM workflow_instances WHERE resource_type = 'Nonconformance' AND resource_id = '${nc.id}'`,
    )
    expect(Number(wfInstanceCount)).toBeGreaterThan(0)

    const stepCount = sqlValue(`
      SELECT count(*) FROM workflow_instance_steps wis
      JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Nonconformance' AND wi.resource_id = '${nc.id}'
    `)
    expect(Number(stepCount), 'workflow steps created').toBeGreaterThan(0)

    const taskCount = sqlValue(
      `SELECT count(*) FROM task_instances WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}' AND status_id = 'ASSIGNED'`,
    )
    expect(Number(taskCount), 'first task assigned').toBeGreaterThan(0)

    const pendingReviewers = sqlValue(`SELECT pending_reviewers::text FROM nonconformances WHERE id = '${nc.id}'`)
    expect(pendingReviewers).toBe('{}')

    // audit_logs uses the table-derived plural entity_type ('Nonconformances'),
    // distinct from task_instances' singular 'Nonconformance' — verified live.
    const auditRows = sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Nonconformances' AND entity_id = '${nc.id}' AND action = 'UNDER_REVIEW' AND performed_by IS NOT NULL`,
    )
    expect(Number(auditRows), 'attributed UNDER_REVIEW audit row exists for this NC').toBeGreaterThan(0)
  })
})
