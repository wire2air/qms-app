// PW-J13 — Retain-samples permission + RLS gates (MTC-24, MTC-25, finding #18).
//
// Everything here deliberately BYPASSES the UI: each probe asks whether the
// server/database refuses something the interface merely hides. Three of the
// four are regression guards for known findings, so read the expectations
// carefully — one of them documents a defect that is still OPEN and is written
// to prove it, not to hide it.
//
//   1. MTC-24 (finding #13, FIXED) — a zero-permission member must NOT be able
//      to INSERT into storage_locations. Shipped broken on 2026-07-29 (the
//      permission gate was in USING but dropped from WITH CHECK, and Postgres
//      only evaluates WITH CHECK on INSERT); fixed the same day. This is the
//      regression guard: it must stay green.
//   2. MTC-25 (finding #14, OPEN) — a retain_samples:update holder CAN flip
//      status_id to DISPOSED over raw GraphQL/SQL, skipping the PIN e-sign,
//      because there is no CHECK/trigger and one broad write policy covers
//      create OR update OR dispose. This test asserts the CURRENT, WRONG
//      behavior and FAILS THE DAY IT IS FIXED — which is the signal to flip it.
//      Mirrors how MTC-01/PW-J8 treat the same class on inspection_lots.
//   3. Finding #18 (OPEN) — the custodian-only persona is bounced off the
//      /qc-inspection list route while its own sidebar entry points there.
//   4. Tenant isolation — retain rows must not leak across companies.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, QC, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { createLotViaRest, createRetainSample, findRetainSample } from '../fixtures/qcInspection.js'

