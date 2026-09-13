// EQ-J5 — the instrument register does not cross tenants.
//
// WHY THIS FILE EXISTS. Equipment is the one module in the product whose SELECT
// policy is nothing BUT the tenant predicate:
//
//   equipment_sel  USING (company_id = authz.current_company_id())
//
// `calibration_equipment` has no `read` action in authz.module_actions
// (migration 20260810170000 dropped it), so there is no permission arm, no
// scope arm and no ownership arm to fall back on. Every other module in this
// suite has a second line of defence if the tenant predicate is ever weakened
// by a refactor; this one has none. The `company_id` comparison IS the
// isolation, which is precisely why it earns a journey of its own.
//
// Both directions, and at BOTH layers:
//   * the REST controller (`req.companyId` from the session, not from the body)
//   * `app_user` under RLS — the layer a raw GraphQL mutation reaches
//
// Both directions matter because a policy that had quietly stopped matching
// ANYTHING would hide E2ELAB's instruments from Otto and look like a perfect
// guard, while actually having broken the register for everyone. So each
// denial is paired with the same read succeeding for the tenant that owns it.
import { test, expect } from '@playwright/test'
import { ALT_BASE_URL, ALT_COMPANY_ID, ALT_USERS, AUTH, COMPANY_ID, EQUIPMENT, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { createPersonaPool, findEquipment, openRegister } from '../fixtures/equipment.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const lastLine = (out) => out.trim().split('\n').pop().trim()
const countVisible = (userId, companyId, equipmentId) =>
  Number(
    lastLine(
      sqlAsAppUser(`SELECT count(*) FROM equipment WHERE id = '${equipmentId}';`, {
        userId,
        companyId,
      }).output,
    ),
  )

test.describe('EQ-J5 · cross-tenant isolation', () => {
  test('the fixture really is on both sides of the boundary', async () => {
    // The premise, asserted rather than assumed. Without an instrument in
    // E2EALT, "Otto sees no E2ELAB instruments" would be indistinguishable from
    // "Otto's register is empty", and every assertion below would pass against
    // a broken product.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM equipment WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL`,
        ),
      ),
      'E2ELAB holds the seeded register',
    ).toBeGreaterThanOrEqual(6)
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM equipment WHERE company_id = '${ALT_COMPANY_ID}' AND deleted_at IS NULL`,
        ),
      ),
      'E2EALT holds one of its own',
    ).toBeGreaterThanOrEqual(1)
  })

  test('the E2EALT owner’s register shows their instrument and none of E2ELAB’s', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    try {
      // Anchor the hydration wait on the ALT tenant's own row: waiting for an
      // E2ELAB name would be waiting for the thing under test never to happen,
      // which is a 60-second pass rather than an assertion.
      await openRegister(page, { anchorName: EQUIPMENT.alt.name })

      // Otto is a COMPANY OWNER, so `authz.current_is_owner()` short-circuits
      // every permission arm he touches. If tenancy leaked anywhere, this is
      // the session that would see it.
      for (const seeded of [
        EQUIPMENT.calDue,
        EQUIPMENT.calExpired,
        EQUIPMENT.pmDue,
        EQUIPMENT.undeletable,
      ]) {
        await expect(
          page.getByText(seeded.name, { exact: false }),
          `E2ELAB's "${seeded.code}" must not reach the other tenant's register`,
        ).toHaveCount(0)
      }
    } finally {
      await ctx.close()
    }
  })

  test('REST answers 404, not 403, for an instrument in the other tenant', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    try {
      // `getEquipment` scopes by { id, companyId } and `findOrFail` raises
      // NotFound, so the other tenant's row is not merely unreadable — it does
      // not exist. That distinction is the one worth pinning: a 403 would
      // confirm the uuid names something real.
      const foreign = await page.request.get(
        `${ALT_BASE_URL}/api/v1/services/equipment/${EQUIPMENT.calDue.id}`,
      )
      expect(foreign.status(), 'an E2ELAB instrument is invisible to E2EALT').toBe(404)

      // The control: the same endpoint, the same session, their OWN row.
      const own = await page.request.get(
        `${ALT_BASE_URL}/api/v1/services/equipment/${EQUIPMENT.alt.id}`,
      )
      expect(own.status(), 'the endpoint itself works for this session').toBe(200)
      expect((await own.json())?.equipment?.code).toBe(EQUIPMENT.alt.code)

      // The list endpoint is the surface a scraper would actually use.
      const list = await page.request.get(`${ALT_BASE_URL}/api/v1/services/equipment`)
      expect(list.status()).toBe(200)
      const codes = ((await list.json())?.equipment ?? []).map((e) => e.code)
      expect(codes, 'the alt register lists its own instrument').toContain(EQUIPMENT.alt.code)
      expect(codes, 'and nothing from E2ELAB').not.toContain(EQUIPMENT.calDue.code)
      expect(codes).not.toContain(EQUIPMENT.undeletable.code)
    } finally {
      await ctx.close()
    }
  })

  test('a write aimed across the boundary reaches nothing, on either path', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    try {
      const before = findEquipment(EQUIPMENT.undeletable.id)
      const calBefore = findEquipment(EQUIPMENT.calExpired.id)

      // REST: the PATCH resolves the row by (id, companyId) before it applies a
      // single field, so an owner of the wrong tenant gets a 404 — not a
      // partial write.
      const patched = await page.request.patch(
        `${ALT_BASE_URL}/api/v1/services/equipment/${EQUIPMENT.undeletable.id}`,
        { data: { name: 'Renamed from the other tenant' } },
      )
      expect(patched.status()).toBe(404)

      // …and record-calibration, which is the endpoint that moves a date the
      // QC capture gate reads. A cross-tenant call here would not merely edit a
      // record, it would silently re-open an instrument for production use.
      const recalibrated = await page.request.post(
        `${ALT_BASE_URL}/api/v1/services/equipment/${EQUIPMENT.calExpired.id}/record-calibration`,
        { data: {} },
      )
      expect(recalibrated.status()).toBe(404)

      const after = findEquipment(EQUIPMENT.undeletable.id)
      expect(after.name, 'nothing was renamed').toBe(before.name)
      // FIXED 2026-09-08: this compared `findEquipment(calExpired).lastCalibratedAt`
      // to a second read of the SAME expression, so it could not fail — the
      // instrument could have been recalibrated across the tenant boundary and
      // the assertion would still have been green. The baseline now comes from
      // before the request, like the rename above it.
      expect(
        findEquipment(EQUIPMENT.calExpired.id).lastCalibratedAt,
        'and no calibration was stamped',
      ).toBe(calBefore.lastCalibratedAt)
    } finally {
      await ctx.close()
    }
  })

  test('RLS holds the same line for a raw app_user session', async () => {
    // REST derives companyId from the session, so its isolation is only as good
    // as the session. `app_user` is the layer where a hand-rolled GraphQL
    // mutation lands, and there the company GUC is the ONLY thing standing
    // between the two registers.
    expect(
      countVisible(ALT_USERS.owner.id, ALT_COMPANY_ID, EQUIPMENT.calDue.id),
      'E2EALT cannot see an E2ELAB instrument',
    ).toBe(0)
    expect(
      countVisible(ALT_USERS.owner.id, ALT_COMPANY_ID, EQUIPMENT.alt.id),
      'but does see its own — so the policy is matching, not merely empty',
    ).toBe(1)

    expect(
      countVisible(USERS.qcAuthor.id, COMPANY_ID, EQUIPMENT.alt.id),
      'and the register owner in E2ELAB cannot see E2EALT’s',
    ).toBe(0)
    expect(
      countVisible(USERS.qcAuthor.id, COMPANY_ID, EQUIPMENT.calDue.id),
      'while seeing their own',
    ).toBe(1)

    // A company GUC that names no tenant at all admits nothing — the same probe
    // IL-J7 makes, and the one that proves the predicate is being evaluated
    // rather than short-circuited.
    expect(
      countVisible(USERS.qcAuthor.id, '00000000-0000-4000-8000-00000000dead', EQUIPMENT.calDue.id),
      'an unknown company GUC sees nothing',
    ).toBe(0)
  })

  // ── OBSERVATION, deliberately not an assertion of correctness ──────────────
  //
  // MEASURED 2026-09-07: `equipment_sel` is ONE OF ONLY NINE SELECT policies in
  // the schema (out of 224) whose USING clause is nothing but
  // `company_id = authz.current_company_id()` — no permission arm, no scope arm,
  // no ownership arm. The others are document_sites, document_templates,
  // form_templates, qc_inspection_settings, qc_inspection_templates,
  // rca_templates, risk_assessment_templates and workflows.
  //
  // The practical consequence is visible in this probe: hand `app_user` the
  // E2ELAB company GUC together with a user id from ANOTHER tenant and the
  // register opens, where the same manoeuvre against `sites` returns nothing
  // (sites_sel additionally asks has_permission('sites','read'), and role grants
  // are keyed by company, so the foreign user fails it).
  //
  // THIS IS NOT A LIVE ESCALATION and the test below does not treat it as one.
  // The (user, company) GUC pair is set server-side by `requireCompanyAccess` /
  // `api/config/authzPgSettings.js` from the authenticated session; no client
  // chooses it, and the pair is always internally consistent in production. It
  // is a missing layer of defence in depth, and it is a direct consequence of
  // `calibration_equipment` having no `read` action to gate on (migration
  // 20260810170000 dropped it) — the register is deliberately tenant-readable.
  //
  // It is pinned here rather than left undocumented so that the day someone
  // registers `calibration_equipment:read` and gives equipment_sel a permission
  // arm, this test fails and says exactly why — which is the moment the
  // module's security review needs revisiting, not a regression.
  test('OBSERVATION · equipment_sel carries the tenant predicate and nothing else', async () => {
    const foreignUserLabGuc = countVisible(
      ALT_USERS.owner.id,
      COMPANY_ID,
      EQUIPMENT.calDue.id,
    )
    expect(
      foreignUserLabGuc,
      'equipment_sel has no second predicate today — if this is now 0, a permission arm was added and docs/modules/equipment/11-security-review.md needs updating',
    ).toBe(1)

    // The contrast that gives the number above its meaning: `sites` refuses the
    // identical manoeuvre.
    const sitesUnderSameSwap = Number(
      lastLine(
        sqlAsAppUser(`SELECT count(*) FROM sites WHERE company_id = '${COMPANY_ID}';`, {
          userId: ALT_USERS.owner.id,
          companyId: COMPANY_ID,
        }).output,
      ),
    )
    expect(
      sitesUnderSameSwap,
      'sites_sel asks has_permission on top of the tenant match, so the same swap yields nothing',
    ).toBe(0)
  })
})
