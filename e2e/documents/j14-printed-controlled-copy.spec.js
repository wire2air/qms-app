// PW-J14 · the printed controlled copy — OQ-01 TC-01-09 / URS-DOC-11.
//
// WHY THIS FILE EXISTS.  §9 scored URS-DOC-11 "Not automated": there was no
// test of the Document printout at all, only a static screenshot fixture at
// tests/screenshots/documents/detail-print-view.png.  The printout is the
// artefact that leaves the building — it is what is pinned to a bench, handed
// to an inspector, and read by an operator who has no way to ask the system a
// follow-up question.  What it says about ITSELF (is this copy current? was it
// approved? by whom?) is therefore the whole control.
//
// THE PRINT VIEW IS A SEPARATE ROUTE, NOT A CSS MEDIA QUERY.  The detail page's
// Print action opens `/print?module=Document&id=<doc>&versionId=<version>` in a
// new tab; `components/print/modules/index.js` dispatches the `Document` key to
// `DocumentPrint.vue`, which renders inside the shared `PrintLayout`.  These
// tests drive the product's own action and follow the popup rather than
// `goto`-ing the URL: a direct navigation would prove the component renders,
// not that the application offers a way to reach it.
//
// `window.print()` IS STUBBED BEFORE THE POPUP OPENS.  DocumentPrint fires it
// automatically ~200ms after its data resolves (DocumentPrint.vue:210-221) and
// a real print dialog blocks the browser for the remainder of the run.
// addInitScript only applies to pages created AFTER it is registered, so it is
// registered on the CONTEXT before the click that opens the popup.
//
// ── The two traps TC-01-09's blockquote warns about ────────────────────────
//
// TRAP 1 — THE APPROVAL BLOCK IS AUDIT TRAIL, NOT DOCUMENT CONTROL.  Both the
// "Approvals & Signatures" block and the revision history's approver columns
// are derived from `db.AuditLog`, and `audit_log_select_rls` bounds that table
// on `audit_trail:read` — a SEPARATE grant that `document_control:read` does
// not imply.  Without it nothing errors: the sync bootstrap simply syncs zero
// rows and the query returns [].  The product deliberately does NOT let the
// section vanish, because a copy printing with no signature block is
// indistinguishable, on paper, from a record that was never signed.  It
// prints "Not shown" plus a notice saying why.  BOTH branches are pinned here:
// `auditor` holds audit_trail:read + document_control:read, `author` holds
// every document_control action and NO audit_trail grant.  The premise of each
// is measured from authz.role_module_permissions rather than assumed, so a
// seed change that hands author the grant fails the test instead of silently
// asserting the wrong branch.
//
// TRAP 2 — PRINT PROVENANCE IS NOT PERSISTED.  "Printed by X · <timestamp>" is
// a computed read of the printing user's LIVE SESSION at render time
// (PrintLayout.vue:211-215, `printedBy`; :184, `generatedAt`).  Nothing is
// written: no audit_logs row, no controlled-copy register, no copy number, no
// distribution record.  So there is no "print log" to assert the existence of,
// and a test that waited for one would hang and then be written off as flaky.
// The test below asserts what actually happens — the line is on the ink, and
// carries the real session identity — and then pins the ABSENCE at the
// database as a documented limitation (see DC-PRINT-01).
import { test, expect } from '@playwright/test'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue, findDocumentByTitle, versionsOf, waitForSqlValue } from '../fixtures/db.js'
import {
  createSopDocument,
  fillAllSections,
  submitForReview,
  createNewRevision,
  uniqueTitle,
  gotoDoc,
  clickWhenReady,
  stepActionDialog,
} from '../fixtures/documents.js'
import { signWithPin } from '../fixtures/esign.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * Open a document's print view through the product's OWN Print action and hand
 * back the popup — with window.print stubbed on the context first.
 *
 * The action lives in DetailActionBar's overflow bucket at priority 50
 * (documentDetailConfig.js:120-128) and `visible: true` unconditionally, so it
 * is reachable at every status for every persona who can open the record. It
 * is not always promoted out of the ⋯ menu, hence the two-step lookup.
 */
