// PW-J3 · Owner closes with e-signature (TC-10) — P0.
// One gate since the effectiveness-check retirement: open workflow steps.
// Close no longer schedules a follow-up check — the workflow's DELAY step owns
// effectiveness (see PW-J4) — so this journey pins BOTH halves: the gate
// blocks and then clears, and closing mints NO legacy
// capa_effectiveness_checks row.
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

    // The built-in effectiveness check is retired: closing schedules NOTHING.
    // (The DELAY-step mechanism is the successor — PW-J4 covers it.)
    const ecCount = sqlValue(
      `SELECT count(*) FROM capa_effectiveness_checks WHERE capa_id = '${capa.id}'`,
    )
    expect(Number(ecCount), 'close mints no legacy effectiveness check').toBe(0)

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

  test('a legacy effectivenessCheckAt payload is inert: close succeeds, nothing is scheduled', async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000)
    const title = uniqueTitle('J3-legacyec')
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

    // An old client (or a replayed request) still sending the retired field
    // must not resurrect the legacy scheduler — the close succeeds on its own
    // terms and no capa_effectiveness_checks row appears.
    const res = await page.request.post(`/api/v1/services/capas/${capa.id}/close`, {
      data: {
        effectivenessCheckAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        comments: 'E2E close — legacy field ignored',
        method: 'PIN',
        token: '12345678',
        provider: null,
      },
    })
    expect(res.status(), 'close succeeds; the retired field is ignored').toBe(200)

    const closed = sqlValue(`SELECT 1 FROM capas WHERE id = '${capa.id}' AND status_id = 'CLOSED'`)
    expect(closed, 'CAPA closed').toBe('1')
    const ecCount = sqlValue(
      `SELECT count(*) FROM capa_effectiveness_checks WHERE capa_id = '${capa.id}'`,
    )
    expect(Number(ecCount), 'no legacy check row from the retired field').toBe(0)
  })
})
