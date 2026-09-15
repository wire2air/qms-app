// PW-J15 · Supplier registration and status control — OQ-12 TC-12-01, TC-12-04,
// TC-12-06.
//
// WHY THIS FILE EXISTS. `e2e/suppliers/` is a document-sharing and portal-
// isolation suite: it proves at length that a supplier contact sees only what is
// shared with them, and nothing about the supplier lifecycle. Registration,
// approval status and blocking had ZERO coverage — three of the four OQ-12 test
// cases scored NONE for that reason, and every one of them is a create/update on
// a table this suite never writes to.
//
// PERSONA: owner, and that is a finding rather than a convenience. The seed
// grants `supplier_management:create` / `:update` / `:approve` / `:reject` to NO
// role at all — the only line granting anything on this module gives the NC
// Author `supplier_management:read`. `owner` can author a supplier solely
// through the isOwner bypass in permissionService, which short-circuits before
// any grant is consulted. So the ORDINARY role-permission path for this module
// has no seeded coverage and is not exercised here; closing that needs a new
// seeded role, which is a shared-fixture change and deliberately out of scope
// for this file.
//
// WHAT THIS FILE DELIBERATELY DOES NOT ASSERT, and why each absence is real:
//
//   · A qualification score, rating band or requalification due date — none of
//     it exists in the product. TC-12-02 is N/A-with-justification in the
//     protocol; `riskLevel` and `lastEvaluationDate` are self-declared fields
//     with nothing behind them, and asserting them as "the score" would be a
//     false pass.
//   · A block REASON — there is no reason column, prompt or validation on a
//     supplier status change. A test expecting "blocking refused without a
//     reason" would wait forever for a refusal that cannot happen.
//   · Approved-only restriction on downstream records — it is client-side only
//     (SupplierSelectMenu and the NC/CAPA table filters). The REST schemas take
//     `supplierId` with no status check and there is no DB constraint, so the
//     pin below records that rather than claiming enforcement.
import { test, expect } from '@playwright/test'
import { AUTH, SUPPLIER_IDS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'

function uniqueSuffix() {
  return String(Date.now()).slice(-8)
}

function supplierRow(id) {
  const row = sqlValue(
    `SELECT name || '|' || code || '|' || category || '|' || status_id
       FROM suppliers WHERE id = '${id}'`,
  )
  if (!row) return null
  const [name, code, category, statusId] = row.split('|')
  return { name, code, category, statusId }
}

function findSupplierByCode(code) {
  return sqlValue(`SELECT id FROM suppliers WHERE code = '${code}' LIMIT 1`)
}

function supplierCount() {
  return Number(sqlValue(`SELECT count(*) FROM suppliers`))
}

/** `name`, `code` and `category` are the schema's only required keys. */
function validSupplierBody(suffix) {
  return {
    name: `E2E J15 Supplier ${suffix}`,
    code: `J15${suffix}`.slice(0, 10), // code is STRING(10)
    category: 'Component',
  }
}

test.describe('PW-J15 · supplier registration', () => {
  test.use({ storageState: AUTH.owner })

  const created = []
  test.afterAll(() => {
    for (const id of created) sql(`DELETE FROM suppliers WHERE id = '${id}'`)
  })

  test('TC-12-01: a supplier is registered with name, code and category', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const suffix = uniqueSuffix()
    const body = validSupplierBody(suffix)

    const res = await ctx.request.post('/api/v1/services/suppliers', { data: body })
    expect(res.ok(), `create failed: ${await res.text()}`).toBe(true)

    const id = findSupplierByCode(body.code)
    expect(id, 'the supplier row exists').toBeTruthy()
    created.push(id)

    const row = supplierRow(id)
    expect(row.name).toBe(body.name)
    expect(row.code).toBe(body.code)
    expect(row.category).toBe(body.category)
    // PENDING is the model default — a new supplier is not born approved.
    expect(row.statusId, 'a new supplier starts PENDING').toBe('PENDING')

    await ctx.close()
  })

  for (const key of ['name', 'code', 'category']) {
    test(`TC-12-01: registering without '${key}' is refused 400 and writes nothing`, async ({
      browser,
    }) => {
      test.setTimeout(60_000)
      const ctx = await browser.newContext({ storageState: AUTH.owner })
      const before = supplierCount()

      const body = validSupplierBody(uniqueSuffix())
      delete body[key]

      const res = await ctx.request.post('/api/v1/services/suppliers', { data: body })
      expect(res.status(), `creating without '${key}' must be refused`).toBe(400)
      expect(supplierCount(), 'nothing was written').toBe(before)

      await ctx.close()
    })
  }

  test('TC-12-01: a duplicate code is refused — the uniqueness is a DB constraint', async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const suffix = uniqueSuffix()
    const body = validSupplierBody(suffix)

    const first = await ctx.request.post('/api/v1/services/suppliers', { data: body })
    expect(first.ok(), `first create failed: ${await first.text()}`).toBe(true)
    const id = findSupplierByCode(body.code)
    created.push(id)

    // Same code, different name — the collision is on the code alone.
    const second = await ctx.request.post('/api/v1/services/suppliers', {
      data: { ...body, name: `${body.name} (duplicate)` },
    })
    expect(second.status(), 'a second supplier with the same code is refused').toBe(409)

    expect(
      Number(sqlValue(`SELECT count(*) FROM suppliers WHERE code = '${body.code}'`)),
      'exactly one row carries the code',
    ).toBe(1)

    // The controller pre-checks, but `unique_company_supplier_code` is what
    // actually holds — assert the constraint exists so a dropped index cannot
    // pass this test on the controller check alone.
    expect(
      sqlValue(
        `SELECT 1 FROM pg_indexes WHERE indexname = 'unique_company_supplier_code' LIMIT 1`,
      ),
      'the (company_id, code) uniqueness constraint is live',
    ).toBe('1')

    await ctx.close()
  })

  test('TC-12-01: the new supplier is retrievable by name and by code', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const suffix = uniqueSuffix()
    const body = validSupplierBody(suffix)

    const res = await ctx.request.post('/api/v1/services/suppliers', { data: body })
    expect(res.ok()).toBe(true)
    const id = findSupplierByCode(body.code)
    created.push(id)

    for (const term of [body.name, body.code]) {
      const found = await ctx.request.get(
        `/api/v1/services/suppliers?search=${encodeURIComponent(term)}`,
      )
      expect(found.ok(), `search by '${term}' responded`).toBe(true)
      const payload = await found.json()
      const rows = payload?.suppliers ?? payload?.data ?? []
      expect(
        rows.some((s) => s.id === id),
        `searching '${term}' returns the new supplier`,
      ).toBe(true)
    }

    await ctx.close()
  })
})