async function openPrintout(page, documentId) {
  await page.context().addInitScript(() => {
    window.print = () => {}
  })
  await page.goto(`/documents/${documentId}`)
  // The ⋯ trigger is the readiness anchor the documents fixtures standardised
  // on: DetailActionBar always buckets >3 actions, so it exists as soon as the
  // record has rendered. If it never appears the persona has no RLS read path.
  await expect(
    page.getByRole('button', { name: 'More actions' }),
    'the document detail rendered for this persona',
  ).toBeVisible({ timeout: 60_000 })

  const inline = page.getByRole('button', { name: 'Print', exact: true })
  if (!(await inline.first().isVisible({ timeout: 3_000 }).catch(() => false))) {
    await page.getByRole('button', { name: 'More actions' }).click()
  }
  const [printout] = await Promise.all([
    page.waitForEvent('popup'),
    page
      .getByRole('menuitem', { name: 'Print', exact: true })
      .or(page.getByRole('button', { name: 'Print', exact: true }))
      .first()
      .click(),
  ])
  await printout.waitForLoadState('domcontentloaded')
  return printout
}

/** Wait for the printout to have real data (PrintLayout replaces the skeleton).
 *
 *  `anchor` is the doc number for a RELEASED document, but a DRAFT has none —
 *  `doc_number` is minted at release (URS-DOC-03). Passing null here used to
 *  reach getByText(null), which Playwright cannot build a matcher from: it
 *  threw "Cannot read properties of null (reading 'unicode')" instead of
 *  failing an assertion. Callers with no number pass the title instead, which
 *  is equally proof the skeleton was replaced. */
async function printoutReady(printout, anchor) {
  expect(anchor, 'printoutReady needs a non-null anchor (doc number or title)').toBeTruthy()
  await expect(
    printout.getByText(anchor, { exact: false }).first(),
    'the printout resolved its document (not still "Loading document…")',
  ).toBeVisible({ timeout: 90_000 })
}


/**
 * The shared fixture this suite builds on, checked before the expensive part.
 *
 * `createSopDocument` reads the template's INHERITED approval flow and waits
 * for its step-1 name to render. When the template's `workflow_id` is NULL the
 * wait times out 15s later inside the fixture, and the failure reads as "the
 * create form is broken" — which cost real time to diagnose once already. The
 * workflow is minted at setup time rather than seeded in e2e-seed.sql, so a
 * concurrent run's purge can momentarily remove it. Fail here, with the reason.
 */
function assertTemplateFixtureIntact() {
  const workflowId = sqlValue(
    `SELECT workflow_id FROM document_templates
      WHERE company_id = ${q(COMPANY_ID)} AND name = 'E2E SOP Template'`,
  )
  expect(
    workflowId,
    'the E2E SOP Template has its inherited approval workflow — it is minted at setup, ' +
      'not seeded, so a concurrent run\'s purge can momentarily remove it. Re-run documentsSetup.',
  ).toBeTruthy()
}


/**
 * Drive an IN_REVIEW version to EFFECTIVE, whichever reviewer actually got the step.
 *
 * ── DC-FIX-01 — RESOLVED 2026-09-24 in the seed. This helper is now a guard.
 *
 * `E2E Reviewer` carries TWO members (reviewer@ and reviewer2@, added by seed
 * §31b for CAPA-J8), and an e-signed step resolves the role to ONE of them
 * non-deterministically — measured over three hours on 2026-09-22: 23 instances
 * to reviewer2, 16 to reviewer. reviewer2 was seeded with no e-signature PIN, so
 * every run that picked her could not be driven past the signature by ANYBODY
 * and the journey died before it started. That broke every documents journey
 * that releases a version, not merely this file.
 *
 * The fix landed where it belonged — the seed now gives reviewer2 the shared PIN
 * hash, plus an idempotent re-assert for tenants seeded earlier (the INSERT is
 * ON CONFLICT DO NOTHING, so an existing tenant would otherwise keep the NULL).
 * Verified after the fix: j14 9/9, j15 11/12, with no reassignment triggered.
 *
 * The reassignment below is KEPT as a guard, not as a workaround: it is now a
 * no-op on a correctly seeded tenant, and it fails loudly rather than silently
 * if a future persona joins a workflow-bearing role without a PIN. Re-rolling by
 * cancel-and-resubmit does NOT work and was tried — the resolver is
 * `db.RoleOnUser.findOne({ where: { roleId } })` with NO `order` clause
 * (workflowInstanceService.js:106-111), so Postgres returns an arbitrary but
 * plan-stable row: measured 7 of 7 consecutive assignments to reviewer2.
 */
