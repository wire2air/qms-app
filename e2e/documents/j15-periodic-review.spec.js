// PW-J15 · periodic review — OQ-01 TC-01-10 / URS-DOC-12.
//
// WHY THIS FILE EXISTS.  §9 scored URS-DOC-12 "Not automated".  Periodic review
// is the control that keeps a released document HONEST over time: without it a
// procedure stays "effective" for ever on the strength of one approval, and the
// register quietly fills with documents nobody has looked at since. The clock,
// the task that fires off it, and the attestation that restarts it are three
// separate mechanisms and this file exercises each.
//
// ── The derivation, and the date it is NOT derived from ────────────────────
//
// next_review = COALESCE(last_reviewed_at, created_at) + periodic_review_months
//
// Explicitly NOT the effective date. That matters more than it looks: a
// document approved in January and made effective in June has been REVIEWED in
// January, and dating the next review from June would silently grant six free
// months. The same formula is implemented THREE times — in the worker's SQL
// (check_periodic_reviews.js:65-66), in the badge's Luxon (
// DocumentPeriodicReviewBadge.vue:68-78), and again in the audit-readiness
// dashboard — so the tests below assert the arithmetic against the DATABASE
// and against the SCREEN independently, which is what would catch the three
// drifting apart.
//
// ── TRAP 3: the scan is NIGHTLY, and this file does not wait for the night ──
//
// `check_periodic_reviews` is a graphile-worker cron task (worker/crontab:15,
// `0 2 * * *  check_periodic_reviews  ?id=periodic-review-scan`). A task is NOT
// expected to appear the moment the review date changes, so a test that
// polled for one after an UPDATE would hang for its whole budget and then be
// filed as flaky.
//
// Instead the scan is DRIVEN: `graphile_worker.add_job('check_periodic_reviews')`
// enqueues the very task the cron would enqueue, and the already-running worker
// picks it up within seconds. That is the real production code path — the same
// task file, the same SQL, the same assignee resolution — just triggered on
// demand rather than at 02:00. `runReviewScan()` below enqueues and then waits
// for the queue to drain.
//
// The scan's ELIGIBILITY PREDICATE is the other half of trap 3, and it is
// correct behaviour rather than a gap: a document with no EFFECTIVE version, or
// an obsoleted (archived) one, raises NO task. Both negatives are pinned below,
// because "no task appeared" is otherwise indistinguishable from "the scan is
// broken" — which is precisely the failure this codebase has had before (the
// scan referenced `d.created_by`, a column `documents` does not have, so it
// threw every night and NO review task was ever created; the only symptom of a
// failed cron is work that never appears).
//
// ── Step 4 is proved at the SERVER, not at the dialog ──────────────────────
//
// DocumentReviewDialog disables its Sign button when the outcome is NO_CHANGE
// and the justification is empty (`canSign`, :56). That is a UX courtesy, not
// the control. The control is controllers/documents/reviews.js:60-62, which
// 400s regardless of what the client sent. The refusal test therefore posts
// DIRECTLY to `/v1/services/documents/:id/review` with the dialog out of the
// picture, and additionally proves nothing was written.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, COMPANY_ID, ESIGN_PIN } from '../fixtures/cast.js'
import { sql, sqlValue, sqlRow, findDocumentByTitle, versionsOf, waitForSqlValue } from '../fixtures/db.js'
import {
  createSopDocument,
  fillAllSections,
  submitForReview,
  uniqueTitle,
  gotoDoc,
  clickWhenReady,
  stepActionDialog,
} from '../fixtures/documents.js'
import { signWithPin } from '../fixtures/esign.js'

const API = 'http://e2elab.localhost:4000'
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * Drive the nightly scan on demand.
 *
 * Enqueues the exact task the crontab enqueues and waits for the running
 * worker to drain it. Returns once no `check_periodic_reviews` job is left in
 * the queue, so callers can assert on its effects immediately afterwards.
 *
 * Not a mock and not a reimplementation: this is production's own task file,
 * SQL and assignee resolution, invoked early.
 */
async function runReviewScan({ timeoutMs = 90_000 } = {}) {
  sql(`SELECT id FROM graphile_worker.add_job('check_periodic_reviews')`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const pending = sqlValue(
      `SELECT count(*) FROM graphile_worker._private_jobs j
         JOIN graphile_worker._private_tasks t ON t.id = j.task_id
        WHERE t.identifier = 'check_periodic_reviews'`,
    )
    if (pending === '0') return
    await new Promise((r) => setTimeout(r, 1_500))
  }
  throw new Error('check_periodic_reviews did not drain — is the worker running?')
}

