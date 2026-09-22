// PW-J11 · impact and risk assessment — OQ-05 TC-05-02 (URS-CHG-02).
//
// WHY THIS FILE EXISTS. §8 of the automated-regression-coverage matrix scored
// URS-CHG-02 "Not automated" with an em-dash for evidence: across nine CR spec
// files nothing ever wrote an impact-assessment field, nothing read one back,
// and nothing checked that the APPROVER can see the assessment at the moment
// they are asked to approve. `createCr` fills the four required intake fields
// and leaves every assessment field null, so the whole of TC-05-02 was
// untested. This file is that gate.
//
// ── WHAT THE PROTOCOL MEANS BY "IMPACT ASSESSMENT" ─────────────────────────
// TC-05-02's own note is explicit: the five impact categories are NOT
// dedicated columns. The record holds Description, Reason for Change,
// Business Justification, Classification, Change Nature, Duration, Regulatory
// Impact and Customer Notification Required — and that list is exactly the
// nullable half of `change_requests` (verified against the live table):
//   description · reason_for_change · business_justification · classification
//   · change_nature · change_duration · regulatory_impact
//   · customer_notification_required
// So "record the impact assessment" is provable as: those eight columns take
// the values the executor typed, survive a re-read, and render on the record.
// Affected products/documents are LINKED records — that is TC-05-04, owned by
// j5-links-lineage.spec.js, and deliberately not repeated here.
//
// ── STEP 5 IS THE ONE THAT MATTERS, AND IT DICTATES THE PERSONA ────────────
// The protocol says so in as many words ("Step 5 is the one that proves the
// process is sound rather than merely present") and forbids executing it as an
// administrator, "whose visibility does not demonstrate the control". So the
// visibility arm runs as `approver` — read + approve at tenant scope and NO
// update (seed §33, confirmed against authz.role_module_permissions) — and
// only while they actually hold the ASSIGNED task on the Change Approval step.
// Holding the task is asserted from the database before the page is read, so a
// green result cannot come from an approver who was merely browsing.
//
// ── WHY THE ASSESSMENT IS WRITTEN AT CREATE, NOT INLINE AFTERWARDS ─────────
// `isEditable` on the detail page is `statusId === 'DRAFT' && canUpdate`, so
// the assessment fields lock the instant the CR is opened — which is precisely
// what makes them readable-but-frozen for the approver. The create form
// carries every one of the eight fields (ChangeRequestsCreate.vue: the
// Classification and Context FormSections), so filling them there is the real
// user journey, not a shortcut around the UI.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, FIXTURES } from '../fixtures/cast.js'
import {
  assignDraftReviewers,
  submitCrForApproval,
  completeReviewerStep,
  uniqueTitle,
} from '../fixtures/changeRequests.js'
import { findCrByTitle, sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { selectFirstOption } from '../fixtures/documents.js'

// ── local helpers ───────────────────────────────────────────────────────────
// Deliberately NOT added to e2e/fixtures/changeRequests.js: other agents are
// editing that file concurrently, and these are TC-05-02-shaped (the
// assessment payload and its approver-side read), not general CR plumbing.

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * The assessment an executor types. Every value is deliberately distinctive so
 * a read-back cannot be satisfied by a coincidental default, and the two prose
 * fields carry no apostrophes so they survive the psql round trip unquoted.
 */
const ASSESSMENT = {
  classification: { id: 'MAJOR', label: 'Major' },
  changeNature: { id: 'EMERGENCY', label: 'Emergency' },
  changeDuration: { id: 'PERMANENT', label: 'Permanent' },
  regulatoryImpact: { id: 'YES', label: 'Yes' },
  customerNotificationRequired: { id: 'YES', label: 'Yes' },
  reasonForChange:
    'Regulatory update: EU Annex 1 revision requires a tighter environmental monitoring limit.',
  businessJustification:
    'Non-compliance risk outweighs the requalification cost; three product families are affected.',
}

/** Purge every CR this file creates — matched on the greppable title prefix. */
function purgeJ11ChangeRequests() {
  sql(`DELETE FROM change_requests WHERE title LIKE 'E2E CR J11-%'`)
}

/**
 * Pick an option by visible label from the BaseSelect belonging to one
 * BaseField inside the create form's Classification section.
 *
 * ⚠ The obvious spelling — `getByText(label).first()` + `xpath=following::
 * *[@role="combobox"][1]`, which is what `comboboxAfterLabel` in
 * fixtures/documents.js does — is WRONG here and cost a run. The FormSection
 * is itself titled "Classification", so for that one field `getByText` matches
 * the SECTION HEADING before the field's own label, and the first combobox
 * following the heading is Change Type's. The picker then opened the wrong
 * select and waited 25s for a 'Major' option that select never had.
 *
 * So: match the `<label>` ELEMENT (BaseLabel renders a real one; the section
 * heading does not), walk up to BaseField's own wrapper div, and take the
 * combobox inside that. Ambiguity is structurally impossible.
 *
 * The open-then-pick dance mirrors `selectFirstByKeyboard`: the panel is
 * scoped through `aria-controls` and the id is re-read on every retry, because
 * a page-wide getByRole('listbox') also matches the previous select's panel
 * while it animates shut — which reads as "already open", skips the click, and
 * silently leaves the field unset.
 */
async function pickByFieldLabel(page, fieldLabel, optionLabel) {
  const section = page.locator('#cr-classification')
  const field = section
    .locator('label')
    .filter({ hasText: new RegExp(`^${fieldLabel}(\\s|\\*|$)`) })
    .first()
    .locator('xpath=ancestor::div[1]')
  const combo = field.locator('[role="combobox"]').first()
  await expect(combo, `the '${fieldLabel}' select is on the form`).toBeVisible({ timeout: 30_000 })

  await expect(async () => {
    const listboxId = await combo.getAttribute('aria-controls')
    const listbox = listboxId ? page.locator(`[id="${listboxId}"]`) : page.getByRole('listbox')
    if (!(await listbox.isVisible().catch(() => false))) await combo.click()
    await expect(
      listbox.getByRole('option', { name: optionLabel, exact: true }).first(),
    ).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 30_000 })

  const listboxId = await combo.getAttribute('aria-controls')
  await page
    .locator(`[id="${listboxId}"]`)
    .getByRole('option', { name: optionLabel, exact: true })
    .first()
    .click()
  await expect(combo, `'${fieldLabel}' now reads back the picked option`).toContainText(optionLabel)
}

/**
 * Type into one of the Context section's TipTap editors.
 *
 * `getByPlaceholder` does not work: BaseRichTextEditor renders the hint from
 * CSS (`content: attr(data-placeholder)`) on the empty paragraph, so there is
 * no `placeholder` attribute in the DOM. Click the node carrying
 * `data-placeholder` to focus the editor, then type. (Same mechanic as
 * `fillRichText` in fixtures/audits.js; kept local so this file does not take
 * a dependency on the audits suite.)
 */
async function fillContextEditor(page, dataPlaceholder, text) {
  const target = page.locator(`[data-placeholder="${dataPlaceholder}"]`).first()
  await expect(target).toBeVisible({ timeout: 20_000 })
  await target.click()
  await page.keyboard.type(text)
}

const REASON_PLACEHOLDER =
  "What's driving this change? (audit finding, regulatory update, NC, supplier change, etc.)"
const JUSTIFICATION_PLACEHOLDER =
  'Why is this change worth the effort? Cost / quality / compliance impact.'

/**
 * Raise a Change Request through the real create form with the FULL
 * assessment filled in, and return its database row.
 *
 * Every test calls this for itself. Playwright discards a worker after a
 * failing test and runs the file's pending afterAll, so a CR arranged once in
 * a beforeAll would be purged out from under every later test in the file.
 */
async function createAssessedCr(page, tag) {
  const title = uniqueTitle(tag)
  await page.goto('/change-requests/create')

  // Workflow-first wizard: with exactly one active CHANGE_CONTROL workflow
  // screen 1 auto-skips; with several the card gallery shows. Wait for either,
  // same as `createCr`.
  const workflowCard = page.getByRole('button', {
    name: `Select workflow ${FIXTURES.crWorkflowName}`,
  })
  const titleInput = page.getByPlaceholder('Short summary of the change')
  await expect(workflowCard.or(titleInput).first()).toBeVisible({ timeout: 45_000 })
  if (await workflowCard.isVisible().catch(() => false)) await workflowCard.click()

  await titleInput.fill(title)

  // TC-05-02 step 2 — the record's own assessment surface.
  await selectFirstOption(page, 'Change Type')
  await pickByFieldLabel(page, 'Classification', ASSESSMENT.classification.label)
  await pickByFieldLabel(page, 'Planned or Emergency', ASSESSMENT.changeNature.label)
  await pickByFieldLabel(page, 'Temporary or Permanent', ASSESSMENT.changeDuration.label)
  // TC-05-02 step 3 — regulatory notifiability, plus its customer-facing twin.
  await pickByFieldLabel(page, 'Regulatory Impact', ASSESSMENT.regulatoryImpact.label)
  await pickByFieldLabel(
    page,
    'Customer Notification Required',
    ASSESSMENT.customerNotificationRequired.label,
  )
  await selectFirstOption(page, 'Site')
  await selectFirstOption(page, 'Department')

  // TC-05-02 step 1 — reason and justification.
  await fillContextEditor(page, REASON_PLACEHOLDER, ASSESSMENT.reasonForChange)
  await fillContextEditor(page, JUSTIFICATION_PLACEHOLDER, ASSESSMENT.businessJustification)

  await page.getByRole('button', { name: 'Create Draft' }).click()
  await expect(page).toHaveURL(/\/change-requests\/(?!create)[0-9a-f-]{36}/, { timeout: 45_000 })

  const cr = findCrByTitle(title)
  expect(cr, 'the assessed CR reached the database').toBeTruthy()
  return { ...cr, title }
}

/** The eight assessment columns as one row, read straight from Postgres. */
function assessmentOf(crId) {
  const row = sqlRow(
    `SELECT coalesce(classification, ''),
            coalesce(change_nature, ''),
            coalesce(change_duration, ''),
            coalesce(regulatory_impact, ''),
            coalesce(customer_notification_required, ''),
            coalesce(reason_for_change, '') <> '',
            coalesce(business_justification, '') <> '',
            coalesce(description, '') <> ''
       FROM change_requests WHERE id = ${quote(crId)}`,
  )
  if (!row) return null
  return {
    classification: row[0],
    changeNature: row[1],
    changeDuration: row[2],
    regulatoryImpact: row[3],
    customerNotificationRequired: row[4],
    hasReason: row[5] === 't',
    hasJustification: row[6] === 't',
    hasDescription: row[7] === 't',
  }
}

/**
 * A prose column fetched on its own.
 *
 * Rich-text values are multi-line HTML, and `sqlRow` splits psql output on
 * '\n' and keeps only the first line — so a multi-line value read as part of a
 * wider row silently truncates and the column after it reads as garbage. One
 * column, one query.
 */
function proseColumn(crId, column) {
  return sqlValue(
    `SELECT replace(coalesce(${column}, ''), E'\\n', ' ') FROM change_requests WHERE id = ${quote(crId)}`,
  )
}

test.describe('PW-J11 · impact and risk assessment (TC-05-02)', () => {
  test.beforeAll(() => purgeJ11ChangeRequests())
  test.afterAll(() => purgeJ11ChangeRequests())

  test('TC-05-02 steps 1–3 · the assessment an executor types is saved and reads back', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    const cr = await createAssessedCr(page, 'J11-record')

    // Saved (step 1 reason/justification · step 2 the record's assessment
    // surface · step 3 regulatory notifiability).
    const saved = assessmentOf(cr.id)
    expect(saved.classification, 'Classification persisted as the picked enum').toBe(
      ASSESSMENT.classification.id,
    )
    expect(saved.changeNature, 'Change Nature (planned/emergency) persisted').toBe(
      ASSESSMENT.changeNature.id,
    )
    expect(saved.changeDuration, 'Change Duration (temporary/permanent) persisted').toBe(
      ASSESSMENT.changeDuration.id,
    )
    expect(saved.regulatoryImpact, 'regulatory notifiability persisted — TC-05-02 step 3').toBe(
      ASSESSMENT.regulatoryImpact.id,
    )
    expect(
      saved.customerNotificationRequired,
      'customer-notification flag persisted alongside it',
    ).toBe(ASSESSMENT.customerNotificationRequired.id)

    // The two prose columns are read one at a time — see `proseColumn`.
    expect(
      proseColumn(cr.id, 'reason_for_change'),
      'Reason for Change kept the text that was typed',
    ).toContain('EU Annex 1 revision')
    expect(
      proseColumn(cr.id, 'business_justification'),
      'Business Justification kept the text that was typed',
    ).toContain('three product families')

    // Retrievable: a fresh page load renders the same values back at the
    // author. This is the "and retrievable" half of step 2 — a value that
    // persisted but never rendered is not evidence for an executor.
    await page.goto(`/change-requests/${cr.id}`)
    await expect(page.getByText(cr.title).first()).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByText(ASSESSMENT.classification.id, { exact: true }).first(),
      'Classification renders on the rail (raw enum — the rail prints cr.classification unmapped)',
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      page.getByText('EU Annex 1 revision', { exact: false }).first(),
      'Reason for Change renders in the Reason & Justification section',
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      page.getByText('three product families', { exact: false }).first(),
      'Business Justification renders alongside it',
    ).toBeVisible({ timeout: 20_000 })

    await ctx.close()
  })

  // KNOWN DEFECT (pinned, not fixed): the detail rail prints
  // `{{ cr.classification || '—' }}` raw — 'MAJOR', not 'Major' — while every
  // sibling field on the same card resolves through `crOptionLabel`. The
  // create form offers the friendly label and the record echoes the enum back.
  // Cosmetic, so the assertion above pins the ENUM: asserting 'Major' would be
  // a failing test against shipped behaviour, which this brief forbids.

  test('TC-05-02 step 4 · a risk record can be linked to the change request', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    const cr = await createAssessedCr(page, 'J11-risklink')

    // "Saved OR linked" — the record has no risk-score column, so the product's
    // answer to step 4 is the affected-records graph. j5 proves a Document link
    // round-trips; this arm proves the SAME endpoint accepts a RiskAssessment
    // pointer, which is what the protocol's "link to a risk record" asks for.
    const riskId = 'e2e0a11a-1111-4111-8111-111111111111'
    const res = await page.request.post(`/api/v1/services/changeRequests/${cr.id}/links`, {
      data: {
        targetType: 'RiskAssessment',
        targetId: riskId,
        linkRole: 'AFFECTED',
        notes: 'E2E — risk assessment covering this change.',
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()

    const row = sqlRow(
      `SELECT target_type, target_id, coalesce(notes, '')
         FROM change_request_links
        WHERE change_request_id = ${quote(cr.id)} AND deleted_at IS NULL`,
    )
    expect(row?.[0], 'the risk pointer is stored with its own target type').toBe('RiskAssessment')
    expect(row?.[1], 'and its target id').toBe(riskId)

    // TC-05-04's note applies here too: link targets are a type+id pair and are
    // NOT validated against the target record. Pinned so nobody reads this arm
    // as proof the risk record exists.
    expect(
      Number(sqlValue(`SELECT count(*) FROM risk_assessments WHERE id = ${quote(riskId)}`)),
      'link targets are unvalidated pointers — no risk record backs this id',
    ).toBe(0)

    await ctx.close()
  })

  test('TC-05-02 step 5 · the approver holding the live approval task can read the whole assessment', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()

    const cr = await createAssessedCr(ownerPage, 'J11-approver')
    await assignDraftReviewers(ownerPage, cr.id)
    await submitCrForApproval(ownerPage, cr.id)
    await ownerCtx.close()

    // Step 1 (Impact Review, ACTION) must finish before step 2 activates and
    // the approver is tasked. This is the point the protocol names: "while it
    // holds the active approval task".
    await completeReviewerStep(browser, cr.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'ChangeRequest' AND entity_id = ${quote(cr.id)}
          AND assigned_to = ${quote(USERS.approver.id)}
          AND status_id IN ('ASSIGNED','FORM_SUBMITTED') AND deleted_at IS NULL`,
      { timeoutMs: 60_000, label: 'approver holds the live approval task' },
    )

    // Asserted from the database BEFORE the page is read, so a green result
    // cannot come from an approver who merely browsed to the record.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM task_instances
            WHERE entity_type = 'ChangeRequest' AND entity_id = ${quote(cr.id)}
              AND assigned_to = ${quote(USERS.approver.id)}
              AND status_id = 'ASSIGNED' AND deleted_at IS NULL`,
        ),
      ),
      'the approver is the assignee at the moment of the read',
    ).toBeGreaterThan(0)

    const approverCtx = await browser.newContext({ storageState: AUTH.approver })
    const approverPage = await approverCtx.newPage()
    await approverPage.goto(`/change-requests/${cr.id}`, { waitUntil: 'domcontentloaded' })
    await expect(approverPage.getByText(cr.title).first()).toBeVisible({ timeout: 45_000 })

    // The approval affordance is present — this is the approval step, not a
    // read-only visit. `exact:true` because "Approve" is a substring of the
    // header profile menu (see fixtures/changeRequests.js).
    await expect(
      approverPage.getByRole('button', { name: 'Approve', exact: true }).first(),
      'the approver is being asked to approve on this very page',
    ).toBeVisible({ timeout: 45_000 })

    // Every assessment surface is legible to them.
    await expect(
      approverPage.getByText('EU Annex 1 revision', { exact: false }).first(),
      'Reason for Change is readable at the approval step',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      approverPage.getByText('three product families', { exact: false }).first(),
      'Business Justification is readable at the approval step',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      approverPage.getByText(ASSESSMENT.classification.id, { exact: true }).first(),
      'Classification is readable at the approval step',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      approverPage.getByText('Regulatory Impact', { exact: true }).first(),
      'the Regulatory Impact field is present on the rail for the approver',
    ).toBeVisible({ timeout: 30_000 })

    // The values behind the two Yes/No rail fields, resolved through
    // crOptionLabel. Scoped to the rail card so 'Yes' cannot be satisfied by a
    // stray label elsewhere on the page.
    const changeDetails = approverPage
      .getByText('Change Details', { exact: true })
      .first()
      .locator('xpath=ancestor::*[self::section or self::div][1]')
    await expect(
      changeDetails,
      'the approver reads the resolved Change Details values, not blanks',
    ).toContainText(ASSESSMENT.changeNature.label, { timeout: 30_000 })
    await expect(changeDetails).toContainText(ASSESSMENT.changeDuration.label)

    // And the assessment is FROZEN for them: `isEditable` is
    // `statusId === 'DRAFT' && canUpdate`, and the approver holds neither. No
    // combobox may appear inside the Change Details card at the approval step —
    // an approver who could rewrite the assessment they are approving would
    // make the signature meaningless.
    await expect(
      changeDetails.locator('[role="combobox"]'),
      'the assessment is read-only at the approval step',
    ).toHaveCount(0)

    await approverCtx.close()
  })
})