async function driveToEffectiveEitherReviewer(browser, docId, versionId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_id = ${q(versionId)} AND deleted_at IS NULL
        AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 60_000, label: 'step-1 reviewer task assigned' },
  )

  // Guard, not workaround (DC-FIX-01 fixed in the seed 2026-09-24): on a
  // correctly seeded tenant this finds nothing and does nothing. It stays so
  // that a future PIN-less persona in a workflow-bearing role is corrected
  // here rather than surfacing as an unexplained e-signature timeout.
  const unsignable = sqlValue(
    `SELECT count(*) FROM task_instances ti
       JOIN users u ON u.id = ti.assigned_to
      WHERE ti.entity_id = ${q(versionId)} AND ti.deleted_at IS NULL
        AND ti.status_id IN ('ASSIGNED','FORM_SUBMITTED')
        AND u.esign_pin_hash IS NULL`,
  )
  if (unsignable !== '0') {
    sql(
      `UPDATE task_instances SET assigned_to = ${q(USERS.reviewer.id)}
        WHERE entity_id = ${q(versionId)} AND deleted_at IS NULL
          AND status_id IN ('ASSIGNED','FORM_SUBMITTED')
          AND assigned_to = ${q(USERS.reviewer2.id)}`,
    )
    sql(
      `UPDATE users_on_workflow_instance_steps uwis
          SET user_id = ${q(USERS.reviewer.id)}
        FROM workflow_instance_steps wis, workflow_instances wi
        WHERE uwis.workflow_instance_step_id = wis.id
          AND wis.workflow_instance_id = wi.id
          AND wi.resource_id = ${q(versionId)}
          AND uwis.user_id = ${q(USERS.reviewer2.id)}`,
    )
  }

  const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
  const reviewerPage = await reviewerCtx.newPage()
  await gotoDoc(reviewerPage, docId)
  await clickWhenReady(reviewerPage, reviewerPage.getByRole('button', { name: /^approve$/i }), {
    until: stepActionDialog(reviewerPage),
  })
  const box = reviewerPage
    .locator('#headlessui-portal-root')
    .locator('textarea, [contenteditable="true"]')
    .first()
  if (await box.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false)) {
    await box.fill('Reviewed by E2E — accurate.')
  }
  await signWithPin(reviewerPage)
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances ti WHERE ti.entity_id = ${q(versionId)}
       AND ti.assigned_to = ${q(USERS.approver.id)} AND ti.deleted_at IS NULL
       AND ti.status_id NOT IN ('CANCELLED')`,
    { timeoutMs: 60_000, label: 'approver task created' },
  )
  await reviewerCtx.close()

  const approverCtx = await browser.newContext({ storageState: AUTH.approver })
  const approverPage = await approverCtx.newPage()
  await gotoDoc(approverPage, docId)
  await clickWhenReady(approverPage, approverPage.getByRole('button', { name: /^approve$/i }), {
    until: stepActionDialog(approverPage),
  })
  await signWithPin(approverPage)
  await waitForSqlValue(
    `SELECT status_id FROM document_versions WHERE id = ${q(versionId)} AND status_id = 'EFFECTIVE'`,
    { timeoutMs: 150_000, label: 'version EFFECTIVE' },
  )
  await approverCtx.close()
}

// One EFFECTIVE document, revised once so a SUPERSEDED version also exists.
// Built once in beforeAll: two full approval cycles are the expensive part of
// this file and every test below reads the same artefact.
const state = { docId: null, docNumber: null, v1: null, v2: null, title: null }

test.describe('PW-J14 · the printed controlled copy', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(900_000)
    assertTemplateFixtureIntact()
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const title = uniqueTitle('J14-print')
    state.title = title

    await createSopDocument(page, title)
    const doc = findDocumentByTitle(title)
    state.docId = doc.id
    state.docNumber = doc.docNumber
    await fillAllSections(page, doc.id)
    await submitForReview(page)
    const [v1] = versionsOf(doc.id)
    state.v1 = v1.id
    await driveToEffectiveEitherReviewer(browser, doc.id, v1.id)

    // A second cycle, so v1 is SUPERSEDED and v2 is EFFECTIVE. TC-01-09 step 4
    // needs a genuinely superseded version — setting status_id by hand would
    // prove the renderer reads a column, not that supersession marks a copy.
    await createNewRevision(page, doc.id, { changeType: 'Minor' })
    await waitForSqlValue(
      `SELECT count(*) FROM document_versions WHERE document_id = ${q(doc.id)} AND deleted_at IS NULL AND version_major = 2`,
      { timeoutMs: 30_000, label: 'v2.0 draft created' },
    )
    const v2 = versionsOf(doc.id).find((v) => v.id !== v1.id)
    state.v2 = v2.id
    await fillAllSections(page, doc.id)
    await submitForReview(page)
    await driveToEffectiveEitherReviewer(browser, doc.id, v2.id)
    await waitForSqlValue(
      `SELECT status_id FROM document_versions WHERE id = ${q(v1.id)} AND status_id = 'SUPERSEDED'`,
      { timeoutMs: 60_000, label: 'v1.0 superseded' },
    )

    // Re-read the number HERE, not at create. `doc_number` is minted when the
    // document is released, not when the draft is made (URS-DOC-03: "create
    // from template → DRAFT 1.0 with no doc number"), so the capture right
    // after createSopDocument stored null. Every printout assertion then called
    // getByText(null), which Playwright cannot build a matcher from — it threw
    // "Cannot read properties of null (reading 'unicode')" and took all five
    // dependent tests with it, while beforeAll itself reported success.
    state.docNumber = findDocumentByTitle(title)?.docNumber ?? null
    expect(state.docNumber, 'the released document carries a doc number').toBeTruthy()
    await ctx.close()
  })

  test('TC-01-09 step 1 · the effective printout carries company header, identifier AND version, status, and the approval detail', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    // The AUDITOR prints: they hold document_control:read AND audit_trail:read,
    // so this is the with-grant branch where approval detail is real. The
    // premise is measured, not assumed.
    expect(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions rmp
           JOIN roles_on_users ru ON ru.role_id = rmp.role_id
          WHERE ru.user_id = ${q(USERS.auditor.id)}
            AND rmp.module_id = 'audit_trail' AND rmp.action_id = 'read'`,
      ),
      'the printing persona HOLDS audit_trail:read — the premise of the approval-detail assertion',
    ).not.toBe('0')

    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const page = await ctx.newPage()
    const printout = await openPrintout(page, state.docId)
    await printoutReady(printout, state.docNumber)

    // Reached through the product's own action, pointed at the right record.
    const url = new URL(printout.url())
    expect(url.searchParams.get('module'), 'the Print action dispatches the Document module').toBe(
      'Document',
    )
    expect(url.searchParams.get('id'), 'for this document').toBe(state.docId)

    // ── Company header. Asserted on the tenant's real name rather than a
    // generic selector: a regression that dropped branding and printed the
    // fallback would otherwise pass.
    // `branding.name` is company.name (PrintLayout.vue:77); the tenant code
    // prints as a separate header line. Both are asserted: the name is what a
    // reader recognises, the code is what a document register is keyed on.
    await expect(
      printout.getByText('E2E Lab (Primary)', { exact: false }).first(),
      'the company header identifies the issuing organisation by name',
    ).toBeVisible()
    await expect(
      printout.getByText('E2ELAB', { exact: true }).first(),
      'and by tenant code',
    ).toBeVisible()

    // ── Document identifier AND version. The protocol names both, and they are
    // separate cells (DocumentPrint.vue:236-243) as well as being combined into
    // the footer identifier `${docNumber} v${versionLabel}`.
    await expect(
      printout.getByRole('heading', { name: state.title }),
      'the title is the printed heading',
    ).toBeVisible()
    await expect(
      printout.getByText(state.docNumber, { exact: false }).first(),
      'the document identifier is on the copy',
    ).toBeVisible()
    await expect(
      // `<th>Version</th>` sits in the meta table's tbody, so its ARIA role is
      // rowheader, not cell — getByRole('cell') never matches a <th>.
      printout.getByRole('rowheader', { name: 'Version', exact: true }),
      'version is a labelled field, not just embedded in a string',
    ).toBeVisible()
    await expect(
      printout.getByText(`${state.docNumber} v2.0`, { exact: false }).first(),
      'identifier AND version travel together in the footer identifier',
    ).toBeVisible()

    // ── Status. Both the header badge and the footer status line.
    await expect(
      printout.getByText('EFFECTIVE', { exact: true }).first(),
      'the status badge names the status',
    ).toBeVisible()
    await expect(
      printout.getByText(/^EFFECTIVE since /),
      'and the footer states since when it has been effective — what an auditor reads first',
    ).toBeVisible()

    // ── Approval detail. This is the TRAP-1 half: with the grant it is real
    // content, and the withheld-notice must NOT be present.
    await expect(
      printout.getByRole('heading', { name: 'Approvals & Signatures' }),
      'the signature block is printed',
    ).toBeVisible()
    await expect(
      // This one IS in a <thead>, so it is a columnheader (PrintLayout.vue:369).
      printout.getByRole('columnheader', { name: 'Signed by', exact: true }),
      'with a signed-by column',
    ).toBeVisible()
    await expect(
      printout.getByText(USERS.approver.name, { exact: false }).first(),
      'naming the approver who actually signed the version — real audit-trail content, not a placeholder',
    ).toBeVisible()
    await expect(
      // The div spans three template lines, so the DOM text arrives with
      // newlines: an `^`-anchored regex whose `.` cannot cross a newline never
      // matches. Match the locator by its class and read its text instead.
      printout.locator('.print-footer-approval').filter({ hasText: 'Approved by' }).first(),
      'and the footer carries the approval line an auditor scans for',
    ).toBeVisible()
    await expect(
      printout.getByText('Not shown on this copy.'),
      'the withheld notice is ABSENT for a printer who holds the grant',
    ).toBeHidden()

    await printout.close()
    await ctx.close()
  })

  test('TC-01-09 step 3 · a DRAFT printout is marked, in writing, as not for controlled use', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    // A fresh draft on its own document: the J14 fixture document has no DRAFT
    // version left (both cycles reached EFFECTIVE), and manufacturing one by
    // UPDATE would test the renderer rather than the lifecycle.
    assertTemplateFixtureIntact()
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const title = uniqueTitle('J14-draft')
    await createSopDocument(page, title)
    const doc = findDocumentByTitle(title)
    await fillAllSections(page, doc.id)
    const [draft] = versionsOf(doc.id)
    expect(draft.statusId, 'precondition: the version under test is a DRAFT').toBe('DRAFT')

    const printout = await openPrintout(page, doc.id)
    // A DRAFT carries no doc number yet, so the title is the anchor.
    await printoutReady(printout, doc.docNumber ?? title)

    // The substance of step 3. The exact string is PrintLayout.vue:193 — note
    // the em-dash (U+2014). Asserting the literal rather than /draft/i is the
    // point: "DRAFT" alone is a status word, and a status word is not a
    // warning. The sentence is what tells an operator not to work to this copy.
    await expect(
      printout.getByText('DRAFT — not for controlled use'),
      'the draft printout says in words that it is not for controlled use',
    ).toBeVisible()
    await expect(
      printout.getByText('DRAFT', { exact: true }).first(),
      'and the status badge shows DRAFT',
    ).toBeVisible()
    // The effective-version footer line must NOT also be present — a copy
    // carrying both would be worse than one carrying neither.
    await expect(
      printout.getByText(/^EFFECTIVE since /),
      'a draft copy never claims to be effective',
    ).toBeHidden()

    // KNOWN DEFECT: DC-PRINT-02 — the marking is ONE FOOTER LINE, not a
    // watermark. Protocol demands the printout be "clearly marked as not for
    // controlled use". The product prints the sentence once, in the footer of
    // the last page, plus a small status badge in the header of the first.
    // There is no diagonal overlay, no per-page repetition and no
    // "UNCONTROLLED COPY" text anywhere in the repo (grepped src/: zero hits
    // for watermark). On a 12-page SOP, pages 2-11 carry NO marking at all, so
    // a page pulled from the middle of a stapled draft is indistinguishable
    // from an effective one. Pinned here as the actual behaviour: the sentence
    // exists and is correct; its PLACEMENT is the deviation to raise.
    const pages = printout.locator('.print-page')
    expect(
      await pages.count(),
      'the printout is a single .print-page article — the marking is not repeated per printed page',
    ).toBe(1)

    await printout.close()
    await ctx.close()
  })

  test('TC-01-09 step 4 · a SUPERSEDED printout identifies itself as superseded and points at the current version', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    expect(
      sqlValue(`SELECT status_id FROM document_versions WHERE id = ${q(state.v1)}`),
      'precondition: v1.0 is SUPERSEDED',
    ).toBe('SUPERSEDED')

    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await page.context().addInitScript(() => {
      window.print = () => {}
    })
    // The superseded version is not the detail page's default selection, so it
    // is addressed by versionId — the same URL shape the Print action builds
    // when a prior version is selected in the version picker
    // (DocumentsPageId.vue:86-89).
    await page.goto(`/print?module=Document&id=${state.docId}&versionId=${state.v1}`)
    await printoutReady(page, state.docNumber)

    // The substance of step 4. PrintLayout.vue:197, em-dash again. This line
    // does two jobs the protocol asks for: it identifies the copy as
    // superseded, AND it tells the holder where to go instead.
    await expect(
      page.getByText('SUPERSEDED — refer to the latest effective version'),
      'the superseded printout identifies itself and redirects the reader',
    ).toBeVisible()
    await expect(
      page.getByText('SUPERSEDED', { exact: true }).first(),
      'and the status badge shows SUPERSEDED',
    ).toBeVisible()
    await expect(
      page.getByText(/^EFFECTIVE since /),
      'a superseded copy never claims to be effective',
    ).toBeHidden()

    // It is still the v1 content that printed, not a silent fallback to the
    // effective version — the renderer falls back to versions[0] on an unknown
    // versionId (DocumentPrint.vue:163-169), which would quietly print the
    // WRONG version under a SUPERSEDED request.
    await expect(
      page.getByText(`${state.docNumber} v1.0`, { exact: false }).first(),
      'the copy is v1.0 — the version that was actually asked for',
    ).toBeVisible()

    await page.close()
    await ctx.close()
  })

  test('TC-01-09 step 2 · print provenance is on the copy — and is NOT persisted anywhere (DC-PRINT-01)', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    // Count the audit rows for this document BEFORE printing. The claim under
    // test is a negative one, so the baseline has to be measured.
    const auditBefore = sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_id = ${q(state.docId)}`,
    )

    const printout = await openPrintout(page, state.docId)
    await printoutReady(printout, state.docNumber)

    // What DOES happen: the line is rendered, from the live session, naming the
    // real printing user. Matched on the persona's actual name so a regression
    // that printed a placeholder ("Unknown user") or leaked another session
    // would be caught.
    await expect(
      printout.getByText(/Printed by /),
      'the copy names who printed it and when',
    ).toBeVisible()
    await expect(
      printout.getByText(new RegExp(`Printed by ${USERS.author.name}\\s+·`)),
      'and it is the real printing session, not a placeholder',
    ).toBeVisible()

    // KNOWN DEFECT: DC-PRINT-01 — print provenance is RENDER-TIME ONLY.
    // Protocol step 2 asks that "the printout records who printed it and when".
    // ACTUAL: `printedBy` (PrintLayout.vue:211-215) and `generatedAt` (:184)
    // are Vue computeds read from the live session at render time. Nothing is
    // written server-side: there is no controlled-copy register, no copy
    // number, no distribution record, and printing emits no audit row. The
    // consequence is that the system cannot answer "who holds copies of this
    // SOP, and which revision are they working to?" — which is the question a
    // controlled-copy procedure exists to answer, and the one an inspector
    // asks. Recorded as a limitation rather than a failing assertion: the test
    // below PINS the absence, so that if a print register is ever added this
    // test fails and is updated deliberately.
    const auditAfter = sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_id = ${q(state.docId)}`,
    )
    expect(
      auditAfter,
      'printing writes NO audit row — there is no server-side record that a copy was produced',
    ).toBe(auditBefore)

    // And there is no register table at all. Pinned by schema so that the
    // limitation is evidenced structurally, not just by a count that a
    // background worker could perturb.
    expect(
      sql(
        `SELECT count(*) FROM information_schema.tables
          WHERE table_schema = 'public'
            AND (table_name ILIKE '%printed%' OR table_name ILIKE '%print_log%'
                 OR table_name ILIKE '%controlled_cop%')`,
      ),
      'no printed-copy register table exists in the schema (DC-PRINT-01)',
    ).toBe('0')

    await printout.close()
    await ctx.close()
  })

  test('TRAP 1 · without audit_trail:read the approval block prints "Not shown", never a silently empty block', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    // The premise, measured: author holds every document_control action and NO
    // audit_trail grant. If a seed change ever handed them one, this test would
    // assert the wrong branch and pass for the wrong reason.
    expect(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions rmp
           JOIN roles_on_users ru ON ru.role_id = rmp.role_id
          WHERE ru.user_id = ${q(USERS.author.id)} AND rmp.module_id = 'audit_trail'`,
      ),
      'the printing persona holds NO audit_trail grant — the premise of this test',
    ).toBe('0')

    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const printout = await openPrintout(page, state.docId)
    await printoutReady(printout, state.docNumber)

    // The section is still printed. Omitting it entirely is the failure mode:
    // on paper, an absent signature block reads as an unsigned record, and
    // paper carries no way to ask.
    await expect(
      printout.getByRole('heading', { name: 'Approvals & Signatures' }),
      'the section is still printed — omitting it entirely is the failure mode',
    ).toBeVisible()
    await expect(
      printout.getByText('Not shown on this copy.'),
      'and it says plainly that the block is withheld, not absent',
    ).toBeVisible()
    await expect(
      printout.getByText('Their absence is not evidence that this record is unsigned.', {
        exact: false,
      }),
      'with the sentence that stops a reader treating a withheld block as an unsigned record',
    ).toBeVisible()
    // KNOWN DEFECT DC-PRINT-02 (found 2026-09-23): the footer's withheld-notice
    // is UNREACHABLE for this persona, so the body and the footer of the same
    // page disagree.
    //
    // PrintLayout.vue:415-422 renders `Approved by …` when `latestApproval` is
    // truthy and the withheld-notice only as its `v-else-if`. `latestApproval`
    // derives from `signatures` (PrintLayout.vue:204), and `signature_select_rls`
    // gates that table on the RECORD's own module — `document_control:read`,
    // `capa:read`, `ncr:read`, … — and never on `audit_trail:read` (verified
    // against pg_policy). The author holds `document_control:read` and zero
    // audit_trail grants, so they read the signature row, the footer prints a
    // real approver name, and the `v-else-if` never runs.
    //
    // The result on paper: the body says "Not shown on this copy … absence is
    // not evidence that this record is unsigned", while the footer of that same
    // copy names the approver and the date. Pinned as it BEHAVES, so the day
    // the footer is brought under the same carve-out this assertion flips and
    // the pin is revisited.
    await expect(
      printout.getByText('Approval details not shown — printed by a user without audit trail access'),
      'DC-PRINT-02: the footer withheld-notice is unreachable while a signature is readable',
    ).toHaveCount(0)
    await expect(
      printout.locator('.print-footer-approval').filter({ hasText: 'Approved by' }),
      'DC-PRINT-02: instead the footer prints real approval detail to a user the body withholds it from',
    ).toHaveCount(1)

    // The revision-history appendix (two versions exist, so it renders) uses
    // the same carve-out, with a DIFFERENT literal: cells read "Not shown"
    // while "—" stays reserved for "the document records none". Conflating the
    // two is exactly how a withheld approver becomes "never approved".
    await expect(
      printout.getByRole('heading', { name: 'Revision History' }),
      'the revision history appendix renders (this document has two versions)',
    ).toBeVisible()
    await expect(
      printout.getByRole('cell', { name: 'Not shown', exact: true }).first(),
      'the approver cells read "Not shown", not the "—" that means "records none"',
    ).toBeVisible()
    await expect(
      printout.getByText('"Not shown" is not "not approved."'),
      'and the appendix carries its own explanatory banner',
    ).toBeVisible()

    await printout.close()
    await ctx.close()
  })
})
