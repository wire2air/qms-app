// AE-J2 · What the auditing body sends: agenda, reports, summaries, the
// certificate (PW-AE-J2, J3's stored-state half, J7; MTC-03/05/07/10).
//
// AI: the E2ELAB tenant has no company_ai_profile, so `canUseAi` is false and
// the extraction button must not render — that IS the degraded path, and it is
// asserted rather than skipped. No proposal is ever written by this suite: the
// one extraction state it seeds is the PENDING marker (no model output), which
// is how PW-AE-J3 specifies the row → UI contract should be tested.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  apiAs,
  auditeeRow,
  chooseFile,
  cleanupAudits,
  createExternalAudit,
  openAuditee,
  openTab,
  pdfFile,
  registerReportApi,
  reportsOf,
  textFile,
  uniqueTag,
  visibleOnTab,
  visibleText,
  visibleWithResync,
} from '../fixtures/auditee.js'

test.use({ storageState: AUTH.author })

const created = []
test.afterAll(() => cleanupAudits(created))

async function freshAudit(playwright, tag, { report = null } = {}) {
  const api = await apiAs(playwright, 'author')
  const audit = await createExternalAudit(api, { tag, start: true })
  created.push(audit.id)
  const out = { audit }
  if (report) out.report = await registerReportApi(api, audit.id, { title: report })
  await api.dispose()
  return out
}

