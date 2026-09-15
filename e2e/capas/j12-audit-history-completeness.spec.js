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
// only. So every row the CONTROLLER wrote is silently dropped from the record's
// own history. Measured on app-db:
//
//     Capa    (singular, controller)  CLOSE 107 · UPDATE 106 · CANCEL 28 ·
//                                     REJECT 26 · EFFECTIVENESS_VERIFIED 23
//     Capas   (plural, trigger)       CREATE 554 · SUBMIT_FOR_REVIEW 414 · …
//
// 218 CAPAs carry BOTH spellings, so on those records the dialog is provably
// incomplete. The same omission affects NC (REJECT 37 · UPDATE 35 ·
// COMPLETE 31), CR (CANCEL 80 · REJECT 72 · CLOSE 46 · STEP_SEND_BACK 35) and
// QualityEvents, and the PRINT modules too (`CapaPrint.vue` passes 'Capas'
// only) — which is TC-16-08 step 5, "the audit history of a record can be
// produced alongside it".
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
import { AUTH } from '../fixtures/cast.js'
import { createCapa, openCapa, cancelCapa, uniqueTitle } from '../fixtures/capas.js'
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
 * Drive a CAPA to CANCELLED as `author`, so the record ends up carrying rows
 * from BOTH writers.
 *
 * Cancel is chosen over close because it is the shortest path to a
 * controller-written row: `j5-cancel-esign.spec.js` already asserts
 * `entity_type = 'Capa'` (singular) for the CANCEL action, so the singular
 * write is pinned by an existing passing test rather than by inference here.
 * Close would work identically and costs two extra workflow steps.
 */
async function capaWithBothWriters(browser, tag) {
  const authorCtx = await browser.newContext({ storageState: AUTH.author })
  const page = await authorCtx.newPage()
  const title = uniqueTitle(tag)

  await createCapa(page, title)
  const capa = findCapaByTitle(title)
  expect(capa?.id, 'setup: the CAPA was created').toBeTruthy()

  await openCapa(page, capa.id)
  await cancelCapa(page, { reason: 'PW-J12 — cancelled to produce a controller-written row.' })
  await waitForSqlValue(
    `SELECT count(*) FROM capas WHERE id = '${capa.id}' AND status_id = 'CANCELLED'`,
    { timeoutMs: 20_000, label: 'CAPA CANCELLED' },
  )

  await authorCtx.close()
  return capa
}

test.describe('PW-J12 · the record history dialog shows every writer', () => {
  test('control: the CAPA really does carry rows under BOTH spellings', async ({ browser }) => {
    // Without this the assertion below proves nothing: if the cancel produced no
    // singular row, a dialog showing only plural rows would be complete and
    // correct, and the test would be failing on a false premise.
    test.setTimeout(180_000)
    const capa = await capaWithBothWriters(browser, 'J12-control')

    // Trigger rows arrive via graphile_worker, so they are async.
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capas' AND entity_id = '${capa.id}'`,
      { timeoutMs: 90_000, label: 'trigger-written CREATE row' },
    )
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capa' AND entity_id = '${capa.id}' AND action = 'CANCEL'`,
      { timeoutMs: 90_000, label: 'controller-written CANCEL row' },
    )

    const plural = triggerRows(capa.id)
    const singular = controllerRows(capa.id)
    expect(plural, "the trigger wrote rows as 'Capas'").toBeGreaterThan(0)
    expect(singular, "the controller wrote rows as 'Capa'").toBeGreaterThan(0)

    test.info().annotations.push({
      type: 'measured',
      description: `${capa.id}: ${plural} trigger-written (Capas) + ${singular} controller-written (Capa)`,
    })
  })

  test("the dialog shows the CANCEL entry, not only the trigger's rows", async ({ browser }) => {
    // THE CORE ARM. A cancelled CAPA's history must include the cancellation.
    // Today the dialog is handed 'Capas' only, so the CANCEL row — the one a
    // reviewer most needs, and the one carrying the e-signature meaning — is
    // filtered out client-side.
    test.setTimeout(240_000)
    const capa = await capaWithBothWriters(browser, 'J12-dialog')

    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capa' AND entity_id = '${capa.id}' AND action = 'CANCEL'`,
      { timeoutMs: 90_000, label: 'controller-written CANCEL row' },
    )
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

      // The assertion that matters: every row the database holds for this record
      // is on screen. A count is used rather than looking for the word "Cancel"
      // because the row's visible label comes from a display map, and the claim
      // under test is completeness, not wording.
      await expect
        .poll(async () => auditRows(dialog).count(), {
          timeout: TRAIL_SYNC_TIMEOUT,
          message: `the dialog must show all ${expected} rows this CAPA has (${triggerRows(
            capa.id,
          )} trigger-written + ${controllerRows(capa.id)} controller-written). Fewer means the
            singular-spelled rows were filtered out client-side — see the D9 note
            at the top of this file.`,
        })
        .toBe(expected)
    } finally {
      await readerCtx.close()
    }
  })
})
