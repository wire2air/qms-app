// PW-J3 · Supplier audit: agenda → release → supplier remediation (MTC-09/10).
//
// The supplier-facing half of the module is the only place where a non-employee
// writes to audit data, and its authorisation is NOT the permission system:
// respondToFinding / completeFinding fall back to a shared_with_user grant
// (assertCanRespondToFinding). Both the grant being created and the response
// landing are asserted here.
//
// The supplier persona has no storageState of its own — auth.setup.js logs in
// every USERS entry and an EXTERNAL_SUPPLIER failing there would take down every
// suite — so this journey mints its own session, the same way the NCR and sites
// suites do.
import { test, expect } from '../../video/fixtures/videoTest.js'
import {
  AUTH,
  USERS,
  SUPPLIER_USER,
  FIXTURES,
  AUDIT_STANDARD,
  COMPANY_ID,
} from '../fixtures/cast.js'
import { freshContext } from '../fixtures/sites.js'
import {
  auditRow,
  createAdHocAudit,
  fillRichText,
  findingsOf,
  openAuditTab,
  scoreClause,
  startAudit,
  uniqueScope,
} from '../fixtures/audits.js'
import { sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J3 · supplier audit remediation loop', () => {
  test('agenda + release share the audit with the supplier, who responds and completes a finding', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    const scope = uniqueScope('J3')
    const audit = await createAdHocAudit(page, scope, {
      type: 'Supplier',
      supplierName: FIXTURES.ncrSupplierWithPortal,
      auditeeName: SUPPLIER_USER.name,
    })
    expect(audit.programTypeId).toBe('SUPPLIER')

    // Creating with an auditee already grants the read-only share + notifies.
    await waitForSqlValue(
      `SELECT count(*) FROM shared_with_user
        WHERE entity_type = 'AuditInstance' AND entity_id = '${audit.id}'
          AND user_id = '${SUPPLIER_USER.id}'`,
      { timeoutMs: 30_000, label: 'auditee share granted at create' },
    )

    await startAudit(page)
    await openAuditTab(page, 'Requirements')
    await scoreClause(page, audit.id, AUDIT_STANDARD.clauses.training, 'Major NC')
    const [finding] = findingsOf(audit.id)
    expect(finding, 'MAJOR_NC raised an auto-finding').toBeTruthy()

    // ── Agenda: all clauses are pre-ticked, so this is a straight send.
    await openAuditTab(page, 'Information')
    await page.getByRole('button', { name: 'Generate & Send to Supplier' }).click()
    await waitForSqlValue(
      `SELECT (agenda->>'sentAt') IS NOT NULL FROM audit_instances WHERE id = '${audit.id}'`,
      { timeoutMs: 30_000, label: 'agenda stamped on the audit' },
    )
    expect(
      Number(
        sqlValue(
          `SELECT jsonb_array_length(agenda->'clauseIds') FROM audit_instances WHERE id = '${audit.id}'`,
        ),
      ),
      'every clause in the snapshot goes into the agenda by default',
    ).toBe(3)
    // NTF-02 — the in-app notice is written inline (the rich agenda email is a
    // worker job, which the worker may already have drained, so the durable
    // notification row is what this asserts on).
    await waitForSqlValue(
      `SELECT count(*) FROM notifications
        WHERE resource_type = 'AuditInstance' AND resource_id = '${audit.id}'
          AND user_id = '${SUPPLIER_USER.id}' AND title LIKE 'Audit agenda%'`,
      { timeoutMs: 30_000, label: 'supplier notified about the agenda' },
    )

    // ── Release: unlocks the supplier's Requirements/Findings/OFI tabs.
    await page.getByRole('button', { name: 'Release to Supplier' }).click()
    await waitForSqlValue(
      `SELECT released_at IS NOT NULL FROM audit_instances WHERE id = '${audit.id}'`,
      { timeoutMs: 30_000, label: 'audit released to supplier' },
    )
    expect(auditRow(audit.id).releasedAt).toBeTruthy()

    // ── Supplier side.
    const supplierCtx = await freshContext(browser, SUPPLIER_USER)
    const supplierPage = await supplierCtx.newPage()
    await supplierPage.goto(`/audits/instances/${audit.id}`, { waitUntil: 'domcontentloaded' })

    // The supplier holds no audit permission at all — RLS + the share are what
    // let them in, and `audits` being SUPPLIER_EXEMPT is what gets them past the
    // route guard.
    await expect(supplierPage).toHaveURL(new RegExp(`/audits/instances/${audit.id}`))
    await expect(supplierPage.getByText(audit.auditNumber).first()).toBeVisible({ timeout: 30_000 })

    await supplierPage.getByRole('tab', { name: /Findings/i }).click()
    const findingRow = supplierPage.getByText(finding.findingNumber, { exact: true }).first()
    await expect(findingRow).toBeVisible({ timeout: 30_000 })
    // Expand the row to reach the supplier "CAPA / Response" block.
    await findingRow.locator('xpath=preceding::button[1]').click()

    const response = 'Retrained the line and re-issued the training matrix (E2E J3).'
    await fillRichText(supplierPage, 'Describe the corrective action / response…', response)
    // The response field autosaves on a debounce while "Mark Complete" fires
    // immediately — wait for the text to land, or the completion can beat it.
    await waitForSqlValue(
      `SELECT count(*) FROM audit_findings WHERE id = '${finding.id}' AND response_text IS NOT NULL`,
      { timeoutMs: 30_000, label: 'supplier response persisted' },
    )
    await supplierPage.getByRole('button', { name: 'Mark Complete' }).first().click()

    await waitForSqlValue(
      `SELECT count(*) FROM audit_findings WHERE id = '${finding.id}' AND completed_at IS NOT NULL`,
      { timeoutMs: 45_000, label: 'finding marked complete by the supplier' },
    )
    const completedBy = sqlValue(
      `SELECT completed_by FROM audit_findings WHERE id = '${finding.id}'`,
    )
    expect(completedBy, 'the supplier is recorded as the completer').toBe(SUPPLIER_USER.id)
    expect(
      sqlValue(`SELECT coalesce(response_text,'') FROM audit_findings WHERE id = '${finding.id}'`),
    ).toContain('Retrained the line')

    // NTF-04 — completing the LAST unresolved finding pings the lead auditor.
    await waitForSqlValue(
      `SELECT count(*) FROM notifications
        WHERE company_id = '${COMPANY_ID}' AND user_id = '${USERS.author.id}'
          AND resource_type = 'AuditInstance' AND resource_id = '${audit.id}'
          AND title LIKE 'Audit ready for review%'`,
      { timeoutMs: 45_000, label: 'lead auditor notified the audit is ready for review' },
    )

    await supplierCtx.close()
  })
})
