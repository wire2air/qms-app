// Shared UI flows + DB readers for the audits journeys.
//
// Selector strategy mostly matches the rest of the suite (BaseSelect renders
// role="combobox" → role="listbox"/"option", driven by field-label text), with
// three audit-specific wrinkles worth knowing before adding a journey:
//
//  - **Selects inside a dialog are scoped to the dialog.** The audits landing
//    page is a table whose column headers are "Standard", "Type", "Status" —
//    the exact labels the create dialog uses. HeadlessUI aria-hides the
//    background while a dialog is open, which protects getByRole/getByLabel but
//    NOT getByText, so a page-wide label lookup can anchor on the table header
//    and walk to the wrong combobox. Everything dialog-borne goes through
//    `selectInDialog`.
//  - **Detail tabs are `mode: 'panel', lazy: false`** — every panel stays
//    MOUNTED and is toggled with v-show. Hidden panels are display:none so the
//    role engine still excludes them, but never assume a locator resolves to
//    one panel: switch tabs first.
//  - **The header action bar shows only the top 3 actions by priority**; the
//    rest live behind the overflow (⋯) BaseMenu. `Start Audit` / `Submit for
//    Close-Out` / `Report` are inline for a live audit; `Audit Log` and
//    `Delete` are not.
import { expect } from '@playwright/test'
import { AUTH, USERS, ESIGN_PIN, FIXTURES, AUDIT_STANDARD, COMPANY_ID } from './cast.js'
import { sql, sqlRow, waitForSqlValue } from './db.js'
import { expectStatusEventually, clickWhenReady } from './documents.js'

/** Unique, greppable audit scope string for one test run. */
export function uniqueScope(tag) {
  return `E2E AUDIT ${tag} ${Date.now()}`
}

/** Today + `days` as the YYYY-MM-DD string an <input type="date"> expects. */
export function dateInDays(days = 0) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The open dialog's root. `getByRole('dialog')` reports hidden here (the
 * HeadlessUI root div has no box of its own — same note as fixtures/capas.js),
 * so this is a plain attribute locator used only for scoping, never asserted on.
 */
function dialog(page) {
  return page.locator('[role="dialog"]').last()
}

/**
 * Resolve the anchor element a field's combobox follows.
 *
 * Element type first, text second — the reverse flakes. A plain
 * `getByText('Supplier', { exact: true })` inside the New Audit dialog matches
 * the TYPE select's selected chip (which reads "Supplier" once the audit type is
 * set) before it reaches the Supplier field's own label, and the walk from there
 * lands on the wrong combobox. `<label>` (BaseField) and `<span>`
 * (WorkflowStepReviewerSelect's step name) are both leaf-ish and never contain
 * the combobox, so `following::` from either is safe; a bare text match can
 * resolve to an ancestor that CONTAINS the combobox, and `following::` skips
 * descendants.
 *
 * The trailing `\*?` absorbs BaseLabel's required marker, which lives in a
 * nested span and so counts toward the anchor's text content; the optional
 * parenthetical absorbs the `<template #label>` fields that qualify themselves
 * ("Auditee (supplier contact)", "Code (auto-derived)").
 */
function fieldAnchor(root, text) {
  const re = new RegExp(`^\\s*${escapeRe(text)}\\s*\\*?\\s*(\\(.*\\))?\\s*\\*?\\s*$`)
  return {
    label: root.locator('label').filter({ hasText: re }),
    span: root.locator('span').filter({ hasText: re }),
    text: root.getByText(text, { exact: true }),
  }
}

/** Open a labelled select INSIDE the current dialog (leaves the listbox open). */
export async function openSelectInDialog(page, fieldLabel) {
  const anchors = fieldAnchor(dialog(page), fieldLabel)
  let anchor = anchors.label
  if ((await anchor.count()) === 0) anchor = anchors.span
  if ((await anchor.count()) === 0) anchor = anchors.text
  await anchor.first().locator('xpath=following::*[@role="combobox"][1]').click()
}

/** Open a labelled select INSIDE the current dialog and pick an option by text. */
export async function selectInDialog(page, fieldLabel, optionText) {
  await openSelectInDialog(page, fieldLabel)
  await page.getByRole('listbox').getByRole('option', { name: optionText }).first().click()
}