test.describe('AE-J2 · agenda, reports and certificate', () => {
  test('agenda: upload the registrar’s file and keep prep notes beside it', async ({
    page,
    playwright,
  }) => {
    const { audit } = await freshAudit(playwright, 'J2 agenda')
    await openAuditee(page, audit.id, audit.auditNumber)

    await chooseFile(page, 'Upload agenda', pdfFile('e2e-registrar-agenda.pdf'))
    await expect(page.getByText('Agenda uploaded')).toBeVisible({ timeout: 20_000 })
    await waitForSqlValue(
      `SELECT count(*) FROM audit_instances WHERE id = '${audit.id}'
          AND agenda->>'assetId' IS NOT NULL AND agenda->>'assetName' = 'e2e-registrar-agenda.pdf'`,
      { timeoutMs: 20_000, label: 'agenda asset stored on the audit' },
    )
    // The stored file renders as a link once the row round-trips to IndexedDB.
    await visibleWithResync(page, page.getByRole('link', { name: 'e2e-registrar-agenda.pdf' }))

    const notes = uniqueTag('J2 prep notes')
    await page.getByPlaceholder(/Preparation notes/).fill(notes)
    await waitForSqlValue(
      `SELECT count(*) FROM audit_instances WHERE id = '${audit.id}' AND agenda->>'notes' = '${notes}'`,
      { timeoutMs: 20_000, label: 'agenda notes autosaved' },
    )
    const agenda = auditeeRow(audit.id).agenda
    expect(agenda.assetName, 'saving the notes must not drop the uploaded file').toBe(
      'e2e-registrar-agenda.pdf',
    )
    expect(agenda.assetId).toBeTruthy()
  })

  test('reports: upload a PDF, flip Interim → Final, refuse a non-PDF — and no AI affordance on a non-AI tenant', async ({
    page,
    playwright,
  }) => {
    const { audit } = await freshAudit(playwright, 'J2 reports')
    const title = `E2E Interim ${Date.now()}`
    await openAuditee(page, audit.id, audit.auditNumber)
    await visibleOnTab(page, 'Reports', () => visibleText(page, 'No auditor reports uploaded yet'))

    await chooseFile(page, 'Upload report PDF', pdfFile(`${title}.pdf`))
    await expect(page.getByText('Report uploaded.')).toBeVisible({ timeout: 20_000 })
    const utcToday = new Date().toISOString().slice(0, 10)
    await waitForSqlValue(
      `SELECT count(*) FROM audit_reports WHERE audit_instance_id = '${audit.id}'
          AND title = '${title}' AND kind = 'INTERIM' AND report_date = '${utcToday}'
          AND uploaded_by = '${USERS.author.id}'`,
      { timeoutMs: 20_000, label: 'report registered as INTERIM, dated today, by the uploader' },
    )

    // The row renders with an inline kind picker; flip it to Final.
    await visibleOnTab(page, 'Reports', () => visibleText(page, title, { exact: true }))
    await visibleText(page, title, { exact: true })
      .first()
      .locator('xpath=following::*[@role="combobox"][1]')
      .click()
    await page.getByRole('option', { name: 'Final', exact: true }).click()
    await waitForSqlValue(
      `SELECT count(*) FROM audit_reports WHERE audit_instance_id = '${audit.id}' AND title = '${title}' AND kind = 'FINAL'`,
      { timeoutMs: 20_000, label: 'kind flipped to FINAL' },
    )

    // A non-PDF is refused in the browser — nothing uploaded, no row written.
    const junk = `not-a-report-${Date.now()}.txt`
    await chooseFile(page, 'Upload report PDF', textFile(junk))
    await expect(page.getByText('Auditor reports are PDFs.')).toBeVisible({ timeout: 10_000 })
    expect(reportsOf(audit.id)).toHaveLength(1)
    expect(Number(sqlValue(`SELECT count(*) FROM assets WHERE original_filename = '${junk}'`))).toBe(0)

    // AI degrade: the tenant is not AI-enabled, so the session says so and the
    // row offers no extraction — its Summary / Findings / OFI jumps remain.
    const session = await (await page.request.get('/api/v1/auth/session')).json()
    const s = session?.session
    const aiEnabled = s?.aiEnabled ?? s?.companies?.[s?.activeCompanyId]?.aiEnabled
    expect(!!aiEnabled, 'E2ELAB carries no company_ai_profile').toBe(false)
    await expect(page.getByRole('button', { name: /AI Extract|Re-extract/ })).toHaveCount(0)
    for (const jump of ['Summary', 'Findings', 'OFI']) {
      await expect(page.getByRole('button', { name: jump, exact: true }).first()).toBeVisible()
    }
  })

  test('summary: one editable summary per report, autosaved and shown back on the register', async ({
    page,
    playwright,
  }) => {
    const title = `E2E Summary Report ${Date.now()}`
    const { audit } = await freshAudit(playwright, 'J2 summary', { report: title })
    const summary = uniqueTag('J2 report summary')
    await openAuditee(page, audit.id, audit.auditNumber)

    const box = () => page.getByPlaceholder(/What this report concluded/)
    await visibleOnTab(page, 'Summary', box)
    await box().first().fill(summary)
    await waitForSqlValue(
      `SELECT count(*) FROM audit_reports WHERE audit_instance_id = '${audit.id}' AND notes = '${summary}'`,
      { timeoutMs: 20_000, label: 'summary autosaved to audit_reports.notes' },
    )
    await visibleOnTab(page, 'Reports', () => visibleText(page, summary))
  })

  test('an extraction marker lives on the row: it survives a reload, and Cancel clears it', async ({
    page,
    playwright,
  }) => {
    const title = `E2E Pending Report ${Date.now()}`
    const { audit, report } = await freshAudit(playwright, 'J2 pending', { report: title })
    // The PENDING marker exactly as extractAuditReportFindings writes it. No
    // model output is seeded — only the state a queued job leaves behind.
    sql(
      `UPDATE audit_reports SET ai_extraction = jsonb_build_object(
          'pending', true,
          'requestedAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'requestedBy', '${USERS.author.id}')
        WHERE id = '${report.id}'`,
    )
    await openAuditee(page, audit.id, audit.auditNumber)
    const extracting = () => page.getByRole('button', { name: /Extracting/ })
    await visibleOnTab(page, 'Reports', extracting)
    await expect(extracting()).toBeDisabled()

    // MTC-07: the state is on the ROW, not in the tab — a hard reload keeps it.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await visibleOnTab(page, 'Reports', extracting)

    // MTC-10: Cancel clears the marker. The header also has a "Cancel" (the
    // audit's own) — the row's is the button right after "Extracting…".
    await extracting().locator('xpath=following::button[1]').click()
    await expect(page.getByText(/Extraction cancelled/)).toBeVisible({ timeout: 20_000 })
    await waitForSqlValue(
      `SELECT count(*) FROM audit_reports WHERE id = '${report.id}' AND ai_extraction IS NULL`,
      { timeoutMs: 20_000, label: 'extraction marker cleared' },
    )
    await expect(extracting()).toHaveCount(0, { timeout: 20_000 })
    // Still a non-AI tenant: cancelling does not surface an extract button.
    await expect(page.getByRole('button', { name: /AI Extract|Re-extract/ })).toHaveCount(0)
  })

  test('certificate: uploaded before completion, kept apart from the reports', async ({
    page,
    playwright,
  }) => {
    const { audit } = await freshAudit(playwright, 'J2 certificate')
    const title = `E2E ISO Certificate ${Date.now()}`
    await openAuditee(page, audit.id, audit.auditNumber)
    await visibleOnTab(page, 'Certificate', () =>
      page.getByRole('button', { name: 'Upload certificate', exact: true }),
    )
    await chooseFile(page, 'Upload certificate', pdfFile(`${title}.pdf`))
    await expect(page.getByText('Certificate uploaded.')).toBeVisible({ timeout: 20_000 })
    await waitForSqlValue(
      `SELECT count(*) FROM audit_reports WHERE audit_instance_id = '${audit.id}' AND title = '${title}' AND kind = 'CERTIFICATE'`,
      { timeoutMs: 20_000, label: 'certificate registered as kind CERTIFICATE' },
    )
    await visibleOnTab(page, 'Certificate', () => visibleText(page, title, { exact: true }))
    await expect(visibleText(page, 'CERTIFICATE', { exact: true })).toHaveCount(1)

    // Not a report: absent from the Reports register and from the Summary tab.
    await openTab(page, 'Reports')
    await expect(visibleText(page, 'No auditor reports uploaded yet')).toHaveCount(1)
    await expect(visibleText(page, title, { exact: true })).toHaveCount(0)
    await openTab(page, 'Summary')
    await expect(visibleText(page, 'No reports yet')).toHaveCount(1)
  })
})

