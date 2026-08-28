// PW-J8 / PW-J9 — the module's two headline integrity probes
// (docs/modules/qc-inspection/14-playwright-journeys.md; findings #1 and #2).
//
// Both deliberately bypass the UI and act as the untrusted `app_user` DB role —
// exactly what a raw GraphQL mutation is. Sequelize/REST connects as the
// superuser and bypasses RLS entirely, so a REST-level test could never see
// these; only sqlAsAppUser can.
//
// ⚠️ READ BEFORE "FIXING" A FAILURE HERE. Both tests assert the CURRENT, WRONG
// behavior and are written to FAIL LOUDLY once the defect is fixed, with a
// message telling you to invert them. A green run means the defect is still
// live; a red run of this file may be GOOD news. This mirrors the pattern the
// Audits (PW-J9/J10) and Suppliers (PW-J6/J7) packs established.
//
// PW-J8 is rated the highest-priority single test in the entire documentation
// program: it proves the disposition state machine can be skipped outright.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { createLotViaRest, findLotByNumber } from '../fixtures/qcInspection.js'

const lastLine = (out) => out.trim().split('\n').pop().trim()

test.describe('PW-J8/J9 — lot integrity probes', () => {
  test('PW-J8 — finding #1 NARROWED: fabricated statuses are refused at the FK; a raw CLOSE remains the residual hole', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()
    const lot = await createLotViaRest(page, {})
    await ctx.close()

    expect(lot.phase, 'a fresh lot starts in the PENDING phase').toBe('PENDING')

    // INVERTED 2026-08-28 (per this probe's own instruction when it first
    // failed "the right way"): the unified vocabulary trimmed
    // inspection_lot_statuses to DRAFT/OPEN/CLOSED/CANCELLED, and status_id's
    // FK now refuses every fabricated outcome-status. The disposition OUTCOME
    // lives on disposition_type_id, which only the disposition flow writes —
    // so an execute-only inspector can no longer forge a "released" lot by
    // inventing a status.
    const res = sqlAsAppUser(
      `UPDATE inspection_lots
          SET status_id = 'DISPOSITIONED', quality_state = 'RELEASED'
        WHERE id = '${lot.id}';`,
      { userId: USERS.qcInspector.id, companyId: COMPANY_ID },
    )
    expect(res.ok, 'fabricated status is refused (FK to the 4-row vocabulary)').toBe(false)
    expect(String(res.error)).toMatch(/foreign key|violates/i)

    const after = findLotByNumber(lot.lotNumber)
    expect(after.statusId, 'the lot is untouched').toBe('OPEN')
    expect(after.phase).toBe('PENDING')

    // RESIDUAL (still open, now narrower): CLOSED is a legal FK value and
    // inspection_lots has no transition trigger, so a raw jump to CLOSED
    // still works — but it lands with NO disposition_type_id, which every
    // outcome reader now keys on, so the forged state no longer reads as a
    // release anywhere. Fix remains C1: a status-transition trigger.
    const rawClose = sqlAsAppUser(
      `UPDATE inspection_lots SET status_id = 'CLOSED' WHERE id = '${lot.id}';`,
      { userId: USERS.qcInspector.id, companyId: COMPANY_ID },
    )
    if (rawClose.ok) {
      test.info().annotations.push({
        type: 'known-defect',
        description:
          'Finding #1 RESIDUAL: no transition trigger on inspection_lots, so a raw jump to the ' +
          'legal CLOSED value still works for any execute-holder — though without a disposition ' +
          'record it no longer masquerades as a release. Fix = C1 status-transition trigger + a ' +
          'single-verb write policy.',
      })
    }
  })

  test('PW-J9 — 🔴 OPEN finding #2: the lot-number counter is writable by a zero-permission member', async () => {
    const before = sqlValue(
      `SELECT current_value FROM inspection_lot_counters
        WHERE company_id = '${COMPANY_ID}' AND prefix = 'RS'`,
    )
    test.skip(!before, 'RS counter row not seeded yet — run the seed first')

    // noAccess holds no QC grants at all. inspection_lot_counters_all_rls has
    // NO permission clause on any verb — company scoping is the entire policy
    // (rls.sql:1713-1715). Rewinding the counter makes the next lot/retain
    // number collide with an existing record, which for a regulated identifier
    // is a data-integrity failure, not a cosmetic one.
    const tampered = String(Number(before) + 500)
    const res = sqlAsAppUser(
      `UPDATE inspection_lot_counters SET current_value = ${tampered}
        WHERE company_id = '${COMPANY_ID}' AND prefix = 'RS';`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )

    const after = sqlValue(
      `SELECT current_value FROM inspection_lot_counters
        WHERE company_id = '${COMPANY_ID}' AND prefix = 'RS'`,
    )

    if (!res.ok || after === before) {
      throw new Error(
        'Finding #2 appears FIXED — the counter write was refused. Good news: invert this test to ' +
          'assert the refusal, and mark finding #2 FIXED in 11-security-review.md.\n' +
          `DB said: ${res.error || `value unchanged at ${after}`}`,
      )
    }

    expect(after, 'a user with zero permissions rewrote the identifier counter').toBe(tampered)

    // Put it back so the tamper does not leak into other specs' RS numbers.
    sqlAsAppUser(
      `UPDATE inspection_lot_counters SET current_value = ${before}
        WHERE company_id = '${COMPANY_ID}' AND prefix = 'RS';`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )
    expect(
      sqlValue(`SELECT current_value FROM inspection_lot_counters
                 WHERE company_id = '${COMPANY_ID}' AND prefix = 'RS'`),
      'counter restored so later specs get clean RS numbers',
    ).toBe(before)

    test.info().annotations.push({
      type: 'known-defect',
      description:
        'Finding #2 OPEN: inspection_lot_counters has no permission check on any verb — full GraphQL ' +
        'exposure to every tenant member. Fix = gate the policy on inspection_qc:create, or revoke ' +
        'app_user write access entirely (the service writes as superuser).',
    })
  })

  test('cross-tenant: the counter and lots are still company-scoped', async () => {
    // The finding above is about MISSING permission checks, not missing tenant
    // isolation — this pins that the company clause still holds, so a future
    // "fix" cannot quietly widen the policy in the other direction.
    const foreign = sqlAsAppUser(
      `SELECT count(*) FROM inspection_lot_counters WHERE company_id = '${COMPANY_ID}';`,
      { userId: USERS.noAccess.id, companyId: '00000000-0000-4000-8000-00000000dead' },
    )
    expect(lastLine(foreign.output), 'counters are invisible from another tenant').toBe('0')
  })
})