/**
 * Type into a rich-text field.
 *
 * `getByPlaceholder` does not work on these: BaseRichTextField wraps TipTap,
 * whose Placeholder extension renders the hint from CSS
 * (`content: attr(data-placeholder)`) on the empty paragraph — there is no
 * `placeholder` attribute in the DOM to match. Click the placeholder node to
 * focus the editor, then type.
 */
export async function fillRichText(page, placeholder, text) {
  const target = page.locator(`[data-placeholder="${placeholder}"]`).first()
  await expect(target).toBeVisible({ timeout: 20_000 })
  await target.click()
  await page.keyboard.type(text)
}

/**
 * Force the syncEngine to re-bootstrap on the next load.
 *
 * Needed after any write made OUTSIDE the app (a `page.request` REST call). The
 * app's own mutations write IDB directly, and server-pushed changes arrive over
 * the sync socket, but a reload alone will not re-read a record the page already
 * has: `bootstrapGate` skips re-bootstrap while the local data is under its
 * 5-minute TTL. Dropping the gate key makes the next load delta-sync from the
 * per-model watermark, which picks the changed row up by its bumped updatedAt.
 */
export async function forceResync(page) {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('syncEngine:bootstrap:')) localStorage.removeItem(key)
    }
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
}

// ── DB readers ─────────────────────────────────────────────────────────────

