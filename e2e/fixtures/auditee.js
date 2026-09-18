// Shared fixtures, flows and DB readers for the `auditee` project.
//
// The Auditee module is the company's view of being audited BY an outside body
// (/auditee) — an EXTERNAL audit_instances row. It shares the table, the
// findings panel and most controllers with the auditor module (fixtures/
// audits.js), so this file reuses that module's helpers and adds only what is
// auditee-specific.
//
// Two rules every journey here follows:
//
//  1. **The seeded audits are read-only fixtures.** e2e-seed.sql §40 seeds
//     AUD-EXT-0900 (OPEN) and AUD-EXT-0901 (CLOSED). CLOSED/CANCELLED are
//     terminal for every caller, so a spec that closed the seeded open audit
//     would break every later run. Anything that mutates an audit creates its
//     own through `createExternalAudit` and soft-deletes it in `cleanupAudits`.
//
//  2. **Detail tabs are `mode: 'panel', lazy: false`.** Every panel is mounted
//     at once and toggled with v-show, so a text locator can resolve inside a
//     HIDDEN panel. Role locators exclude display:none; text locators need
//     `visibleText()` below.
import { expect } from '@playwright/test'
import { AUTH, BASE_URL, COMPANY_ID, USERS } from './cast.js'
import { sql, sqlRow, sqlValue, siteGucSql, waitForSqlValue } from './db.js'
import { dateInDays, forceResync } from './audits.js'
import { execFileSync } from 'node:child_process'

export const AUDITEE = {
  open: {
    id: 'e2eae000-0000-4000-8000-000000000900',
    number: 'AUD-EXT-0900',
    firm: 'E2E Registrar Ltd',
    auditorName: 'Rhoda Registrar',
    email: 'rhoda@registrar.e2e.test',
    phone: '+1 555 0100',
    agendaNotes: 'E2E AUDITEE agenda notes — opening meeting 09:00, Board Room A.',
    // The registrar's interim report — on the audit the no-grant participant
    // is invited to, so report visibility can be compared persona by persona.
    reportId: 'e2eae300-0000-4000-8000-000000000901',
    reportTitle: 'E2E Registrar Interim Report',
  },
  closed: {
    id: 'e2eae000-0000-4000-8000-000000000901',
    number: 'AUD-EXT-0901',
    firm: 'E2E Certification Body',
    reportId: 'e2eae300-0000-4000-8000-000000000900',
    reportTitle: 'E2E Certification Body Final Report',
  },
  // Pre-split EXTERNAL audit with a walkthrough response no screen renders.
  legacy: {
    id: 'e2eae000-0000-4000-8000-000000000902',
    number: 'AUD-EXT-0902',
    responseId: 'e2eae500-0000-4000-8000-000000000900',
    responseComment: 'E2E AUDITEE legacy walkthrough response — must survive the auditor/auditee split.',
  },
  findings: {
    openNc: { id: 'e2eae200-0000-4000-8000-000000000900', number: 'FND-E2E-0900' },
    closedObservation: { id: 'e2eae200-0000-4000-8000-000000000901', number: 'FND-E2E-0901' },
    openOfi: { id: 'e2eae200-0000-4000-8000-000000000902', number: 'FND-E2E-0902' },
    closedMajor: { id: 'e2eae200-0000-4000-8000-000000000903', number: 'FND-E2E-0903' },
  },
}

/** Unique, greppable text for one test's records. */
export function uniqueTag(tag) {
  return `E2E AUDITEE ${tag} ${Date.now()}`
}

// A tiny but well-formed PDF. The upload route validates the declared mime
// type (isAllowedFileType), not the bytes, but a real PDF keeps the file
// honest if anything downstream ever parses it.
const MINIMAL_PDF = [
  '%PDF-1.4',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj',
  'trailer<</Root 1 0 R>>',
  '%%EOF',
].join('\n')

/** A Playwright file payload for setFiles / multipart. */
export function pdfFile(name = 'e2e-report.pdf') {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(MINIMAL_PDF) }
}

/** A non-PDF payload — the reports panel must refuse it client-side. */
export function textFile(name = 'not-a-report.txt') {
  return { name, mimeType: 'text/plain', buffer: Buffer.from('this is not a pdf') }
}

/** An API context signed in as `role` (storageState reuse — no new login). */
export async function apiAs(playwright, role = 'author') {
  return playwright.request.newContext({ baseURL: BASE_URL, storageState: AUTH[role] })
}

/**
 * Create an EXTERNAL audit through the same REST route the dialog posts to.
 * Used by journeys whose subject is NOT creation (reports, findings, the
 * completion gate) so each test owns a fresh, mutable record. The Lead POC is
 * the author; `teamUserIds` join as TEAM.
 */
