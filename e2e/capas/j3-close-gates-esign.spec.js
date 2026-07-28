// PW-J3 · Owner closes with e-signature (TC-10) — P0.
// CAPA's close gate is thinner than NCR's 5-gate walk: the controller
// (backend/api/controllers/capas.js closeCapa) enforces exactly 2 —
// open workflow steps, and a valid (future) effectiveness-check date. The
// UI's action-bar "Close CAPA" button only ever surfaces gate 1: the EC-date
// ref defaults to a valid 90-day-out value at component mount (CapasPageId.vue
// closeEcPresetDays = ref(90)), not just when the dialog opens, so
// closeDisabledReason's "Pick an effectiveness check date" branch is
// unreachable through the UI. Gate 2 is still real at the API layer, so it's
// asserted directly against the endpoint below.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import {
  createCapa,
  openCapa,
  completeReviewerStep,
  completeApproverStep,
  closeCapa,
  closeBlockedReason,
  expectCloseRejected,
  uniqueTitle,
} from '../fixtures/capas.js'
import { findCapaByTitle, sqlValue, sqlRow, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J3 · Approve & Close — the open-steps gate, then e-signed close', () => {
  test('the open-steps gate blocks in turn; completing steps unblocks close', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000)

    const title = uniqueTitle('J3')
    await createCapa(page, title)
    const capa = findCapaByTitle(title)
    await openCapa(page, capa.id)

    // Gate 1 — open steps (workflow just started, nothing complete yet).
    await expect(page.getByRole('button', { name: 'Close CAPA' })).toBeVisible({ timeout: 15_000 })
    await expect
      .poll(() => closeBlockedReason(page), { timeout: 15_000 })
      .toMatch(/workflow step.*still open/i)
    await expectCloseRejected(page, capa.id, /workflow step.*still open/i)

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
    await page.reload({ waitUntil: 'domcontentloaded' })

    // All gates satisfied — the button enables (title tooltip clears).
    await expect
      .poll(() => closeBlockedReason(page), { timeout: 20_000 })
      .toBeFalsy()

    await closeCapa(page, { comments: 'E2E close — corrective action verified.' })

    await waitForSqlValue(
      `SELECT count(*) FROM capas WHERE id = '${capa.id}' AND status_id = 'CLOSED'`,
      { timeoutMs: 30_000, label: 'CAPA CLOSED' },
    )

    // Effectiveness check auto-scheduled by close, ~90 days out (default preset).
    const ecRow = sqlRow(
      `SELECT status_id, due_at > NOW() + INTERVAL '80 days' FROM capa_effectiveness_checks WHERE capa_id = '${capa.id}'`,
    )
    expect(ecRow[0]).toBe('PENDING')
    expect(ecRow[1]).toBe('t')

    // Part-11 signature — exactly one row, subject = this CAPA, meaning CLOSED.
    const sigCount = sqlValue(
      `SELECT count(*) FROM signatures WHERE capa_id = '${capa.id}' AND meaning = 'CLOSED'`,
    )
    expect(Number(sigCount), 'one CLOSED signature row for this CAPA').toBe(1)

    // Attributed CLOSE audit row.
    const auditRow = sqlRow(
      `SELECT performed_by, new_value_json::text FROM audit_logs WHERE entity_type = 'Capa' AND entity_id = '${capa.id}' AND action = 'CLOSE'`,
    )
    expect(auditRow, 'CLOSE audit row exists').toBeTruthy()
    expect(auditRow[0]).toBeTruthy()
    expect(auditRow[1]).toContain('corrective action verified')
  })

  test('a past effectiveness-check date is rejected 400 (gate 2, API-only — unreachable via the UI)', async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000)
    const title = uniqueTitle('J3-pastdate')
    await createCapa(page, title)
    const capa = findCapaByTitle(title)
    await openCapa(page, capa.id)

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

    const res = await page.request.post(`/api/v1/services/capas/${capa.id}/close`, {
      data: {
        effectivenessCheckAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        comments: 'E2E gate probe — past date',
        method: 'PIN',
        token: '12345678',
        provider: null,
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json().catch(() => null)
    expect(body?.error?.message ?? '').toMatch(/must be in the future/i)

    const stillPending = sqlValue(`SELECT 1 FROM capas WHERE id = '${capa.id}' AND status_id = 'PENDING'`)
    expect(stillPending, 'rejected close must not mutate status').toBe('1')
  })
})
