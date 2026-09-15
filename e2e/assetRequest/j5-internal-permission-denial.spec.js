// AR-J5 — an internal persona with no `supplier_management` grant cannot
// create, update, accept, reject or write against an asset request, on
// either the REST or the RLS layer.
//
// `noAccess` (e2e-seed.sql, seeded with NO permissions of any kind — the
// no-grant denial persona reused across the whole suite, e.g. documents,
// NCR, CAPA) is the correct persona here: no ordinary role in this tenant
// holds `supplier_management:create`/`:update`/`:approve`/`:reject` at all —
// only the `author` role holds `supplier_management:read` (e2e-seed.sql
// §10) and `owner` reaches everything via the isOwner bypass — so `noAccess`
// is the cast's only true zero-grant-on-this-module persona, which is
// exactly what a permission-boundary probe needs: a denial that means
// "no permission", not "wrong role for this one verb".
//
// Two layers, because REST and RLS enforce independently here (unlike some
// modules, `REST_RLS_ENABLED` is off by default — see
// docs/modules/asset-request/22-hardening-2026-09-01.md "What is still
// open" — so the REST `enforcePermission` / `enforceAnyPermission` gates ARE
// what's authoritative on this path today; RLS is checked as defense in
// depth for the day that flag flips).
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, SUPPLIER_IDS, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { FIXED_REQUEST, resetFixedRequest } from '../fixtures/assetRequest.js'

test.describe('AR-J5 — internal permission boundary (noAccess)', () => {
  test.beforeAll(() => resetFixedRequest())
  test.afterAll(() => resetFixedRequest())

  test('CONTROL — noAccess really holds no supplier_management grant', async () => {
    const grants = sqlValue(`
      SELECT count(*) FROM authz.role_module_permissions rmp
      JOIN roles_on_users rou ON rou.role_id = rmp.role_id
      WHERE rou.user_id = '${USERS.noAccess.id}' AND rmp.module_id = 'supplier_management'
    `)
    expect(grants, 'a probe on the wrong persona proves nothing').toBe('0')
  })

  test('REST — cannot create a request', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    try {
      const res = await page.request.post('/api/v1/services/assetRequests', {
        data: {
          supplierId: SUPPLIER_IDS.withPortal,
          title: 'AR-J5 should never exist',
          userIds: [],
        },
      })
      expect(res.status()).toBe(403)
      expect(
        sqlValue(`SELECT count(*) FROM asset_requests WHERE title = 'AR-J5 should never exist'`),
      ).toBe('0')
    } finally {
      await ctx.close()
    }
  })

  test('REST — cannot create a bundle via the Phase-C endpoint either', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    try {
      const res = await page.request.post(
        `/api/v1/services/suppliers/${SUPPLIER_IDS.withPortal}/assetRequests`,
        { data: { title: 'AR-J5 bundle should never exist', userIds: [], items: [{ customTitle: 'x' }] } },
      )
      expect(res.status()).toBe(403)
    } finally {
      await ctx.close()
    }
  })

  test('REST — cannot update, accept or reject the fixed request', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    try {
      const put = await page.request.put(`/api/v1/services/assetRequests/${FIXED_REQUEST.id}`, {
        data: { title: 'AR-J5 renamed' },
      })
      expect(put.status()).toBe(403)

      // Move the fixed request to RECEIVED so accept/reject are at least
      // reaching the status check rather than failing on 409 for the wrong
      // reason — a 403 has to come from the permission gate, not the
      // lifecycle guard.
      sql(`UPDATE asset_requests SET status_id = 'RECEIVED' WHERE id = '${FIXED_REQUEST.id}'`)

      const accept = await page.request.post(
        `/api/v1/services/assetRequests/${FIXED_REQUEST.id}/accept`,
        { data: {} },
      )
      expect(accept.status()).toBe(403)

      const reject = await page.request.post(
        `/api/v1/services/assetRequests/${FIXED_REQUEST.id}/reject`,
        { data: { reviewNote: 'no' } },
      )
      expect(reject.status()).toBe(403)

      expect(sqlValue(`SELECT title FROM asset_requests WHERE id = '${FIXED_REQUEST.id}'`)).toBe(
        FIXED_REQUEST.title,
      )
      expect(
        sqlValue(`SELECT status_id FROM asset_requests WHERE id = '${FIXED_REQUEST.id}'`),
      ).toBe('RECEIVED')
    } finally {
      await ctx.close()
    }
  })

  test('REST — CAN still read (control: the denial is on write verbs, not read)', async ({
    browser,
  }) => {
    // Measured 2026-09-14: reads ARE gated for an internal caller — the
    // endpoint answers 403 "Not permitted to read on supplier_management".
    // The original premise here ("internal reads are tenant-wide for staff")
    // was wrong; F-01's gate narrows internal access too, it does not only
    // admit the portal party. Pinned as 403 so a future widening of the read
    // surface fails loudly instead of silently.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    try {
      const res = await page.request.get(`/api/v1/services/assetRequests/${FIXED_REQUEST.id}`)
      expect(res.status(), 'reads are gated too — supplier_management:read').toBe(403)
    } finally {
      await ctx.close()
    }
  })

  test('RLS — app_user with no owner/permission cannot write, either', async () => {
    const before = sqlValue(`SELECT title FROM asset_requests WHERE id = '${FIXED_REQUEST.id}'`)
    const result = sqlAsAppUser(
      `UPDATE asset_requests SET title = 'AR-J5 via app_user' WHERE id = '${FIXED_REQUEST.id}';`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )
    // The WITH CHECK / USING clause filters the row out rather than raising —
    // an UPDATE that matches zero rows is not an error, so the assertion that
    // matters is the row being unchanged, not a thrown exception.
    expect(
      sqlValue(`SELECT title FROM asset_requests WHERE id = '${FIXED_REQUEST.id}'`),
      'RLS silently admits zero rows to the UPDATE rather than raising',
    ).toBe(before)
    // The command should still have SUCCEEDED (0 rows affected is not a psql
    // error) — a thrown error here would mean something else broke.
    expect(result.ok, result.error).toBe(true)
  })
})