/** Audit instance by its (per-run unique) scope text. */
export function findAuditByScope(scope) {
  const row = sqlRow(
    `SELECT id, audit_number, status_id, program_type_id,
            coalesce(released_at::text,''), coalesce(completed_at::text,'')
       FROM audit_instances WHERE scope = '${scope}' ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return {
    id: row[0],
    auditNumber: row[1] || null,
    statusId: row[2],
    programTypeId: row[3],
    releasedAt: row[4] || null,
    completedAt: row[5] || null,
  }
}

/** Re-read one audit instance by id. */
export function auditRow(auditInstanceId) {
  const row = sqlRow(
    `SELECT status_id, coalesce(released_at::text,''), coalesce(completed_at::text,''),
            coalesce(workflow_instance_id::text,''), execution_phase
       FROM audit_instances WHERE id = '${auditInstanceId}'`,
  )
  if (!row) return null
  return {
    statusId: row[0],
    releasedAt: row[1] || null,
    completedAt: row[2] || null,
    workflowInstanceId: row[3] || null,
    executionPhase: row[4],
  }
}

/** Every finding on an audit, oldest first. */
export function findingsOf(auditInstanceId) {
  const out = sql(
    `SELECT id, finding_number, finding_type_id, status_id, auto_generated,
            coalesce(spawned_capa_id::text,''), coalesce(spawned_nc_id::text,''),
            coalesce(completed_at::text,''), coalesce(response_text,'')
       FROM audit_findings
      WHERE audit_instance_id = '${auditInstanceId}' AND deleted_at IS NULL
      ORDER BY created_at`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, findingNumber, typeId, statusId, auto, capaId, ncId, completedAt, responseText] =
      line.split('|')
    return {
      id,
      findingNumber,
      typeId,
      statusId,
      autoGenerated: auto === 't',
      spawnedCapaId: capaId || null,
      spawnedNcId: ncId || null,
      completedAt: completedAt || null,
      responseText: responseText || null,
    }
  })
}

/** requirementId → resultId for one audit. */
export function responsesOf(auditInstanceId) {
  const out = sql(
    `SELECT requirement_id, coalesce(result_id,'')
       FROM audit_requirement_responses WHERE audit_instance_id = '${auditInstanceId}'`,
  )
  if (!out) return {}
  return Object.fromEntries(out.split('\n').map((l) => l.split('|')))
}

/** Audit standard row by code (codes are unique per tenant). */
export function findStandardByCode(code) {
  const row = sqlRow(
    `SELECT id, name, content_license, coalesce(current_effective_version_id::text,''),
            coalesce(customer_license_attested_at::text,''), coalesce(workflow_version_id::text,'')
       FROM audit_standards
      WHERE company_id = '${COMPANY_ID}' AND code = '${code}' AND deleted_at IS NULL
      LIMIT 1`,
  )
  if (!row) return null
  return {
    id: row[0],
    name: row[1],
    contentLicense: row[2],
    currentEffectiveVersionId: row[3] || null,
    attestedAt: row[4] || null,
    workflowVersionId: row[5] || null,
  }
}

/** Versions of a standard, oldest first. */
export function versionsOfStandard(standardId) {
  const out = sql(
    `SELECT id, version_label, status_id, coalesce(superseded_at::text,'')
       FROM audit_standard_versions
      WHERE audit_standard_id = '${standardId}' AND deleted_at IS NULL
      ORDER BY version_major, version_minor`,
  )
  if (!out) return []
  return out.split('\n').map((l) => {
    const [id, label, statusId, supersededAt] = l.split('|')
    return { id, label, statusId, supersededAt: supersededAt || null }
  })
}

/** Clause count on a standard version. */
export function clauseCount(versionId) {
  return Number(
    sql(
      `SELECT count(*) FROM audit_requirements WHERE audit_standard_version_id = '${versionId}' AND deleted_at IS NULL`,
    ),
  )
}

// ── Create flows ───────────────────────────────────────────────────────────

/**
 * Create an ad-hoc audit through the "New Audit" dialog and land on its detail
 * page. Returns the DB row — the scope text is the handle, since the audit
 * number is minted server-side.
 */
export async function createAdHocAudit(
  page,
  scope,
  {
    type = null,
    supplierName = null,
    auditeeName = null,
    leadAuditorName = USERS.author.name,
  } = {},
) {
  await page.goto('/audits?tab=instances')
  await page.getByRole('button', { name: 'New Audit' }).click()
  await expect(page.getByRole('heading', { name: 'New Audit' })).toBeVisible({ timeout: 20_000 })

  await selectInDialog(page, 'Standard', AUDIT_STANDARD.name)
  // Type defaults to Internal; only touch it when the journey wants another.
  if (type) await selectInDialog(page, 'Type', type)
  await page.getByLabel('Scheduled Date').fill(dateInDays(1))

  if (leadAuditorName) await selectInDialog(page, 'Lead Auditor', leadAuditorName)
  // Supplier only renders (and is only accepted by the BE) for SUPPLIER audits.
  if (supplierName) await selectInDialog(page, 'Supplier', supplierName)
  if (auditeeName) await selectInDialog(page, 'Auditee', auditeeName)

  await page.getByPlaceholder("What's in scope?").fill(scope)
  await page.getByRole('button', { name: 'Create & open' }).click()
  await expect(page).toHaveURL(/\/audits\/instances\/[0-9a-f-]{36}/, { timeout: 45_000 })

  const audit = findAuditByScope(scope)
  expect(audit, `audit row exists for scope "${scope}"`).toBeTruthy()
  return audit
}

/**
 * Create an audit standard through the "New Standard" dialog (the BE auto-mints
 * a v1.0 DRAFT version) and land on its detail page. Returns the DB row.
 */
export async function createStandard(page, { name, code }) {
  await page.goto('/audits?tab=standards')
  await page.getByRole('button', { name: 'New Standard' }).click()
  await expect(page.getByRole('heading', { name: 'New Audit Standard' })).toBeVisible({
    timeout: 20_000,
  })
  await page.getByPlaceholder('e.g. ISO 9001:2015').fill(name)
  // Code auto-derives from the name; override so the test owns the per-tenant
  // unique key it later looks the row up by.
  await page.getByRole('button', { name: 'Override' }).click()
  await page.getByPlaceholder('ISO_9001_2015').fill(code)

  await page.getByRole('button', { name: 'Create & open' }).click()
  await expect(page).toHaveURL(/\/audits\/standards\/[0-9a-f-]{36}/, { timeout: 45_000 })

  const standard = findStandardByCode(code)
  expect(standard, `standard row exists for code "${code}"`).toBeTruthy()
  return standard
}

/** Add one clause to the standard currently open (Requirements editor). */
export async function addClause(page, { number, title }) {
  await page.getByRole('button', { name: 'Add Requirement' }).first().click()
  await expect(page.getByRole('heading', { name: 'Add Requirement' })).toBeVisible({
    timeout: 20_000,
  })
  await page.getByPlaceholder('7.2.1').fill(number)
  await page.getByPlaceholder('Personnel competency assessment').fill(title)
  // The footer submit label repeats the dialog title; scope to the dialog's
  // button so the (aria-hidden) trigger behind it can't be picked instead.
  await dialog(page).getByRole('button', { name: 'Add Requirement' }).click()
  await expect(page.getByRole('heading', { name: 'Add Requirement' })).toBeHidden({
    timeout: 20_000,
  })
}

// ── Audit lifecycle ────────────────────────────────────────────────────────

/** Switch the audit detail page to one of its panel tabs. */
export async function openAuditTab(page, name) {
  await page.getByRole('tab', { name: new RegExp(name, 'i') }).click()
}

/** SCHEDULED → IN_PROGRESS via the header CTA. */
export async function startAudit(page) {
  await clickWhenReady(page, page.getByRole('button', { name: 'Start Audit' }))
  await expectStatusEventually(page, /in progress/i)
}

/**
 * Record a verdict on one clause in the Requirements walkthrough: jump to it via
 * the clause rail (every clause is a step, section headers included), then click
 * the result chip. `result` is the chip label — Conforming / Minor NC / Major NC
 * / OFI / N/A.
 *
 * Barriers on the response row rather than a toast: the save is a bare POST with
 * no confirmation UI, and the auto-finding an NC verdict raises is written in
 * the SAME transaction — so this also covers the finding being there for the
 * next step.
 */
export async function scoreClause(page, auditInstanceId, clause, result) {
  // `.first()` — the clause label also appears on the scoring rail's jump
  // buttons. The walkthrough rail is the left column and always precedes them in
  // document order, so first-match is the rail row; the heading assertion below
  // confirms the click actually navigated the walkthrough.
  await page
    .getByRole('button', {
      name: new RegExp(`${escapeRe(clause.number)}\\s+${escapeRe(clause.title)}`),
    })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: clause.title })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: result, exact: true }).click()
  await waitForSqlValue(
    `SELECT count(*) FROM audit_requirement_responses
      WHERE audit_instance_id = '${auditInstanceId}' AND requirement_id = '${clause.id}'
        AND result_id IS NOT NULL`,
    { timeoutMs: 30_000, label: `verdict saved for clause ${clause.number}` },
  )
}

/**
 * Drive a started audit through every leaf clause. Both leaves score CONFORMING
 * unless `majorNcOn` names one, which then takes a MAJOR_NC — auto-raising a
 * finding the caller has to resolve before close-out.
 */
export async function executeAudit(page, audit, { majorNcOn = null } = {}) {
  await startAudit(page)
  await openAuditTab(page, 'Requirements')
  for (const clause of [AUDIT_STANDARD.clauses.documentControl, AUDIT_STANDARD.clauses.training]) {
    await scoreClause(
      page,
      audit.id,
      clause,
      majorNcOn?.id === clause.id ? 'Major NC' : 'Conforming',
    )
  }
}

/**
 * Close one finding from the Findings panel. Anchors on the finding number and
 * walks to that row's own Close control (the per-row buttons carry stable
 * title attributes; several rows can be on screen at once).
 */
export async function closeFinding(page, findingNumber) {
  await page
    .getByText(findingNumber, { exact: true })
    .first()
    .locator('xpath=following::button[@title="Close this finding"][1]')
    .click()
}

/**
 * Submit the open audit for close-out: pick the seeded AUDIT_INSTANCE workflow,
 * assign one reviewer per step, confirm.
 *
 * Both the header CTA and the dialog footer read "Submit for Close-Out", and
 * the header label grows a "(N unassessed)" / "(N open)" suffix while the gate
 * is unmet — hence the anchored regex on the way in and the dialog scope on the
 * way out.
 */
export async function submitForCloseOut(
  page,
  auditInstanceId,
  { comments = 'E2E close-out submission.' } = {},
) {
  await clickWhenReady(page, page.getByRole('button', { name: /^Submit for Close-Out$/ }))
  await expect(page.getByRole('heading', { name: 'Submit Audit for Close-Out' })).toBeVisible({
    timeout: 20_000,
  })
  // WorkflowVersionSelect is NOT a combobox — it renders a clickable-row list,
  // one button per workflow with aria-label "Select workflow <name>" (the same
  // control documents/NCR/CAPA pick their workflow from).
  await dialog(page)
    .getByRole('button', { name: `Select workflow ${FIXTURES.auditCloseOutWorkflowName}` })
    .click()
  // Per-step reviewer pickers only render once a workflow is picked; each step's
  // role has exactly one member, so the candidate list is deterministic.
  await selectInDialog(page, FIXTURES.auditCloseOutStep1, USERS.reviewer.name)
  await selectInDialog(page, FIXTURES.auditCloseOutStep2, USERS.approver.name)
  if (comments) await page.getByPlaceholder('Any context for reviewers?').fill(comments)
  const confirm = dialog(page).getByRole('button', { name: 'Submit for Close-Out' })
  await expect(confirm, 'both step reviewers must be picked before submit enables').toBeEnabled({
    timeout: 15_000,
  })
  await confirm.click()

  // Wait on the dialog closing and the DB, NOT on page text. `/review/i` matches
  // the dialog's own "Assign a reviewer for each workflow step" line and the
  // "Audit Review" step name, so a text wait returns before the POST lands and
  // the caller then reads a stale status.
  await expect(page.getByRole('heading', { name: 'Submit Audit for Close-Out' })).toBeHidden({
    timeout: 30_000,
  })
  await waitForSqlValue(
    `SELECT count(*) FROM audit_instances WHERE id = '${auditInstanceId}' AND status_id = 'REVIEW'`,
    { timeoutMs: 30_000, label: 'audit handed to the close-out workflow' },
  )
}

/** Reviewer (close-out step 1, ACTION, no e-sign) marks their task complete. */
export async function completeCloseOutReview(browser, auditId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'AuditInstance' AND entity_id = '${auditId}'
        AND assigned_to = '${USERS.reviewer.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: 'close-out reviewer task assigned' },
  )
  const ctx = await browser.newContext({ storageState: AUTH.reviewer })
  const page = await ctx.newPage()
  await page.goto(`/audits/instances/${auditId}`, { waitUntil: 'domcontentloaded' })
  await clickWhenReady(page, page.getByRole('button', { name: 'Mark Complete' }))
  await ctx.close()
}

/** Approver (close-out step 2, APPROVAL + e-sign) signs the audit closed. */
export async function completeCloseOutSignOff(browser, auditId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'AuditInstance' AND entity_id = '${auditId}'
        AND assigned_to = '${USERS.approver.id}' AND deleted_at IS NULL
        AND status_id NOT IN ('CANCELLED')`,
    { timeoutMs: 45_000, label: 'close-out approver task created' },
  )
  const ctx = await browser.newContext({ storageState: AUTH.approver })
  const page = await ctx.newPage()
  await page.goto(`/audits/instances/${auditId}`, { waitUntil: 'domcontentloaded' })
  // exact:true — "Approve" is also a substring of the profile-menu entry in the
  // top bar (the same collision documented in fixtures/capas.js).
  await clickWhenReady(page, page.getByRole('button', { name: 'Approve', exact: true }))
  const pin = page.getByPlaceholder('Enter your e-signature PIN')
  await expect(pin).toBeVisible({ timeout: 15_000 })
  const signBtn = page.getByRole('button', { name: 'Sign', exact: true })
  await expect(async () => {
    await pin.fill(ESIGN_PIN)
    await expect(signBtn).toBeEnabled({ timeout: 3_000 })
  }).toPass({ timeout: 15_000 })
  await signBtn.click()
  await ctx.close()
}

