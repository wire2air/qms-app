// ALD-A5 — a record's own history dialog, and the append-only guarantee under it.
//
// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — THE AFFORDANCE
//
// `/audit-logs` is one surface; `AuditLogDialog` is TEN, embedded on Audits
// (instances + standards), CAPA, Change Requests, Customer Complaints,
// Documents, NCR, QA Complaints, Quality Events and Users. All ten render the
// same "Audit Log" menu item through a `canViewAuditTrail` gate threaded into
// nine `*DetailConfig.js` builders, and all ten inherit
// `audit_log_select_rls` for the rows themselves.
//
// The gate is on the AFFORDANCE, and the reasoning behind that is the point.
// Before it, an ungated user opening the dialog saw the existing empty state:
//
//     No audit entries — No changes have been recorded yet.
//
// On a compliance record that sentence is a FALSE STATEMENT. It asserts that
// nothing happened, when the truth is that the viewer is not allowed to know,
// and the two lead a reviewer to opposite conclusions. So the dialog grew a
// distinct denial state, and the button that can only ever produce it is not
// offered at all. This test pins the button; `fixtures/auditLogs.js` exports
// both strings separately (`trailDeniedNotice` / `trailEmptyState`) precisely so
// no future test can conflate them.
//
// THE PAIR, and why it is on ONE record rather than two personas on two records:
//
//   author  Aaron OWNS the probe NC (`owner_id`) and holds ncr:create/read/
//           update. He reaches the record's detail page in full and must still
//           not be offered its history. Measured: `nonconformances_sel` returns
//           the row for him.
//   auditor Ava holds ncr:read AND audit_trail:read. Same page, same record,
//           same run — the only difference between them is the trail grant.
//
// A denial that is only ever observed on a record the persona cannot reach
// proves nothing about the trail. That is why the subject is one both can read.
//
// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — APPEND-ONLY
//
// Read control is half of a Part 11 trail; the other half is that the record of
// a change cannot itself be changed. `audit_logs` carries the
// `audit_logs_immutable` trigger (`prevent_audit_log_mutation()`) AND is granted
// only `SELECT, INSERT` to `app_user` — two independent layers, and both are
// probed, because either one alone would be silently load-bearing.
//
// This was found the hard way: `removeProbeNc()` in the fixture opened with
// `DELETE FROM audit_logs WHERE entity_id = …` and had never been able to run.
// It looked fine on a database where the probe had not executed yet, because a
// DELETE matching zero rows never fires a row-level trigger. The helper no
// longer tries; the guarantee it tripped over is asserted here instead.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import {
  PROBE_NC,
  TRAIL_SYNC_TIMEOUT,
  auditLogMenuItem,
  auditRows,
  dbNow,
  revealRecordActions,
  seedProbeNc,
  trailDeniedNotice,
  trailEmptyState,
  waitForAuditRow,
} from '../fixtures/auditLogs.js'

const NC_PATH = `/nonconformances/${PROBE_NC.id}`

