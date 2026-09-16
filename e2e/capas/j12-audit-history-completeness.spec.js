// PW-J12 · A record's own audit history must be COMPLETE — OQ-04 TC-04-10
// step 1, and OQ-16 TC-16-05 / TC-16-08 step 5 by the same mechanism.
//
// ⚠️  THE SECOND TEST IS EXPECTED TO FAIL ON `develop` TODAY (D9).
//
// Same deliberate departure as TRN-J10/J11: it asserts what the protocol
// requires, not what the product does. This suite's usual convention
// (e2e/README.md, IL-D1) pins an open defect AS IT BEHAVES so the suite stays
// green — wrong here, because a green test asserting "the history dialog may
// omit the closure entries" would be evidence FOR the defect, and TC-04-10
// would have to trace to it.
//
// ── THE DEFECT (D9) ─────────────────────────────────────────────────────────
// A CAPA's audit rows are written by TWO different paths that spell the entity
// type differently:
//
//   · the DB trigger (`capas_audit_trigger` → audit_event) stamps
//     `entity_type` from TG_TABLE_NAME, i.e. the PascalCase PLURAL — 'Capas'
//   · the controllers write their own rows with a SINGULAR literal —
//     `db.AuditLog.create({ entityType: 'Capa', ... })`
//
// Both spellings are legitimate and the platform knows about them:
// `audit_entity_type_aliases` carries `Capas -> Capa` (124 such rows), and
// `audit_log_select_rls` UNIONs canonical ids with their aliases, so RLS
// resolves both to one module. The full `/audit-logs` page is fine too —
// `AuditLogsItem` calls `singular()` from `pluralize` for display.
//
// The per-record dialog is where it breaks. `AuditLogDialog.vue` filters
// IN MEMORY on an EXACT string match:
//
//     filtered = all.filter((log) => byType.get(log.entityType)?.has(log.entityId))
//
// and `CapasPageId.vue` hands it `{ entityType: 'Capas', entityIds: [id] }`
// only.
//
// WHICH ROWS ARE ACTUALLY LOST, because the first version of this file got it
// wrong and asserted on an action that is fine. Most lifecycle actions are
// written TWICE — the controller's singular row AND a trigger row for the same
// UPDATE — so the plural-only block still shows them. Measured per record id:
//
//     CLOSE                    107 singular / 107 also plural  → SHOWN
//     CANCEL                    30 singular /  30 also plural  → SHOWN
//     REJECT                    26 singular /   0 also plural  → LOST
//     UPDATE                   106 singular /   0 also plural  → LOST
//     EFFECTIVENESS_VERIFIED    23 singular /   0 also plural  → LOST
//
// The reason is the two writers' vocabularies, and it is decisive:
//
//     trigger emits   CANCEL CLOSE CREATE DELETE DRAFT SUBMIT_FOR_REVIEW UPDATE
//     controller emits CANCEL CLOSE EFFECTIVENESS_VERIFIED REJECT UPDATE
//
// `REJECT` and `EFFECTIVENESS_VERIFIED` exist ONLY in the controller's
// vocabulary — `SELECT count(*) WHERE entity_type='Capas' AND action='REJECT'`
// is 0, and the same holds for `Nonconformances` REJECT and `ChangeRequests`
// REJECT/STEP_SEND_BACK. No plural row can ever exist for them, so the dialog
// can never show them.
//
// A rejected CAPA's own rows read:
//
//     Capas CREATE · Capas SUBMIT_FOR_REVIEW · Capa REJECT · Capas DRAFT
//
// and the dialog shows three of those four. Verified on CAPA-179: 13 rows exist
// across the record and its workflow, and the dialog's header says "Showing 12
// entries across 4 related records".
//
// ── HOW BAD IS IT, HONESTLY ─────────────────────────────────────────────────
// Minor, and this file said otherwise twice before the screenshots were read.
// State it accurately or the protocol note built on it overstates the case:
//
// The rejection IS visible to a reviewer. The dialog renders
// `REJECT · E2E CAPA Review & Approval · Workflow Instance` (attributed,
// timestamped) plus two `STEP REJECTED · Step 2` rows. And the payloads
// overlap — the hidden row carries
// `{reason, stepName, stepNumber}` while the VISIBLE workflow row carries the
// same text as `{comment, statusId: IN_PROGRESS -> REJECTED}`. So the reason is
// not lost either.
//
// What is actually wrong: a tamper-evident log's own record view undercounts by
// one, and the omitted row would have rendered as a bare uuid anyway (see
// below). Worth fixing, worth a defect report — NOT worth telling a validation
// executor that the audit trail hides rejections. It does not.
//
// Same duplicate-filtering shape on NC (REJECT 37 · COMPLETE 31), CR
// (REJECT 72 · STEP_SEND_BACK 35) and QualityEvents, and in the PRINT modules
// (`CapaPrint.vue` passes 'Capas' only) — TC-16-08 step 5.
//
// EFFECTIVENESS_VERIFIED is likewise a duplicate: written against BOTH the
// CapaEffectivenessCheck and the Capa, and the page passes a
// `CapaEffectivenessChecks` block, so the check's own entry is shown.
//
// ── THE MORE VISIBLE DEFECT, found from the same screenshot ─────────────────
// `ENTITY_LABEL_RESOLVERS` (src/utils/auditConstants.js) has no `Capa` or
// `ChangeRequest` entry — it covers Document, Nonconformance, QualityEvent,
// CustomerComplaint, Record and ~40 others. So CAPA rows fall back to
// `label: entityId` and display a raw uuid where an NC shows its number. That
// is the thing a reviewer actually notices, it bears on TC-16-08's
// "human-readable", and it is tracked as its own observation rather than folded
// into this one.
//
// TWO PAGES ALREADY DO IT RIGHT, which is what makes this an inconsistency
// rather than a design question:
//
//     CustomerComplaintsPageId.vue:141-142
//       { entityType: 'CustomerComplaint',  entityIds: [props.id] },
//       { entityType: 'CustomerComplaints', entityIds: [props.id] },
//
// QaComplaintsPageId.vue does the same for Complaint/Complaints. The fix for
// CAPA/NC/CR/QE is that one extra line per page (and per print module);
// `pluralize.singular()` round-trips all ten affected names cleanly.
//
// NOT claimed here, deliberately: this is NOT the "128 broken entity types"
// story. Migration 20260902400000 records that exact mis-diagnosis — a review
// that checked `audit_entity_types` alone, missed the alias table, and
// concluded the platform was broken. The vocabulary works. What is broken is
// one client-side filter.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { signWithPin } from '../fixtures/esign.js'
import { clickWhenReady } from '../fixtures/documents.js'
import { createCapa, openCapa, completeReviewerStep, uniqueTitle } from '../fixtures/capas.js'
import { findCapaByTitle, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  TRAIL_SYNC_TIMEOUT,
  auditLogMenuItem,
  auditRows,
  revealRecordActions,
} from '../fixtures/auditLogs.js'