test.describe('AE-J2 · the extraction worker honours cancel and supersede (PW-AE-J4)', () => {
  // DB + worker only. The job is enqueued with the payload shape
  // extractAuditReportFindings enqueues, but with a requestedAt that no longer
  // matches the row. audit_report_extract checks that FIRST, right after
  // loading the report and before any permission load or model call — so the
  // run aborts without reaching the AI provider. No proposal is produced.
  function enqueueExtract({ auditId, reportId, requestedAt }) {
    const payload = JSON.stringify({
      companyId: COMPANY_ID,
      userId: USERS.author.id,
      isOwner: false,
      auditInstanceId: auditId,
      reportId,
      requestedAt,
      extractedText: 'E2E AUDITEE late-worker probe '.padEnd(80, 'x'),
      standardName: null,
    })
    return sqlValue(`SELECT (graphile_worker.add_job('audit_report_extract', '${payload}'::json)).id`)
  }
  async function waitJobGone(jobId) {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      if (sqlValue(`SELECT count(*) FROM graphile_worker.jobs WHERE id = ${jobId}`) === '0') return
      await new Promise((r) => setTimeout(r, 1_000))
    }
    throw new Error(`the worker never completed job ${jobId}`)
  }
  const markerOf = (reportId) =>
    sqlValue(`SELECT coalesce(ai_extraction::text, 'NULL') FROM audit_reports WHERE id = '${reportId}'`)

  test('a late run cannot resurrect a cancelled extraction, nor overwrite a newer request', async ({
    playwright,
  }) => {
    const { audit, report } = await freshAudit(playwright, 'J2 late worker', {
      report: `E2E Late Worker ${Date.now()}`,
    })
    const runA = '2026-09-14T08:00:00.000Z'
    const runB = '2026-09-14T09:00:00.000Z'

    // Cancelled: the marker is already NULL (Cancel's effect) when A executes.
    expect(markerOf(report.id)).toBe('NULL')
    await waitJobGone(enqueueExtract({ auditId: audit.id, reportId: report.id, requestedAt: runA }))
    expect(markerOf(report.id), 'a cancelled run must not write its result').toBe('NULL')

    // Superseded: B is the live request when A's late job executes.
    sql(
      `UPDATE audit_reports SET ai_extraction = jsonb_build_object(
          'pending', true, 'requestedAt', '${runB}', 'requestedBy', '${USERS.author.id}')
        WHERE id = '${report.id}'`,
    )
    await waitJobGone(enqueueExtract({ auditId: audit.id, reportId: report.id, requestedAt: runA }))
    expect(
      sqlValue(`SELECT ai_extraction->>'requestedAt' FROM audit_reports WHERE id = '${report.id}'`),
      'only the newer request’s marker survives',
    ).toBe(runB)
    expect(sqlValue(`SELECT ai_extraction->>'pending' FROM audit_reports WHERE id = '${report.id}'`)).toBe(
      'true',
    )
    expect(
      Number(sqlValue(`SELECT count(*) FROM audit_findings WHERE audit_instance_id = '${audit.id}'`)),
      'no finding is ever written by the worker',
    ).toBe(0)
    sql(`UPDATE audit_reports SET ai_extraction = NULL WHERE id = '${report.id}'`)
  })
})
