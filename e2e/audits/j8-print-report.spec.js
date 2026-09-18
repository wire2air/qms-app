// PW-J8 · Printable audit report (MTC-17).
//
// The report is the artefact that leaves the building — it is what the auditee
// or supplier receives — so what it OMITS matters as much as what it carries.
// By design it publishes the conformance rollup and the findings, but never the
// per-clause verdicts: a conforming clause must not be identifiable in the
// report. That omission is asserted here alongside the positive content.
//
// window.print() is stubbed before the popup opens; the print view fires it
// automatically ~250ms after its data resolves and a real print dialog would
// block the run.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, AUDIT_STANDARD } from '../fixtures/cast.js'
import {
  createAdHocAudit,
  findingsOf,
  openAuditTab,
  scoreClause,
  startAudit,
  uniqueScope,
} from '../fixtures/audits.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J8 · the printable report', () => {
  test('renders number, scope, conformance and findings — and no per-clause detail', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    const scope = uniqueScope('J8')
    const audit = await createAdHocAudit(page, scope)
    await startAudit(page)
    await openAuditTab(page, 'Requirements')
    await scoreClause(page, audit.id, AUDIT_STANDARD.clauses.documentControl, 'Conforming')
    await scoreClause(page, audit.id, AUDIT_STANDARD.clauses.training, 'Major NC')
    const [finding] = findingsOf(audit.id)

    await page.context().addInitScript(() => {
      window.print = () => {}
    })

    const [report] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Report', exact: true }).click(),
    ])
    await report.waitForLoadState('domcontentloaded')
    expect(new URL(report.url()).searchParams.get('module')).toBe('AuditInstance')
    expect(new URL(report.url()).searchParams.get('id')).toBe(audit.id)

    await expect(report.getByRole('heading', { name: /Audit Report/ })).toBeVisible({
      timeout: 45_000,
    })
    await expect(report.getByText(audit.auditNumber).first()).toBeVisible()
    await expect(report.getByText(scope)).toBeVisible()
    await expect(report.getByRole('heading', { name: /2\. Conformance Summary/ })).toBeVisible()
    // A Major NC fails the audit outright, whatever the percentage.
    await expect(report.getByText(/Conformance · FAIL/)).toBeVisible()
    await expect(report.getByRole('heading', { name: /3\. Findings \(1\)/ })).toBeVisible()
    await expect(report.getByText(finding.findingNumber)).toBeVisible()
    await expect(report.getByRole('heading', { name: /4\. Audit Team & Sign-off/ })).toBeVisible()

    // By design: no per-clause results table. The conforming clause raised no
    // finding, so if the report leaked clause-level detail this is where it
    // would show up.
    //
    // Scoped to the printed body and matched exactly: the print route renders
    // inside the app shell, whose sidebar carries a "Document Control" nav link,
    // and getByText is substring + case-INSENSITIVE by default — a page-wide
    // loose match reports a leak that isn't there.
    await expect(
      report
        .locator('.aud-print-body')
        .getByText(AUDIT_STANDARD.clauses.documentControl.title, { exact: true }),
      'a conforming clause must not appear in the shared report',
    ).toHaveCount(0)
    await expect(
      report.locator('.aud-print-body').getByText(AUDIT_STANDARD.clauses.training.title, {
        exact: true,
      }),
      'nor a non-conforming one — the finding carries the clause, the report has no clause table',
    ).toHaveCount(0)

    await report.close()
  })
})
