// AE-J3 · Findings, the CAPA link, and the completion gate (PW-AE-J5/J6/J8.6;
// MTC-11/12/13/16).
//
// Certification audits have no close-out workflow: "Mark Completed" PATCHes
// statusId CLOSED directly, and updateAuditInstance's certCompletion branch
// refuses while any finding is neither CLOSED nor CANCELLED. The gate is
// server-side, so each half is asserted in the database, not just the toast.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { findCapaByTitle, waitForSqlValue } from '../fixtures/db.js'
import { fillRichText, findingsOf } from '../fixtures/audits.js'
import { fillCapaCreateForm, uniqueTitle } from '../fixtures/capas.js'
import {
  apiAs,
  auditeeRow,
  cleanupAudits,
  createExternalAudit,
  createFindingApi,
  openAuditee,
  openTab,
  registerReportApi,
  uniqueTag,
  visibleOnTab,
  visibleText,
  visibleWithResync,
} from '../fixtures/auditee.js'

test.use({ storageState: AUTH.author })

const created = []
test.afterAll(() => cleanupAudits(created))

const FINDING_PLACEHOLDER =
  'What was observed? Include the requirement reference + evidence summary.'

async function raiseFindingInUi(page, text) {
  await page.getByRole('button', { name: 'New Finding' }).click()
  await expect(page.getByRole('heading', { name: 'New Finding' })).toBeVisible({ timeout: 20_000 })
  await fillRichText(page, FINDING_PLACEHOLDER, text)
  await page.getByRole('button', { name: 'Create Finding' }).click()
  await expect(page.getByRole('heading', { name: 'New Finding' })).toBeHidden({ timeout: 20_000 })
}

