// PW-J16 · URS-NCR-10 / OQ-03 TC-03-10 step 1 — an NC's OWN history dialog must
// show every entry recorded against the record.
//
// ⚠️  THE CORE TEST IS EXPECTED TO FAIL ON `develop` TODAY (defect D9, NC arm).
//
// Same deliberate departure as `capas/j12-audit-history-completeness.spec.js`,
// for the same reason: this suite's usual convention (e2e/README.md, IL-D1) pins
// an open defect AS IT BEHAVES so the suite stays green. That is wrong here. A
// green test asserting "the NC history dialog may omit entries" would be
// evidence FOR the defect, and TC-03-10 — whose step 1 lists *every workflow
// action* among the things that must be present — would then trace to a test
// that certifies the opposite of the requirement.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS, AND WHY `auditLogs/a5-record-history.spec.js` WAS NOT
// ENOUGH.
//
// §6 scored URS-NCR-10 *Partial* against `a5`. `a5` is a fine test of the
// AFFORDANCE — who is offered the History button, who is not, and that the rows
// underneath are append-only at both the privilege layer and the trigger. It
// asserts `auditRows(dialog).first()` is VISIBLE. It never asserts HOW MANY.
//
// Completeness is the half TC-03-10 step 1 actually asks about, and it is the
// half D9 breaks. So this file counts.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DEFECT (D9, NC ARM), MEASURED RATHER THAN INFERRED.
//
// An NC's audit rows are written by TWO paths that spell the entity type
// differently. This is not a guess; each half was read at its source:
//
//   · THE DB TRIGGER. `nonconformances` carries `nonconformances_audit_trigger`
//     → `audit_trigger()`, which enqueues a graphile job whose payload carries
//     `TG_TABLE_NAME`. The worker's `handleDefault`
//     (backend/worker/services/audit/defaultHandler.js:71) stamps
//     `entityType: toPascalCase(table)` — and `toPascalCase('nonconformances')`
//     is the PascalCase PLURAL, **'Nonconformances'**.
//
//   · THE CONTROLLERS. `NC_MODULE_CONFIG`
//     (backend/api/controllers/nonconformances.js:35) declares
//     `entityType: 'Nonconformance'` — the SINGULAR — and every hand-written
//     `db.AuditLog.create` in that controller and in the shared
//     `workflowStepActionsService` uses it.
//
// Both spellings are legitimate and the PLATFORM knows about them:
// `audit_entity_type_aliases` carries the mapping and `audit_log_select_rls`
// UNIONs canonical ids with their aliases, so RLS resolves both to one module.
// The full `/audit-logs` page is fine too — `AuditLogsItem` singularises for
// display.
//
// THE PER-RECORD DIALOG IS WHERE IT BREAKS. `AuditLogDialog.vue:88` filters
// IN MEMORY on an EXACT string match:
//
//     filtered = filtered.filter((log) => byType.get(log.entityType)?.has(log.entityId))
//
// and `NonconformancesPageId.vue:400` hands it ONE block for the record:
//
//     { entityType: 'Nonconformances', entityIds: [props.id] }
//
// No 'Nonconformance' block. So every singular-spelled row is filtered out of
// the record's own history before it is ever rendered.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHICH NC ROWS ARE ACTUALLY LOST — and why REJECT is the probe.
//
// Most lifecycle actions are written TWICE: the controller's singular row AND a
// trigger row for the same UPDATE. Those survive the plural-only filter, because
// the plural copy is still there. Choosing one of them as the probe is the
// mistake `capas/j12` made in its first draft, and it would make this file pass
// against the live defect.
//
// The rows that can NEVER have a plural twin are the ones whose ACTION is not in
// the trigger's vocabulary at all. For `nonconformances` that vocabulary is
// fixed by the registry's `actionMap`
// (backend/worker/services/audit/registry/modules/nonconformances.js):
//
//     statusId → OPEN/UNDER_REVIEW: UNDER_REVIEW · CLOSED: CLOSE
//                CANCELLED: CANCEL · APPROVED: APPROVE · REJECTED: REJECT
//
// plus the generic CREATE / UPDATE / DELETE. Two of those five status keys are
// DEAD LETTERS after the unified-status migration: `nc_statuses` holds exactly
// DRAFT / OPEN / CLOSED / CANCELLED (measured), so `APPROVED` and `REJECTED` are
// not reachable NC statuses and the trigger can never emit APPROVE or REJECT for
// this table.
//
// Meanwhile the controller's vocabulary DOES carry both:
//   · REJECT    — `workflowStepActionsService.js:372` writes
//                 `{ entityType, entityId: resourceId, action: AUDIT_ACTIONS.REJECT }`
//                 with `entityType` coming from NC_MODULE_CONFIG, i.e. singular.
//   · COMPLETE  — `controllers/nonconformances.js:645`, written by markNcComplete
//                 at close, singular. The trigger writes CLOSE for that same
//                 UPDATE, which is a DIFFERENT action word, so the COMPLETE row
//                 has no plural twin either.
//
// Verified against the live database before this file was written:
//
//     SELECT count(*) FROM audit_logs
//      WHERE entity_type = 'Nonconformances' AND action IN ('REJECT','COMPLETE');
//     → 0
//
// Zero rows, database-wide. No plural REJECT or COMPLETE row can exist, so a
// plural-only filter can never surface one. That is why the arrange below drives
// a REJECTION rather than something cheaper.
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW BAD IS IT, HONESTLY — state this accurately or the protocol note built on
// it overstates the case.
//
// Minor, and it is an UNDERCOUNT rather than a hidden action. The rejection IS
// visible to a reviewer: the same page passes `WorkflowInstances` and
// `WorkflowInstanceSteps` blocks, and the rejection writes
// `WorkflowInstanceSteps STEP_REJECTED` alongside the NC-scoped `REJECT`, with
// the same `{ reason, stepName, stepNumber }` payload. So the fact and its
// reason both reach the reader through the workflow rows.
//
// What is actually wrong: a tamper-evident log's own record view undercounts.
// For an inspection response you would have to take the history from the
// system-wide Audit Logs page instead, and that caveat belongs in the executed
// protocol. Worth fixing, worth a defect report — NOT worth telling a validation
// executor that the NC audit trail hides rejections. It does not.
//
// THE FIX is one line per consumer, and two pages in this codebase ALREADY DO
// IT — which is what makes this an inconsistency rather than a design question:
//
//     CustomerComplaintsPageId.vue:141-142
//       { entityType: 'CustomerComplaint',  entityIds: [props.id] },
//       { entityType: 'CustomerComplaints', entityIds: [props.id] },
//
// `QaComplaintsPageId.vue` does the same for Complaint/Complaints.
//
// SAME DEFECT, SECOND SURFACE — the PRINTED record (OQ-16 TC-16-08 step 5).
// `NonconformancePrint.vue:219` builds its `auditEntities` the same way:
//     if (nc.value?.id) out.push({ entityType: 'Nonconformances', entityId: nc.value.id })
// so the printed copy of an NC undercounts identically. Pinned below at the
// source level rather than by driving the print view, because the print module
// reads the SAME dialog data through the same exact-match filter — a second UI
// walk would re-measure one defect twice and cost three minutes doing it.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { signWithPin } from '../fixtures/esign.js'
import { clickWhenReady } from '../fixtures/documents.js'
import { raiseNc, completeReviewerStep, uniqueTitle } from '../fixtures/nonconformances.js'
import { findNcByTitle, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  TRAIL_SYNC_TIMEOUT,
  auditLogMenuItem,
  auditRows,
  revealRecordActions,
} from '../fixtures/auditLogs.js'

