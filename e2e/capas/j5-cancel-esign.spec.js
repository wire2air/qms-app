// PW-J5 · Cancel with e-signature (TC-11).
//
// Doc14 describes cancel as available on a "DRAFT/PENDING" CAPA — true at the
// controller (backend/api/controllers/capas.js cancelCapa only rejects
// CLOSED/CANCELLED), but the action-bar "Cancel CAPA" button is gated
// `statusId === 'PENDING'` only (capaDetailConfig.js buildCapaActions) — a
// DRAFT CAPA has no UI path to cancel, just Delete. This journey exercises
// the PENDING path the UI actually offers; the DRAFT gap is a product
// question (intentional — Delete already covers DRAFT removal — or a miss),
// not something this suite can paper over with an API-only workaround.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import {
  createCapa,
  openCapa,
  cancelCapa,
  completeReviewerStep,
  completeApproverStep,
  uniqueTitle,
} from '../fixtures/capas.js'
import { findCapaByTitle, sqlValue, sqlRow, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J5 · cancel a PENDING CAPA', () => {
  test('owner cancels a PENDING CAPA — workflow aborted, e-signed', async ({ page }) => {
    test.setTimeout(90_000)
    const title = uniqueTitle('J5')
    await createCapa(page, title)
    const capa = findCapaByTitle(title)
    await openCapa(page, capa.id)

    const wfInstanceIdBefore = sqlValue(
      `SELECT id FROM workflow_instances WHERE resource_type = 'Capa' AND resource_id = '${capa.id}' AND status_id = 'IN_PROGRESS'`,
    )
    expect(wfInstanceIdBefore, 'workflow instance is IN_PROGRESS before cancel').toBeTruthy()

    await cancelCapa(page, { reason: 'E2E cancel — root cause investigation superseded.' })

    await waitForSqlValue(
      `SELECT count(*) FROM capas WHERE id = '${capa.id}' AND status_id = 'CANCELLED'`,
      { timeoutMs: 20_000, label: 'CAPA CANCELLED' },
    )

    const row = sqlRow(`SELECT cancel_reason, cancelled_at IS NOT NULL FROM capas WHERE id = '${capa.id}'`)
    expect(row[0]).toContain('superseded')
    expect(row[1]).toBe('t')

    // The in-progress workflow instance is aborted, not left dangling.
    const wfStatusAfter = sqlValue(`SELECT status_id FROM workflow_instances WHERE id = '${wfInstanceIdBefore}'`)
    expect(wfStatusAfter, 'workflow instance no longer IN_PROGRESS').not.toBe('IN_PROGRESS')

    // Part-11 signature — exactly one row, subject = this CAPA, meaning CANCELLED.
    const sigCount = sqlValue(
      `SELECT count(*) FROM signatures WHERE capa_id = '${capa.id}' AND meaning = 'CANCELLED'`,
    )
    expect(Number(sigCount), 'one CANCELLED signature row for this CAPA').toBe(1)

    // Attributed CANCEL audit row.
    const auditRow = sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capa' AND entity_id = '${capa.id}' AND action = 'CANCEL' AND performed_by IS NOT NULL`,
    )
    expect(Number(auditRow), 'attributed CANCEL audit row exists').toBeGreaterThan(0)

    // Terminal — the Cancel/Close/Open actions are all gone from the action bar.
    await expect(page.getByRole('button', { name: 'Cancel CAPA' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Close CAPA' })).toHaveCount(0)
  })

  test('negative: cancelling an already-CLOSED CAPA is rejected 409', async ({ page, browser }) => {
    test.setTimeout(150_000)
    const title = uniqueTitle('J5-closed')
    await createCapa(page, title)
    const capa = findCapaByTitle(title)
    await openCapa(page, capa.id)

    // Skip straight to CLOSED via the API — this test only cares about the
    // terminal-state guard on cancel, not re-proving the close journey (J3).
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    await completeReviewerStep(browser, capa.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 30_000, label: 'approver task created' },
    )
    await completeApproverStep(browser, capa.id)
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instances WHERE resource_type = 'Capa' AND resource_id = '${capa.id}' AND status_id != 'IN_PROGRESS'`,
      { timeoutMs: 30_000, label: 'workflow finished' },
    )
    const closeRes = await ownerPage.request.post(`/api/v1/services/capas/${capa.id}/close`, {
      data: {
        effectivenessCheckAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        comments: 'E2E setup — J5 terminal-state guard.',
        method: 'PIN',
        token: '12345678',
        provider: null,
      },
    })
    expect(closeRes.ok()).toBeTruthy()
    await ownerCtx.close()

    const res = await page.request.post(`/api/v1/services/capas/${capa.id}/cancel`, {
      data: { reason: 'should be rejected', method: 'PIN', token: '12345678', provider: null },
    })
    expect(res.status()).toBe(409)
    const body = await res.json().catch(() => null)
    expect(body?.error?.message ?? '').toMatch(/already closed/i)
  })
})
