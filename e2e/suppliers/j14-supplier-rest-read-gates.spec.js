// SUP-J14 — the four ungated supplier REST reads (suppliers finding #2 + SUP-N2).
//
// ⚠️ WRITTEN 2026-09-07 ALONGSIDE THE FIX AND NOT YET EXECUTED. The gates are in
// place and are asserted statically by `backend/api/tests/supplierReadRouteGates.test.js`
// (8 tests, green). This is the behavioural half — it needs a live app and a
// seeded database, and the `suppliers` project has not been run since. Treat a
// failure here as "run me first", not as a regression.
//
// ── WHAT THIS PINS ──────────────────────────────────────────────────────────
// Until today, three routes in `routes/suppliers.js` and one in
// `routes/assetRequests.js` carried `requireAuthByApiKey, requireCompanyAccess`
// and no permission gate. `requireCompanyAccess` proves a session and a tenant.
// It does not prove an entitlement.
//
// RLS did not cover for it: `REST_RLS_ENABLED` defaults to false, so Sequelize
// connects as the DB superuser and `suppliers_sel` never fired on this path at
// all. The controllers filter on `companyId` alone.
//
// ── WHY THE EXTERNAL PARTY IS THE POINT ─────────────────────────────────────
// A supplier-portal user (`users.kind = 'EXTERNAL_SUPPLIER'`) holds ZERO
// permission grants, and signs in through the ORDINARY login flow — so their
// session scope is `FULL`, not `PORTAL_ONLY`, and the `PORTAL_ONLY` rejection in
// `requireCompanyAccessWithoutTransaction` never fires on them. They reach these
// routes as an ordinary company member. Ungated, that meant an employee of one
// supplier could enumerate every supplier in the tenant and read a competitor's
// portal-user roster — names, emails, status — over REST.
//
// Half 3 is therefore the severity-setting half, exactly as in SUP-J11.
//
// ── WHY NO SPA JOURNEY COVERS THIS ──────────────────────────────────────────
// The SPA reads suppliers over SyncEngine (GraphQL), where RLS fires
// unconditionally, and calls none of these four routes. A UI-level test would
// have shown green throughout. That is the whole reason the finding survived six
// weeks: the data was one curl away regardless of what the interface did.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, SUPPLIER_IDS, SUPPLIER_USER } from '../fixtures/cast.js'
import { portalContext } from '../fixtures/suppliers.js'

const SUPPLIERS = '/api/v1/services/suppliers'

// Every read this module exposes over REST, and what it leaks ungated.
const READS = [
  [`${SUPPLIERS}`, 'the list — every supplier in the tenant'],
  [`${SUPPLIERS}/${SUPPLIER_IDS.withPortal}`, 'the detail read'],
  [`${SUPPLIERS}/${SUPPLIER_IDS.withPortal}/users`, "a supplier's portal-user roster"],
]

// ── Half 1 · an internal member holding nothing ─────────────────────────────

test.describe('SUP-J14a · a zero-grant internal member', () => {
  test.use({ storageState: AUTH.noAccess })

  for (const [path, what] of READS) {
    test(`is refused ${path.replace(SUPPLIERS, '/suppliers')} — ${what}`, async ({ request }) => {
      const res = await request.get(path, { failOnStatusCode: false })
      expect(res.status(), 'must require supplier_management:read').toBe(403)
    })
  }

  test('SUP-N2 · …and cannot read another supplier’s outstanding-document position', async ({
    request,
  }) => {
    // The fourth route, and the one no document had ever recorded. It answers
    // FOR A NAMED SUPPLIER — the tenant's request-type catalogue annotated with
    // what that supplier has already delivered — so it is guarded by the
    // supplier-scoped `authorizeSupplierAssetRequestRead`, not by a flat
    // `enforcePermission`. Its two siblings on the same router already had it.
    const res = await request.get(
      `${SUPPLIERS}/${SUPPLIER_IDS.withPortal}/availableDocTypes`,
      { failOnStatusCode: false },
    )
    expect(res.status(), 'must require authority over THIS supplier').toBe(403)
  })
})

// ── Half 2 · controls, so a blanket 403 cannot masquerade as a pass ─────────
//
// `author` is the right persona for this and not an arbitrary pick: it is the
// only seeded role granted `supplier_management:read` (e2e-seed.sql §10, granted
// because the NC Supplier picker needs it), and it holds NO other
// supplier_management action. So it proves two things at once — the gate admits
// a reader, and `read` is what the gate asks for rather than a proxy for
// "holds something on this module".

test.describe('SUP-J14b · CONTROL — a supplier_management:read holder still reads', () => {
  test.use({ storageState: AUTH.author })

  for (const [path, what] of READS) {
    test(`admits an authorized caller: ${what}`, async ({ request }) => {
      const res = await request.get(path, { failOnStatusCode: false })
      expect(res.status(), 'the gate must not have broken the feature').toBeLessThan(300)
    })
  }

  test('CONTROL · read is not update — the same caller cannot write', async ({ request }) => {
    // Without this, a gate accidentally mounted as `update` would look identical
    // to a correct one from the reads above, because author would fail both and
    // noAccess would fail both.
    const res = await request.put(`${SUPPLIERS}/${SUPPLIER_IDS.noPortal}`, {
      data: { name: 'E2E SUP-J14 Control Rename' },
      failOnStatusCode: false,
    })
    expect(res.status(), 'author holds read and not update').toBe(403)
  })
})

// ── Half 3 · the external party — the reason the severity is what it is ─────

test.describe('SUP-J14c · the same routes, called by an EXTERNAL_SUPPLIER', () => {
  test('a portal user cannot enumerate suppliers or read a rival’s roster', async () => {
    const ctx = await portalContext()
    try {
      for (const [path, what] of READS) {
        const res = await ctx.get(path, { failOnStatusCode: false })
        expect(res.status(), `external party refused: ${what}`).toBe(403)
      }

      // Including their OWN supplier's roster. That may look harsh, but the
      // route takes an id from the caller and `listSupplierUsers` scopes on
      // companyId alone — there is no "only your own" branch to fall back to,
      // so admitting the self case would admit every case.
      const own = await ctx.get(`${SUPPLIERS}/${SUPPLIER_IDS.withPortal}/users`, {
        failOnStatusCode: false,
      })
      expect(own.status(), 'no self-exemption exists on this route').toBe(403)

      // availableDocTypes is different, and deliberately so. Its guard is
      // `assertCanReadForSupplier`, whose FIRST branch is
      // `isPortalUserFor(req, supplierId)` — so a portal user keeps their own
      // supplier and loses every other one. That asymmetry with the roster
      // route above is real and is the point: one route is supplier-scoped and
      // one is not.
      const mine = await ctx.get(
        `${SUPPLIERS}/${SUPPLIER_IDS.withPortal}/availableDocTypes`,
        { failOnStatusCode: false },
      )
      expect(mine.status(), 'their own supplier stays readable').toBeLessThan(300)

      const rival = await ctx.get(
        `${SUPPLIERS}/${SUPPLIER_IDS.noPortal}/availableDocTypes`,
        { failOnStatusCode: false },
      )
      expect(rival.status(), 'a rival’s does not').toBe(403)
    } finally {
      await ctx.dispose()
    }
  })

  test('SUPPLIER_USER is the account this journey is about', async () => {
    // Cheap guard against the fixture drifting: if the seeded portal user stops
    // being an EXTERNAL_SUPPLIER, every assertion above starts proving something
    // different while still passing.
    expect(SUPPLIER_USER.email).toBe('supplier@e2e.test')
  })
})