// ── Standard version approval ──────────────────────────────────────────────

/**
 * Attach the seeded AUDIT_STANDARD approval workflow to a standard.
 *
 * This is a REST call rather than a UI flow ON PURPOSE: the standard detail page
 * has no control for it anywhere — the versions rail only warns "No approval
 * workflow attached. Drafts can't be submitted until one is set", and the create
 * dialog never sends workflowVersionId even though the schema accepts it. Until
 * that gap is closed there is no UI path to a submittable standard, so the
 * journeys reach for the API to get past it (and assert the warning first, so
 * the gap itself stays covered).
 */
export async function attachStandardWorkflow(page, standardId, workflowVersionId) {
  const res = await page.request.patch(`/api/v1/services/auditStandards/${standardId}`, {
    data: { workflowVersionId },
  })
  expect(res.ok(), `attach approval workflow → ${res.status()}`).toBeTruthy()
}

/** Submit the standard's editable draft for approval (header CTA → dialog). */
export async function submitStandardVersion(
  page,
  { changeSummary = 'E2E version submission.' } = {},
) {
  await clickWhenReady(page, page.getByRole('button', { name: 'Submit for Approval' }))
  await expect(page.getByRole('heading', { name: 'Submit for Approval' })).toBeVisible({
    timeout: 20_000,
  })
  await selectInDialog(page, FIXTURES.auditStandardStep1, USERS.reviewer.name)
  await selectInDialog(page, FIXTURES.auditStandardStep2, USERS.approver.name)
  if (changeSummary)
    await page.getByPlaceholder('What changed in this version?').fill(changeSummary)
  await dialog(page).getByRole('button', { name: 'Submit' }).click()
}

