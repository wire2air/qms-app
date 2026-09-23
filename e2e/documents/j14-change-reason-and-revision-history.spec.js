// PW-J14 — Revision under change control (OQ-01 TC-01-08, URS-DOC-09 + URS-DOC-10).
// The two gaps this file closes: "a blank change reason is never refused" and
// "the revision-history view is not tested". PW-J5 only ever fills the dialog
// correctly and never opens Revision History at all.
//
// TC-01-08's note is the specification here, and it makes three distinctions
// this file keeps separate rather than blurring:
//
//   · CHANGE REASON is enforced at BOTH layers — "the revision dialog requires
//     it, and a database constraint requires a change reason on every version
//     above 1.0". Both are evidenced: the dialog refusal AND
//     `document_versions_change_reason_required` firing on a direct insert.
//   · CHANGE TYPE is "enforced by the dialog only — its column is nullable".
//     Evidenced as an INTERFACE control and explicitly NOT claimed as a
//     data-integrity one: the same insert that the reason constraint rejects
//     succeeds with change_type NULL.
//   · The REVISION HISTORY approval column "draws on the Audit Trail module,
//     whose read permission is a SEPARATE grant from Document Control read.
//     Without it the column renders as *not shown* rather than empty". Both
//     sides are pinned — the auditor (who HOLDS audit_trail:read, e2e-seed.sql
//     §35) and the controller (full document_control CRUD, deliberately zero
//     audit_trail, §35's named regression probe).
//
// Measured 2026-09-22 against the live local stack (app-db).
//
// ── WHY THIS FILE DOES NOT USE `createSopDocument` / `driveToEffective` ──────
// SEED DEFECT, recorded because it bit this work and will bite the next:
// `e2e-seed.sql` §8 inserts `E2E SOP Template` with NO `workflow_id` — the
// INSERT's column list simply omits it — and the file contains no
// 'E2E SOP Template — Approval' workflow at all (`grep -c e2eab100
// qms/database/e2e-seed.sql` → 0, 2026-09-22). The create form makes Approval
// Flow `required` the moment a template is picked, so on a database built from
// the seed alone, Create Document is refused and `createSopDocument` dies on
// its `Technical Review` readiness anchor — PW-J1 fails identically. The link
// currently PRESENT in the local app-db
// (document_templates.workflow_id = e2eab100-…-001) was inserted by hand and
// exists nowhere in version control, so it does not survive a database reset.
// Building this file's fixture on it would make these tests depend on an
// undeclared manual patch.
//
// So the fixture is built from product behaviour alone: the document is created
// through "Save as Draft", which requires the title only and deliberately
// permits a template-less draft (DocumentsCreate.vue's DRAFT_MINIMUM — "a
// template-less draft is coherent"), and its v1.0 is then walked to EFFECTIVE
// along the TRUSTED transition path (DRAFT→IN_REVIEW→APPROVED→EFFECTIVE, every
// edge in enforce_document_version_transition()'s legal graph) — exactly the
// edges the approval workflow itself drives. No guard is bypassed and no
// product code is touched; only the human approval steps are skipped, and those
// are PW-J2's subject, not this test case's.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { uniqueTitle, openDocumentDetail } from '../fixtures/documents.js'
import { findDocumentByTitle, versionsOf, sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'

/** BaseForm's post-submit validation summary (see e2e/fixtures/negativeArms.js). */
const VALIDATION_SUMMARY = /please fix \d+ issues? before continuing/i

/**
 * LOCAL helper (this task may not touch shared fixtures). Template-less draft
 * via "Save as Draft" — the only requirement is a title.
 */
async function createDraftDocument(page, title) {
  await page.goto('/documents')
  await page.getByRole('button', { name: 'Create Document' }).click()
  await expect(page).toHaveURL(/\/documents\/create/)
  // Document Template is `required`, so its select AUTO-PICKS the first option a
  // beat after mount, and that selection fires a watcher which rewrites prefix,
  // review cadence, auto-release and the inherited workflow. A Save-as-Draft
  // click racing that cascade lands on a button mid-re-render and is a silent
  // no-op (observed: the form still on /documents/create 25s later, with the
  // title typed and every derived field populated). So: type the title, let the
  // cascade finish, and retry the click if the first one did not navigate.
  await page.getByPlaceholder('e.g. Clean Room Sterilization Protocol').fill(title)
  await expect(page.getByLabel('Document Prefix')).not.toHaveValue('', { timeout: 15_000 })
  for (let attempt = 0; attempt < 3; attempt++) {
    await dismissViteErrorOverlay(page)
    await page.getByRole('button', { name: 'Save as Draft' }).click()
    const navigated = await page
      .waitForURL(/\/documents\/(?!create)[0-9a-f-]{36}/, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    if (navigated) return title
  }
  // `createDocument` is a useLiveMutation, which CATCHES every error, raises a
  // toast and returns undefined; persist() then guards on `if (doc)` and skips
  // the redirect. So the only way to say WHY is to read the toast back.
  const said = (
    await page
      .getByRole('alert')
      .allTextContents()
      .catch(() => [])
  )
    .concat(
      await page
        .getByRole('status')
        .allTextContents()
        .catch(() => []),
    )
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  throw new Error(
    `Save as Draft never navigated — still on ${page.url()}. ` +
      (said.length ? `The app reported: ${said.join(' | ')}` : 'The app reported nothing.'),
  )
}

/**
 * LOCAL guard. `vite-plugin-checker` renders a full-viewport
 * <vite-plugin-checker-error-overlay> whenever ANY file under src/ or resource/
 * fails ESLint — including a file another agent is mid-edit on, which has
 * nothing to do with this spec. It intercepts every pointer event, so clicks
 * silently retry until they time out ("<vite-plugin-checker-error-overlay>
 * intercepts pointer events" in the call log). Report what it says rather than
 * failing as a mysterious click timeout, then remove it so the run can proceed:
 * it is a dev-server affordance, not product UI, and nothing under test renders
 * it.
 */
async function dismissViteErrorOverlay(page) {
  const overlay = page.locator('vite-plugin-checker-error-overlay')
  if (!(await overlay.count())) return
  const said =
    (await overlay
      .first()
      .textContent()
      .catch(() => '')) || ''
  console.warn(
    `[vite checker overlay] a lint error in src/ or resource/ is blocking the page: ${said
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300)}`,
  )
  await page.evaluate(() => {
    document.querySelectorAll('vite-plugin-checker-error-overlay').forEach((n) => n.remove())
  })
}

/**
 * LOCAL helper. Walk a DRAFT version to EFFECTIVE along the legal trusted edges.
 * Every UPDATE passes through enforce_document_version_transition(); an illegal
 * edge would raise, so this cannot silently paper over a broken transition graph.
 */
function driveVersionEffectiveAtDb(versionId) {
  for (const status of ['IN_REVIEW', 'APPROVED', 'EFFECTIVE']) {
    sql(`UPDATE document_versions SET status_id = '${status}' WHERE id = '${versionId}'`)
  }
  expect(
    sqlValue(`SELECT status_id FROM document_versions WHERE id = '${versionId}'`),
    'fixture version reached EFFECTIVE along legal edges',
  ).toBe('EFFECTIVE')
}

/**
 * Open the Revision History dialog from the detail page's overflow menu and
 * return the dialog's portal root — every later assertion is scoped to it, so a
 * match cannot come from the page behind the overlay or from the menu item that
 * carries the same words as the dialog title.
 */
async function openRevisionHistory(page, docId) {
  await openDocumentDetail(page, docId)
  await dismissViteErrorOverlay(page)
  await page.getByRole('button', { name: 'More actions' }).click()
  await page
    .getByRole('menuitem', { name: /revision history/i })
    .or(page.getByRole('button', { name: /revision history/i }))
    .first()
    .click()
  const dialog = page.locator('#headlessui-portal-root')
  await expect(dialog.getByText('Revision History', { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  })
  return dialog
}

test.describe('PW-J14 · revision under change control', () => {
  let docId
  let v1Id

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const title = uniqueTitle('J14-rev')
    await createDraftDocument(page, title)
    docId = findDocumentByTitle(title).id
    await waitForSqlValue(
      `SELECT count(*) FROM document_versions WHERE document_id = '${docId}' AND deleted_at IS NULL`,
      { timeoutMs: 20_000, label: 'v1.0 DRAFT created' },
    )
    v1Id = versionsOf(docId)[0].id
    driveVersionEffectiveAtDb(v1Id)
    await ctx.close()
  })

  // ── TC-01-08 steps 1 + 2 — the DIALOG layer ──────────────────────────────
  test('the revision dialog requires a change reason — a blank one is refused', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await openDocumentDetail(page, docId)
    await dismissViteErrorOverlay(page)

    // Reach "Create New Revision". The action only renders once this context's
    // IndexedDB has the EFFECTIVE version, so allow for the sync-back lag.
    const inline = page.getByRole('button', { name: /create new draft/i })
    if (
      !(await inline
        .first()
        .isVisible({ timeout: 8_000 })
        .catch(() => false))
    ) {
      await page.getByRole('button', { name: 'More actions' }).click()
    }
    await page
      .getByRole('menuitem', { name: /create new draft/i })
      .or(page.getByRole('button', { name: /create new draft/i }))
      .first()
      .click()
    await expect(page.getByText('Create New Revision')).toBeVisible({ timeout: 15_000 })

    const versionsBefore = versionsOf(docId).length

    // Step 2: proceed with the change reason BLANK. Change type is picked so
    // the refusal we measure is the REASON rule and not a second empty field.
    await page.getByRole('button', { name: /^Minor\b/i }).click()
    await page.getByRole('button', { name: 'Create Revision' }).click()

    // The dialog refuses: it stays open and BaseForm names the offender.
    await expect(page.getByText(VALIDATION_SUMMARY)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Create New Revision')).toBeVisible()
    expect(versionsOf(docId), 'no version was written').toHaveLength(versionsBefore)

    // The dialog's second reason rule: a reason shorter than 10 characters is
    // refused too. Worth pinning — a one-character reason would satisfy a
    // naive NOT NULL check and is useless on an audit trail.
    const reason = page.getByPlaceholder(/New calibration interval/i)
    await reason.fill('typo')
    await page.getByRole('button', { name: 'Create Revision' }).click()
    // Scope to the FIELD ERROR (role="alert"), not any text match: the same
    // sentence is also the rule's own button label, so an unscoped getByText
    // resolves to two nodes and trips strict mode.
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /add a few more words so reviewers understand/i })
        .first(),
    ).toBeVisible({ timeout: 10_000 })
    expect(versionsOf(docId), 'still no version was written').toHaveLength(versionsBefore)

    // Step 3: complete the details and proceed — the revision IS created, so
    // the refusals above are a gate and not a broken dialog.
    await reason.fill('E2E J14 — clarified the calibration interval per SOP-014 rev 4.')
    await page.getByRole('button', { name: 'Create Revision' }).click()
    await expect(page.getByText('Create New Revision')).toBeHidden({ timeout: 20_000 })
    await waitForSqlValue(
      `SELECT count(*) FROM document_versions
         WHERE document_id = '${docId}' AND deleted_at IS NULL AND version_major = 2`,
      { timeoutMs: 25_000, label: 'v2.0 draft created' },
    )
    const v2 = versionsOf(docId).find((v) => v.id !== v1Id)
    expect(v2.statusId).toBe('DRAFT')
    // The captured reason really is on the row.
    expect(sqlValue(`SELECT change_reason FROM document_versions WHERE id = '${v2.id}'`)).toMatch(
      /calibration interval per SOP-014/,
    )
    // TC-01-08 step 4: the previously effective version is untouched and current.
    expect(sqlValue(`SELECT status_id FROM document_versions WHERE id = '${v1Id}'`)).toBe(
      'EFFECTIVE',
    )
    await ctx.close()
  })

  // ── TC-01-08 step 1 — the DATABASE layer, and what it does NOT cover ──────
  test('DATABASE: a version above 1.0 cannot be written without a change reason', async () => {
    // `document_versions_change_reason_required`:
    //   CHECK (ROW(version_major, version_minor) <= ROW(1,0) OR change_reason IS NOT NULL)
    // Probed as the superuser — the widest possible caller — inside a rolled-back
    // transaction. If even this is refused, no path writes a reasonless revision.
    let error = ''
    try {
      sql(`BEGIN;
        INSERT INTO document_versions
          (id, company_id, document_id, version_major, version_minor, status_id, is_latest,
           created_by, created_at, updated_at)
        VALUES (gen_random_uuid(), '${COMPANY_ID}', '${docId}', 9, 9, 'DRAFT', false,
                '${USERS.author.id}', NOW(), NOW());
        ROLLBACK;`)
    } catch (err) {
      error = `${err.stderr ?? ''}`
    }
    expect(error, 'the reasonless v9.9 insert was REJECTED').toMatch(
      /violates check constraint "document_versions_change_reason_required"/i,
    )
  })

  test('DATABASE: v1.0 is exempt — the constraint is scoped to revisions, not all versions', async () => {
    // The other half of the constraint, and the reason the dialog exists at all:
    // v1.0 is legitimately reasonless (there is nothing to have changed FROM).
    // Pinning it keeps a future "just make the column NOT NULL" from looking safe.
    expect(
      sqlValue(`SELECT change_reason IS NULL FROM document_versions WHERE id = '${v1Id}'`),
      'the seeded v1.0 carries no change reason and is accepted',
    ).toBe('t')
  })

  test('KNOWN DEFECT — change TYPE is a dialog-only control: the column is nullable', async () => {
    // KNOWN DEFECT (by design, per TC-01-08's note, recorded not fixed):
    // the protocol says change type "is enforced by the dialog only — its column
    // is nullable — so if you evidence change-type capture separately, record it
    // as an interface-level control". This test PINS the actual behaviour rather
    // than asserting the control the protocol stops short of claiming.
    //
    // PROTOCOL DEMANDS: the dialog requires change type (step 1) — and it does;
    //   `required('Pick a change type.')` on the BaseField, exercised above.
    // ACTUAL AT THE DATA LAYER: a v9.9 revision carrying a change reason but NO
    //   change type is ACCEPTED. Evidence below; measured 2026-09-22.
    // CONSEQUENCE: change-type capture is a usability control, not a
    //   data-integrity one. A write reaching the data layer directly is not
    //   refused, so do not present change type as a Part 11 integrity control.
    let error = ''
    try {
      sql(`BEGIN;
        INSERT INTO document_versions
          (id, company_id, document_id, version_major, version_minor, status_id, is_latest,
           change_reason, change_type, created_by, created_at, updated_at)
        VALUES (gen_random_uuid(), '${COMPANY_ID}', '${docId}', 9, 9, 'DRAFT', false,
                'J14 probe — reason present, type absent', NULL,
                '${USERS.author.id}', NOW(), NOW());
        ROLLBACK;`)
    } catch (err) {
      error = `${err.stderr ?? ''}`
    }
    expect(error, 'a typeless revision is ACCEPTED at the data layer').toBe('')
    // And the column really is nullable, which is the mechanism.
    expect(
      sqlValue(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_name = 'document_versions' AND column_name = 'change_type'`,
      ),
    ).toBe('YES')
  })

  // ── TC-01-08 step 5 — the REVISION HISTORY view ───────────────────────────
  test('revision history lists every version with its change-control detail', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    // The AUTHOR, deliberately. Only a collaborator/author sees a DRAFT version
    // — `document_version_select_rls` withholds DRAFT rows from every other
    // reader (see the separate arm below, which pins that) — so the author is
    // the only persona for whom "EVERY version is listed" is even testable.
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const dialog = await openRevisionHistory(page, docId)
    // Every version is listed. The document has v1.0 (EFFECTIVE) and v2.0 (DRAFT)
    // by now; confirm against the database rather than a hardcoded count.
    // version_label is not always stored (the dialog derives `v{major}.{minor}`
    // when it is null — see DocumentRevisionHistoryDialog.versionLabel), so
    // build the expected label from major/minor rather than trusting the column.
    const dbVersions = sql(
      `SELECT id, version_major, version_minor, status_id FROM document_versions
        WHERE document_id = '${docId}' AND deleted_at IS NULL
        ORDER BY version_major, version_minor`,
    )
      .split('\n')
      .map((line) => {
        const [id, major, minor, statusId] = line.split('|')
        return { id, label: `v${major}.${minor}`, statusId }
      })
    expect(dbVersions.length, 'fixture has more than one version to list').toBeGreaterThan(1)
    for (const v of dbVersions) {
      await expect(
        dialog.getByText(v.label, { exact: true }).first(),
        `${v.label} is listed`,
      ).toBeVisible({ timeout: 15_000 })
      await expect(
        dialog.getByText(v.statusId, { exact: true }).first(),
        `${v.label}'s status is shown`,
      ).toBeVisible()
    }
    // Change-control detail: the columns the protocol names, plus the captured
    // reason itself on the revision row.
    for (const heading of ['VERSION', 'STATUS', 'TYPE', 'APPROVED', 'REASON FOR CHANGE']) {
      await expect(dialog.getByText(heading, { exact: true }).first()).toBeVisible()
    }
    await expect(dialog.getByText(/calibration interval per SOP-014/)).toBeVisible()
    await expect(dialog.getByText('MINOR', { exact: true }).first()).toBeVisible()
    await ctx.close()
  })

  test('KNOWN DEFECT — revision history omits DRAFT versions from a non-collaborator reader', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    // KNOWN DEFECT (pinned, not fixed — it is an RLS design consequence, and it
    // is the same deliberate draft-privacy rule PW-J9 documents).
    // PROTOCOL DEMANDS (TC-01-08 step 5): "Every version is listed with its
    //   change control detail and approval chain."
    // ACTUAL: the dialog reads DocumentVersion out of this context's IndexedDB,
    //   and `document_version_select_rls` withholds DRAFT rows from anyone who
    //   is not the author/collaborator/assignee/owner. So a plain reader —
    //   here the AUDITOR, who holds document_control:read AND audit_trail:read
    //   at tenant scope — sees the EFFECTIVE version and NOT the in-progress
    //   v2.0 draft. Measured 2026-09-22 via sqlAsAppUser against
    //   document_version_select_rls: the auditor's SELECT returns the EFFECTIVE
    //   row only.
    // CONSEQUENCE: on an audit-facing traceability view, "every version" means
    //   "every version this reader may see". An auditor reviewing revision
    //   history cannot tell a document with no revision in flight from one with
    //   a draft they are not cleared for — and unlike the approval column, this
    //   omission is NOT labelled. If your procedure requires the revision
    //   history to be complete for an auditor, raise a deviation.
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const page = await ctx.newPage()
    const dialog = await openRevisionHistory(page, docId)
    await expect(dialog.getByText('v1.0', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByText('EFFECTIVE', { exact: true }).first()).toBeVisible()
    // …and the draft revision is absent, though it exists in the database.
    expect(
      sqlValue(
        `SELECT count(*) FROM document_versions
          WHERE document_id = '${docId}' AND deleted_at IS NULL AND status_id = 'DRAFT'`,
      ),
      'a DRAFT revision does exist on this document',
    ).toBe('1')
    await expect(dialog.getByText('v2.0', { exact: true })).toHaveCount(0)
    await ctx.close()
  })

  test('the approval column reads "Not shown" without audit_trail:read — never a blank', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    // THE TRAP TC-01-08 WARNS ABOUT, asserted as a control in its own right.
    // Carla (controller) holds full document_control CRUD and deliberately zero
    // audit_trail (e2e-seed.sql §35 names her as the regression probe for it).
    // `audit_log_select_rls` gates on audit_trail:read, so she syncs no
    // approval rows — and the column must say so rather than rendering the same
    // "—" a genuinely-unapproved version gets. On a Part 11 traceability view
    // those two must not look alike.
    const ctx = await browser.newContext({ storageState: AUTH.controller })
    const page = await ctx.newPage()
    const dialog = await openRevisionHistory(page, docId)
    await expect(
      dialog.getByText('Not shown', { exact: true }).first(),
      'missing permission is labelled, not silently empty',
    ).toBeVisible({ timeout: 15_000 })
    // The rest of the table is still hers to read — the gate is on the approval
    // column alone, not on the view.
    await expect(dialog.getByText('v1.0', { exact: true }).first()).toBeVisible()
    await expect(dialog.getByText('EFFECTIVE', { exact: true }).first()).toBeVisible()
    await ctx.close()

    // THE CONTRAST, which is what makes the label meaningful. The AUDITOR holds
    // audit_trail:read, so the same column for the same row is NOT labelled
    // "Not shown" — it falls through to the dialog's genuine-absence "—",
    // because this fixture's version reached EFFECTIVE along the database
    // transition path and so has no APPROVE / SET_EFFECTIVE audit row. Two
    // different renderings for two different facts, which is precisely the
    // distinction TC-01-08's note says must not collapse.
    const auditorCtx = await browser.newContext({ storageState: AUTH.auditor })
    const auditorPage = await auditorCtx.newPage()
    const auditorDialog = await openRevisionHistory(auditorPage, docId)
    await expect(auditorDialog.getByText('v1.0', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      auditorDialog.getByText('Not shown', { exact: true }),
      'a holder of audit_trail:read is never told the column is withheld',
    ).toHaveCount(0)
    await auditorCtx.close()
  })
})