export async function createExternalAudit(api, { tag, teamUserIds = [], start = false } = {}) {
  const scope = uniqueTag(tag || 'journey')
  const res = await api.post('/api/v1/services/auditInstances', {
    data: {
      programTypeId: 'EXTERNAL',
      scheduledDate: dateInDays(7),
      leadAuditorUserId: USERS.author.id,
      teamUserIds,
      externalAuditFirm: 'E2E Journey Registrar',
      externalAuditorName: 'Jo Journey',
      externalAuditorEmail: 'jo@journey.e2e.test',
      externalAuditorPhone: '+1 555 0142',
      scope: `<p>${scope}</p>`,
    },
  })
  const text = await res.text()
  expect(res.status(), `create EXTERNAL audit → ${res.status()} ${text.slice(0, 300)}`).toBe(201)
  const body = JSON.parse(text)
  const instance = body.auditInstance ?? body.data?.auditInstance
  expect(instance?.id, 'create response carries the new audit').toBeTruthy()
  // requireCompanyAccess commits its transaction in res.on('finish') — AFTER
  // the 201 is on the wire — so an immediate follow-up request can 404 on a row
  // that is not committed yet (observed: "start audit → 404 AuditInstance not
  // found"). Wait for the commit before touching the record again.
  await waitForSqlValue(`SELECT count(*) FROM audit_instances WHERE id = '${instance.id}'`, {
    timeoutMs: 15_000,
    intervalMs: 250,
    label: 'created audit committed',
  })
  if (start) await startAuditApi(api, instance.id)
  return { id: instance.id, auditNumber: instance.auditNumber, scope }
}

/** SCHEDULED → IN_PROGRESS, exactly the PATCH the Start Audit action sends. */
export async function startAuditApi(api, auditId) {
  const res = await api.patch(`/api/v1/services/auditInstances/${auditId}`, {
    data: { statusId: 'OPEN', executionPhase: 'IN_PROGRESS' },
  })
  expect(res.ok(), `start audit → ${res.status()} ${await res.text()}`).toBeTruthy()
}

/** Upload a file through /v1/files/upload and return the asset id. */
export async function uploadAssetApi(api, file = pdfFile()) {
  const res = await api.post('/api/v1/files/upload', {
    multipart: { file, fileType: 'ASSET' },
  })
  const text = await res.text()
  expect(res.ok(), `upload → ${res.status()} ${text.slice(0, 300)}`).toBeTruthy()
  const body = JSON.parse(text)
  const asset = body.asset ?? body.data?.asset
  expect(asset?.id, 'upload response carries the asset').toBeTruthy()
  return asset
}

/** Upload a PDF and register it on the audit as a report (kind INTERIM by default). */
export async function registerReportApi(api, auditId, { title, kind = 'INTERIM' } = {}) {
  const asset = await uploadAssetApi(api, pdfFile(`${title}.pdf`))
  const res = await api.post(`/api/v1/services/auditInstances/${auditId}/reports`, {
    data: { assetId: asset.id, title, kind, reportDate: dateInDays(0) },
  })
  const text = await res.text()
  expect(res.ok(), `register report → ${res.status()} ${text.slice(0, 300)}`).toBeTruthy()
  const body = JSON.parse(text)
  const report = body.report ?? body.data?.report
  // Same commit-after-response window as createExternalAudit.
  await waitForSqlValue(`SELECT count(*) FROM audit_reports WHERE id = '${report.id}'`, {
    timeoutMs: 15_000,
    intervalMs: 250,
    label: 'registered report committed',
  })
  return { ...report, assetId: asset.id, assetUrl: asset.url }
}

/** Raise a finding on the audit through the same route the dialog uses. */
export async function createFindingApi(
  api,
  auditId,
  { description, findingTypeId = 'MINOR_NC', auditReportId = null },
) {
  const res = await api.post('/api/v1/services/auditFindings', {
    data: { auditInstanceId: auditId, findingTypeId, description, auditReportId },
  })
  const text = await res.text()
  expect(res.ok(), `create finding → ${res.status()} ${text.slice(0, 300)}`).toBeTruthy()
  const body = JSON.parse(text)
  return body.finding ?? body.data?.finding
}

/**
 * Soft-delete the audits a spec created so /auditee does not grow by a few rows
 * every run (DataTable pages at 50, and the seeded rows sort AFTER journey rows
 * because journeys schedule a week out). Superuser SQL: this is fixture
 * housekeeping, not behaviour under test.
 */
export function cleanupAudits(ids) {
  const list = ids.filter(Boolean)
  if (!list.length) return
  sql(
    `UPDATE audit_instances SET deleted_at = now()
      WHERE id IN (${list.map((id) => `'${id}'`).join(',')}) AND deleted_at IS NULL`,
  )
}

// ── UI helpers ──────────────────────────────────────────────────────────────

/**
 * Wait for `locator` to become visible, re-bootstrapping the syncEngine between
 * attempts. Seeded rows and REST writes reach IndexedDB through bootstrap or
 * the sync socket; a plain reload does not re-read a record the page already
 * has (bootstrapGate's 5-minute TTL), which is what `forceResync` clears.
 */
export async function visibleWithResync(page, locator, { perTry = 30_000, tries = 2 } = {}) {
  for (let attempt = 0; attempt <= tries; attempt++) {
    try {
      await expect(locator.first()).toBeVisible({ timeout: perTry })
      return
    } catch (err) {
      if (attempt === tries) throw err
      await forceResync(page)
    }
  }
}

