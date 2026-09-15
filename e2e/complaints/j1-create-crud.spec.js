// CMP-J1 — internal Quality Complaint: create, read, inline edit.
//
// WHY THIS FILE EXISTS. The module (`complaints`, table `complaints`) had ZERO
// Playwright coverage before this — no project, no seed section
// (e2e-seed.sql §45). This is the CRUD-lifecycle half; J2 covers status
// transitions and J3 covers the sibling `complaint_management` module.
//
// A journey here proves the create form actually reaches the RIGHT table:
// `/complaints` is `QaComplaintsIndex` → `db.Complaint`, and the create POST
// goes to `/v1/services/complaints` (createComplaint controller). The
// component's own header comment claims it "writes to the same
// customer_complaints table" — that comment is stale/wrong; this journey
// asserts against the real `complaints` table so a regression that actually
// repointed the form at `customer_complaints` would fail here loudly instead
// of silently matching a misleading comment.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  findComplaintBySubject,
  openComplaints,
  purgeComplaintBySubject,
  purgeMintedComplaints,
  complaintRow,
} from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

// Constant, not timestamped — Playwright restarts the worker after a failed
// test, re-evaluating module scope; a timestamped subject would change
// mid-file and orphan whatever the create test minted. beforeAll purges
// instead (equipment EQ-J1 pattern).
const SUBJECT = 'E2E J1 Complaint Subject'

