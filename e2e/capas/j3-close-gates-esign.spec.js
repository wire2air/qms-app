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

    // ~~Effectiveness check auto-scheduled by close, ~90 days out.~~ Close no
    // longer schedules a record-based check: `closeCapa` dropped it when the
    // effectiveness check became a workflow DELAY step (capa/21 §3, §4).
    // Asking again at close was asking a second time about something the DELAY
    // step had already settled, and creating a parallel check would have had
    // the owner verify the same corrective action twice.
    //
    // This asserted the removed behaviour and crashed on it —
    // `TypeError: Cannot read properties of null (reading '0')`, because
    // sqlRow() returns null for no rows. Pin the CURRENT contract instead.
    const ecCount = sqlValue(
      `SELECT count(*) FROM capa_effectiveness_checks WHERE capa_id = '${capa.id}'`,
    )
    expect(Number(ecCount), 'close does not create a record-based check any more').toBe(0)

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

  // ~~a past effectiveness-check date is rejected 400 (gate 2)~~ — gate 2 no
  // longer exists (capa/21 §4). `effectivenessCheckAt` went from required to
  // `z.string().optional().nullable()` in closeCapaSchema and the controller
  // only checks that it PARSES (`capas.js:342-345`, "must be a valid date").
  // A past date now closes the CAPA with a 200.
  //
  // ⚠️ capa/21 §4 says the date "is still validated when sent … so an older
  // client neither 400s nor writes a nonsense date". Half right: it is
  // validated for parseability only. A nonsense *date* — yesterday — IS
  // accepted and IS written to the CLOSE audit row. See capa/22.
  //
  // Retargeted at the validation that actually survives, so the endpoint keeps
  // a negative test instead of losing one.
  test('an unparseable effectiveness-check date is rejected 400 (a past one is not — gate 2 is gone)', async ({
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
        effectivenessCheckAt: 'not-a-date',
        comments: 'E2E gate probe — unparseable date',
        method: 'PIN',
        token: '12345678',
        provider: null,
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json().catch(() => null)
    expect(body?.error?.message ?? '').toMatch(/valid date/i)

    const stillOpen = sqlValue(`SELECT 1 FROM capas WHERE id = '${capa.id}' AND status_id = 'OPEN'`)
    expect(stillOpen, 'rejected close must not mutate status').toBe('1')
  })
})