/**
 * Walk a submitted AuditStandardVersion through both approval steps. The tasks
 * hang off the VERSION (resourceType 'AuditStandardVersion'), but the reviewers
 * act on the standard's detail page, which surfaces the under-review version's
 * step cards.
 */
export async function approveStandardVersion(browser, { standardId, versionId }) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'AuditStandardVersion' AND entity_id = '${versionId}'
        AND assigned_to = '${USERS.reviewer.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: 'standard reviewer task assigned' },
  )
  const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
  const reviewerPage = await reviewerCtx.newPage()
  await reviewerPage.goto(`/audits/standards/${standardId}`, { waitUntil: 'domcontentloaded' })
  await clickWhenReady(reviewerPage, reviewerPage.getByRole('button', { name: 'Mark Complete' }))
  await reviewerCtx.close()

  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'AuditStandardVersion' AND entity_id = '${versionId}'
        AND assigned_to = '${USERS.approver.id}' AND deleted_at IS NULL
        AND status_id NOT IN ('CANCELLED')`,
    { timeoutMs: 45_000, label: 'standard approver task created' },
  )
  const approverCtx = await browser.newContext({ storageState: AUTH.approver })
  const approverPage = await approverCtx.newPage()
  await approverPage.goto(`/audits/standards/${standardId}`, { waitUntil: 'domcontentloaded' })
  await clickWhenReady(
    approverPage,
    approverPage.getByRole('button', { name: 'Approve', exact: true }),
  )
  const pin = approverPage.getByPlaceholder('Enter your e-signature PIN')
  await expect(pin).toBeVisible({ timeout: 15_000 })
  const signBtn = approverPage.getByRole('button', { name: 'Sign', exact: true })
  await expect(async () => {
    await pin.fill(ESIGN_PIN)
    await expect(signBtn).toBeEnabled({ timeout: 3_000 })
  }).toPass({ timeout: 15_000 })
  await signBtn.click()
  await approverCtx.close()

  await waitForSqlValue(
    `SELECT count(*) FROM audit_standard_versions WHERE id = '${versionId}' AND status_id = 'EFFECTIVE'`,
    { timeoutMs: 90_000, label: 'version flipped EFFECTIVE' },
  )
}

// ── API / worker probes ────────────────────────────────────────────────────

/**
 * POST a BYOL CSV import as the calling context's user.
 *
 * `licenseAttested` is mandatory for CUSTOMER_LICENSED — the import schema's
 * superRefine rejects the payload without it (400), which is the same
 * defence-in-depth check the dialog's attestation checkbox feeds.
 */
export async function importStandard(
  request,
  { code, name, csv, contentLicense = 'CUSTOMER_LICENSED' },
) {
  return request.post('/api/v1/services/auditStandards/import', {
    data: {
      code,
      name,
      format: 'csv',
      content: csv,
      contentLicense,
      licenseAttested: contentLicense === 'CUSTOMER_LICENSED',
      customerLicenseReference: 'E2E licence ref 12345',
    },
  })
}

/**
 * Fire the daily generator on demand instead of waiting for its 02:30 cron
 * slot: enqueue the same graphile task the crontab entry enqueues. The worker
 * polls every 2s (graphile.config.js), so the barrier after this is short.
 */
export function enqueueGenerator() {
  return sql(`SELECT graphile_worker.add_job('generate_due_audit_instances')`)
}
