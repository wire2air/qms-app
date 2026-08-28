// PW-J4 · Effectiveness check verify (TC-12) — worker + step assignee.
//
// ~~The CAPA's effectiveness check is a `capa_effectiveness_checks` row with a
// card on the CAPA detail page, verified through a "Verify" button.~~ None of
// that is reachable any more. On 2026-08-18 the effectiveness check became a
// workflow DELAY step, and `buildCapaSections()` says so in as many words:
//
//   "The Effectiveness section is gone (2026-08-18) … The record-based
//    CapaEffectivenessCheck table, its endpoints and its card are still in the
//    codebase but unreachable — kept only until the transition is done."
//
// The card still HAS its Verify button in source — which is why grepping for
// it finds a hit and suggests nothing is wrong. `CapaEffectivenessCheckCard`
// simply has no call site anywhere in `src/`; the only surviving mention is
// that comment. The complete-dialog has exactly one mount left
// (TaskInstanceCapaEffectivenessActions → TaskActionBar), and TaskActionBar is
// never rendered on /capas/:id, so no page on develop can open it for a CAPA.
//
// So this journey now drives the live path: a DELAY step whose
// `captures_effectiveness` flag turns it into the verdict gate. The subject is
// unchanged — the worker wakes a parked check, the assignee records a verdict,
// and the completion is e-signed — but every locator and every assertion had
// to move from `capa_effectiveness_checks` onto the workflow's own tables.
//
// The seeded "E2E CAPA Review & Approval" workflow has no DELAY step at all
// (ACTION + APPROVAL only), so this uses the delay fixture's `eff` template.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ESIGN_PIN } from '../fixtures/cast.js'
import { clickWhenReady } from '../fixtures/documents.js'
import {
  ensureDelayTemplates,
  reachScheduledDelay,
  delayStepOf,
  fireDelayNow,
  gotoCapaWorkflow,
  signatureCountOn,
} from '../fixtures/workflowDelay.js'
import { sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'

const PIN_FIELD = 'Enter your e-signature PIN'

test.use({ storageState: AUTH.author })

test.describe('PW-J4 · effectiveness check verify', () => {
  test.beforeAll(() => ensureDelayTemplates())

  test('worker wakes the parked check; the assignee records EFFECTIVE with an e-signature', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    const { capaId } = await reachScheduledDelay(page, browser, { template: 'eff', tag: 'J4' })
    const delay = delayStepOf(capaId)
    expect(delay, 'the CAPA runs a DELAY step').toBeTruthy()

    // Park it in the past: the worker (JOB-01) flips SCHEDULED → IN_PROGRESS
    // and mints the assignee's task. This replaces the old close-schedules-it
    // dance, which created nothing at all once close stopped scheduling checks.
    await fireDelayNow(page.request, capaId, delay.id)

    const ctx = await browser.newContext({ storageState: AUTH.approver })
    const assigneePage = await ctx.newPage()
    try {
      await gotoCapaWorkflow(assigneePage, capaId)

      // The verdict is inline on the step card, not in a dialog. It is a
      // SegmentedControl: <button role="radio">, NOT <input type=radio> — so
      // `check()` throws ("Not a checkbox or radio button") and only click()
      // works. exact:true because 'Effective' is a substring of 'Not effective'.
      await assigneePage.getByRole('radio', { name: 'Effective', exact: true }).click()

      // Two "Mark Complete" buttons render (step header + card footer);
      // clickWhenReady takes .first(). The label is derived from stepType —
      // a DELAY step is not an APPROVAL step, so it is not "Approve".
      await clickWhenReady(
        assigneePage,
        assigneePage.getByRole('button', { name: 'Mark Complete', exact: true }),
      )

      const pin = assigneePage.getByPlaceholder(PIN_FIELD)
      await expect(pin, 'completing the verdict demands a credential').toBeVisible({
        timeout: 15_000,
      })
      await pin.fill(ESIGN_PIN)
      await assigneePage.getByRole('button', { name: 'Sign', exact: true }).click()

      await waitForSqlValue(
        `SELECT count(*) FROM workflow_instance_steps WHERE id = '${delay.id}' AND status_id = 'APPROVED'`,
        { timeoutMs: 60_000, label: 'signed completion landed' },
      )
    } finally {
      await assigneePage.close()
      await ctx.close()
    }

    // The verdict lands on the STEP. `capa_effectiveness_checks` stays empty —
    // nothing on this path writes it.
    const step = sqlRow(
      `SELECT status_id, effectiveness_outcome FROM workflow_instance_steps WHERE id = '${delay.id}'`,
    )
    expect(step[0]).toBe('APPROVED')
    expect(step[1], 'the recorded verdict').toBe('EFFECTIVE')

    const legacyRows = sqlValue(
      `SELECT count(*) FROM capa_effectiveness_checks WHERE capa_id = '${capaId}'`,
    )
    expect(Number(legacyRows), 'the record-based table is not on this path').toBe(0)

    // Part-11: exactly one signature for the verdict.
    expect(signatureCountOn(delay.id), 'one Part-11 signature row').toBe(1)
  })
})