/** Rows the DB TRIGGER wrote for this NC (table-derived PascalCase plural). */
function triggerRows(ncId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Nonconformances' AND entity_id = '${ncId}'`,
    ),
  )
}

/** Rows the CONTROLLERS wrote for this NC (NC_MODULE_CONFIG's singular). */
function controllerRows(ncId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Nonconformance' AND entity_id = '${ncId}'`,
    ),
  )
}

/**
 * Drive a fresh NC to a REJECTED approval step — the action that actually
 * exposes the defect (see the header: REJECT is singular-only by construction).
 *
 * The rejection flow is lifted verbatim from `j2-reviewer-workflow.spec.js`,
 * gotchas included. Do not "simplify" any of the three:
 *   · `BaseMenu` hard-codes `aria-label="More actions"` on EVERY trigger, so the
 *     record header's menu and the step card's are indistinguishable by
 *     role+name. Anchor on the STEP's own Approve button and take the next
 *     More-actions trigger in document order.
 *   · the approval step sits low in a 1280x720 viewport and the menu opens
 *     downward without flipping, so its items render below the fold and every
 *     click retries "outside of the viewport" until timeout.
 *     `scrollIntoViewIfNeeded` stops as soon as the TRIGGER is visible, which is
 *     exactly where the menu has no room — hence the explicit centre scroll.
 *   · rejecting an e-sign-required APPROVAL step captures a signature (F-16), so
 *     without `signWithPin` the reject 400s with ESIGNATURE_REQUIRED.
 */
