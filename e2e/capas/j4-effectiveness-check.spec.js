// PW-J4 · Effectiveness check verify (TC-12) — worker + owner.
//
// Doc14 frames this as continuing from PW-J3's CLOSED CAPA, but journeys in
// this suite are self-contained per spec file (matches documents/nonconformances
// convention) — this test does its own create->open->complete-steps->close
// setup rather than depending on another file's run order.
//
// The close UI's effectiveness-check date is day-granularity and defaults to
// a 90-day-out preset (see fixtures/capas.js closeCapa) — waiting 90 real days
// for the graphile-worker reminder job isn't a real option. So the close step
// here calls the endpoint directly (page.request.post) with a date a few
// seconds in the future, satisfying the ">now" gate while letting the worker's
// capa_effectiveness_check_remind job (2s poll interval — graphile.config.js)
// fire almost immediately.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, ESIGN_PIN } from '../fixtures/cast.js'
import {
  createCapa,
  openCapa,
  completeReviewerStep,
  completeApproverStep,
  uniqueTitle,
} from '../fixtures/capas.js'
import { clickWhenReady } from '../fixtures/documents.js'
import { findCapaByTitle, sqlValue, sqlRow, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J4 · effectiveness check verify', () => {
  test('worker flips a near-due check to IN_PROGRESS; owner verifies EFFECTIVE with e-sign', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000)

    const title = uniqueTitle('J4')
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
        effectivenessCheckAt: new Date(Date.now() + 5_000).toISOString(),
        comments: 'E2E close — J4 effectiveness-check setup.',
        method: 'PIN',
        token: ESIGN_PIN,
        provider: null,
      },
    })
    expect(res.ok(), 'close must succeed').toBeTruthy()

    await waitForSqlValue(
      `SELECT count(*) FROM capas WHERE id = '${capa.id}' AND status_id = 'CLOSED'`,
      { timeoutMs: 15_000, label: 'CAPA CLOSED' },
    )

    // Worker: reminder job fires at due_at (~5s out), flips PENDING -> IN_PROGRESS,
    // creates an EFFECTIVENESS_CHECK task for the owner.
    await waitForSqlValue(
      `SELECT count(*) FROM capa_effectiveness_checks WHERE capa_id = '${capa.id}' AND status_id = 'IN_PROGRESS'`,
      { timeoutMs: 30_000, label: 'effectiveness check IN_PROGRESS (worker job fired)' },
    )
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}' AND task_kind_id = 'EFFECTIVENESS_CHECK'
          AND assigned_to = '${USERS.author.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 15_000, label: 'effectiveness-check task assigned to owner' },
    )

    await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await clickWhenReady(page, page.getByRole('button', { name: 'Verify' }))
    await expect(page.getByRole('heading', { name: 'Complete Effectiveness Check' })).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('radio', { name: 'Effective', exact: true }).check()
    await page
      .getByPlaceholder('What did you verify? Any residual risks?')
      .fill('E2E verification — no recurrence observed, CAPA holds.')
    await page.getByRole('button', { name: 'Mark Complete' }).click()

    const pin = page.getByPlaceholder('Enter your e-signature PIN')
    await expect(pin).toBeVisible({ timeout: 10_000 })
    const signBtn = page.getByRole('button', { name: 'Sign', exact: true })
    await expect(async () => {
      await pin.fill(ESIGN_PIN)
      await expect(signBtn).toBeEnabled({ timeout: 3_000 })
    }).toPass({ timeout: 15_000 })
    await signBtn.click()

    await waitForSqlValue(
      `SELECT count(*) FROM capa_effectiveness_checks WHERE capa_id = '${capa.id}' AND status_id = 'COMPLETED' AND outcome = 'EFFECTIVE'`,
      { timeoutMs: 30_000, label: 'effectiveness check COMPLETED / EFFECTIVE' },
    )

    const checkRow = sqlRow(
      `SELECT comments, completed_by FROM capa_effectiveness_checks WHERE capa_id = '${capa.id}'`,
    )
    expect(checkRow[0]).toContain('no recurrence observed')
    expect(checkRow[1]).toBe(USERS.author.id)

    // Part-11 signature for the verification.
    const sigCount = sqlValue(
      `SELECT count(*) FROM signatures WHERE capa_id = '${capa.id}' AND meaning = 'VERIFIED'`,
    )
    expect(Number(sigCount), 'one VERIFIED signature row for this CAPA').toBe(1)

    // Two audit rows — one on the EC row, one rolled up onto the parent CAPA.
    const ecAuditCount = sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'CapaEffectivenessCheck' AND action = 'EFFECTIVENESS_VERIFIED' AND performed_by IS NOT NULL
        AND entity_id = (SELECT id FROM capa_effectiveness_checks WHERE capa_id = '${capa.id}')`,
    )
    expect(Number(ecAuditCount), 'EC-row EFFECTIVENESS_VERIFIED audit row').toBeGreaterThan(0)
    const capaAuditCount = sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capa' AND entity_id = '${capa.id}' AND action = 'EFFECTIVENESS_VERIFIED' AND performed_by IS NOT NULL`,
    )
    expect(Number(capaAuditCount), 'CAPA-rollup EFFECTIVENESS_VERIFIED audit row').toBeGreaterThan(0)

    // Reminder job's own row got consumed — no pending duplicate.
    const stillPending = sqlValue(
      `SELECT count(*) FROM capa_effectiveness_checks WHERE capa_id = '${capa.id}' AND status_id IN ('PENDING','IN_PROGRESS')`,
    )
    expect(stillPending).toBe('0')
  })
})