/** Rows the DB trigger wrote for this CAPA (plural spelling). */
function triggerRows(capaId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capas' AND entity_id = '${capaId}'`,
    ),
  )
}

/** Rows the CONTROLLER wrote for this CAPA (singular spelling). */
function controllerRows(capaId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capa' AND entity_id = '${capaId}'`,
    ),
  )
}

/**
 * Drive a CAPA to a REJECTED approval step, which is the action that actually
 * exposes the defect.
 *
 * NOT cancel, and the reason is the whole point of this file. The first version
 * used `cancelCapa`, and the test could never have worked: CANCEL is written by
 * BOTH writers (30 singular / 30 also-plural), so the plural-only dialog block
 * shows it correctly. REJECT is written ONLY by the controller —
 * `entity_type='Capas' AND action='REJECT'` is 0 rows across the whole database
 * — so it is the action a plural-only filter can never surface.
 *
 * The rejection flow is lifted from `j2-reviewer-workflow.spec.js`, gotchas
 * included; do not "simplify" them:
 *   · `BaseMenu` hardcodes `aria-label="More actions"` on EVERY trigger, so the
 *     record header's menu and the step card's are indistinguishable by
 *     role+name. Anchor on the step's own Approve button and take the next
 *     More-actions trigger in document order.
 *   · the approval step sits low in a 1280x720 viewport and the menu opens
 *     downward without flipping, so its items render below the fold and every
 *     click retries "outside of the viewport" until timeout.
 *     `scrollIntoViewIfNeeded` stops as soon as the TRIGGER is visible, which is
 *     exactly where the menu has no room — hence the explicit centre scroll.
 *   · rejecting an e-sign-required APPROVAL step captures a signature (F-16),
 *     so without `signWithPin` the reject 400s with ESIGNATURE_REQUIRED.
 */