async function ncRejectedByApprover(browser, tag) {
  const ownerCtx = await browser.newContext({ storageState: AUTH.author })
  const ownerPage = await ownerCtx.newPage()
  const title = uniqueTitle(tag)
  await raiseNc(ownerPage, title)
  const nc = findNcByTitle(title)
  expect(nc?.id, 'arrange: the NC was raised').toBeTruthy()
  await ownerCtx.close()

  await completeReviewerStep(browser, nc.id)
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}'
        AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
    { timeoutMs: 45_000, label: 'approver task created' },
  )

  const approverCtx = await browser.newContext({ storageState: AUTH.approver })
  const approverPage = await approverCtx.newPage()
  await approverPage.goto(`/nonconformances/${nc.id}`, { waitUntil: 'domcontentloaded' })

  const stepMenu = approverPage
    .getByRole('button', { name: 'Approve', exact: true })
    .first()
    .locator('xpath=following::button[@aria-label="More actions"][1]')
  await stepMenu.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await clickWhenReady(approverPage, stepMenu)
  await approverPage.getByRole('menuitem', { name: 'Reject' }).click()
  await expect(approverPage.getByPlaceholder('Why are you rejecting?')).toBeVisible({
    timeout: 10_000,
  })
  await approverPage
    .getByPlaceholder('Why are you rejecting?')
    .fill('PW-J16 — rejected to produce a controller-only audit row.')
  await approverPage.getByRole('button', { name: 'Confirm' }).click()
  await signWithPin(approverPage)
  await approverCtx.close()

  await waitForSqlValue(
    `SELECT count(*) FROM nonconformances WHERE id = '${nc.id}' AND status_id = 'DRAFT'`,
    { timeoutMs: 45_000, label: 'NC reverted to DRAFT after rejection' },
  )
  return nc
}

