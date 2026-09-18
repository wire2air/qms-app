// PW-J1 · Owner: raise → draft → open (TC-01/04/05)
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { raiseNc, uniqueTitle } from '../fixtures/nonconformances.js'
import { findNcByTitle, sqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J1 · owner raises an NC, it opens for review', () => {
  test('raise NC → auto-opened (OPEN), workflow instantiated', async ({ page }) => {
    const title = uniqueTitle('J1')
    const counterBefore = Number(
      sqlValue(
        `SELECT current_value FROM nc_counters WHERE company_id = 'e2e00001-0000-4000-8000-000000000001' AND prefix = 'NC'`,
      ) || 0,
    )

    await raiseNc(page, title)

    const nc = findNcByTitle(title)
    expect(nc, 'NC row exists').toBeTruthy()
    // Create-and-open (2026-08-10): Create NC starts the workflow in the
    // same action — no separate Open NC step.
    expect(nc.statusId).toBe('OPEN')
    // Flat numbering since 369be68b (2026-08-18): site and department came out
    // of the identifier — NC-HQ-QA-004 became NC-004. They are columns on the
    // record and filterable there, and keeping them in the prefix made the
    // counter key vary per site/department. \d{3,} — zero-padded to 3, but this
    // dev DB accumulates NCs across every run, so it legitimately grows past 999.
    expect(nc.ncNumber).toMatch(/^NC-\d{3,}$/)
    await expect(page.getByText(nc.ncNumber).first()).toBeVisible()

    const counterAfter = Number(
      sqlValue(
        `SELECT current_value FROM nc_counters WHERE company_id = 'e2e00001-0000-4000-8000-000000000001' AND prefix = 'NC'`,
      ) || 0,
    )
    expect(counterAfter, 'counter incremented').toBeGreaterThan(counterBefore)

    const statusAfterOpen = sqlValue(`SELECT status_id FROM nonconformances WHERE id = '${nc.id}'`)
    expect(statusAfterOpen).toBe('OPEN')

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
    // The point of this assertion is ATTRIBUTION — that opening the NC is
    // recorded against a real user — but the ACTION is load-bearing too, and it
    // has now moved twice in one day.
    //
    // ~~CREATE + UPDATE~~. The previous repair reasoned that "status-named audit
    // actions no longer exist for NC", and for about three hours that was true:
    // the unified-status migration renamed UNDER_REVIEW -> OPEN on the record
    // while the audit registry's actionMap kept its key on the retired word, so
    // every raise fell through to a generic UPDATE. That was the DEFECT, not the
    // contract. qms `839d02b0` (2026-08-28) rekeyed
    // worker/services/audit/registry/modules/nonconformances.js to
    // `OPEN: AUDIT_ACTIONS.UNDER_REVIEW` — the same fix that restored CAPA's
    // SUBMIT_FOR_REVIEW — so the semantic action is written again.
    //
    // The map keys on the NEW status id and emits the OLD action name on
    // purpose: the status vocabulary is what the migration changed; the Part-11
    // action vocabulary (AUDIT_ACTIONS.UNDER_REVIEW = 'UNDER_REVIEW') was not
    // touched, and renaming it would orphan every historical row. So the id
    // written to audit_logs.action is 'UNDER_REVIEW' even though no NC is ever
    // in an UNDER_REVIEW status any more. Verified against app-db: an NC raised
    // after the rekey carries exactly CREATE + UNDER_REVIEW; one raised before
    // it carries CREATE + UPDATE.
    //
    // Asserted as two separate counts rather than one count(DISTINCT ...) = 2 so
    // a regression names WHICH row went missing instead of reporting "1, wanted 2".
    const createRows = sqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE entity_type = 'Nonconformances' AND entity_id = '${nc.id}'
          AND action = 'CREATE' AND performed_by IS NOT NULL`,
    )
    expect(Number(createRows), 'the raise is audited as an attributed CREATE').toBeGreaterThan(0)

    const openRows = sqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE entity_type = 'Nonconformances' AND entity_id = '${nc.id}'
          AND action = 'UNDER_REVIEW' AND performed_by IS NOT NULL`,
    )
    expect(
      Number(openRows),
      'the DRAFT->OPEN transition is audited under its own semantic action, not a generic UPDATE',
    ).toBeGreaterThan(0)
  })
})