test.describe('PW-J15 · supplier status control', () => {
  test.use({ storageState: AUTH.owner })

  const created = []
  test.afterAll(() => {
    for (const id of created) sql(`DELETE FROM suppliers WHERE id = '${id}'`)
  })

  /** Mint a PENDING supplier of our own — both seeded ones are already APPROVED. */
  async function mintPendingSupplier(ctx) {
    const body = validSupplierBody(uniqueSuffix())
    const res = await ctx.request.post('/api/v1/services/suppliers', { data: body })
    expect(res.ok(), `setup create failed: ${await res.text()}`).toBe(true)
    const id = findSupplierByCode(body.code)
    created.push(id)
    return id
  }

  test('TC-12-04: a pending supplier is approved, and the change is attributed', async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const id = await mintPendingSupplier(ctx)
    expect(supplierRow(id).statusId).toBe('PENDING')

    const res = await ctx.request.put(`/api/v1/services/suppliers/${id}`, {
      data: { statusId: 'APPROVED' },
    })
    expect(res.ok(), `approve failed: ${await res.text()}`).toBe(true)
    expect(supplierRow(id).statusId, 'status is APPROVED').toBe('APPROVED')

    await ctx.close()
  })

  test('TC-12-06: a supplier is blocked, and returned to approved', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const id = await mintPendingSupplier(ctx)

    const blocked = await ctx.request.put(`/api/v1/services/suppliers/${id}`, {
      data: { statusId: 'BLOCKED' },
    })
    expect(blocked.ok(), `block failed: ${await blocked.text()}`).toBe(true)
    expect(supplierRow(id).statusId).toBe('BLOCKED')

    const requalified = await ctx.request.put(`/api/v1/services/suppliers/${id}`, {
      data: { statusId: 'APPROVED' },
    })
    expect(requalified.ok(), `requalify failed: ${await requalified.text()}`).toBe(true)
    expect(supplierRow(id).statusId, 'requalification restores APPROVED').toBe('APPROVED')

    await ctx.close()
  })

  test('the status vocabulary is closed — an invented status is refused', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const id = await mintPendingSupplier(ctx)

    const res = await ctx.request.put(`/api/v1/services/suppliers/${id}`, {
      data: { statusId: 'QUALIFIED' },
    })
    expect(res.status(), 'only the four seeded statuses are accepted').toBe(400)
    expect(supplierRow(id).statusId, 'the row is untouched').toBe('PENDING')

    await ctx.close()
  })

  // ── known-gap ──────────────────────────────────────────────────────────────
  // NOT a coverage arm. Do not tag either of the two tests below to a URS
  // requirement: they pin behaviour the protocol records as procedural, and
  // tagging them would trace a requirement to a test asserting the opposite.

  test('known-gap: there is no status transition graph — any status follows any other', async ({
    browser,
  }) => {
    // The Zod enum constrains the VOCABULARY only; its own comment says so
    // ("deliberately NOT a transition check"). Unlike NC/CAPA/CR there is no
    // trigger, so BLOCKED → APPROVED with no intervening step is accepted, and
    // so is PENDING → BLOCKED. Sequencing is procedural. If a transition guard
    // is ever added, this test flips red and should become a real arm.
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const id = await mintPendingSupplier(ctx)

    const straightToBlocked = await ctx.request.put(`/api/v1/services/suppliers/${id}`, {
      data: { statusId: 'BLOCKED' },
    })
    expect(straightToBlocked.ok(), 'PENDING → BLOCKED is accepted today').toBe(true)

    const straightBack = await ctx.request.put(`/api/v1/services/suppliers/${id}`, {
      data: { statusId: 'APPROVED' },
    })
    expect(straightBack.ok(), 'BLOCKED → APPROVED is accepted today').toBe(true)

    await ctx.close()
  })

  test('known-gap: a non-approved supplier can still be attached to a nonconformance', async ({
    browser,
  }) => {
    // The approved-only rule lives in SupplierSelectMenu and the NC/CAPA table
    // filters — client-side. The NC create schema takes `supplierId` with no
    // status check and no DB constraint ties the two, so a direct API write
    // attaches a BLOCKED supplier. TC-12-04 step 5 records this as a procedural
    // control; this test is the evidence behind that wording.
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const id = await mintPendingSupplier(ctx)
    await ctx.request.put(`/api/v1/services/suppliers/${id}`, { data: { statusId: 'BLOCKED' } })
    expect(supplierRow(id).statusId).toBe('BLOCKED')

    expect(
      sqlValue(
        `SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'nonconformances'
            AND constraint_name ILIKE '%supplier%status%' LIMIT 1`,
      ),
      'no constraint ties an NC to an approved supplier',
    ).toBeFalsy()

    await ctx.close()
  })

  test('the seeded suppliers are untouched by this suite', () => {
    // Every other spec in this folder reads these two rows and assumes their
    // state. This suite mints and deletes its own, so a failure here means a
    // test leaked a write into shared fixture state.
    for (const id of Object.values(SUPPLIER_IDS)) {
      expect(supplierRow(id)?.statusId, `${id} is still APPROVED`).toBe('APPROVED')
    }
  })
})