test.describe('PW-J16 · an NC record history dialog must show every writer', () => {
  test('control: the REJECT row exists, and exists ONLY under the singular spelling', async ({
    browser,
  }) => {
    // WITHOUT THIS ARM THE CORE TEST PROVES NOTHING. `capas/j12` failed exactly
    // here in its first draft by choosing an action BOTH writers record; the
    // plural-only dialog showed it correctly and the test passed against a live
    // defect. This arm pins the asymmetry the whole file depends on, as measured
    // state rather than as a claim in a comment.
    test.setTimeout(300_000)
    const nc = await ncRejectedByApprover(browser, 'J16-control')

    // Trigger rows arrive via graphile_worker, so they are asynchronous.
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Nonconformances' AND entity_id = '${nc.id}'`,
      { timeoutMs: 90_000, label: 'trigger-written (plural) rows' },
    )
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}' AND action = 'REJECT'`,
      { timeoutMs: 90_000, label: 'controller-written (singular) REJECT row' },
    )

    expect(triggerRows(nc.id), "the trigger wrote rows as 'Nonconformances'").toBeGreaterThan(0)
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE entity_type = 'Nonconformances' AND entity_id = '${nc.id}' AND action = 'REJECT'`,
        ),
      ),
      "and NO plural REJECT row exists for it — the trigger's actionMap can only emit REJECT for a REJECTED status, which `nc_statuses` does not hold",
    ).toBe(0)

    // The premise stated as itself, so a future vocabulary change fails here
    // with a message that names the cause rather than as a bare count diff.
    expect(
      sqlValue(`SELECT count(*) FROM nc_statuses WHERE id IN ('REJECTED','APPROVED')`),
      'the unified status machine has no REJECTED/APPROVED NC status — which is WHY the trigger can never write a plural REJECT',
    ).toBe('0')

    test.info().annotations.push({
      type: 'measured',
      description: `${nc.id}: ${triggerRows(nc.id)} plural (Nonconformances) + ${controllerRows(
        nc.id,
      )} singular (Nonconformance), of which the REJECT is singular-only`,
    })
  })

  test('the dialog shows every entry recorded against the NC — including the REJECT that explains the revert to DRAFT', async ({
    browser,
  }) => {
    // THE CORE ARM (TC-03-10 step 1). A rejected NC's own rows read:
    //     Nonconformances CREATE · Nonconformances UNDER_REVIEW ·
    //     Nonconformance REJECT · Nonconformances DRAFT-ward UPDATE
    // The dialog is handed 'Nonconformances' only, so it shows the creation, the
    // submission and the revert — but not the rejection that caused it.
    test.setTimeout(360_000)
    const nc = await ncRejectedByApprover(browser, 'J16-dialog')

    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}' AND action = 'REJECT'`,
      { timeoutMs: 90_000, label: 'controller-written REJECT row' },
    )
    // Scoped to THIS NC's OWN rows only. The page also passes WorkflowInstances
    // and WorkflowInstanceSteps blocks, whose rows are legitimately in the
    // dialog — counting the dialog's TOTAL and comparing it to the NC's own row
    // count is what made `capas/j12` fail with "Expected 4, Received 10" on a
    // dialog that was behaving correctly for those other blocks.
    const expected = triggerRows(nc.id) + controllerRows(nc.id)
    expect(expected, 'there is a history to count').toBeGreaterThan(0)

    // `auditor` holds audit_trail:read AND ncr:read, and nothing that writes —
    // so opening the history cannot perturb the record it is measuring.
    const readerCtx = await browser.newContext({ storageState: AUTH.auditor })
    try {
      const page = await readerCtx.newPage()
      await page.goto(`/nonconformances/${nc.id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      })
      await expect(page.getByText(nc.ncNumber).first(), 'the record renders').toBeVisible({
        timeout: 60_000,
      })

      await revealRecordActions(page)
      await expect(auditLogMenuItem(page), 'the History affordance is offered').toBeVisible({
        timeout: 20_000,
      })
      await auditLogMenuItem(page).click()

      // Do NOT assert getByRole('dialog') is visible — HeadlessUI puts the role
      // on a zero-box positioning wrapper that always resolves hidden. Usable as
      // a SCOPE, useless as a visibility check. (Same note as ALD-A5.)
      const dialog = page.getByRole('dialog')
      await expect(
        page.getByRole('heading', { name: new RegExp(`Audit Log — ${nc.ncNumber}`) }),
        'the history dialog opened',
      ).toBeVisible({ timeout: 20_000 })

      await expect(auditRows(dialog).first(), 'the record has a history').toBeVisible({
        timeout: TRAIL_SYNC_TIMEOUT,
      })
      // Wait for the trail to reach IndexedDB before counting — the dialog reads
      // from IDB, and the plural rows land there first.
      await expect
        .poll(async () => auditRows(dialog).count(), { timeout: TRAIL_SYNC_TIMEOUT })
        .toBeGreaterThan(0)

      // THE ASSERTION. Filter to this NC's own rows by matching its NUMBER.
      //
      // The NC NUMBER, not the uuid, and unlike CAPA that choice is available
      // here: `ENTITY_LABEL_RESOLVERS.Nonconformance` (src/utils/auditConstants.js
      // :595) resolves an NC row to `e.ncNumber`, so an NC's audit rows print
      // 'NC-nnn' where a CAPA's print a raw uuid. (That CAPA-side readability
      // gap is `capas/j12`'s separate observation, not this one.)
      //
      // It also makes the filter exact. The other blocks resolve to labels that
      // cannot contain an NC number: `WorkflowInstance` → the workflow's name,
      // `WorkflowInstanceStep` → "Step N". Filtering on the ACTION word would
      // NOT be safe — a rejected NC's workflow rows carry
      // `WorkflowInstances REJECT` and `WorkflowInstanceSteps STEP_REJECTED`, so
      // a `hasText: 'REJECT'` filter would match those and pass while the NC's
      // own REJECT stayed hidden.
      const ownRows = dialog
        .getByRole('button', { name: /^(Expand|Collapse) change details$/ })
        .filter({ hasText: nc.ncNumber })

      await expect
        .poll(async () => ownRows.count(), {
          timeout: TRAIL_SYNC_TIMEOUT,
          message: `KNOWN DEFECT D9 (NC arm): the dialog must show all ${expected} rows recorded against this NC (${triggerRows(
            nc.id,
          )} trigger-written 'Nonconformances' + ${controllerRows(
            nc.id,
          )} controller-written 'Nonconformance'). Fewer means a singular-spelled row was filtered out client-side by NonconformancesPageId.vue:400's plural-only block. The omitted row is a duplicate of an action that IS otherwise visible via the WorkflowInstanceSteps rows, so this is an UNDERCOUNT, not a hidden action — read the severity note at the top of this file before reporting it.`,
        })
        .toBe(expected)
    } finally {
      await readerCtx.close()
    }
  })

  test('KNOWN DEFECT D9 · the same plural-only block is in the PRINTED record (OQ-16 TC-16-08 step 5)', async () => {
    // Pinned at the DATA level rather than by driving `/print`, deliberately.
    // `NonconformancePrint.vue:219` pushes the identical
    // `{ entityType: 'Nonconformances', entityId }` block into the same
    // exact-match filter the dialog uses, so walking the print view would
    // re-measure ONE defect a second time and spend three minutes doing it. What
    // IS worth asserting separately is the thing that makes the print arm real:
    // that rows exist under the singular spelling which NO plural-only consumer
    // can ever reach — for THIS module, database-wide, not just for one record.
    const singularOnly = Number(
      sqlValue(
        `SELECT count(*) FROM audit_logs
          WHERE entity_type = 'Nonconformance' AND action IN ('REJECT','COMPLETE')`,
      ),
    )
    const pluralTwins = Number(
      sqlValue(
        `SELECT count(*) FROM audit_logs
          WHERE entity_type = 'Nonconformances' AND action IN ('REJECT','COMPLETE')`,
      ),
    )

    expect(
      singularOnly,
      'at least one NC REJECT/COMPLETE row exists — the earlier arms wrote one',
    ).toBeGreaterThan(0)
    expect(
      pluralTwins,
      `KNOWN DEFECT D9: ${singularOnly} NC rows carry REJECT/COMPLETE under the SINGULAR spelling and ${pluralTwins} carry it under the plural — every plural-only consumer (the record dialog AND NonconformancePrint.vue:219) filters all of them out`,
    ).toBe(0)

    // The pair that stops this reading as "the platform does not know about the
    // two spellings". It does — the alias table exists and RLS UNIONs through
    // it, which is precisely why the full /audit-logs page is unaffected and
    // only the two client-side exact-match filters are.
    expect(
      sqlValue(
        `SELECT count(*) FROM information_schema.tables WHERE table_name = 'audit_entity_type_aliases'`,
      ),
      'the platform carries an alias table — the vocabulary works; what is broken is a client-side filter',
    ).toBe('1')
  })
})
