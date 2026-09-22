// PW-J14 · Per-clause results — the half of the audit report the PDF omits.
//
// WHY THIS FILE EXISTS
//
// automated-regression-coverage.md §10 rates URS-AUD-07 **Partial**, with the
// note: "Not covered: per-clause results, omitted by design, so the protocol
// step is unmet." That is OQ-07 TC-07-07 step 2, which asks the report to
// include "scope, standard, dates, team, requirement results and all findings".
// PW-J8 already asserts the printed report carries the first four and the
// findings — and asserts, deliberately, that it carries NO clause detail
// (AuditInstancePrint.vue: "Requirement-level results are intentionally NOT
// printed — the report shared with the auditee/supplier carries the conformance
// summary + findings only"). A supplier-facing report that named every
// conforming clause would be an information leak, so the omission is a real
// design decision and not a defect to be fixed.
//
// What was never asserted is the other side of that decision: that the
// per-clause results EXIST, are attributed, are reachable by a reader of the
// record, and that the number the report DOES publish reconciles with them.
// Without that, "omitted by design" is an unevidenced claim — the results could
// equally be absent, or the published percentage could be computed from
// something other than the verdicts, and every test in the suite would still be
// green. That is the gap this file closes, and it is what lets an assessor
// discharge TC-07-07 steps 2 and 3 against the audit record even though the
// shared PDF is the wrong surface for it.
//
// TC-07-04 step 7 ("responses are attributed to the auditor who recorded them,
// with a timestamp") rides along, because it is asserted on the same rows and
// the suite had nothing on it either.
//
// WHERE THE RESULTS ACTUALLY LIVE
//
// `audit_requirement_responses`, one row per clause, carrying `result_id`,
// `assessed_by_user_id` and `assessed_at`. They surface in the UI on the audit's
// Requirements tab (AuditWalkthroughPanel), whose clause rail marks an assessed
// clause with a `title="Assessed"` dot — that title attribute is the stable
// handle this file reads, because the verdict itself is rendered as a selected
// chip whose styling, not its text, carries the state.
//
// SELF-CONTAINED PER TEST. Playwright discards the worker after a failing test
// and runs its pending afterAll, so every test here builds its own audit from
// scratch through the normal UI flow and removes it in a finally block. Nothing
// is shared between them.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, AUDIT_STANDARD, COMPANY_ID, USERS } from '../fixtures/cast.js'
import {
  createAdHocAudit,
  openAuditTab,
  responsesOf,
  scoreClause,
  startAudit,
} from '../fixtures/audits.js'
import { sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

/** Everything this file creates is greppable by this prefix. */
const TAG = 'E2E AUDIT PW-J14'

/** Remove one audit and everything hanging off it. NEVER audit_logs — immutable. */
function removeAudit(auditId) {
  if (!auditId) return
  sql(`DELETE FROM audit_requirement_responses WHERE audit_instance_id = '${auditId}'`)
  sql(`DELETE FROM audit_findings WHERE audit_instance_id = '${auditId}'`)
  sql(`DELETE FROM audit_team_members WHERE audit_instance_id = '${auditId}'`)
  sql(`DELETE FROM audit_instances WHERE id = '${auditId}'`)
}

/** Sweep audits an earlier run of this file left behind. */
function purge() {
  const ids = sql(
    `SELECT id FROM audit_instances WHERE company_id = '${COMPANY_ID}' AND scope LIKE '%${TAG}%'`,
  )
    .split('\n')
    .filter(Boolean)
  for (const id of ids) removeAudit(id)
}

/**
 * Record a verdict on the clause the walkthrough is currently showing.
 *
 * Local, not `fixtures/audits.js`'s `scoreClause`, and for one reason: the
 * shared helper clicks `getByRole('button', { name: result, exact: true })`
 * page-wide, which is unambiguous for Conforming / Minor NC / Major NC but NOT
 * for `N/A` and `OFI` — the Auditor's Notebook above the verdict row renders
 * its own rating chips carrying those same two labels, so a page-wide match is
 * a strict-mode violation (measured: two `N/A` buttons on the clause step).
 *
 * The verdict chips are the `v-for="r in RESULTS"` row that follows the
 * "Result" overline, so the anchor is that overline and the walk is
 * `following::button`. Same anchor-then-walk shape the dialog helpers in
 * fixtures/audits.js use, for the same reason.
 *
 * Not added to the shared fixture: other suites are being edited concurrently.
 */
async function pickResult(page, auditInstanceId, clause, result) {
  await page
    .getByRole('button', {
      name: new RegExp(
        `${clause.number.replace(/\./g, '\\.')}\\s+${clause.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      ),
    })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: clause.title })).toBeVisible({ timeout: 20_000 })

  await page
    .getByText('Result', { exact: true })
    .first()
    .locator(`xpath=following::button[normalize-space(.)='${result}'][1]`)
    .click()

  await waitForSqlValue(
    `SELECT result_id FROM audit_requirement_responses
      WHERE audit_instance_id = '${auditInstanceId}' AND requirement_id = '${clause.id}'
        AND deleted_at IS NULL AND result_id IS NOT NULL`,
    { timeoutMs: 45_000, label: `verdict saved for clause ${clause.number}` },
  )
}

/** One response row, read back in full. */
function responseRow(auditInstanceId, requirementId) {
  const row = sqlRow(
    `SELECT coalesce(result_id,''), coalesce(assessed_by_user_id::text,''),
            coalesce(assessed_at::text,'')
       FROM audit_requirement_responses
      WHERE audit_instance_id = '${auditInstanceId}' AND requirement_id = '${requirementId}'
        AND deleted_at IS NULL`,
  )
  if (!row) return null
  // sqlValue/sqlRow hand back '' for SQL NULL, never null — so these stay as
  // the empty string and the assertions below compare against ids, not truthiness.
  return { resultId: row[0], assessedBy: row[1], assessedAt: row[2] }
}

test.beforeAll(purge)
test.afterAll(purge)

test.describe('PW-J14 · per-clause results are recorded, attributed and reconcilable', () => {
  test('every leaf clause carries its own verdict, attributed to the auditor with a timestamp', async ({
    page,
  }) => {
    // TC-07-07 step 2 (requirement results exist on the record) and
    // TC-07-04 step 7 (attribution + timestamp).
    test.setTimeout(300_000)

    const scope = `${TAG} attribution ${Date.now()}`
    let auditId = null
    try {
      const audit = await createAdHocAudit(page, scope)
      auditId = audit.id

      await startAudit(page)
      await openAuditTab(page, 'Requirements')
      await scoreClause(page, auditId, AUDIT_STANDARD.clauses.documentControl, 'Conforming')
      await scoreClause(page, auditId, AUDIT_STANDARD.clauses.training, 'Minor NC')

      // ── The results themselves, one row per LEAF clause.
      const responses = responsesOf(auditId)
      expect(
        responses[AUDIT_STANDARD.clauses.documentControl.id],
        'the conforming clause keeps its own verdict on the record, even though the PDF omits it',
      ).toBe('CONFORMING')
      expect(
        responses[AUDIT_STANDARD.clauses.training.id],
        'and so does the nonconforming one — a distinct verdict, not a rollup',
      ).toBe('MINOR_NC')
      expect(
        responses[AUDIT_STANDARD.clauses.section.id],
        'a section header is not assessable and must hold no verdict (it is exempt from the close-out gate)',
      ).toBeUndefined()

      // ── Attribution. `assessed_by_user_id` / `assessed_at` are what make a
      // clause result evidence rather than an opinion; both are written by the
      // controller on the same request that saves the verdict.
      for (const clause of [
        AUDIT_STANDARD.clauses.documentControl,
        AUDIT_STANDARD.clauses.training,
      ]) {
        const row = responseRow(auditId, clause.id)
        expect(row, `clause ${clause.number} has a response row`).toBeTruthy()
        expect(
          row.assessedBy,
          `clause ${clause.number} names the auditor who recorded the verdict`,
        ).toBe(USERS.author.id)
        expect(
          row.assessedAt,
          `clause ${clause.number} carries the timestamp of the assessment`,
        ).not.toBe('')
      }

      // ── And a reader of the record can SEE which clauses are assessed. The
      // walkthrough rail marks each one with a title="Assessed" dot; two leaf
      // clauses are scored and the section header is not, so exactly two.
      await expect(
        page.locator('[title="Assessed"]'),
        'the Requirements walkthrough must show both leaf clauses as assessed',
      ).toHaveCount(2, { timeout: 45_000 })
    } finally {
      removeAudit(auditId)
    }
  })

  test('the published conformance figure reconciles with the per-clause verdicts', async ({
    page,
  }) => {
    // TC-07-07 step 3 — "Confirm any conformance score shown is consistent with
    // the recorded responses." The report publishes a percentage and a
    // PASS/FAIL; this is the test that the number is derived from the clause
    // results and not from anything else.
    //
    // The scoring model (src/composables/useAuditScoring.js, shared by the
    // right-rail widget AND the print report so the two cannot disagree):
    //   conformancePct = (CONFORMING + OFI) / (everything scored except NA)
    //   pass           = no MAJOR_NC
    //
    // Scored here as one CONFORMING + one N/A, deliberately: N/A is the only
    // verdict that leaves the denominator, so 100% with an unassessed-looking
    // clause on the record is the case a naive implementation gets wrong (it
    // would publish 50%). It also covers TC-07-04 step 5 — a clause marked N/A.
    test.setTimeout(300_000)

    const scope = `${TAG} reconcile ${Date.now()}`
    let auditId = null
    try {
      const audit = await createAdHocAudit(page, scope)
      auditId = audit.id

      await startAudit(page)
      await openAuditTab(page, 'Requirements')
      await scoreClause(page, auditId, AUDIT_STANDARD.clauses.documentControl, 'Conforming')
      await pickResult(page, auditId, AUDIT_STANDARD.clauses.training, 'N/A')

      const responses = responsesOf(auditId)
      expect(responses[AUDIT_STANDARD.clauses.documentControl.id]).toBe('CONFORMING')
      expect(
        responses[AUDIT_STANDARD.clauses.training.id],
        'N/A is a recorded verdict in its own right, not an absent one',
      ).toBe('NA')

      // Recompute the published figure from the raw rows, the way an assessor
      // reconciling the report would. Asserting the rendered number against a
      // constant would pass even if BOTH the report and the model were wrong.
      const counts = Object.fromEntries(
        sql(
          `SELECT result_id, count(*) FROM audit_requirement_responses
            WHERE audit_instance_id = '${auditId}' AND deleted_at IS NULL AND result_id IS NOT NULL
            GROUP BY result_id`,
        )
          .split('\n')
          .filter(Boolean)
          .map((l) => {
            const [id, n] = l.split('|')
            return [id, Number(n)]
          }),
      )
      const scored =
        (counts.CONFORMING ?? 0) + (counts.OFI ?? 0) + (counts.MINOR_NC ?? 0) + (counts.MAJOR_NC ?? 0)
      const conformant = (counts.CONFORMING ?? 0) + (counts.OFI ?? 0)
      const expectedPct = scored > 0 ? Math.round((conformant / scored) * 100) : null
      expect(expectedPct, 'one CONFORMING, one NA excluded from the denominator → 100%').toBe(100)
      expect(counts.MAJOR_NC ?? 0, 'no major NC, so the audit passes').toBe(0)

      // Now the published artefact. window.print() is stubbed before the popup
      // opens: the print view fires it ~250ms after its data resolves and a
      // real print dialog would block the run (same reason as PW-J8).
      await page.context().addInitScript(() => {
        window.print = () => {}
      })
      const [report] = await Promise.all([
        page.waitForEvent('popup'),
        page.getByRole('button', { name: 'Report', exact: true }).click(),
      ])
      await report.waitForLoadState('domcontentloaded')
      await expect(report.getByRole('heading', { name: /2\. Conformance Summary/ })).toBeVisible({
        timeout: 60_000,
      })

      await expect(
        report.getByText(`${expectedPct}%`, { exact: true }).first(),
        'the published percentage must be the one the recorded verdicts produce',
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        report.getByText(/Conformance · PASS/),
        'no MAJOR_NC among the clause results, so the report must publish PASS',
      ).toBeVisible()

      // The count table is the bridge between the two surfaces: it publishes
      // the per-RESULT tally even though it publishes no per-CLAUSE row, so an
      // assessor can tie the percentage back to the record without the PDF ever
      // naming a clause. Scoped to the printed body — the app shell around the
      // print route carries its own nav text.
      const body = report.locator('.aud-print-body')
      await expect(body.getByText('Conforming', { exact: true })).toBeVisible()
      await expect(body.getByText('N/A', { exact: true })).toBeVisible()
      await expect(
        body.getByText('Assessed', { exact: true }),
        'the report states how many clauses were assessed, which is what the percentage divides',
      ).toBeVisible()

      // And PW-J8's design decision still holds on THIS audit: no clause is
      // named. Exact match, scoped to the printed body — getByText is substring
      // and case-insensitive by default, and the shell's sidebar carries a
      // "Document Control" nav link that a loose page-wide match would hit.
      await expect(
        body.getByText(AUDIT_STANDARD.clauses.documentControl.title, { exact: true }),
        'the shared report still names no clause — the results are on the record, not in the PDF',
      ).toHaveCount(0)
      await expect(
        body.getByText(AUDIT_STANDARD.clauses.training.title, { exact: true }),
        'including the one marked N/A',
      ).toHaveCount(0)

      await report.close()
    } finally {
      removeAudit(auditId)
    }
  })

  test('a changed verdict replaces the clause result rather than adding a second one', async ({
    page,
  }) => {
    // The integrity property the reconciliation above depends on. One clause
    // must yield exactly one result: `audit_requirement_responses` carries a
    // partial unique index on (audit_instance_id, requirement_id) WHERE
    // deleted_at IS NULL AND requirement_id IS NOT NULL, so a re-score is an
    // upsert. If a re-score appended instead, the denominator would grow and
    // the published percentage would silently drift away from the audit.
    test.setTimeout(300_000)

    const scope = `${TAG} rescore ${Date.now()}`
    let auditId = null
    try {
      const audit = await createAdHocAudit(page, scope)
      auditId = audit.id

      await startAudit(page)
      await openAuditTab(page, 'Requirements')
      const clause = AUDIT_STANDARD.clauses.documentControl
      await scoreClause(page, auditId, clause, 'Conforming')
      expect(responsesOf(auditId)[clause.id]).toBe('CONFORMING')

      // Re-score the SAME clause. Both helpers' barriers only wait for a
      // non-null result_id, which is already true — so poll for the new VALUE
      // rather than trusting a barrier here. The click is anchored the same way
      // pickResult anchors, because 'OFI' is one of the two labels the Auditor's
      // Notebook rating chips also carry.
      await page
        .getByText('Result', { exact: true })
        .first()
        .locator("xpath=following::button[normalize-space(.)='OFI'][1]")
        .click()
      await expect(async () => {
        expect(responsesOf(auditId)[clause.id]).toBe('OFI')
      }).toPass({ timeout: 45_000 })

      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM audit_requirement_responses
              WHERE audit_instance_id = '${auditId}' AND requirement_id = '${clause.id}'
                AND deleted_at IS NULL`,
          ),
        ),
        'a re-scored clause must hold exactly one live result — otherwise the conformance denominator inflates',
      ).toBe(1)
    } finally {
      removeAudit(auditId)
    }
  })
})