async function capaRejectedByApprover(browser, tag) {
  const ownerCtx = await browser.newContext({ storageState: AUTH.author })
  const ownerPage = await ownerCtx.newPage()
  const title = uniqueTitle(tag)

  await createCapa(ownerPage, title)
  const capa = findCapaByTitle(title)
  expect(capa?.id, 'setup: the CAPA was created').toBeTruthy()
  await openCapa(ownerPage, capa.id)
  await ownerCtx.close()

  await completeReviewerStep(browser, capa.id)
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
        AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
    { timeoutMs: 45_000, label: 'approver task created' },
  )

  const approverCtx = await browser.newContext({ storageState: AUTH.approver })
  const approverPage = await approverCtx.newPage()
  await approverPage.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })

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
    .fill('PW-J12 — rejected to produce a controller-only audit row.')
  await approverPage.getByRole('button', { name: 'Confirm' }).click()
  await signWithPin(approverPage)
  await approverCtx.close()

  await waitForSqlValue(
    `SELECT count(*) FROM capas WHERE id = '${capa.id}' AND status_id = 'DRAFT'`,
    { timeoutMs: 45_000, label: 'CAPA reverted to DRAFT after rejection' },
  )
  return capa
}

test.describe('PW-J12 · the record history dialog shows every writer', () => {
  test('control: the REJECT row exists, and exists ONLY under the singular spelling', async ({
    browser,
  }) => {
    // Without this the assertion below proves nothing — and the first version of
    // this file failed exactly there, by choosing an action that both writers
    // record. This arm pins the asymmetry the defect depends on.
    test.setTimeout(240_000)
    const capa = await capaRejectedByApprover(browser, 'J12-control')

    // Trigger rows arrive via graphile_worker, so they are async.
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capas' AND entity_id = '${capa.id}'`,
      { timeoutMs: 90_000, label: 'trigger-written rows' },
    )
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capa' AND entity_id = '${capa.id}' AND action = 'REJECT'`,
      { timeoutMs: 90_000, label: 'controller-written REJECT row' },
    )

    expect(triggerRows(capa.id), "the trigger wrote rows as 'Capas'").toBeGreaterThan(0)
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capas' AND entity_id = '${capa.id}' AND action = 'REJECT'`,
        ),
      ),
      "and NO plural REJECT row exists — the trigger's vocabulary has no REJECT",
    ).toBe(0)

    test.info().annotations.push({
      type: 'measured',
      description: `${capa.id}: ${triggerRows(capa.id)} plural (Capas) + ${controllerRows(
        capa.id,
      )} singular (Capa), of which the REJECT is singular-only`,
    })
  })

  test('the dialog shows the REJECT entry that explains the revert to DRAFT', async ({
    browser,
  }) => {
    // THE CORE ARM. A rejected CAPA's trail reads:
    //     Capas CREATE · Capas SUBMIT_FOR_REVIEW · Capa REJECT · Capas DRAFT
    // The dialog is handed 'Capas' only, so it shows the creation, the
    // submission and the revert to DRAFT — but not the rejection that caused it.
    test.setTimeout(300_000)
    const capa = await capaRejectedByApprover(browser, 'J12-dialog')

    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capa' AND entity_id = '${capa.id}' AND action = 'REJECT'`,
      { timeoutMs: 90_000, label: 'controller-written REJECT row' },
    )
    // Scoped to THIS CAPA's own rows only. The page also passes
    // WorkflowInstances / WorkflowInstanceSteps / CapaEffectivenessChecks
    // blocks, whose rows are legitimately in the dialog — counting the total
    // and comparing it to the CAPA's own row count is what made the first
    // version of this test fail with "Expected 4, Received 10" on a dialog that
    // was behaving correctly for those other blocks.
    const expected = triggerRows(capa.id) + controllerRows(capa.id)

    // auditor holds audit_trail:read AND capa:read, and nothing that writes —
    // so it can open the history without perturbing the record.
    const readerCtx = await browser.newContext({ storageState: AUTH.auditor })
    try {
      const page = await readerCtx.newPage()
      await page.goto(`/capas/${capa.id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      })
      await expect(page.getByText(capa.capaNumber).first(), 'the record renders').toBeVisible({
        timeout: 60_000,
      })

      await revealRecordActions(page)
      await expect(auditLogMenuItem(page), 'the History affordance is offered').toBeVisible({
        timeout: 20_000,
      })
      await auditLogMenuItem(page).click()

      // Do NOT assert getByRole('dialog') is visible — HeadlessUI puts the role
      // on a zero-box positioning wrapper that always resolves hidden. Usable as
      // a scope, useless as a visibility check. (Same note as ALD-A5.)
      const dialog = page.getByRole('dialog')
      await expect(
        page.getByRole('heading', { name: new RegExp(`Audit Log — ${capa.capaNumber}`) }),
        'the history dialog opened',
      ).toBeVisible({ timeout: 20_000 })

      await expect(auditRows(dialog).first(), 'the record has a history').toBeVisible({
        timeout: TRAIL_SYNC_TIMEOUT,
      })

      // Wait for the trail to have synced into IndexedDB before counting —
      // the dialog reads from IDB, and the plural rows land there first.
      await expect
        .poll(async () => auditRows(dialog).count(), { timeout: TRAIL_SYNC_TIMEOUT })
        .toBeGreaterThan(0)

      // THE ASSERTION. Filter to this CAPA's own rows by matching its UUID.
      //
      // The UUID, not the CAPA number, and this is not arbitrary:
      // `ENTITY_LABEL_RESOLVERS` (src/utils/auditConstants.js) has NO `Capa`
      // entry — it covers Document, Workflow, Record, Nonconformance,
      // QualityEvent, CustomerComplaint and ~40 others, but not Capa or
      // ChangeRequest. So `AuditLogsItem` singularises 'Capas' -> 'Capa', finds
      // no resolver, and falls back to `label: entityId`. A CAPA's audit rows
      // therefore display the raw UUID. (Worth reporting separately: on any
      // audit view a CAPA reads as a uuid rather than CAPA-173, which is a
      // readability gap against TC-16-08 — but it is NOT this defect.)
      //
      // It also makes the filter exact. The other blocks resolve to labels that
      // cannot contain this uuid: `WorkflowInstance` -> the workflow's name,
      // `WorkflowInstanceStep` -> "Step N". Filtering on the action word would
      // NOT be safe — a rejected CAPA's workflow rows carry
      // `WorkflowInstances REJECT` and `WorkflowInstanceSteps STEP_REJECTED`,
      // so a `hasText: 'REJECT'` filter would match those and pass while the
      // CAPA's own REJECT stayed hidden. That is the same mistake as the row
      // count this file already made once.
      const ownRows = dialog
        .getByRole('button', { name: /^(Expand|Collapse) change details$/ })
        .filter({ hasText: capa.id })

      await expect
        .poll(async () => ownRows.count(), {
          timeout: TRAIL_SYNC_TIMEOUT,
          message: `the dialog must show all ${expected} rows recorded against this CAPA (${triggerRows(
            capa.id,
          )} trigger-written + ${controllerRows(
            capa.id,
          )} controller-written). Fewer means a singular-spelled row was filtered out client-side — a duplicate of an action that IS otherwise visible via the workflow rows, so this is an undercount rather than a hidden action. See the severity note at the top of this file before reporting it.`,
        })
        .toBe(expected)
    } finally {
      await readerCtx.close()
    }
  })
})