/** Open an auditee detail page and wait until the record has rendered. */
export async function openAuditee(page, auditId, marker) {
  await page.goto(`/auditee/${auditId}`, { waitUntil: 'domcontentloaded' })
  await visibleWithResync(page, page.getByText(marker, { exact: false }))
}

/** Switch the detail page to one of its panel tabs (exact label). */
export async function openTab(page, name) {
  await page.getByRole('tab', { name, exact: true }).click()
}

/** Only the VISIBLE matches of a text — see rule 2 in the header. */
export function visibleText(page, text, { exact = false } = {}) {
  return page.getByText(text, { exact }).filter({ visible: true })
}

/**
 * Switch to `tab` and wait for `makeLocator()` to show, re-bootstrapping between
 * attempts. A reload resets the page to its default tab (Information), so the
 * tab has to be re-selected on every attempt — `visibleWithResync` alone would
 * wait on a panel that is display:none after the first retry.
 */
export async function visibleOnTab(page, tab, makeLocator, { perTry = 30_000, tries = 2 } = {}) {
  for (let attempt = 0; attempt <= tries; attempt++) {
    try {
      await openTab(page, tab)
      await expect(makeLocator().first()).toBeVisible({ timeout: perTry })
      return
    } catch (err) {
      if (attempt === tries) throw err
      await forceResync(page)
    }
  }
}

/** Click a button that opens a native file chooser, then hand it `file`. */
export async function chooseFile(page, buttonName, file) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: buttonName, exact: true }).click(),
  ])
  await chooser.setFiles(file)
}

// ── DB readers ──────────────────────────────────────────────────────────────

/** One audit instance, with every column the auditee journeys assert on. */
export function auditeeRow(auditId) {
  const row = sqlRow(
    `SELECT status_id, execution_phase, program_type_id,
            coalesce(audit_standard_id::text,''), coalesce(audit_standard_version_id::text,''),
            requirement_schema::text, coalesce(external_audit_firm,''),
            coalesce(external_auditor_name,''), coalesce(external_auditor_email,''),
            coalesce(external_auditor_phone,''), coalesce(agenda::text,''),
            coalesce(completed_at::text,''), coalesce(started_at::text,''), coalesce(scope,'')
       FROM audit_instances WHERE id = '${auditId}'`,
  )
  if (!row) return null
  return {
    statusId: row[0],
    executionPhase: row[1],
    programTypeId: row[2],
    auditStandardId: row[3] || null,
    auditStandardVersionId: row[4] || null,
    requirementSchema: row[5],
    firm: row[6],
    auditorName: row[7],
    email: row[8],
    phone: row[9],
    agenda: row[10] ? JSON.parse(row[10]) : null,
    completedAt: row[11] || null,
    startedAt: row[12] || null,
    scope: row[13],
  }
}

/** Live (non-deleted) team rows: userId → role. */
export function teamOf(auditId) {
  const out = sql(
    `SELECT user_id, role_on_audit FROM audit_team_members
      WHERE audit_instance_id = '${auditId}' AND deleted_at IS NULL`,
  )
  if (!out) return {}
  return Object.fromEntries(out.split('\n').map((l) => l.split('|')))
}

/** Report register rows for an audit, oldest first. */
export function reportsOf(auditId) {
  const out = sql(
    `SELECT id, title, kind, coalesce(report_date::text,''), uploaded_by,
            coalesce(notes,''), coalesce(ai_extraction::text,'')
       FROM audit_reports WHERE audit_instance_id = '${auditId}' AND deleted_at IS NULL
      ORDER BY created_at`,
  )
  if (!out) return []
  return out.split('\n').map((l) => {
    const [id, title, kind, reportDate, uploadedBy, notes, aiExtraction] = l.split('|')
    return { id, title, kind, reportDate, uploadedBy, notes, aiExtraction: aiExtraction || null }
  })
}

export function today() {
  return sqlValue('SELECT current_date::text')
}

export { waitForSqlValue }

/**
 * Run a query as `app_user` with a given identity — the role every GraphQL
 * request runs as, so this is the RLS verdict the syncEngine will see.
 * Unlike db.js's sqlAsAppUser this lets the caller set the owner flag, which
 * the owner-branch assertions need.
 */
export function asAppUser(query, { userId, companyId = COMPANY_ID, isOwner = false }) {
  const script = [
    siteGucSql(userId, companyId, false),
    'SET ROLE app_user;',
    `SELECT set_config('app.current_user_id', '${userId}', false);`,
    `SELECT set_config('app.current_company_id', '${companyId}', false);`,
    `SELECT set_config('app.current_user_is_owner', '${isOwner ? 'true' : 'false'}', false);`,
    query,
  ].join('\n')
  const out = execFileSync(
    'docker',
    ['exec', '-i', process.env.E2E_PSQL_CONTAINER || 'qms-postgres-1', 'psql', '-U', 'postgres', '-d', 'app-db', '-v', 'ON_ERROR_STOP=1', '-tA'],
    { encoding: 'utf8', timeout: 15_000, input: script },
  )
  // The three set_config SELECTs echo their values; the query's rows come last.
  const lines = out.trim().split('\n')
  return lines[lines.length - 1]
}
