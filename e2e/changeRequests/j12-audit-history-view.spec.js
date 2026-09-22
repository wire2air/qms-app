// PW-J12 · the change request's own audit-history VIEW — OQ-05 TC-05-06
// (URS-CHG-06).
//
// WHY THIS FILE EXISTS. §8 scored URS-CHG-06 "Partial" with exactly this note:
// "Individual entries asserted; the record's history view is never opened for
// completeness." That is accurate. j1 asserts a CLOSE row exists, j2 a CANCEL
// row, j3 a REJECT row — three single-row `SELECT count(*) > 0` probes against
// `audit_logs`. None of them opens the surface an executor actually reads, and
// TC-05-06 step 1 is a COMPLETENESS claim about that surface: "Creation,
// assessment entries, approvals, rejections, links, implementation and closure
// are all recorded." A per-row count can never answer it. This file opens the
// Audit Log dialog on the record, reads what it shows, and asserts the five
// step-level claims of TC-05-06 — including the one the product does not
// currently satisfy, which is pinned rather than fixed.
//
// ── THE PERSONA IS FORCED BY THE PERMISSION MODEL ─────────────────────────
// The trail is its own matrix module. `audit_log_select_rls` gates which rows
// sync at all, and the Audit Log button is `visible: !!canViewAuditTrail`
// where `canViewAuditTrail = isAllowed(['audit_trail:read'])`. In the E2E
// tenant only `auditor` and `roleAdmin` hold that grant (verified against
// authz.role_module_permissions) — the CR's own author does NOT. `auditor`
// also holds change_control:read at tenant scope and nothing else, so it is
// the only persona that can both reach a CR detail page and open its trail.
// A green result here therefore also proves the dialog is reachable by a
// legitimately-granted reader, which is the control TC-05-06 assumes.
//
// ── EVERY TRIGGER-WRITTEN ASSERTION IS A BARRIER, NOT A READ ──────────────
// `change_requests_audit_trigger` does NOT write `audit_logs`. It builds a
// payload and calls `graphile_worker.add_job('audit_event', …)`; the worker
// INSERTs the row. Those rows are therefore ASYNC — every one of them is
// polled for below, never read straight, because a bare read races the queue
// and fails intermittently, which is worse than not testing it.
// Controller-written rows (close, cancel, reject) are synchronous and land
// inside the request's own transaction.
//
// ── TWO ENTITY_TYPE SPELLINGS, AND ONLY ONE REACHES THE DIALOG ────────────
// Trigger rows get `entity_type` from `toPascalCase(table)` →
// 'ChangeRequests' (PLURAL). The controller hardcodes `entityType:
// 'ChangeRequest'` (SINGULAR) for CLOSE, CANCEL and REJECT. AuditLogDialog
// filters `byType.get(log.entityType)` with no canonicalisation, and
// ChangeRequestsPageId.vue registers only the plural — so the singular rows
// cannot reach the view. CLOSE and CANCEL survive it because the
// status-transition trigger writes a plural duplicate; REJECT does not, and
// that is the KNOWN DEFECT pinned on the last test. SQL-side probes here fold
// both spellings through `audit_canonical_entity_type()`, the same function
// migration 20260918020740 seeds the ChangeRequests→ChangeRequest alias for.
import { test, expect } from '@playwright/test'
import { AUTH, ESIGN_PIN, USERS } from '../fixtures/cast.js'
import {
  createCr,
  assignDraftReviewers,
  submitCrForApproval,
  completeReviewerStep,
  completeApproverStep,
  completeImplementationStep,
  closeCr,
  stepIdByName,
  uniqueTitle,
} from '../fixtures/changeRequests.js'
import { findCrByTitle, sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'

// ── local helpers ───────────────────────────────────────────────────────────
// Deliberately NOT added to e2e/fixtures/changeRequests.js: other agents are
// editing that file concurrently, and these are TC-05-06-shaped.

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

// Distinctive enough that finding it in the diff viewer cannot be an accident,
// and free of apostrophes so it survives the psql round trip unquoted.
const REJECT_COMMENT = 'E2E J12 reject — the impact assessment is incomplete.'

/**
 * Purge every CR this file creates.
 *
 * `audit_logs` is NOT touched — the table is immutable at the database
 * (`audit_logs_immutable`, BEFORE UPDATE OR DELETE, unconditional), so a
 * cleanup DELETE would abort the whole purge. The orphaned trail rows are
 * correct behaviour and the point of the last test in this file.
 */
function purgeJ12ChangeRequests() {
  // `signatures_change_request_id_fkey` is ON DELETE RESTRICT (the other three
  // inbound FKs cascade or null), so the Part-11 ledger rows this file's
  // closures mint have to go first or the whole purge aborts. Scoped to this
  // file's own CRs by the title prefix — nothing else's ledger is touched.
  sql(
    `DELETE FROM signatures WHERE change_request_id IN
       (SELECT id FROM change_requests WHERE title LIKE 'E2E CR J12-%')`,
  )
  sql(`DELETE FROM change_requests WHERE title LIKE 'E2E CR J12-%'`)
}

/** All audit actions recorded for one CR, both entity_type spellings folded. */
function auditActions(crId) {
  const out = sql(
    `SELECT DISTINCT action FROM audit_logs
      WHERE audit_canonical_entity_type(entity_type) = 'ChangeRequest'
        AND entity_id = ${quote(crId)}
      ORDER BY action`,
  )
  return out ? out.split('\n').filter(Boolean) : []
}

function auditCount(crId, { action, spelling } = {}) {
  const actionFilter = action ? ` AND action = ${quote(action)}` : ''
  const typeFilter = spelling
    ? `entity_type = ${quote(spelling)}`
    : `audit_canonical_entity_type(entity_type) = 'ChangeRequest'`
  return Number(
    sqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE ${typeFilter} AND entity_id = ${quote(crId)}${actionFilter}`,
    ),
  )
}

/** Poll until the graphile_worker `audit_event` task has written `action`. */
async function waitForAuditAction(crId, action) {
  await expect
    .poll(() => auditCount(crId, { action }), {
      timeout: 45_000,
      intervals: [750],
      message:
        `no '${action}' audit row for change request ${crId} within 45s. Trigger-written ` +
        'rows are enqueued as a graphile_worker `audit_event` job and written by the ' +
        'WORKER, so a persistent zero here means the worker is not draining, not that ' +
        'change_requests_audit_trigger is missing.',
    })
    .toBeGreaterThan(0)
}

/**
 * Open the record's Audit Log dialog as a persona holding audit_trail:read and
 * return the PANEL locator.
 *
 * ⚠ NOT `getByRole('dialog')`, which cost a run. BaseDialog's headless-ui
 * `Dialog` root does carry role="dialog", but it is the `tw:relative
 * tw:z-modal` positioning shell — zero-sized, so Playwright reports it hidden
 * forever while the real panel is plainly on screen. The visible surface is
 * `DialogPanel`, a plain div with no role at all. So the anchor is the
 * DialogTitle heading (which the panel is the nearest sized ancestor of) and
 * the panel is reached from it.
 *
 * The list inside is a ~2.5 MB async chunk (AuditLogDialog lazy-loads
 * AuditLogsList), so the summary line is the readiness barrier rather than the
 * first row: it renders from the dialog itself and states the entry count the
 * live query resolved.
 */
async function openAuditDialog(page, crId) {
  await page.goto(`/change-requests/${crId}`, { waitUntil: 'domcontentloaded' })
  const button = page.getByRole('button', { name: 'Audit Log', exact: true }).first()
  await expect(button, 'audit_trail:read renders the Audit Log action').toBeVisible({
    timeout: 45_000,
  })
  await button.click()
  const heading = page.getByRole('heading', { name: /^Audit Log —/ }).first()
  await expect(heading, 'the Audit Log dialog opened on this record').toBeVisible({
    timeout: 20_000,
  })
  const dialog = heading.locator('xpath=ancestor::div[contains(@class,"tw:max-h-[90vh]")][1]')
  await expect(
    dialog.getByText(/Showing \d+ entries/),
    'the trail resolved — this line is absent while the async list chunk loads',
  ).toBeVisible({ timeout: 45_000 })
  return dialog
}

/** Drive a CR from nothing to CLOSED, returning its row. Per-test, by design. */
async function closedCr(browser, tag) {
  const ownerCtx = await browser.newContext({ storageState: AUTH.author })
  const ownerPage = await ownerCtx.newPage()
  const title = uniqueTitle(tag)
  await createCr(ownerPage, title)
  const cr = findCrByTitle(title)
  await assignDraftReviewers(ownerPage, cr.id)
  await submitCrForApproval(ownerPage, cr.id)

  await completeReviewerStep(browser, cr.id)
  await completeApproverStep(browser, cr.id)
  // Retried, unlike j1's straight call. `completeImplementationStep` reloads
  // the page and clicks Mark Complete, and under the load of a concurrent
  // suite the step card can still be hydrating when the click budget runs out
  // — the button is simply not in the DOM yet. A second pass reloads a page
  // that has had another 20s of sync behind it. Idempotent: if the first pass
  // did land, the barrier below is already satisfied and the retry is skipped.
  await expect(async () => {
    const done = Number(
      sqlValue(
        `SELECT count(*) FROM change_requests
          WHERE id = ${quote(cr.id)} AND approved_at IS NOT NULL`,
      ),
    )
    if (done > 0) return
    await completeImplementationStep(ownerPage, cr.id)
    await expect
      .poll(
        () =>
          Number(
            sqlValue(
              `SELECT count(*) FROM change_requests
                WHERE id = ${quote(cr.id)} AND approved_at IS NOT NULL`,
            ),
          ),
        { timeout: 45_000, intervals: [1_000] },
      )
      .toBeGreaterThan(0)
  }).toPass({ timeout: 150_000, intervals: [1_000] })
  await waitForSqlValue(
    `SELECT count(*) FROM change_requests
      WHERE id = ${quote(cr.id)} AND status_id = 'OPEN' AND approved_at IS NOT NULL`,
    { timeoutMs: 60_000, label: 'workflow finished, CR still OPEN' },
  )

  await ownerPage.goto(`/change-requests/${cr.id}`)
  await closeCr(ownerPage, { comments: 'E2E J12 close — implemented and verified.' })
  await waitForSqlValue(
    `SELECT count(*) FROM change_requests WHERE id = ${quote(cr.id)} AND status_id = 'CLOSED'`,
    { timeoutMs: 45_000, label: 'CR CLOSED' },
  )
  await ownerCtx.close()
  return { ...cr, title }
}

test.describe('PW-J12 · the record’s audit history view (TC-05-06)', () => {
  test.beforeAll(() => purgeJ12ChangeRequests())
  test.afterAll(() => purgeJ12ChangeRequests())

  test('TC-05-06 steps 1 & 4 · the history view opens on the record and every entry carries a timestamp', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J12-history')
    await createCr(ownerPage, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(ownerPage, cr.id)
    await submitCrForApproval(ownerPage, cr.id)
    await ownerCtx.close()

    // Creation and the submit transition are the two trigger-written rows the
    // lifecycle has produced so far. `transitions` mode maps OPEN →
    // SUBMIT_FOR_REVIEW (worker/services/audit/registry/modules/changeRequests.js).
    await waitForAuditAction(cr.id, 'CREATE')
    await waitForAuditAction(cr.id, 'SUBMIT_FOR_REVIEW')

    // Step 4 — every entry carries a performer AND a timestamp. Asserted as an
    // absence of counter-examples across the WHOLE trail, which is the only
    // form a claim about "every entry" can take; a positive probe on one row
    // proves nothing about the rest.
    //
    // Attribution survives the ASYNC trigger path: the trigger reads the
    // request's `app.current_user_id` GUC into the queued payload before the
    // session ends and the worker copies it onto the row, so `performed_by` is
    // populated on trigger-written rows too — not only on the
    // controller-written ones. Worth pinning, because if the GUC ever stopped
    // propagating the entries would still appear, just anonymous, and the list
    // would silently render them as "System".
    //
    // DELETE is excluded, and the exclusion is this SUITE's fault rather than
    // the product's: the file's own purge runs as raw psql with no
    // `app.current_user_id` set, so it mints exactly the anonymous DELETE rows
    // this assertion would otherwise trip on. No user-driven path produces one
    // — a soft delete through the app is an UPDATE of `deleted_at`.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE audit_canonical_entity_type(entity_type) = 'ChangeRequest'
              AND entity_id = ${quote(cr.id)} AND action <> 'DELETE'
              AND (performed_at IS NULL OR created_at IS NULL OR performed_by IS NULL)`,
        ),
      ),
      'no audit entry for this CR is missing its performer or its timestamp',
    ).toBe(0)

    // The view itself. `auditor` is the persona — see the header.
    const auditorCtx = await browser.newContext({ storageState: AUTH.auditor })
    const auditorPage = await auditorCtx.newPage()
    const dialog = await openAuditDialog(auditorPage, cr.id)

    // Completeness as the executor reads it: the dialog is titled on the
    // record, and the creation + submission entries are both on screen.
    await expect(
      dialog.getByText('CREATE', { exact: true }).first(),
      'the creation entry appears in the record’s own history view ' +
        '(AuditLogActionBadge prints the raw action, underscores replaced by spaces)',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      dialog.getByText('SUBMIT FOR REVIEW', { exact: false }).first(),
      'the submission entry appears alongside it',
    ).toBeVisible({ timeout: 30_000 })

    // Step 4 on the surface: each row prints "by <performer> · <datetime>".
    await expect(
      dialog.getByText(/by .+ · .+\d/).first(),
      'entries render a performer and a timestamp',
    ).toBeVisible({ timeout: 30_000 })

    await auditorCtx.close()
  })

  test('TC-05-06 step 2 · an update entry shows old and new values', async ({ browser }) => {
    test.setTimeout(200_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J12-diff')
    await createCr(ownerPage, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(ownerPage, cr.id)
    await submitCrForApproval(ownerPage, cr.id)
    await ownerCtx.close()

    await waitForAuditAction(cr.id, 'SUBMIT_FOR_REVIEW')

    // The transition row is the update entry TC-05-06 step 2 asks about: it is
    // the product of an UPDATE, and `buildAuditValues` fills BOTH sides from
    // `getChangedFields`. Postgres renders jsonb with a space after the colon,
    // so this is parsed rather than string-matched.
    const oldJson = JSON.parse(
      sqlValue(
        `SELECT coalesce(old_value_json::text, 'null') FROM audit_logs
          WHERE audit_canonical_entity_type(entity_type) = 'ChangeRequest'
            AND entity_id = ${quote(cr.id)} AND action = 'SUBMIT_FOR_REVIEW'
          ORDER BY performed_at DESC LIMIT 1`,
      ),
    )
    const newJson = JSON.parse(
      sqlValue(
        `SELECT coalesce(new_value_json::text, 'null') FROM audit_logs
          WHERE audit_canonical_entity_type(entity_type) = 'ChangeRequest'
            AND entity_id = ${quote(cr.id)} AND action = 'SUBMIT_FOR_REVIEW'
          ORDER BY performed_at DESC LIMIT 1`,
      ),
    )
    expect(oldJson?.statusId, 'the update entry carries the value before the change').toBe('DRAFT')
    expect(newJson?.statusId, 'and the value after it').toBe('OPEN')

    // The surface: expanding the row reveals the diff (AuditLogsItem renders
    // AuditLogsDiffViewer only when expanded, and only when a diff exists).
    const auditorCtx = await browser.newContext({ storageState: AUTH.auditor })
    const auditorPage = await auditorCtx.newPage()
    const dialog = await openAuditDialog(auditorPage, cr.id)

    const submitRow = dialog
      .getByText('SUBMIT FOR REVIEW', { exact: false })
      .first()
      .locator('xpath=ancestor::*[@aria-expanded][1]')
    await expect(
      submitRow,
      'the update entry is expandable, which is how the diff is offered',
    ).toHaveAttribute('aria-expanded', 'false', { timeout: 30_000 })
    await submitRow.click()
    await expect(submitRow).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 })

    // The expanded body holds BOTH sides. Matched case-insensitively against
    // the whole panel rather than as an exact string: AuditValueCell routes a
    // value through ENTITY_LABEL_RESOLVERS when the field has a refModel, so
    // 'OPEN' may render as 'Open'. Which of the two it picks is not the claim
    // under test — that old AND new are both shown is.
    const expandedBody = submitRow.locator('xpath=following-sibling::div[1]')
    await expect(
      expandedBody,
      'the expanded entry shows the value BEFORE the change',
    ).toContainText(/draft/i, { timeout: 20_000 })
    await expect(expandedBody, 'and the value after it').toContainText(/open/i)

    await auditorCtx.close()
  })

  test('TC-05-06 step 5 · no audit entry can be edited or deleted, by anyone', async ({
    browser,
  }) => {
    test.setTimeout(120_000)

    // Arranges its OWN victim row. A Playwright worker is discarded after a
    // failing test and the file's pending afterAll runs, so a test that
    // borrowed "the newest CR audit row" from an earlier test would fail for
    // the wrong reason the moment anything upstream broke. Creating a draft is
    // the cheapest CR audit row there is.
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const title = uniqueTitle('J12-immutable')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    await ctx.close()
    await waitForAuditAction(cr.id, 'CREATE')

    // Not the interface's absence of a button — the protocol's own note says
    // that is "not the whole of the evidence". `audit_logs_immutable` is an
    // UNCONDITIONAL BEFORE UPDATE OR DELETE trigger, so it fires for the
    // superuser connection Sequelize uses as readily as for `app_user`. The
    // statements below run as the DB superuser, the strongest caller in the
    // system, inside an explicit transaction that is rolled back regardless.
    const victim = sqlValue(
      `SELECT id FROM audit_logs
        WHERE audit_canonical_entity_type(entity_type) = 'ChangeRequest'
          AND entity_id = ${quote(cr.id)}
        ORDER BY created_at DESC LIMIT 1`,
    )
    // sqlValue returns '' (not null) for no rows — check for both.
    expect(victim, 'this test’s own CR audit row exists to attempt the mutation against').toBeTruthy()

    // Scoped to THIS CR. A global `count(*) FROM audit_logs` is not a
    // measurement in this environment: other suites run concurrently and the
    // graphile_worker drains continuously, so the number moves between the two
    // reads and the assertion fails on other people's writes. Cost a run.
    const scopedCount = () =>
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE audit_canonical_entity_type(entity_type) = 'ChangeRequest'
              AND entity_id = ${quote(cr.id)}`,
        ),
      )
    const before = scopedCount()

    for (const [what, stmt] of [
      ['UPDATE', `UPDATE audit_logs SET action = 'TAMPERED' WHERE id = ${quote(victim)}`],
      ['DELETE', `DELETE FROM audit_logs WHERE id = ${quote(victim)}`],
    ]) {
      let error = ''
      try {
        sql(`BEGIN; ${stmt}; ROLLBACK;`)
      } catch (err) {
        error = `${err.stderr ?? err.message ?? ''}`
      }
      expect(
        error,
        `${what} on audit_logs must be refused by the database, not merely hidden in the UI`,
      ).toMatch(/audit_logs rows are immutable/)
    }

    expect(
      scopedCount(),
      'the refused statements left this record’s trail exactly as it was',
    ).toBe(before)

    // The interface half of step 5: the dialog offers Refresh and (with the
    // separate audit_trail:export grant) Export CSV — and nothing else. There
    // is no edit or delete affordance to find. Proven structurally above; the
    // read-only dialog is asserted in the first test of this file.
  })

  test('TC-05-06 step 1 · a closed change request’s history view holds creation, submission, approval and closure', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const cr = await closedCr(browser, 'J12-closed')

    await waitForAuditAction(cr.id, 'CREATE')
    await waitForAuditAction(cr.id, 'SUBMIT_FOR_REVIEW')
    await waitForAuditAction(cr.id, 'CLOSE')

    const actions = auditActions(cr.id)
    expect(actions, 'creation is recorded').toContain('CREATE')
    expect(actions, 'the submission that starts the approval cycle is recorded').toContain(
      'SUBMIT_FOR_REVIEW',
    )
    expect(actions, 'closure is recorded').toContain('CLOSE')

    // CLOSE is written TWICE, by two different paths. The trigger's
    // `transitions` actionMap maps the new status CLOSED → CLOSE (plural
    // entity_type); the controller writes its own CLOSE carrying the e-sign
    // manifest (singular). Both are real, both are attributed, and the pair is
    // pinned so a future de-duplication is a deliberate change rather than a
    // silent one.
    expect(
      auditCount(cr.id, { action: 'CLOSE', spelling: 'ChangeRequests' }),
      'the status-transition trigger writes a CLOSE row under the plural entity_type',
    ).toBeGreaterThan(0)
    expect(
      auditCount(cr.id, { action: 'CLOSE', spelling: 'ChangeRequest' }),
      'and the close controller writes its own under the singular one',
    ).toBeGreaterThan(0)
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE entity_type = 'ChangeRequest' AND entity_id = ${quote(cr.id)}
              AND action = 'CLOSE' AND performed_by = ${quote(USERS.author.id)}`,
        ),
      ),
      'the controller-written CLOSE row names the signer',
    ).toBeGreaterThan(0)

    // Approval is recorded against the STEP, not the record: approving the
    // second workflow step never changes `change_requests.status_id` (the CR
    // stays OPEN), so the record-level `transitions` trigger has nothing to
    // fire on. `auditIncludeEntities` includes WorkflowInstanceSteps precisely
    // so the approval still reaches the record's history view.
    const approvalRows = Number(
      sqlValue(
        `SELECT count(*) FROM audit_logs a
          WHERE a.entity_id IN (
                  SELECT wis.id FROM workflow_instance_steps wis
                    JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
                   WHERE wi.resource_type = 'ChangeRequest' AND wi.resource_id = ${quote(cr.id)})
            AND a.performed_by IS NOT NULL`,
      ),
    )
    expect(
      approvalRows,
      'the workflow steps this CR ran carry their own attributed audit rows, which the ' +
        'record’s history view pulls in via auditIncludeEntities',
    ).toBeGreaterThan(0)

    // The view itself.
    const auditorCtx = await browser.newContext({ storageState: AUTH.auditor })
    const auditorPage = await auditorCtx.newPage()
    const dialog = await openAuditDialog(auditorPage, cr.id)

    await expect(
      dialog.getByText('CREATE', { exact: true }).first(),
      'creation appears in the record’s own history view',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      dialog.getByText('SUBMIT FOR REVIEW', { exact: false }).first(),
      'the submission appears in it',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      dialog.getByText('CLOSE', { exact: true }).first(),
      'and so does the closure — the trigger’s plural CLOSE row is the one that matches ' +
        'the dialog’s entity_type filter',
    ).toBeVisible({ timeout: 30_000 })

    // Completeness, as a number: the dialog states how many entries it
    // resolved, and a closed CR's trail is never a one-liner.
    const summary = await dialog.getByText(/Showing \d+ entries/).first().innerText()
    const shown = Number(summary.match(/Showing (\d+) entries/)[1])
    expect(
      shown,
      'the history view shows the whole lifecycle, not a single entry — creation, ' +
        'submission, the workflow steps and closure',
    ).toBeGreaterThanOrEqual(4)

    await auditorCtx.close()
  })

  test('TC-05-06 step 3 · a rejection is recorded with its comment — but only the step-level row reaches the view', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J12-reject')
    await createCr(ownerPage, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(ownerPage, cr.id)
    await submitCrForApproval(ownerPage, cr.id)
    await ownerCtx.close()

    await completeReviewerStep(browser, cr.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'ChangeRequest' AND entity_id = ${quote(cr.id)}
          AND assigned_to = ${quote(USERS.approver.id)} AND status_id = 'ASSIGNED'`,
      { timeoutMs: 60_000, label: 'approver holds the approval task' },
    )

    // Driven over REST rather than through j3's step-menu dance: this file is
    // about the TRAIL, and j3 already owns the UI path for the rejection
    // itself. The e-sign credentials are mandatory — the Change Approval step
    // requires a signature, and F-16 made rejecting it signed too.
    const stepId = stepIdByName(cr.id, 'Change Approval')
    expect(stepId, 'the approval step resolved').toBeTruthy()

    const approverCtx = await browser.newContext({ storageState: AUTH.approver })
    const res = await approverCtx.request.post(
      `/api/v1/services/changeRequests/${cr.id}/rejectStepTask`,
      {
        data: {
          workflowInstanceStepId: stepId,
          comment: REJECT_COMMENT,
          method: 'PIN',
          token: ESIGN_PIN,
          provider: null,
        },
      },
    )
    expect(res.ok(), await res.text()).toBeTruthy()
    await approverCtx.close()

    await waitForSqlValue(
      `SELECT count(*) FROM change_requests WHERE id = ${quote(cr.id)} AND status_id = 'DRAFT'`,
      { timeoutMs: 45_000, label: 'the rejection reverted the CR to DRAFT' },
    )

    // The rejection IS recorded, with its comment, and attributed — twice: a
    // STEP_REJECTED row on the workflow step and a REJECT row on the record.
    // Both carry `newValueJson.reason` (workflowStepActionsService.js builds
    // one `auditPayload` and writes it to both). jsonb is PARSED, never
    // string-matched: Postgres renders it with a space after the colon.
    //
    // ⚠ TWO rows share the action STEP_REJECTED on this step: the workflows
    // audit registry ALSO maps the step's statusId → REJECTED to
    // STEP_REJECTED, and that trigger-written twin carries
    // {statusId, completedAt} and no reason. Ordering by performed_at picks
    // the twin about half the time, so the row is selected by the presence of
    // the key instead — `new_value_json ? 'reason'` is the jsonb
    // key-existence operator.
    const stepReason = JSON.parse(
      sqlValue(
        `SELECT coalesce(new_value_json::text, 'null') FROM audit_logs
          WHERE entity_type = 'WorkflowInstanceSteps' AND entity_id = ${quote(stepId)}
            AND action = 'STEP_REJECTED' AND new_value_json ? 'reason'
          ORDER BY performed_at DESC LIMIT 1`,
      ),
    )
    expect(stepReason?.reason, 'the step-level rejection row carries the comment').toBe(
      REJECT_COMMENT,
    )
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE entity_type = 'WorkflowInstanceSteps' AND entity_id = ${quote(stepId)}
              AND action = 'STEP_REJECTED' AND new_value_json ? 'reason'
              AND performed_by = ${quote(USERS.approver.id)}`,
        ),
      ),
      'and names the approver who rejected',
    ).toBeGreaterThan(0)

    const recordReason = JSON.parse(
      sqlValue(
        `SELECT coalesce(new_value_json::text, 'null') FROM audit_logs
          WHERE entity_type = 'ChangeRequest' AND entity_id = ${quote(cr.id)}
            AND action = 'REJECT' ORDER BY performed_at DESC LIMIT 1`,
      ),
    )
    expect(recordReason?.reason, 'the record-level REJECT row carries the same comment').toBe(
      REJECT_COMMENT,
    )

    // ── KNOWN DEFECT (pinned, not fixed) ────────────────────────────────────
    // That record-level REJECT row cannot reach the record's own history view.
    //
    // `ChangeRequestsPageId.vue` builds `auditIncludeEntities` as
    //   [{ entityType: 'ChangeRequests', entityIds: [id] }, …]
    // and `AuditLogDialog` filters with a strict `byType.get(log.entityType)`
    // lookup — client-side, no canonicalisation. The controller writes REJECT
    // (and CANCEL) with `entityType: 'ChangeRequest'` (SINGULAR), which never
    // matches the plural key.
    //
    // For CLOSE this is invisible, because the status-transition trigger
    // writes a PLURAL duplicate. For REJECT there is no duplicate to save it:
    // the reject path moves the CR OPEN → DRAFT, and the registry's actionMap
    // maps DRAFT → 'DRAFT', not 'REJECT'. So the only entry the dialog can
    // show for a rejection is the STEP_REJECTED row on the workflow step —
    // which does carry the comment, so TC-05-06 step 3 is satisfiable, but the
    // record-level entry an executor would look for is simply absent.
    // CANCEL on a DRAFT CR is worse: there is no trigger duplicate there
    // either (DRAFT → CANCELLED does fire, so CANCEL is written plural too —
    // but a CANCEL from OPEN likewise fires; the exposure is REJECT alone).
    //
    // `CustomerComplaintsPageId.vue` already lists BOTH spellings in its own
    // `auditIncludeEntities`, so the one-line fix is known and applied
    // elsewhere — just not on CR (nor CAPA nor NC, which share the shape).
    // j3-reject-sendback.spec.js calls the two spellings "a real (harmless)
    // casing inconsistency"; harmless in SQL, where
    // `audit_canonical_entity_type()` folds them, and not harmless here.
    expect(
      auditCount(cr.id, { action: 'REJECT', spelling: 'ChangeRequests' }),
      'KNOWN DEFECT: nothing writes a REJECT row under the plural entity_type the ' +
        'dialog filters on, so the record-level rejection entry never reaches the view',
    ).toBe(0)

    // On the surface: the trail opens, the step rejection is in it with its
    // comment, and no record-level Reject entry appears.
    const auditorCtx = await browser.newContext({ storageState: AUTH.auditor })
    const auditorPage = await auditorCtx.newPage()
    const dialog = await openAuditDialog(auditorPage, cr.id)

    await expect(
      dialog.getByText('STEP REJECTED', { exact: false }).first(),
      'the step-level rejection reaches the record’s history view',
    ).toBeVisible({ timeout: 30_000 })

    // The comment lives in the diff, which only renders once the row expands.
    //
    // ⚠ EVERY STEP_REJECTED badge has to be expanded, not just the first. The
    // step carries TWO of them (see the SQL note above) and the newer one is
    // the registry's status-transition twin, which holds {statusId,
    // completedAt} and no reason. Expanding only `.first()` opens the twin,
    // finds no comment, and reads as "the product does not record it" — which
    // is the opposite of the truth. Cost a run.
    const rejectBadges = dialog.getByText('STEP REJECTED', { exact: false })
    const badgeCount = await rejectBadges.count()
    for (let i = 0; i < badgeCount; i++) {
      const row = rejectBadges.nth(i).locator('xpath=ancestor::*[@aria-expanded][1]')
      if ((await row.getAttribute('aria-expanded')) === 'false') await row.click()
    }
    await expect(
      dialog.getByText(REJECT_COMMENT, { exact: false }).first(),
      'TC-05-06 step 3 — the rejection is recorded WITH its comment, readable in the view',
    ).toBeVisible({ timeout: 30_000 })

    await auditorCtx.close()
  })

  // ── NOT COVERED HERE, AND WHY ───────────────────────────────────────────
  //
  // TC-05-06 step 1 also lists "assessment entries". They are not in the
  // trail and cannot be asserted into it: the module registers
  // `mode: 'transitions'` on `transitionField: 'statusId'`, and
  // `hasRelevantChanges` returns false for any UPDATE that does not touch
  // that one field. Editing Reason for Change, Business Justification,
  // Classification, Change Nature, Duration, Regulatory Impact or Customer
  // Notification Required on a DRAFT therefore writes NO audit_logs row at
  // all — not a thin one, none. Reported as a defect rather than pinned with
  // an assertion, because a test asserting the absence would harden it.
})