test.describe('ALD-A5 — the per-record history dialog', () => {
  test.beforeAll(async () => {
    const since = dbNow()
    seedProbeNc(USERS.owner.id)
    await waitForAuditRow({
      entityType: 'Nonconformances',
      entityId: PROBE_NC.id,
      action: 'CREATE',
      since,
    })
  })

  test('the History affordance is offered to a trail holder and withheld from the record owner', async ({
    browser,
  }) => {
    test.setTimeout(TRAIL_SYNC_TIMEOUT + 120_000)

    // ── GRANTED. Ava opens the record and its history.
    const granted = await browser.newContext({ storageState: AUTH.auditor })
    try {
      const page = await granted.newPage()
      await page.goto(NC_PATH, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await expect(page.getByText(PROBE_NC.number).first(), 'the record renders').toBeVisible({
        timeout: 60_000,
      })

      await revealRecordActions(page)
      await expect(auditLogMenuItem(page), 'the History affordance is offered').toBeVisible()
      await auditLogMenuItem(page).click()

      // Headless UI's `role="dialog"` node is a zero-box positioning wrapper —
      // Playwright reports it HIDDEN even while the panel inside it is on
      // screen, so it is usable as a SCOPE and useless as a visibility
      // assertion. The heading is the thing that is actually painted.
      const dialog = page.getByRole('dialog')
      await expect(
        page.getByRole('heading', { name: `Audit Log — ${PROBE_NC.number}` }),
        'the history dialog opened',
      ).toBeVisible({ timeout: 20_000 })
      // The denial state must NOT be what a grant holder sees — that would mean
      // the client gate and the policy disagree, which is the exact class of
      // defect this module already shipped once in the other direction.
      await expect(trailDeniedNotice(dialog)).toHaveCount(0)
      await expect(
        auditRows(dialog).first(),
        'and the record has a history to show — the CREATE this file wrote',
      ).toBeVisible({ timeout: TRAIL_SYNC_TIMEOUT })
      // Which also means the empty state is not on screen. Asserted explicitly:
      // "no entries" and "not yours to see" must never be confusable, and a test
      // that only checks for rows would pass with both strings rendered.
      await expect(trailEmptyState(dialog)).toHaveCount(0)

      // §8 — export is a SEPARATE grant, and nobody in this tenant holds
      // `audit_trail:export`. An affordance gate, not the gate: the CSV is
      // assembled from rows already in IndexedDB, so `audit_log_select_rls` is
      // what actually bounds what can leave. Ava reads the trail and still
      // cannot download it.
      await expect(
        dialog.getByRole('button', { name: /Export CSV/ }),
        'reading the trail is not permission to export it',
      ).toHaveCount(0)
    } finally {
      await granted.close()
    }

    // ── DENIED. Aaron owns this record and is not offered its history.
    const denied = await browser.newContext({ storageState: AUTH.author })
    try {
      const page = await denied.newPage()
      await page.goto(NC_PATH, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await expect(
        page.getByText(PROBE_NC.number).first(),
        'he reaches the record in full — this is not a record-visibility result',
      ).toBeVisible({ timeout: 60_000 })

      // `revealRecordActions` opens the ⋯ overflow if the page has one and does
      // nothing if it does not — on this record the actions are inline buttons.
      // Either way the assertion is the same: the control is not there.
      await revealRecordActions(page)
      await expect(
        auditLogMenuItem(page),
        'the record owner is not offered his own record’s history — §6.3, and it is open on purpose',
      ).toHaveCount(0)
    } finally {
      await denied.close()
    }
  })

  test('the owner is offered both reading and exporting', async ({ browser }) => {
    test.setTimeout(TRAIL_SYNC_TIMEOUT + 90_000)

    // Olivia holds NO audit_trail grant — `isAllowed()` short-circuits on
    // `isOwner` exactly as `audit_log_select_rls` short-circuits on
    // `app.current_user_is_owner`. She is the control that says the two
    // absences above are permission results and not a broken menu: the same
    // build, the same page, the same record, both affordances present.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    try {
      const page = await ctx.newPage()
      await page.goto(NC_PATH, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await expect(page.getByText(PROBE_NC.number).first()).toBeVisible({ timeout: 60_000 })

      await revealRecordActions(page)
      await expect(auditLogMenuItem(page)).toBeVisible()
      await auditLogMenuItem(page).click()

      const dialog = page.getByRole('dialog')
      await expect(
        page.getByRole('heading', { name: `Audit Log — ${PROBE_NC.number}` }),
      ).toBeVisible({ timeout: 20_000 })
      await expect(trailDeniedNotice(dialog)).toHaveCount(0)
      await expect(
        dialog.getByRole('button', { name: /Export CSV/ }),
        'the owner bypass reaches audit_trail:export too',
      ).toBeVisible({ timeout: 20_000 })
    } finally {
      await ctx.close()
    }
  })

  test('the trail is append-only — at the privilege layer and at the trigger', () => {
    const rowId = sqlValue(
      `SELECT id FROM audit_logs
        WHERE entity_id = '${PROBE_NC.id}' AND action = 'CREATE'
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(rowId, 'there is a row to try to tamper with').toBeTruthy()

    // The pair that makes the refusals below mean something: the row is
    // reachable through the SELECT policy for a granted persona. Without this,
    // "the UPDATE touched nothing" is equally consistent with the row not being
    // visible in the first place — which is the trap this whole suite is built
    // around.
    const visible = sqlAsAppUser(
      `SELECT 'RESULT=' || count(*)::text FROM audit_logs WHERE id = '${rowId}';`,
      { userId: USERS.auditor.id, companyId: COMPANY_ID },
    )
    expect(visible.ok, `read probe ran (stderr: ${visible.error})`).toBeTruthy()
    expect(Number(/RESULT=(\d+)/.exec(visible.output)?.[1]), 'the row is readable').toBe(1)

    // Layer 1 — privileges. `app_user` is granted SELECT and INSERT and nothing
    // else, so the GraphQL role cannot even form the statement. This layer is
    // the one that covers every future write path without anybody remembering
    // to guard it.
    // The forgery is a REAL one: relabelling a CREATE as a DELETE. Writing the
    // value the row already holds would be indistinguishable from a refusal.
    const asAppUser = sqlAsAppUser(
      `UPDATE audit_logs SET action = 'DELETE' WHERE id = '${rowId}';`,
      { userId: USERS.auditor.id, companyId: COMPANY_ID },
    )
    expect(asAppUser.ok, 'the GraphQL role cannot rewrite an audit row').toBeFalsy()
    expect(asAppUser.error).toMatch(/permission denied/i)

    // Layer 2 — the trigger, which is what makes layer 1 more than an accident
    // of who happens to hold what. The REST path connects as the SUPERUSER with
    // `REST_RLS_ENABLED` off, so it never meets a policy or a GRANT; only this
    // layer stands between it and history.
    const asSuperuser = () => {
      try {
        sqlValue(`UPDATE audit_logs SET action = 'DELETE' WHERE id = '${rowId}'`)
        return null
      } catch (err) {
        return `${err.stderr ?? err.message}`
      }
    }
    expect(asSuperuser(), 'not even the superuser rewrites one').toMatch(/immutable/i)

    const deleteAttempt = (() => {
      try {
        sqlValue(`DELETE FROM audit_logs WHERE id = '${rowId}'`)
        return null
      } catch (err) {
        return `${err.stderr ?? err.message}`
      }
    })()
    expect(deleteAttempt, 'nor deletes one').toMatch(/immutable/i)

    // And the row is exactly where it was.
    expect(
      sqlValue(`SELECT count(*) FROM audit_logs WHERE id = '${rowId}' AND action = 'CREATE'`),
      'the CREATE row is untouched',
    ).toBe('1')
  })
})