test.describe('PW-J13 — retain-samples permission + RLS gates', () => {
  test('MTC-24 — a zero-permission member cannot INSERT a storage location (finding #13 regression guard)', async () => {
    // noAccess holds nothing on any QC module. Before the 2026-07-29 fix this
    // INSERT succeeded: the policy gated USING but not WITH CHECK.
    const res = sqlAsAppUser(
      `INSERT INTO storage_locations (company_id, code, name)
       VALUES ('${COMPANY_ID}', 'HACK-${Date.now()}', 'Should be refused');`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )
    expect(res.ok, 'zero-permission INSERT must be refused by RLS').toBeFalsy()
    expect(res.error, 'refused by the row-level security policy').toMatch(/row-level security/i)
  })

  test('MTC-25 — finding #14 CLOSED: an update-holder cannot dispose over raw SQL, skipping the e-sign', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()
    const lot = await createLotViaRest(page, {})
    const sample = await createRetainSample(page, lot.id, {})
    await ctx.close()

    expect(sample.statusId).toBe('RETAINED')

    // The inspector holds retain_samples:read/create/update — NOT dispose. The
    // REST route refuses them (asserted in PW-J12).
    //
    // INVERTED 2026-09-01 (QC-F6, migration 20260901120000). The database used
    // to allow this: retain_samples_write_rls accepts create OR update OR
    // dispose in one policy, and status_id had no CHECK and no trigger, so the
    // RETAINED/DISPOSED vocabulary and the disposal seal lived only in
    // retainSampleService.js. `enforce_retain_sample_lifecycle` now refuses any
    // untrusted write to the disposal facts with SQLSTATE QMSRS.
    //
    // This pairs with QC-F5 (20260901110000), which made the REST disposal write
    // a real Part 11 `signatures` row — it had been calling verifyAndSign with
    // no subject, so the PIN was checked and nothing was recorded. Neither half
    // is a control on its own: a signature you can decline to produce by going
    // around the endpoint is not a signature.
    const res = sqlAsAppUser(
      `UPDATE retain_samples SET status_id = 'DISPOSED', disposed_at = NOW()
        WHERE id = '${sample.id}';`,
      { userId: USERS.qcInspector.id, companyId: COMPANY_ID },
    )

    const after = findRetainSample(sample.id)

    expect(
      after.statusId,
      'finding #14 has regressed — an update-holder disposed a retain sample over raw SQL',
    ).toBe('RETAINED')
    expect(after.disposedAt ?? null, 'the disposal facts must not be forged either').toBeNull()

    // The harm the old bypass caused, asserted from the other side: the sample
    // is still live, so its custody chain has no DISPOSED event to be missing.
    expect(
      sqlValue(`SELECT count(*) FROM retain_sample_events
                 WHERE retain_sample_id = '${sample.id}' AND event_type = 'DISPOSED'`),
      'a refused disposal must not leave a custody event behind',
    ).toBe('0')
  })

  test('finding #18 — the retain custodian is bounced off the QC list route their own sidebar links to', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.retainCustodian })
    const page = await ctx.newPage()

    // The sidebar renders "Retain Samples" for this persona (gated
    // retain_samples:read) pointing at /qc-inspection?tab=retain-samples…
    await page.goto('/dashboard')
    await expect(
      page.getByRole('link', { name: 'Retain Samples' }),
      'the sidebar offers the custodian their surface',
    ).toBeVisible({ timeout: 20_000 })

    // …but permissionGuard.js maps the /qc-inspection segment to
    // inspection_qc:read, which the custodian does not hold. A query string is
    // not part of to.path, so the tab URL normalizes to the bare list route.
    // CLICKING the link (in-app SPA navigation) is what runs the guard.
    await page.getByRole('link', { name: 'Retain Samples' }).click()
    await expect(page, 'custodian is redirected away from their own entry').toHaveURL(/no-access/, {
      timeout: 20_000,
    })

    // The other half, verified: a DIRECT load of the same URL is NOT blocked.
    // evaluateRoute returns true while `currentSession` is still unresolved and
    // never re-evaluates once it resolves, so a fresh page load / refresh sails
    // through and the surface renders. The custodian is therefore locked out
    // only of their own sidebar entry, not of the page — and the guard is a UX
    // affordance, not a security boundary (RLS is the real gate).
    await page.goto('/qc-inspection?tab=retain-samples')
    await expect(page, 'a direct load is not guarded at all').toHaveURL(/qc-inspection/, {
      timeout: 20_000,
    })
    await expect(
      page.getByRole('heading', { name: 'QC Inspection' }).first(),
      'and the surface renders for a persona the guard just rejected',
    ).toBeVisible({ timeout: 20_000 })
    test.info().annotations.push({
      type: 'known-defect',
      description:
        'Finding #18 OPEN: gate the qc-inspection segment on inspection_qc:read OR retain_samples:read. ' +
        'Masked in production by the retroactive grants; live for any custodian-only role. Note the guard ' +
        'only fires on SPA navigation — a direct load of the same URL renders, so this is a UX defect, ' +
        'not an access-control one.',
    })

    // DETAIL routes are deliberately guard-open and defer to RLS, so the same
    // persona can open a retain sample directly — PW-J12 relies on this, it is
    // how the custodian disposes at all.
    await ctx.close()
  })

  test('tenant isolation — retain samples do not leak to another company', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()
    const lot = await createLotViaRest(page, {})
    const sample = await createRetainSample(page, lot.id, {})
    await ctx.close()

    // sqlAsAppUser runs a 4-statement script (SET ROLE + three set_config
    // SELECTs) before the query, so stdout carries their results too — the
    // answer is the LAST line, never the whole output.
    const lastLine = (out) => out.trim().split('\n').pop().trim()

    const own = sqlAsAppUser(`SELECT count(*) FROM retain_samples WHERE id = '${sample.id}';`, {
      userId: USERS.qcInspector.id,
      companyId: COMPANY_ID,
    })
    expect(lastLine(own.output), 'own tenant sees its retain sample').toBe('1')

    const other = sqlAsAppUser(`SELECT count(*) FROM retain_samples WHERE id = '${sample.id}';`, {
      userId: USERS.qcInspector.id,
      companyId: '00000000-0000-4000-8000-00000000dead',
    })
    expect(lastLine(other.output), 'a different company_id sees nothing').toBe('0')

    // Storage locations are tenant-scoped the same way.
    const otherLoc = sqlAsAppUser(
      `SELECT count(*) FROM storage_locations WHERE id = '${QC.storageLocation.id}';`,
      { userId: USERS.qcInspector.id, companyId: '00000000-0000-4000-8000-00000000dead' },
    )
    expect(lastLine(otherLoc.output), 'storage locations are tenant-scoped').toBe('0')
  })
})
