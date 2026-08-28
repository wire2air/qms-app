// PW-J1 · Owner: create → draft → open (submit) (TC-01/04/05)
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { createCapa, openCapa, uniqueTitle } from '../fixtures/capas.js'
import { findCapaByTitle, sqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J1 · owner creates a CAPA, it opens for review', () => {
  test('create CAPA (DRAFT) → Start CAPA (OPEN), workflow instantiated', async ({ page }) => {
    const title = uniqueTitle('J1')
    // ~~prefix = 'CAPA-HQ-QA'~~ — CAPA numbering went FLAT (capa/21). The number
    // is no longer scoped by site and department, so the counter row this
    // journey has to watch is the bare `CAPA` prefix. The old row still exists
    // (frozen at 367) and would have satisfied `counterAfter > counterBefore`
    // never — it stopped moving the day the format changed.
    const COUNTER_PREFIX = 'CAPA'
    const counterBefore = Number(
      sqlValue(
        `SELECT current_value FROM capa_counters WHERE company_id = 'e2e00001-0000-4000-8000-000000000001' AND prefix = '${COUNTER_PREFIX}'`,
      ) || 0,
    )

    await createCapa(page, title)

    const capa = findCapaByTitle(title)
    expect(capa, 'CAPA row exists').toBeTruthy()
    expect(capa.statusId).toBe('DRAFT')
    expect(capa.capaNumber).toMatch(/^CAPA-\d{3,}$/)
    await expect(page.getByText(capa.capaNumber).first()).toBeVisible()

    const counterAfter = Number(
      sqlValue(
        `SELECT current_value FROM capa_counters WHERE company_id = 'e2e00001-0000-4000-8000-000000000001' AND prefix = '${COUNTER_PREFIX}'`,
      ) || 0,
    )
    expect(counterAfter, 'counter incremented').toBeGreaterThan(counterBefore)

    await openCapa(page, capa.id)

    const statusAfterOpen = sqlValue(`SELECT status_id FROM capas WHERE id = '${capa.id}'`)
    expect(statusAfterOpen).toBe('OPEN')

    const wfInstanceCount = sqlValue(
      `SELECT count(*) FROM workflow_instances WHERE resource_type = 'Capa' AND resource_id = '${capa.id}'`,
    )
    expect(Number(wfInstanceCount)).toBeGreaterThan(0)

    const stepCount = sqlValue(`
      SELECT count(*) FROM workflow_instance_steps wis
      JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capa.id}'
    `)
    expect(Number(stepCount), 'workflow steps created').toBeGreaterThan(0)

    const taskCount = sqlValue(
      `SELECT count(*) FROM task_instances WHERE entity_type = 'Capa' AND entity_id = '${capa.id}' AND status_id = 'ASSIGNED'`,
    )
    expect(Number(taskCount), 'first task assigned').toBeGreaterThan(0)

    const pendingReviewers = sqlValue(`SELECT pending_reviewers::text FROM capas WHERE id = '${capa.id}'`)
    expect(pendingReviewers).toBe('{}')

    // The submit is audited by the table trigger as an attributed UPDATE (the
    // bespoke SUBMIT_FOR_REVIEW action row was retired with the audit-trigger
    // consolidation) — what matters is that the status flip is attributable.
    const auditRows = sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capas' AND entity_id = '${capa.id}' AND action = 'UPDATE' AND performed_by IS NOT NULL`,
    )
    expect(Number(auditRows), 'attributed UPDATE audit row exists for this CAPA').toBeGreaterThan(0)
  })
})
