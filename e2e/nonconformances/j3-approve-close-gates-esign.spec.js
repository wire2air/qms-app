// PW-J3 · Owner approves & closes with the 5 gates (TC-09) — P0.
// Walks every gate the controller checks (nonconformances.js markNcComplete,
// in the same order the computed markCompleteBlockedReason evaluates them):
// open steps -> disposition -> disposition notes -> CAPA-required -> cost.
//
// Each gate is asserted at BOTH layers, because they are enforced twice and
// independently:
//   • UI    — markCompleteBlockedReason() disables the button + explains why.
//   • API   — expectMarkCompleteRejected() POSTs the real endpoint and asserts
//             the server's own 409. Without this half, deleting the entire
//             controller gate block would leave this journey green while a
//             direct API caller could close an NC with no disposition.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, FIXTURES } from '../fixtures/cast.js'
import {
  raiseNc,
  completeReviewerStep,
  completeApproverStep,
  fillDisposition,
  approveAndClose,
  markCompleteBlockedReason,
  expectMarkCompleteRejected,
  uniqueTitle,
} from '../fixtures/nonconformances.js'
import { findNcByTitle, sqlValue, sqlRow, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J3 · Approve & Close — all 5 gates, then e-signed close', () => {
  test('every gate blocks in turn with its specific reason; satisfying all closes the NC', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000)

    const title = uniqueTitle('J3')
    await raiseNc(page, title)
    const nc = findNcByTitle(title)

    // Gate 1 — open steps (workflow just started, nothing complete yet).
    await expect(page.getByRole('button', { name: 'Approve & Close' })).toBeVisible({ timeout: 15_000 })
    await expect
      .poll(() => markCompleteBlockedReason(page), { timeout: 15_000 })
      .toMatch(/workflow step.*still open/i)
    await expectMarkCompleteRejected(page, nc.id, /workflow step.*still open/i)

    await completeReviewerStep(browser, nc.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 30_000, label: 'approver task created' },
    )
    await completeApproverStep(browser, nc.id)
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instances WHERE resource_type = 'Nonconformance' AND resource_id = '${nc.id}' AND status_id != 'IN_PROGRESS'`,
      { timeoutMs: 30_000, label: 'workflow finished' },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })

    // Gate 2 — no disposition picked yet.
    await expect
      .poll(() => markCompleteBlockedReason(page), { timeout: 20_000 })
      .toMatch(/pick a disposition/i)
    // Server wording differs from the UI's ("Pick a Disposition…") — proof these
    // are two independent checks, not the same string surfaced twice.
    await expectMarkCompleteRejected(page, nc.id, /disposition is required/i)

    // Rework tracks cost — picked deliberately so gate 5 is exercised below.
    await fillDisposition(page, nc.id, { disposition: FIXTURES.ncrDispositionCost })

    // Gate 3 — disposition notes required.
    await expect
      .poll(() => markCompleteBlockedReason(page), { timeout: 15_000 })
      .toMatch(/disposition notes are required/i)
    await expectMarkCompleteRejected(page, nc.id, /disposition notes are required/i)

    await fillDisposition(page, nc.id, { notes: 'E2E disposition — reworked per SOP-9, retested OK.' })

    // Gate 4 — CAPA required set to Yes with none linked (takes priority over
    // the still-unmet cost gate in the controller's check order).
    await fillDisposition(page, nc.id, { capaRequired: true })
    await waitForSqlValue(
      `SELECT count(*) FROM nonconformances WHERE id = '${nc.id}' AND capa_required = true`,
      { timeoutMs: 15_000, label: 'capaRequired=true persisted' },
    )
    await expect
      .poll(() => markCompleteBlockedReason(page), { timeout: 15_000 })
      .toMatch(/capa required is set to yes/i)
    await expectMarkCompleteRejected(page, nc.id, /capa required is set to yes/i)

    // Turn it back off — no CAPA is actually being linked in this journey.
    await fillDisposition(page, nc.id, { capaRequired: false })
    await waitForSqlValue(
      `SELECT count(*) FROM nonconformances WHERE id = '${nc.id}' AND capa_required = false`,
      { timeoutMs: 15_000, label: 'capaRequired=false persisted' },
    )

    // Gate 5 — cost of NC required (Rework tracks cost).
    await expect
      .poll(() => markCompleteBlockedReason(page), { timeout: 15_000 })
      .toMatch(/cost of nc is required/i)
    await expectMarkCompleteRejected(page, nc.id, /cost of nc is required/i)

    await fillDisposition(page, nc.id, { costOfNc: 275.5 })

    // All gates satisfied.
    await expect
      .poll(() => markCompleteBlockedReason(page), { timeout: 15_000 })
      .toBeNull()

    await approveAndClose(page, { comments: 'E2E close — all gates satisfied.' })

    await waitForSqlValue(
      `SELECT count(*) FROM nonconformances WHERE id = '${nc.id}' AND status_id = 'CLOSED'`,
      { timeoutMs: 30_000, label: 'NC CLOSED' },
    )

    const row = sqlRow(
      `SELECT disposition_notes, cost_of_nc, capa_required FROM nonconformances WHERE id = '${nc.id}'`,
    )
    expect(row[0]).toContain('reworked per SOP-9')
    expect(Number(row[1])).toBeCloseTo(275.5, 1)
    expect(row[2]).toBe('f')

    // Part-11 signature — exactly one row, subject = this NC, meaning CLOSED.
    const sigCount = sqlValue(
      `SELECT count(*) FROM signatures WHERE nc_id = '${nc.id}' AND meaning = 'CLOSED'`,
    )
    expect(Number(sigCount), 'one CLOSED signature row for this NC').toBe(1)

    // Attributed COMPLETE audit row with the disposition snapshot.
    const auditRow = sqlRow(
      `SELECT performed_by, new_value_json::text FROM audit_logs WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}' AND action = 'COMPLETE'`,
    )
    expect(auditRow, 'COMPLETE audit row exists').toBeTruthy()
    expect(auditRow[0]).toBeTruthy()
    expect(auditRow[1]).toContain('reworked per SOP-9')
  })
})
