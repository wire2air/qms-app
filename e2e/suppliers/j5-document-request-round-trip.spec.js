// SUP-J5 — Document-request round trip, entirely inside a session.
//
// The replacement for the token upload page. What matters is that the
// authenticated endpoint does everything the public one did — the retirement
// is only safe if nothing was lost:
//
//   • the item flips to RECEIVED and records who uploaded it
//   • an Asset row is created and LINKED to the supplier (SupplierAsset), so
//     the admin Documents tab shows the file immediately, before any accept
//   • the parent request rolls up to RECEIVED once no item is left PENDING
//   • the requester is notified
//
// It also proves the authorization: the endpoint validates the parent
// request's supplier against the caller's own supplierId, so a portal user of
// one supplier cannot upload against another's request.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { SUPPLIER_IDS } from '../fixtures/cast.js'
import { sql, sqlRow, waitForSqlValue } from '../fixtures/db.js'
import { portalContext, seedAssetRequest, cleanup } from '../fixtures/suppliers.js'

const PDF = Buffer.from('%PDF-1.4\n% E2E supplier upload\n')

test.describe('SUP-J5 · the supplier answers a document request in the portal', () => {
  const created = { assetRequestIds: [] }

  test.afterAll(() => cleanup(created))

  test('upload flips the item, links the asset and rolls the request up', async () => {
    const req = seedAssetRequest({ title: 'E2E SUP-J5 ISO Certificate' })
    created.assetRequestIds.push(req.id)

    const ctx = await portalContext()
    try {
      const res = await ctx.post(`/api/v1/services/assetRequestItems/${req.itemId}/upload`, {
        multipart: {
          file: { name: 'iso9001.pdf', mimeType: 'application/pdf', buffer: PDF },
        },
      })
      expect(res.status(), await res.text()).toBe(200)
    } finally {
      await ctx.dispose()
    }

    const item = sqlRow(
      `SELECT status_id, asset_id, uploaded_by FROM asset_request_items WHERE id = '${req.itemId}'`,
    )
    expect(item[0], 'item RECEIVED').toBe('RECEIVED')
    expect(item[1], 'an asset was attached').toBeTruthy()
    expect(item[2], 'the uploader is recorded — the whole point of retiring anonymous upload').toBeTruthy()

    expect(
      Number(
        sql(
          `SELECT count(*) FROM supplier_assets WHERE asset_id = '${item[1]}' AND supplier_id = '${SUPPLIER_IDS.withPortal}'`,
        ).trim(),
      ),
      'the file is linked to the supplier so it surfaces on the Documents tab',
    ).toBe(1)

    // Single-item request: with nothing left PENDING the parent must close.
    await waitForSqlValue(
      `SELECT 1 FROM asset_requests WHERE id = '${req.id}' AND status_id = 'RECEIVED' LIMIT 1`,
      { timeoutMs: 15_000, label: 'parent request rolled up to RECEIVED' },
    )
  })

  test('a portal user cannot upload against another supplier’s request', async () => {
    const req = seedAssetRequest({ title: 'E2E SUP-J5 Foreign Request' })
    created.assetRequestIds.push(req.id)
    // Re-point the request at the supplier this user does NOT belong to.
    sql(
      `UPDATE asset_requests SET supplier_id = '${SUPPLIER_IDS.noPortal}' WHERE id = '${req.id}'`,
    )

    const ctx = await portalContext()
    try {
      const res = await ctx.post(`/api/v1/services/assetRequestItems/${req.itemId}/upload`, {
        multipart: {
          file: { name: 'nope.pdf', mimeType: 'application/pdf', buffer: PDF },
        },
      })
      expect(res.status(), 'must be refused').toBe(403)
    } finally {
      await ctx.dispose()
    }

    expect(
      sqlRow(`SELECT status_id FROM asset_request_items WHERE id = '${req.itemId}'`)[0],
      'the item must be untouched by the refused upload',
    ).toBe('PENDING')
  })
})
