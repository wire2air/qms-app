// PW-J5 · Several findings → ONE CAPA (MTC-11b).
//
// The bulk bar's "Create CAPA" deep-links to /capas/create?findingIds=a,b — the
// plural param. The distinguishing assertion is that ONE CAPA is created and
// BOTH findings' spawned_capa_id point at it: a per-finding create would be a
// silent regression that still leaves both findings "linked".
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, AUDIT_STANDARD } from '../fixtures/cast.js'
import { fillCapaCreateForm, uniqueTitle } from '../fixtures/capas.js'
import { findCapaByTitle, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  createAdHocAudit,
  findingsOf,
  openAuditTab,
  scoreClause,
  startAudit,
  uniqueScope,
} from '../fixtures/audits.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J5 · one CAPA raised from multiple findings', () => {
  test('select two findings → Create CAPA → both point at the same CAPA', async ({ page }) => {
    test.setTimeout(300_000)

    const scope = uniqueScope('J5')
    const audit = await createAdHocAudit(page, scope)
    await startAudit(page)
    await openAuditTab(page, 'Requirements')
    await scoreClause(page, audit.id, AUDIT_STANDARD.clauses.documentControl, 'Major NC')
    await scoreClause(page, audit.id, AUDIT_STANDARD.clauses.training, 'Major NC')

    const findings = findingsOf(audit.id)
    expect(findings).toHaveLength(2)

    await openAuditTab(page, 'Findings')
    for (const finding of findings) {
      await expect(page.getByText(finding.findingNumber, { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      })
    }
    // The per-row select checkboxes carry title="Select for CAPA".
    const checkboxes = page.locator('input[type="checkbox"][title="Select for CAPA"]')
    await expect(checkboxes).toHaveCount(2)
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    await expect(page.getByText('2 findings selected')).toBeVisible()

    await page.getByRole('button', { name: 'Create CAPA' }).click()
    await expect(page).toHaveURL(/\/capas\/create\?findingIds=/, { timeout: 30_000 })
    const url = new URL(page.url())
    expect(
      url.searchParams.get('findingIds').split(',').sort(),
      'both finding ids ride the deep link',
    ).toEqual(findings.map((f) => f.id).sort())

    const capaTitle = uniqueTitle('J5-bulk')
    await fillCapaCreateForm(page, capaTitle)
    const capa = findCapaByTitle(capaTitle)
    expect(capa).toBeTruthy()

    for (const finding of findings) {
      await waitForSqlValue(
        `SELECT count(*) FROM audit_findings WHERE id = '${finding.id}' AND spawned_capa_id = '${capa.id}'`,
        { timeoutMs: 45_000, label: `finding ${finding.findingNumber} linked to the bulk CAPA` },
      )
    }
    expect(
      Number(
        sqlValue(
          `SELECT count(DISTINCT spawned_capa_id) FROM audit_findings WHERE audit_instance_id = '${audit.id}'`,
        ),
      ),
      'exactly one CAPA covers both findings',
    ).toBe(1)
  })
})
