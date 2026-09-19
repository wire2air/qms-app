// RA-J3 — regression guard for F-01: `risk_assessments_update_rls` used to
// check only `company_id`, with no permission clause at all
// (docs/modules/risk-assessment/11-security-review.md §2). Any authenticated
// tenant user, holding no capa/ncr/change_control permission, could rewrite a
// finalized risk assessment's score, justification or hazard category.
//
// STATUS AT THE TIME THIS SUITE WAS WRITTEN: CLOSED. Fixed 2026-09-01
// (migration 20260901180000, docs/modules/risk-assessment/
// 22-hardening-pass-2026-09-01.md §2) by mirroring the sibling verbs'
// has_permission(...) clause onto both USING and WITH CHECK. Verified live
// against database/rls.sql:5007 below (not the doc's own citation, which the
// hardening pass itself flags as stale — "every line-number citation in [11]
// has drifted"). Already integration-tested in
// backend/api/tests/integration/riskAssessment/risk-assessment-rls.test.js;
// this file re-verifies the SAME contract at the E2E layer, through the
// dedicated workflow's real UI-produced row rather than a hand-inserted one,
// and is a live GREEN regression guard — not a documented-defect probe —
// because there is no live defect left to document.
//
// WHY EVERY PROBE IS TWO-SIDED (borrowed from the integration suite's own
// header comment). RLS refuses by FILTERING: an UPDATE that matches no row
// SUCCEEDS against zero rows, so a persona that holds NO permission at all is
// filtered by the SELECT policy before UPDATE is ever reached and would read
// as "the guard works" even if the UPDATE clause had regressed back to
// company-id-only. `auditor` (capa:read, no capa:update) is the persona that
// actually exercises the UPDATE policy; `reviewer` (capa:update) is the
// admitting control that proves the probe itself is sound.
import { test, expect } from '@playwright/test'
import { AUTH, RISK_ASSESSMENT } from '../fixtures/cast.js'
import { findCapaByTitle, sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { createCapa, uniqueTitle, openCapa } from '../fixtures/capas.js'
import { completeRiskReviewStep, waitForRiskAssessment, purgeRiskAssessment, HIGH_CELL } from '../fixtures/riskAssessment.js'

const COMPANY_ID = 'e2e00001-0000-4000-8000-000000000001'
const AUDITOR_ID = 'e2e10000-0000-4000-8000-000000000006' // capa:read only, no capa:update
const REVIEWER_ID = 'e2e10000-0000-4000-8000-000000000003' // capa:update — the admitting control
const NO_ACCESS_ID = 'e2e10000-0000-4000-8000-000000000008' // no capa grants at all

test.describe.configure({ mode: 'serial' })

test.describe('RA-J3 · F-01 regression guard — risk_assessments UPDATE RLS', () => {
  let capaId
  let raId

  test.beforeAll(async () => {
    // beforeAll runs in a fresh worker on a failed-test restart (harness
    // note in e2e/README.md); keep this self-contained rather than relying
    // on earlier files' state.
  })

  test('arrange: a real, UI-derived risk_assessments row to probe', async ({ browser }) => {
    const ctxAuthor = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await ctxAuthor.newPage()
    const title = uniqueTitle('RA-J3')
    await createCapa(authorPage, title, { workflowName: RISK_ASSESSMENT.workflowName })
    const capa = findCapaByTitle(title)
    capaId = capa.id
    purgeRiskAssessment(capaId)
    await openCapa(authorPage, capaId)
    await ctxAuthor.close()

    await completeRiskReviewStep(browser, capaId, { cell: HIGH_CELL })
    const ra = await waitForRiskAssessment(capaId)
    raId = ra.id
    expect(ra.computedScore).toBe(HIGH_CELL.rpn)
  });

  test('the policy shape itself: the UPDATE clause carries a permission check on BOTH halves', () => {
    // The exact regression shape F-01 had: an asymmetric policy could let a
    // caller who passes USING write a row they could not have selected.
    const rows = sqlValue(
      `SELECT (COALESCE(qual,'') LIKE '%has_permission%')::text || ',' ||
              (COALESCE(with_check,'') LIKE '%has_permission%')::text
         FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'risk_assessments' AND cmd = 'UPDATE'`,
    )
    expect(rows, 'the UPDATE policy still exists').toBeTruthy()
    const [usingGated, checkGated] = rows.split(',')
    expect(usingGated, 'USING carries has_permission').toBe('t')
    expect(checkGated, 'WITH CHECK carries has_permission').toBe('t')
  })

  test('a capa:read-only holder cannot downgrade the recorded risk level', () => {
    const before = sqlValue(`SELECT computed_score FROM risk_assessments WHERE id = '${raId}'`)
    expect(before).toBe(String(HIGH_CELL.rpn))

    const res = sqlAsAppUser(
      `UPDATE public.risk_assessments SET computed_risk_level_label = 'LOW', computed_score = 1 WHERE id = '${raId}';`,
      { userId: AUDITOR_ID, companyId: COMPANY_ID },
    )
    // A refused UPDATE is a zero-row success, not an error — psql prints
    // "UPDATE 0" to stderr-free stdout via \timing off; check the stored value
    // instead of the command tag, which is the assertion that actually proves
    // the row is unchanged.
    expect(res.ok, `sqlAsAppUser should not error: ${res.error}`).toBe(true)

    const after = sqlValue(`SELECT computed_score FROM risk_assessments WHERE id = '${raId}'`)
    expect(after, 'the score did not move').toBe(String(HIGH_CELL.rpn))
  })

  test('nor rewrite the justification', () => {
    sqlAsAppUser(
      `UPDATE public.risk_assessments SET justification = 'reworded after the fact' WHERE id = '${raId}';`,
      { userId: AUDITOR_ID, companyId: COMPANY_ID },
    )
    const justification = sqlValue(`SELECT justification FROM risk_assessments WHERE id = '${raId}'`)
    expect(justification).not.toBe('reworded after the fact')
  })

  test('nor soft-delete it', () => {
    sqlAsAppUser(`UPDATE public.risk_assessments SET deleted_at = now() WHERE id = '${raId}';`, {
      userId: AUDITOR_ID,
      companyId: COMPANY_ID,
    })
    const deletedAt = sqlValue(`SELECT deleted_at FROM risk_assessments WHERE id = '${raId}'`)
    expect(deletedAt, 'still not deleted').toBeFalsy()
  })

  test('a zero-grant user is filtered by SELECT, not by reaching the UPDATE policy at all', () => {
    // Vacuity check: with no capa permission whatsoever, the row is invisible
    // before UPDATE is ever evaluated — proving this persona is refused says
    // nothing about the UPDATE clause specifically. That is why the probes
    // above use `auditor` (capa:read), not this persona.
    const sel = sqlAsAppUser(`SELECT id FROM public.risk_assessments WHERE id = '${raId}';`, {
      userId: NO_ACCESS_ID,
      companyId: COMPANY_ID,
    })
    expect(sel.ok).toBe(true)
    expect(sel.output.trim(), 'invisible to a zero-grant user').toBe('')
  })

  test('CONTROL · a capa:update holder CAN still update — proves the probe itself is sound', () => {
    // Without this, a policy that had stopped matching ANYTHING (not just the
    // unauthorized case) would make every refusal above pass for the wrong
    // reason.
    const res = sqlAsAppUser(
      `UPDATE public.risk_assessments SET justification = 'residual risk accepted by the quality manager' WHERE id = '${raId}';`,
      { userId: REVIEWER_ID, companyId: COMPANY_ID },
    )
    expect(res.ok, `sqlAsAppUser should not error: ${res.error}`).toBe(true)
    const justification = sqlValue(`SELECT justification FROM risk_assessments WHERE id = '${raId}'`)
    expect(justification).toBe('residual risk accepted by the quality manager')
  })

  test('WITH CHECK mirrors USING — a granted user cannot write the row out of its own tenant', () => {
    const res = sqlAsAppUser(
      `UPDATE public.risk_assessments SET company_id = gen_random_uuid() WHERE id = '${raId}';`,
      { userId: REVIEWER_ID, companyId: COMPANY_ID },
    )
    expect(res.ok, 'the statement is REJECTED, not silently filtered').toBe(false)
    expect(res.error).toMatch(/permission denied|new row violates row-level security/i)
  })
})