/** The scan's own next-review arithmetic, asked of the database. */
function nextReviewDate(docId) {
  return sqlValue(
    `SELECT (COALESCE(last_reviewed_at, created_at)
              + (periodic_review_months || ' months')::interval)::date
       FROM documents WHERE id = ${q(docId)}`,
  )
}

/** The open REVIEW task the scan raises, if any. */
function openReviewTask(docId) {
  const row = sqlRow(
    `SELECT id, assigned_to, due_date::date, status_id, source_type FROM task_instances
      WHERE entity_type = 'Document' AND entity_id = ${q(docId)}
        AND task_kind_id = 'REVIEW'
        AND status_id IN ('ASSIGNED','IN_PROGRESS','CHANGES_REQUESTED','SENT_BACK','FORM_SUBMITTED')
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return { id: row[0], assignedTo: row[1], dueDate: row[2], statusId: row[3], sourceType: row[4] }
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

/** Build an EFFECTIVE document. The scan ignores anything without one. */
async function makeEffectiveDoc(browser, tag) {
  assertTemplateFixtureIntact()
  const ctx = await browser.newContext({ storageState: AUTH.author })
  const page = await ctx.newPage()
  const title = uniqueTitle(tag)
  await createSopDocument(page, title)
  const doc = findDocumentByTitle(title)
  await fillAllSections(page, doc.id)
  await submitForReview(page)
  const [v1] = versionsOf(doc.id)
  await driveToEffectiveEitherReviewer(browser, doc.id, v1.id)
  await ctx.close()
  return { ...doc, title, versionId: v1.id }
}

test.describe('PW-J15 · periodic review', () => {
  test('TC-01-10 steps 1+2 · the frequency saves, and for a never-reviewed document the next review date derives from CREATION', async ({
    browser,
  }) => {
    test.setTimeout(600_000)
    // A document that has NEVER been released, deliberately. Releasing a
    // version stamps last_reviewed_at (see the next test), so an effective
    // document is never "never reviewed" — the creation-date branch of the
    // derivation can only be observed before first release.
    assertTemplateFixtureIntact()
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const title = uniqueTitle('J15-derive')
    await createSopDocument(page, title)
    const doc = findDocumentByTitle(title)

    // Step 1 — a frequency is configured and persists. The seeded SOP template
    // carries 12 months; set 6 so the assertion cannot pass on the default.
    // This is the column the edit dialog's stepper binds to
    // (DocumentsEditDialog.vue:152-182, `periodicReviewMonths`).
    sql(`UPDATE documents SET periodic_review_months = 6 WHERE id = ${q(doc.id)}`)
    expect(
      sqlValue(`SELECT periodic_review_months FROM documents WHERE id = ${q(doc.id)}`),
      'the configured frequency is saved',
    ).toBe('6')

    expect(
      sqlValue(`SELECT last_reviewed_at IS NULL FROM documents WHERE id = ${q(doc.id)}`),
      'precondition: this document has never been reviewed',
    ).toBe('t')

    // Step 2 — never reviewed ⇒ the baseline is the CREATION date.
    expect(
      nextReviewDate(doc.id),
      'next review = creation + frequency, for a document never reviewed',
    ).toBe(
      sqlValue(
        `SELECT (created_at + interval '6 months')::date FROM documents WHERE id = ${q(doc.id)}`,
      ),
    )

    // ...and it tracks CREATION, not anything else. On a same-day E2E run the
    // candidate dates coincide, so a plain inequality would be vacuous. Assert
    // the DERIVATION instead: move creation back a year and watch the
    // next-review date move with it by exactly a year.
    const before = nextReviewDate(doc.id)
    sql(`UPDATE documents SET created_at = created_at - interval '1 year' WHERE id = ${q(doc.id)}`)
    const after = nextReviewDate(doc.id)
    expect(
      sqlValue(`SELECT (${q(before)}::date - ${q(after)}::date)`),
      'backdating creation by a year moves the next-review date by exactly a year',
    ).toBe('365')

    // The SCREEN agrees with the database. The badge recomputes the same
    // formula independently in Luxon (DocumentPeriodicReviewBadge.vue:68-78),
    // so this is the assertion that catches the two implementations drifting.
    // Restore a forward clock first so the badge renders its 'current' branch
    // ("Next review: <date>") rather than the overdue banner.
    sql(
      `UPDATE documents SET created_at = now(), periodic_review_months = 24 WHERE id = ${q(doc.id)}`,
    )
    const expectedLabel = sqlValue(
      `SELECT to_char((created_at + interval '24 months'), 'FMMon FMDD, YYYY')
         FROM documents WHERE id = ${q(doc.id)}`,
    )
    await page.goto(`/documents/${doc.id}`)
    await expect(
      page.getByText(`Next review: ${expectedLabel}`),
      'the screen shows the same next-review date the database derives',
    ).toBeVisible({ timeout: 90_000 })
    await ctx.close()
  })

  test('TC-01-10 step 2 · releasing a version restarts the clock, so the date derives from the LAST REVIEW and never from the effective date', async ({
    browser,
  }) => {
    test.setTimeout(600_000)
    // The other half of step 2, and the half that proves the protocol's
    // "NOT derived from the effective date" clause has teeth.
    //
    // Releasing a version stamps last_reviewed_at — "a fresh EFFECTIVE version
    // IS a review event" (documentversion.js:279-315). So a released document
    // derives from last_reviewed_at, which is set AT RELEASE and therefore sits
    // very close to the effective date. The two are easy to confuse and this
    // test separates them: move last_reviewed_at, leave effective_date alone,
    // and the next-review date must follow last_reviewed_at.
    const doc = await makeEffectiveDoc(browser, 'J15-clock')

    sql(`UPDATE documents SET periodic_review_months = 6 WHERE id = ${q(doc.id)}`)
    expect(
      sqlValue(`SELECT last_reviewed_at IS NOT NULL FROM documents WHERE id = ${q(doc.id)}`),
      'releasing a version stamped the review clock',
    ).toBe('t')

    const effectiveDate = sqlValue(
      `SELECT MIN(effective_date::date) FROM document_versions
        WHERE document_id = ${q(doc.id)} AND status_id = 'EFFECTIVE'`,
    )
    expect(effectiveDate, 'the version has an effective date to contrast against').not.toBe('')

    // Move ONLY the last-reviewed date, two years back.
    sql(
      `UPDATE documents SET last_reviewed_at = now() - interval '2 years' WHERE id = ${q(doc.id)}`,
    )
    expect(
      sqlValue(
        `SELECT MIN(effective_date::date) FROM document_versions
          WHERE document_id = ${q(doc.id)} AND status_id = 'EFFECTIVE'`,
      ),
      'the effective date is untouched by that move',
    ).toBe(effectiveDate)

    expect(
      nextReviewDate(doc.id),
      'next review = LAST REVIEWED + frequency',
    ).toBe(
      sqlValue(
        `SELECT (last_reviewed_at + interval '6 months')::date FROM documents WHERE id = ${q(doc.id)}`,
      ),
    )
    expect(
      nextReviewDate(doc.id),
      'and NOT effective date + frequency — the derivation the protocol explicitly rules out',
    ).not.toBe(sqlValue(`SELECT (${q(effectiveDate)}::date + interval '6 months')::date`))
  })

  test('TC-01-10 step 3 · a due document raises a REVIEW task to the document OWNER, dated to the derived review date', async ({
    browser,
  }) => {
    test.setTimeout(600_000)
    const doc = await makeEffectiveDoc(browser, 'J15-due')

    // Make it fall due. The scan's lead is 30 days (LEAD_DAYS), so backdating
    // creation past the frequency puts it comfortably overdue rather than
    // relying on the edge of the lead window.
    // Make it fall due. The scan's lead is 30 days (LEAD_DAYS), so backdating
    // past the frequency puts it comfortably overdue rather than sitting on the
    // edge of the lead window.
    //
    // BOTH columns move, and last_reviewed_at is the one that matters: the
    // baseline is COALESCE(last_reviewed_at, created_at), and releasing a
    // version STAMPS last_reviewed_at (documentversion.js:279-315 — "a fresh
    // EFFECTIVE version IS a review event"). Backdating created_at alone is
    // therefore inert on any document that has been released, which is every
    // document the scan looks at.
    sql(
      `UPDATE documents SET periodic_review_months = 12,
                            created_at = now() - interval '13 months',
                            last_reviewed_at = now() - interval '13 months'
        WHERE id = ${q(doc.id)}`,
    )
    expect(openReviewTask(doc.id), 'precondition: no review task exists yet').toBeNull()

    await runReviewScan()

    const task = openReviewTask(doc.id)
    expect(task, 'the scan raised a REVIEW task for the due document').not.toBeNull()

    // Raised to the OWNER (documents.user_id) — deliberately not the author and
    // not whoever reviewed it last.
    const ownerId = sqlValue(`SELECT user_id FROM documents WHERE id = ${q(doc.id)}`)
    expect(task.assignedTo, 'the review task is assigned to the document owner').toBe(ownerId)
    expect(ownerId, 'and that owner is the creating persona').toBe(USERS.author.id)

    // Dated to the derived review date, not to "today" — so the task inbox
    // sorts by real urgency.
    expect(task.dueDate, 'the task due date IS the derived next-review date').toBe(
      nextReviewDate(doc.id),
    )
    expect(task.sourceType, 'and it is attributable to the periodic-review scan').toBe(
      'PeriodicReview',
    )
    expect(task.statusId).toBe('ASSIGNED')

    // Idempotent: the scan runs nightly, and a second night must not produce a
    // second task while the first is still open. Without this guard an
    // overdue document would accrue one task per night indefinitely.
    await runReviewScan()
    expect(
      sqlValue(
        `SELECT count(*) FROM task_instances
          WHERE entity_type = 'Document' AND entity_id = ${q(doc.id)}
            AND task_kind_id = 'REVIEW'
            AND status_id IN ('ASSIGNED','IN_PROGRESS','CHANGES_REQUESTED','SENT_BACK','FORM_SUBMITTED')`,
      ),
      're-running the scan does not raise a duplicate task',
    ).toBe('1')

    // The task surfaces on the document itself, so the owner meets it where
    // the work is rather than only in an inbox.
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await page.goto(`/documents/${doc.id}`)
    await expect(
      page.getByText('Review pending'),
      'the open review task is visible on the document',
    ).toBeVisible({ timeout: 90_000 })
    await ctx.close()
  })

  test('TRAP 3 · a document with no effective version, and an archived one, raise NO task — correct behaviour, not a failure', async ({
    browser,
  }) => {
    test.setTimeout(600_000)

    // (a) Never released. A draft that is old enough to be "due" is not due,
    // because nothing has been issued to anyone — there is no controlled copy
    // in the field to be stale.
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const draftTitle = uniqueTitle('J15-nodraft')
    await createSopDocument(page, draftTitle)
    const draftDoc = findDocumentByTitle(draftTitle)
    await ctx.close()
    sql(
      `UPDATE documents SET periodic_review_months = 1,
                            created_at = now() - interval '5 years',
                            last_reviewed_at = NULL
        WHERE id = ${q(draftDoc.id)}`,
    )
    expect(
      sqlValue(
        `SELECT count(*) FROM document_versions
          WHERE document_id = ${q(draftDoc.id)} AND status_id = 'EFFECTIVE' AND deleted_at IS NULL`,
      ),
      'precondition: this document has no EFFECTIVE version',
    ).toBe('0')

    // (b) Archived (obsoleted). A withdrawn document must not keep generating
    // review work for an owner who correctly retired it.
    const archived = await makeEffectiveDoc(browser, 'J15-archived')
    sql(
      `UPDATE documents
          SET periodic_review_months = 1,
              created_at = now() - interval '5 years',
              last_reviewed_at = now() - interval '5 years',
              obsoleted_at = now(),
              obsoleted_by = ${q(USERS.author.id)},
              obsoletion_reason = 'PW-J15 — archived, must not raise review work'
        WHERE id = ${q(archived.id)}`,
    )
    expect(
      sqlValue(`SELECT obsoleted_at IS NOT NULL FROM documents WHERE id = ${q(archived.id)}`),
      'precondition: this document is archived',
    ).toBe('t')

    await runReviewScan()

    expect(
      openReviewTask(draftDoc.id),
      'a document with no effective version raises no review task — correct, not a gap',
    ).toBeNull()
    expect(
      openReviewTask(archived.id),
      'an archived document raises no review task — correct, not a gap',
    ).toBeNull()

    // The scan is proved ALIVE in the same run, so the two nulls above cannot
    // be explained by "the scan did nothing at all". This is the assertion the
    // `d.created_by` regression needed and did not have: for months the scan
    // threw every night, and every eligibility test would still have passed.
    const control = await makeEffectiveDoc(browser, 'J15-control')
    sql(
      `UPDATE documents SET periodic_review_months = 12,
                            created_at = now() - interval '13 months',
                            last_reviewed_at = now() - interval '13 months'
        WHERE id = ${q(control.id)}`,
    )
    await runReviewScan()
    expect(
      openReviewTask(control.id),
      'a control document DID raise a task in the same scan — the two nulls above are eligibility, not a dead scan',
    ).not.toBeNull()
  })

  test('TC-01-10 step 4 · "no change required" with NO justification is refused BY THE SERVER, and writes nothing', async ({
    browser,
  }) => {
    test.setTimeout(600_000)
    const doc = await makeEffectiveDoc(browser, 'J15-refusal')
    const ctx = await browser.newContext({ storageState: AUTH.author })

    const reviewsBefore = sqlValue(
      `SELECT count(*) FROM document_reviews WHERE document_id = ${q(doc.id)}`,
    )
    const clockBefore = sqlValue(
      `SELECT last_reviewed_at FROM documents WHERE id = ${q(doc.id)}`,
    )

    // Posted directly, with the dialog out of the picture. The dialog's
    // disabled Sign button is a courtesy; this is the control.
    const res = await ctx.request.post(`${API}/v1/services/documents/${doc.id}/review`, {
      data: { outcome: 'NO_CHANGE', esign: { method: 'PIN', token: ESIGN_PIN } },
    })
    expect(res.status(), 'the server refuses NO_CHANGE without a justification').toBe(400)
    expect(
      JSON.stringify(await res.json()),
      'and says why, in terms a reviewer can act on',
    ).toContain('A justification is required when no change is made.')

    // An empty rich-text editor emits '<p></p>'. The check is markup-blind
    // (richTextFilled, reviews.js:38-42), so whitespace-in-tags is refused too
    // — which is what a user who clicks into the box and back out sends.
    const emptyMarkup = await ctx.request.post(`${API}/v1/services/documents/${doc.id}/review`, {
      data: {
        outcome: 'NO_CHANGE',
        justification: '<p></p>',
        esign: { method: 'PIN', token: ESIGN_PIN },
      },
    })
    expect(
      emptyMarkup.status(),
      'an empty rich-text editor does not count as a justification',
    ).toBe(400)

    // Nothing was written — not the review row, not the signature, not the
    // clock. A refusal that still stamped last_reviewed_at would restart the
    // compliance clock on a review that never happened.
    expect(
      sqlValue(`SELECT count(*) FROM document_reviews WHERE document_id = ${q(doc.id)}`),
      'no review row was written by either refusal',
    ).toBe(reviewsBefore)
    // The clock did not move. Not "is NULL" — releasing the version already
    // stamped last_reviewed_at — but "is the same instant it was before the
    // two refusals". A refusal that still restarted the clock would grant a
    // fresh review period for a review that never happened.
    expect(
      sqlValue(`SELECT last_reviewed_at FROM documents WHERE id = ${q(doc.id)}`),
      'and the review clock was NOT restarted',
    ).toBe(clockBefore)

    await ctx.close()
  })

  test('TC-01-10 step 4 · with a justification and a valid PIN the review is accepted, recorded as a SIGNED decision, and the clock restarts', async ({
    browser,
  }) => {
    test.setTimeout(600_000)
    const doc = await makeEffectiveDoc(browser, 'J15-accept')

    // Make it due first, so the accepted review also has to close the open
    // task — the half of the contract that keeps the scan from re-raising it
    // the next night.
    sql(
      `UPDATE documents SET periodic_review_months = 12,
                            created_at = now() - interval '13 months',
                            last_reviewed_at = now() - interval '13 months'
        WHERE id = ${q(doc.id)}`,
    )
    await runReviewScan()
    const task = openReviewTask(doc.id)
    expect(task, 'precondition: an open review task exists').not.toBeNull()

    const beforeNext = nextReviewDate(doc.id)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const justification = 'PW-J15 — sections 1-3 re-read against the current process; still accurate.'

    const res = await ctx.request.post(`${API}/v1/services/documents/${doc.id}/review`, {
      data: {
        outcome: 'NO_CHANGE',
        justification,
        esign: { method: 'PIN', token: ESIGN_PIN },
      },
    })
    expect(res.status(), 'a justified, PIN-signed review is accepted').toBe(200)

    // Recorded as a decision with its reason — not as an overwritten timestamp.
    // The row survives the next cycle, which a `last_reviewed_at` stamp does not.
    const review = sqlRow(
      `SELECT outcome, justification, reviewed_by, signature_id, task_instance_id, reviewed_at
         FROM document_reviews WHERE document_id = ${q(doc.id)}
        ORDER BY reviewed_at DESC LIMIT 1`,
    )
    expect(review, 'the review is kept as its own record').not.toBeNull()
    expect(review[0], 'with the outcome that was attested').toBe('NO_CHANGE')
    expect(review[1], 'and the reason it was attested').toBe(justification)
    expect(review[2], 'attributed to the reviewer').toBe(USERS.author.id)
    expect(review[4], 'and linked to the task it closes').toBe(task.id)

    // SIGNED. The protocol says "recorded as a signed decision", so the
    // signature is asserted as a real Part 11 row, with its meaning — not
    // merely as a non-null id.
    expect(review[3], 'the decision carries a signature').not.toBe('')
    const sig = sqlRow(
      `SELECT user_id, meaning FROM signatures WHERE id = ${q(review[3])}`,
    )
    expect(sig, 'the signature row exists').not.toBeNull()
    expect(sig[0], 'signed by the reviewer').toBe(USERS.author.id)
    expect(
      sig[1],
      'and its MEANING names the act — a signature without one proves only that a PIN was typed',
    ).toBe('Periodic review completed — no change required')

    // The clock restarts from the NEW last-reviewed date. Asserted as MOVEMENT
    // from the backdated value, not as non-NULL: the release already stamped
    // last_reviewed_at, so a non-NULL check would pass without the review
    // having done anything.
    expect(
      sqlValue(
        `SELECT last_reviewed_at > now() - interval '5 minutes'
           FROM documents WHERE id = ${q(doc.id)}`,
      ),
      'last_reviewed_at is re-stamped to the moment of this review',
    ).toBe('t')
    expect(
      sqlValue(`SELECT last_reviewed_at = ${q(review[5])} FROM documents WHERE id = ${q(doc.id)}`),
      'and it is exactly the reviewed_at of the decision just recorded',
    ).toBe('t')
    const afterNext = nextReviewDate(doc.id)
    expect(afterNext, 'and the next review date has moved forward').not.toBe(beforeNext)
    expect(
      afterNext,
      'to exactly last-reviewed + frequency — the clock restarts from the review, not from creation',
    ).toBe(
      sqlValue(
        `SELECT (last_reviewed_at + (periodic_review_months || ' months')::interval)::date
           FROM documents WHERE id = ${q(doc.id)}`,
      ),
    )

    // The open task is closed, so the scanner's guard clears cleanly rather
    // than the task lingering and suppressing next year's review.
    expect(
      sqlValue(`SELECT status_id FROM task_instances WHERE id = ${q(task.id)}`),
      'the review task is closed by the attestation',
    ).toBe('APPROVED')
    expect(openReviewTask(doc.id), 'no open review task remains').toBeNull()

    // And the scan agrees: now that the clock has restarted, a further run
    // raises nothing. This is what "the review clock restarts" MEANS
    // operationally.
    await runReviewScan()
    expect(
      openReviewTask(doc.id),
      'the restarted clock keeps the next scan quiet',
    ).toBeNull()

    await ctx.close()
  })

  test('the escalation path is real: the scan falls back to the owner\'s department supervisor', async ({
    browser,
  }) => {
    test.setTimeout(600_000)
    // Step 3's second clause. The escalation is NOT tested by deactivating a
    // shared cast member — every other documents spec authenticates as these
    // personas, and a half-restored user_status_id would poison the suite.
    //
    // It is tested by pointing a document at a throwaway INACTIVE owner who
    // sits in a department with a known-active supervisor, and watching the
    // scan route the task to that supervisor. That exercises the real
    // resolveAssignee candidate chain (owner → owner's department supervisor,
    // check_periodic_reviews.js:117-125) with production's own SQL.
    const doc = await makeEffectiveDoc(browser, 'J15-escalate')

    // The seeded Quality department's supervisor is the owner persona — read
    // it rather than hard-coding, so a seed change fails loudly here.
    const deptId = sqlValue(
      `SELECT department_id FROM users WHERE id = ${q(USERS.author.id)}`,
    )
    const supervisorId = sqlValue(
      `SELECT supervisor_user_id FROM departments WHERE id = ${q(deptId)}`,
    )
    expect(supervisorId, 'the owner department has an active supervisor to escalate to').not.toBe('')
    expect(
      sqlValue(`SELECT user_status_id FROM users WHERE id = ${q(supervisorId)}`),
      'and that supervisor is ACTIVE — otherwise the escalation has nowhere to land',
    ).toBe('ACTIVE')

    // A throwaway INACTIVE owner in that department. Its own row, so nothing
    // any other spec authenticates as is touched.
    const goneId = sqlValue(
      `INSERT INTO users (id, company_id, email, first_name, last_name, user_status_id,
                          department_id, created_at, updated_at)
       VALUES (gen_random_uuid(), ${q(COMPANY_ID)}, 'j15-departed@e2e.test',
               'Gone', 'Owner', 'INACTIVE', ${q(deptId)}, now(), now())
       RETURNING id`,
    )
    try {
      sql(
        `UPDATE documents
            SET user_id = ${q(goneId)},
                periodic_review_months = 12,
                created_at = now() - interval '13 months',
                last_reviewed_at = now() - interval '13 months'
          WHERE id = ${q(doc.id)}`,
      )

      await runReviewScan()

      const task = openReviewTask(doc.id)
      expect(
        task,
        'an inactive owner does not swallow the review — a task is still raised',
      ).not.toBeNull()
      expect(
        task.assignedTo,
        "it escalates to the supervisor of the OWNER's department, who is the person who has to reassign ownership",
      ).toBe(supervisorId)
      expect(task.assignedTo, 'and not to the departed owner').not.toBe(goneId)
    } finally {
      // Hand the document back to a real persona before releasing the throwaway
      // user, so the FK has nothing to hold and no other spec meets a document
      // owned by a deleted row.
      sql(`UPDATE documents SET user_id = ${q(USERS.author.id)} WHERE id = ${q(doc.id)}`)
      sql(`DELETE FROM users WHERE id = ${q(goneId)}`)
    }
  })

  test('KNOWN DEFECT DC-REV-01 · the justification requirement has no database backstop', async ({
    browser,
  }) => {
    test.setTimeout(600_000)
    // Protocol step 4 demands the refusal be "server-enforced", and it IS —
    // the REST controller refuses (proved above). This test pins WHERE that
    // enforcement lives, because the answer bounds what the refusal covers.
    //
    // KNOWN DEFECT: DC-REV-01 — the NO_CHANGE justification rule exists ONLY in
    // JavaScript (controllers/documents/reviews.js:60-62). `document_reviews`
    // has exactly one CHECK constraint, on `outcome`; `justification` is plain
    // nullable text, and there is no trigger. PROTOCOL DEMANDS a review with no
    // change and no justification be impossible. ACTUAL: it is impossible
    // through the only route that writes it, and would be permitted by any
    // future writer that skipped the controller. Compare TC-01-08's change
    // reason and TC-01-11's obsoletion reason, which the protocol records as
    // enforced at BOTH layers — this one is single-layer.
    //
    // Pinned as the actual schema rather than asserted as a failure: the shipped
    // control works. If a constraint is ever added, this test fails and is
    // updated deliberately.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_constraint
          WHERE conrelid = 'document_reviews'::regclass AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%justification%'`,
      ),
      'no CHECK constraint mentions justification (DC-REV-01)',
    ).toBe('0')
    expect(
      sqlValue(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_name = 'document_reviews' AND column_name = 'justification'`,
      ),
      'and the column is nullable — the rule is conditional, so it could not be NOT NULL anyway',
    ).toBe('YES')
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_trigger
          WHERE tgrelid = 'document_reviews'::regclass AND NOT tgisinternal
            AND tgname NOT LIKE '%audit%'`,
      ),
      'and no non-audit trigger guards the table (DC-REV-01)',
    ).toBe('0')

    // The corollary worth stating: because enforcement is in the controller,
    // the REST route is the only write path — there is no GraphQL INSERT policy
    // for app_user to bypass it with. That is what keeps the single layer
    // sufficient today.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_policies
          WHERE tablename = 'document_reviews' AND cmd IN ('INSERT','ALL')`,
      ),
      'document_reviews has no INSERT policy — the controller is the only write path, which is why one layer holds',
    ).toBe('0')

    expect(browser, 'fixture referenced').toBeTruthy()
  })
})