test.describe('AE-J3 · findings through to completion', () => {
  test('a finding added by hand lands on Findings; one added from the OFI tab is an OFI', async ({
    page,
    playwright,
  }) => {
    const api = await apiAs(playwright)
    const audit = await createExternalAudit(api, { tag: 'J3 findings', start: true })
    created.push(audit.id)
    await api.dispose()

    const ncText = uniqueTag('J3 manual NC')
    const ofiText = uniqueTag('J3 manual OFI')
    await openAuditee(page, audit.id, audit.auditNumber)

    await visibleOnTab(page, 'Findings', () => page.getByRole('button', { name: 'New Finding' }))
    await raiseFindingInUi(page, ncText)
    await visibleOnTab(page, 'OFI', () => page.getByRole('button', { name: 'New Finding' }))
    await raiseFindingInUi(page, ofiText)

    await waitForSqlValue(
      `SELECT count(*) FROM audit_findings WHERE audit_instance_id = '${audit.id}' AND deleted_at IS NULL`,
      { timeoutMs: 20_000, label: 'two findings written' },
    )
    const rows = findingsOf(audit.id)
    expect(rows).toHaveLength(2)
    const byType = Object.fromEntries(rows.map((f) => [f.typeId, f]))
    // Findings tab seeds MINOR_NC; the OFI tab seeds OFI (defaultTypeId).
    expect(Object.keys(byType).sort()).toEqual(['MINOR_NC', 'OFI'])
    for (const f of rows) expect(f.statusId, 'every finding starts OPEN').toBe('OPEN')

    // The tabs are two filters over one table — each shows only its own.
    await visibleOnTab(page, 'OFI', () => visibleText(page, ofiText))
    await expect(visibleText(page, ncText)).toHaveCount(0)
    await visibleOnTab(page, 'Findings', () => visibleText(page, ncText))
    await expect(visibleText(page, ofiText)).toHaveCount(0)
    // No report on this audit → the per-report filter control is absent (MTC-11).
    await expect(visibleText(page, 'All reports', { exact: true })).toHaveCount(0)
  })

  test('a finding raises a CAPA through the deep link, and the CAPA links back to /auditee', async ({
    page,
    playwright,
  }) => {
    test.setTimeout(240_000)
    const api = await apiAs(playwright)
    const audit = await createExternalAudit(api, { tag: 'J3 capa', start: true })
    created.push(audit.id)
    const finding = await createFindingApi(api, audit.id, {
      description: uniqueTag('J3 finding for CAPA'),
    })
    await api.dispose()

    await openAuditee(page, audit.id, audit.auditNumber)
    await visibleOnTab(page, 'Findings', () => visibleText(page, finding.findingNumber))
    // Expand the row (the chevron precedes the finding number) to reach its links.
    await visibleText(page, finding.findingNumber)
      .first()
      .locator('xpath=preceding::button[1]')
      .click()
    await page.getByRole('button', { name: 'New CAPA' }).first().click()
    await expect(page).toHaveURL(new RegExp(`/capas/create\\?findingId=${finding.id}`), {
      timeout: 30_000,
    })

    const capaTitle = uniqueTitle('AE-J3')
    await fillCapaCreateForm(page, capaTitle)
    const capa = findCapaByTitle(capaTitle)
    expect(capa, 'the CAPA row exists').toBeTruthy()
    await waitForSqlValue(
      `SELECT count(*) FROM audit_findings WHERE id = '${finding.id}' AND spawned_capa_id = '${capa.id}'`,
      { timeoutMs: 45_000, label: 'the new CAPA self-linked to the certification finding' },
    )

    // The CAPA's Audit Origin panel routes a certification finding to /auditee.
    await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await visibleWithResync(page, page.locator(`a[href*="/auditee/${audit.id}"]`))
  })

  test('Mark Completed is refused while a finding is open, allowed once it closes — and then nothing is editable', async ({
    page,
    playwright,
  }) => {
    test.setTimeout(180_000)
    const api = await apiAs(playwright)
    const audit = await createExternalAudit(api, { tag: 'J3 completion', start: true })
    created.push(audit.id)
    const finding = await createFindingApi(api, audit.id, {
      description: uniqueTag('J3 open finding'),
    })
    await api.dispose()

    await openAuditee(page, audit.id, audit.auditNumber)
    const complete = () => page.getByRole('button', { name: 'Mark Completed' })
    await visibleWithResync(page, complete())

    // ── Refused: one finding still open.
    await complete().click()
    await expect(page.getByText(/Cannot complete — 1 finding\(s\) are still open/)).toBeVisible({
      timeout: 20_000,
    })
    expect(auditeeRow(audit.id).statusId, 'a refused completion changes nothing').toBe('OPEN')

    // ── Close the finding from the Findings tab.
    await visibleOnTab(page, 'Findings', () =>
      page.locator('button[title="Close this finding"]').filter({ visible: true }),
    )
    await page.locator('button[title="Close this finding"]').filter({ visible: true }).click()
    await waitForSqlValue(
      `SELECT count(*) FROM audit_findings WHERE id = '${finding.id}' AND status_id = 'CLOSED'`,
      { timeoutMs: 20_000, label: 'finding closed' },
    )

    // ── Allowed: straight to CLOSED, no close-out workflow.
    await complete().click()
    await expect(page.getByText('Audit completed')).toBeVisible({ timeout: 20_000 })
    await waitForSqlValue(
      `SELECT count(*) FROM audit_instances WHERE id = '${audit.id}'
          AND status_id = 'CLOSED' AND execution_phase = 'COMPLETE' AND completed_at IS NOT NULL`,
      { timeoutMs: 20_000, label: 'certification audit closed directly' },
    )

    // ── Terminal: every lifecycle action and every editable control is gone.
    await expect(async () => {
      await expect(complete()).toHaveCount(0, { timeout: 5_000 })
    }).toPass({ timeout: 45_000 })
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
    await openTab(page, 'Information')
    await expect(page.getByRole('button', { name: /Upload agenda|Replace agenda file/ })).toHaveCount(0)
    await openTab(page, 'Findings')
    await expect(page.getByRole('button', { name: 'New Finding' })).toHaveCount(0)

    // ── MTC-16 / pack 19 risk 5 (pins CURRENT behaviour): once CLOSED the
    // Certificate tab offers no upload. If the product decides certificates
    // arrive after completion, this flips and becomes the regression guard.
    await visibleOnTab(page, 'Certificate', () => visibleText(page, 'No certificate uploaded yet'))
    await expect(page.getByRole('button', { name: 'Upload certificate' })).toHaveCount(0)
  })

  test('findings carry their source report; the per-report filter and jump separate them (MTC-11)', async ({
    page,
    playwright,
  }) => {
    const api = await apiAs(playwright)
    const audit = await createExternalAudit(api, { tag: 'J3 per-report', start: true })
    created.push(audit.id)
    const stamp = Date.now()
    const titleA = `E2E Stage 1 Report ${stamp}`
    const titleB = `E2E Stage 2 Report ${stamp}`
    const repA = await registerReportApi(api, audit.id, { title: titleA })
    const repB = await registerReportApi(api, audit.id, { title: titleB })
    const fromA = uniqueTag('J3 from report A')
    const fromB = uniqueTag('J3 from report B')
    const manual = uniqueTag('J3 added manually')
    await createFindingApi(api, audit.id, { description: fromA, auditReportId: repA.id })
    await createFindingApi(api, audit.id, { description: fromB, auditReportId: repB.id })
    await createFindingApi(api, audit.id, { description: manual })
    await api.dispose()

    await openAuditee(page, audit.id, audit.auditNumber)
    await visibleOnTab(page, 'Findings', () => visibleText(page, fromB))
    await expect(visibleText(page, '3 findings', { exact: true })).toHaveCount(1)
    // A report-sourced finding names its report; a manual one carries no chip.
    await expect(page.locator(`[title="From report: ${titleA}"]`).filter({ visible: true })).toHaveCount(1)
    await expect(page.locator(`[title="From report: ${titleB}"]`).filter({ visible: true })).toHaveCount(1)

    const filter = () =>
      page.getByRole('combobox').filter({ hasText: 'All reports' }).filter({ visible: true }).first()
    await filter().click()
    await page.getByRole('option', { name: 'Added manually' }).click()
    await expect(visibleText(page, manual)).toHaveCount(1)
    await expect(visibleText(page, fromA)).toHaveCount(0)
    await expect(visibleText(page, fromB)).toHaveCount(0)

    // The Reports tab's per-row jump lands on Findings pre-filtered to THAT report.
    await visibleOnTab(page, 'Reports', () => visibleText(page, titleB, { exact: true }))
    await visibleText(page, titleB, { exact: true })
      .first()
      .locator('xpath=following::button[normalize-space()="Findings"][1]')
      .click()
    await expect(visibleText(page, fromB)).toHaveCount(1)
    await expect(visibleText(page, fromA)).toHaveCount(0)
    await expect(visibleText(page, manual)).toHaveCount(0)
  })
})