test.describe('CMP-J1 · internal Quality Complaint CRUD', () => {
  test.beforeAll(() => {
    purgeMintedComplaints()
    purgeComplaintBySubject(SUBJECT)
  })
  test.afterAll(() => {
    purgeComplaintBySubject(SUBJECT)
  })

  test('create: the form persists to the `complaints` table over REST, lands OPEN, and auto-starts the QA workflow', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.complaintOwner)

    const restCalls = []
    page.on('request', (req) => {
      if (req.url().includes('/v1/services/complaints')) restCalls.push(`${req.method()} ${new URL(req.url()).pathname}`)
    })

    await page.goto('/complaints/create')
    await expect(page.getByRole('textbox', { name: 'Subject', exact: true })).toBeVisible()

    await page.getByRole('textbox', { name: 'Subject', exact: true }).fill(SUBJECT)
    // Description is a rich-text field (RichTextAttachments), not a plain
    // textbox. `.fill()` sets the DOM directly and never fires the events the
    // editor's v-model listens for, so the form's required-field validation
    // silently blocks submit — click + type instead, as auditee j1 does.
    const descriptionEditor = page.locator('[contenteditable="true"]').first()
    await descriptionEditor.click()
    await page.keyboard.type('Seeded by CMP-J1.')
    // Product and Batch/Lot are required. `.first()` on the label locator
    // matches the equipment/departments idiom — an unqualified getByText can
    // resolve ambiguously once the ValidationSummary alert (which repeats the
    // same field label in its own text) is on screen, sending the `following::`
    // xpath from the wrong anchor.
    const productLabel = page.getByText('Product / Service involved', { exact: false }).first()
    await productLabel.scrollIntoViewIfNeeded()
    const productCombobox = productLabel.locator('xpath=following::*[@role="combobox"][1]')
    await productCombobox.click()
    // BaseSelect's plain list always renders the null/"— Select —" row FIRST,
    // ahead of the real options — `.first()` here selects "no selection",
    // which never satisfies the required() rule. `.nth(1)` is the first real
    // product row (products/equipment specs use `getByRole('option', { name })`
    // for the same reason, since they know the option's label up front).
    await page.getByRole('listbox').getByRole('option').nth(1).click()
    await page.getByPlaceholder('e.g. LOT-2026-014').fill('LOT-CMP-J1')

    // StickyFormFooter appends the ⌘↵ shortcut hint to the accessible name
    // ("Create Complaint ⌘↵"), so an exact match never resolves.
    await page.getByRole('button', { name: 'Create Complaint', exact: false }).click()

    // Assert against Postgres, not the toast — the row is what the workflow
    // engine, the QA queue and the RLS scope tiers all read.
    await expect
      .poll(() => sqlValue(`SELECT count(*) FROM complaints WHERE subject = '${SUBJECT}'`), {
        timeout: 20_000,
        message: 'the create landed in Postgres',
      })
      .toBe('1')

    const row = findComplaintBySubject(SUBJECT)
    expect(row.statusId, 'createComplaint always lands OPEN, not the DRAFT default').toBe('OPEN')
    expect(row.ownerId, 'ownerId defaults to the creator when none is chosen').toBe(
      USERS.complaintOwner.id,
    )
    expect(row.deletedAt).toBeNull()
    expect(row.complaintNumber, 'a CMP- number was minted').toMatch(/^CMP-/)

    expect(
      restCalls,
      'create goes over REST to the INTERNAL complaints route, not customer_complaints',
    ).toContain('POST /api/v1/services/complaints')

    // The QA-review workflow (Investigation → Review Summary → Approval)
    // auto-starts, per createComplaint's own doc comment and
    // bootstrapCompanyDefaults' always-seeded "Default Complaint Review".
    await expect
      .poll(
        () =>
          sqlValue(
            `SELECT count(*) FROM workflow_instances wi
               JOIN complaints c ON c.id = wi.resource_id
              WHERE wi.resource_type = 'Complaint' AND c.subject = '${SUBJECT}'`,
          ),
        { timeout: 20_000, message: 'the QA-review workflow auto-started' },
      )
      .toBe('1')

    // The redirect lands on the detail page — confirms the create flow, not
    // just the POST, completed.
    await expect(page).toHaveURL(/\/complaints\/[0-9a-f-]{36}$/)
  })

  test('read: the new complaint appears in the list without a reload — the live query', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.complaintOwner)
    await openComplaints(page, { anchorText: SUBJECT })
    await expect(complaintRow(page, SUBJECT)).toBeVisible()
  })

  test('detail: the record renders its number, subject and OPEN status', async ({ browser }) => {
    const page = await pool.page(browser, AUTH.complaintOwner)
    const subject = findComplaintBySubject(SUBJECT)
    expect(subject, 'the create test left a row behind').not.toBeNull()

    await page.goto(`/complaints/${subject.id}`)
    // The complaint number renders in the breadcrumb, a list row and the
    // detail panel at once — scope to the detail panel to avoid a
    // strict-mode violation (same fix as j4).
    await expect(
      page.getByLabel('Details').getByText(subject.complaintNumber, { exact: false }).first(),
    ).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText(SUBJECT, { exact: false }).first()).toBeVisible()
  })

  test('update: an owner can edit the record while it is OPEN (not terminal)', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.complaintOwner)
    const subject = findComplaintBySubject(SUBJECT)
    await page.goto(`/complaints/${subject.id}`)
    // The complaint number renders in the breadcrumb, a list row and the
    // detail panel at once — scope to the detail panel to avoid a
    // strict-mode violation (same fix as j4).
    await expect(
      page.getByLabel('Details').getByText(subject.complaintNumber, { exact: false }).first(),
    ).toBeVisible({
      timeout: 30_000,
    })

    // `descriptionEditable` requires isEditable (not terminal, canUpdate) AND
    // not an imported source — a manually-created complaint (no sourceId set)
    // qualifies. The description is a rich-text field; editing it and letting
    // the inline auto-save fire is the assertion.
    const editable = page.locator('[contenteditable="true"]').first()
    await expect(editable).toBeVisible({ timeout: 15_000 })
    // `.fill()` sets the DOM directly and never fires the events the editor's
    // v-model listens for — click + type instead (see the create test above).
    await editable.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('Updated by CMP-J1 update test.')
    // Blur to trigger the debounced auto-save watcher.
    await page.keyboard.press('Tab')

    await expect
      .poll(
        () =>
          sqlValue(
            `SELECT description FROM complaints WHERE id = '${subject.id}'`,
          ),
        { timeout: 15_000, message: 'the inline edit auto-saved' },
      )
      .toContain('Updated by CMP-J1')
  })
})
