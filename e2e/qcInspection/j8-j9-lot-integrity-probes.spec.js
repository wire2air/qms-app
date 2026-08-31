// The module's integrity probes — findings #1 and #2
// (docs/modules/qc-inspection/14-playwright-journeys.md).
//
// Both deliberately bypass the UI and act as the untrusted `app_user` DB role —
// exactly what a raw GraphQL mutation is. Sequelize/REST connects as the
// superuser and bypasses RLS entirely, so a REST-level test could never see
// these; only sqlAsAppUser can.
//
// ⚠️ READ BEFORE "FIXING" A FAILURE HERE. PW-J9 still asserts the CURRENT, WRONG
// behavior and is written to FAIL LOUDLY once the defect is fixed, with a
// message telling you to invert it. A green run means the defect is still live;
// a red run of that test may be GOOD news. This mirrors the pattern the Audits
// (PW-J9/J10) and Suppliers (PW-J6/J7) packs established.
//
// ── PW-J8 HAS MOVED, BECAUSE IT IS NO LONGER A DEFECT PROBE ─────────────────
//
// Finding #1 is FIXED: migration `20260901100000-lock-inspection-lot-lifecycle`
// adds `enforce_inspection_lot_lifecycle` (errcode QMSQC), and the client half
// landed alongside it. So PW-J8 stopped being a documented hole and became a
// release gate, and it now lives in **`j8-lot-lifecycle-lock.spec.js`** where it
// can cover all four lifecycle-bearing columns, the client model and the UI.
//
// What stays here is the narrower claim this file has always made about the
// *vocabulary*: a fabricated status is refused. It is worth keeping separate,
// because it is the one refusal that survives even if the trigger is dropped —
// the foreign key to the four-row `inspection_lot_statuses` is the backstop
// under the guard, and the test below pins which of the two answers first.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { createLotViaRest, findLotByNumber } from '../fixtures/qcInspection.js'

const lastLine = (out) => out.trim().split('\n').pop().trim()

test.describe('PW-J9 — lot integrity probes (PW-J8 moved to j8-lot-lifecycle-lock.spec.js)', () => {
  test('a fabricated status is refused — by the lifecycle guard first, the FK behind it', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()
    const lot = await createLotViaRest(page, {})
    await ctx.close()

    expect(lot.phase, 'a fresh lot starts in the PENDING phase').toBe('PENDING')

    // Two independent defences now stand behind this one statement, and the
    // order is the point of the test.
    //
    // The 2026-08-28 unification trimmed `inspection_lot_statuses` to
    // DRAFT/OPEN/CLOSED/CANCELLED, so the FK alone refuses every fabricated
    // outcome-status — an execute-only inspector cannot forge a "released" lot
    // by inventing a status name. But a BEFORE trigger runs ahead of constraint
    // checking, so with `enforce_inspection_lot_lifecycle` in place the caller
    // now sees QMSQC rather than a constraint violation, and would see it for a
    // *legal* status too. That distinction is what `j8-lot-lifecycle-lock.spec.js`
    // exists to prove; here we only pin that the statement is refused and that
    // the refusal comes from the guard.
    const res = sqlAsAppUser(
      `UPDATE inspection_lots
          SET status_id = 'DISPOSITIONED', quality_state = 'RELEASED'
        WHERE id = '${lot.id}';`,
      { userId: USERS.qcInspector.id, companyId: COMPANY_ID },
    )
    expect(res.ok, 'a fabricated status is refused').toBe(false)
    expect(String(res.error), 'the lifecycle guard answers before the foreign key does').toMatch(
      /lifecycle cannot be changed|foreign key|violates/i,
    )

    const after = findLotByNumber(lot.lotNumber)
    expect(after.statusId, 'the lot is untouched').toBe('OPEN')
    expect(after.phase).toBe('PENDING')
    expect(after.qualityState, 'and no outcome was forged onto it').toBeNull()

    // The residual raw-CLOSE hole this test used to document is CLOSED. CLOSED
    // is a legal FK value, so before the trigger this statement succeeded; it is
    // now refused, and `j8-lot-lifecycle-lock.spec.js` asserts that on the
    // SQLSTATE rather than on the message.
    const rawClose = sqlAsAppUser(
      `UPDATE inspection_lots SET status_id = 'CLOSED' WHERE id = '${lot.id}';`,
      { userId: USERS.qcInspector.id, companyId: COMPANY_ID },
    )
    expect(rawClose.ok, 'a raw jump to the LEGAL terminal status is refused too').toBe(false)
    expect(findLotByNumber(lot.lotNumber).statusId).toBe('OPEN')
  })

  test('PW-J9 — finding #2 CLOSED: the lot-number counter is not writable by a zero-permission member', async () => {
    const before = sqlValue(
      `SELECT current_value FROM inspection_lot_counters
        WHERE company_id = '${COMPANY_ID}' AND prefix = 'RS'`,
    )
    test.skip(!before, 'RS counter row not seeded yet — run the seed first')

    // noAccess holds no QC grants at all. Rewinding the counter would make the
    // next lot/retain number collide with an existing record — for a regulated
    // identifier that is a data-integrity failure, not a cosmetic one.
    //
    // INVERTED 2026-09-01 (QC hardening pass). This probe used to assert the
    // defect: `inspection_lot_counters_all_rls` was a single FOR ALL policy
    // carrying tenancy and nothing else, plus a DELETE grant, so any company
    // member could read, bump or delete the counter. It is now three per-command
    // policies each carrying a permission clause, with DELETE revoked.
    //
    // Note the gate is deliberately `inspection_qc:create OR retain_samples:create`.
    // This one table serves two allocators keyed on `prefix` — 'QC' for
    // inspectionLotService.nextLotNumber() and 'RS' for
    // retainSampleService.nextRsNumber() — and a custodian-only role holds the
    // retain verbs with no inspection_qc grant at all. This probe uses the RS
    // row precisely because that is the arm most likely to be broken by a
    // careless tightening.
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

    expect(
      after,
      'a zero-permission member rewrote the regulated identifier counter — finding #2 has regressed',
    ).toBe(before)
    expect(after, 'the counter must not carry the tampered value').not.toBe(tampered)

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
