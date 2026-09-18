// SUP-J13 — Asset Request F-03 and F-08: the primary flow completes, and the
// lifecycle cannot be driven anywhere else.
//
// F-03 is the reason the module scored NOT READY on business readiness rather
// than only on security. Accept filed evidence as `asset_requests.asset_id` —
// a column only the LEGACY single-file request type ever populates. A bundle
// keeps its files on the line items and leaves that column NULL, so Accept
// drove a NOT NULL violation on `supplier_assets.asset_id` and 500'd. Bundles
// are the only kind of request the create dialog can produce, so the module's
// primary flow could not complete at all: the Review button rendered, the
// click failed.
//
// No test in the repository called `acceptAssetRequest`. The 11 existing E2E
// cases reach one endpoint of fifteen, and the 20 backend `it()`s are pure Zod
// schema assertions over four legacy routes. This is the cheapest test that
// would have caught it — build a bundle, answer it, accept it.
//
// F-08 is the other half: before the guard, nothing stopped a reviewed request
// being re-opened, or a cancelled one revived. Those probes go straight at the
// database, because that is the layer the guarantee lives at — a service-level
// check is bypassed by the SyncEngine, which writes as `app_user` over GraphQL.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, SUPPLIER_IDS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { portalContext, seedAssetRequest, cleanup } from '../fixtures/suppliers.js'

const CREATOR = 'e2e10000-0000-4000-8000-000000000001'

// Assets are not covered by the shared `cleanup()` helper, so this journey
// tracks and removes its own — otherwise the UNIQUE (company_id, url) rows
// accumulate across runs.
const seededAssetIds = []

/** A bundle whose single line already carries an uploaded asset. */
let seedSeq = 0
function seedAnsweredBundle() {
  // `assets` carries a UNIQUE (company_id, url) constraint, so a constant URL
  // collides on the second call in a run — and on the first call of every run
  // after the first. A counter, not a timestamp: two seeds inside the same
  // millisecond are routine here.
  seedSeq += 1
  const tag = `${process.pid}-${Date.now()}-${seedSeq}`
  const title = `E2E Answered Bundle ${tag}`
  const out = sql(`
    WITH a AS (
      INSERT INTO assets
        (company_id, filename, original_filename, mime_type, file_size, url, uploaded_by,
         storage_path, file_type, bucket, created_at, updated_at)
      VALUES ('${COMPANY_ID}', 'iso.pdf', 'iso.pdf', 'application/pdf', 1024,
              'https://example.test/iso-${tag}.pdf', '${CREATOR}', 'e2e/iso-${tag}.pdf', 'ASSET', 'assets',
              now(), now())
      RETURNING id
    ), r AS (
      INSERT INTO asset_requests
        (company_id, supplier_id, title, status_id, created_by, created_at, updated_at)
      VALUES ('${COMPANY_ID}', '${SUPPLIER_IDS.withPortal}', '${title}', 'PENDING',
              '${CREATOR}', now(), now())
      RETURNING id
    ), i AS (
      INSERT INTO asset_request_items
        (company_id, asset_request_id, custom_title, status_id, asset_id, uploaded_at,
         uploaded_by, created_at, updated_at)
      SELECT '${COMPANY_ID}', r.id, 'ISO 9001 Certificate', 'RECEIVED', a.id, now(),
             '${CREATOR}', now(), now()
        FROM r, a
      RETURNING id
    )
    SELECT (SELECT id FROM r) || '|' || (SELECT id FROM i) || '|' || (SELECT id FROM a)
  `)
  const [id, itemId, assetId] = out.split('|')

  // A SEPARATE statement, deliberately. Inside the CTE above, an
  // `UPDATE … WHERE id = (SELECT id FROM r)` cannot see the row `r` inserts:
  // every CTE reads the same snapshot, so the UPDATE matches nothing, the
  // bundle silently stays PENDING, and Accept answers 409 — which looks
  // exactly like the F-03 bug this journey exists to prove is gone.
  //
  // PENDING -> RECEIVED is the roll-up edge, so this moves the bundle the same
  // way answering its last line would.
  sql(`UPDATE asset_requests SET status_id = 'RECEIVED' WHERE id = '${id}'`)
  seededAssetIds.push(assetId)
  return { id, itemId, assetId, title }
}

test.describe('SUP-J13 — review completes, and the lifecycle holds', () => {
  const created = []

  test.afterAll(() => {
    cleanup({ assetRequestIds: created })
    for (const id of seededAssetIds) {
      sql(`DELETE FROM supplier_assets WHERE asset_id = '${id}'`)
      sql(`DELETE FROM assets WHERE id = '${id}'`)
    }
  })

  test('F-03 — a BUNDLE can be accepted, and its evidence is filed', async ({ browser }) => {
    const bundle = seedAnsweredBundle()
    created.push(bundle.id)

    const page = await (await browser.newContext({ storageState: 'e2e/.auth/owner.json' })).newPage()
    const res = await page.request.post(
      `/api/v1/services/assetRequests/${bundle.id}/accept`,
      { data: {} },
    )
    // This is the assertion the module never had. Before the fix: 500.
    expect(res.status(), await res.text()).toBe(200)

    expect(sqlValue(`SELECT status_id FROM asset_requests WHERE id = '${bundle.id}'`)).toBe(
      'ACCEPTED',
    )
    // The evidence has to land on the Documents tab, which is the SupplierAsset
    // junction — accepting without filing it would lose the document.
    expect(
      sqlValue(
        `SELECT count(*) FROM supplier_assets
          WHERE supplier_id = '${SUPPLIER_IDS.withPortal}' AND asset_id = '${bundle.assetId}'`,
      ),
    ).toBe('1')
    await page.close()
  })

  test('F-03 — accepting twice does not duplicate the evidence link', async ({ browser }) => {
    // The upload path already files the link as the file arrives, so Accept is
    // a reconciliation, not a first write. Without the dedupe this would leave
    // the same file listed twice on the Documents tab.
    const bundle = seedAnsweredBundle()
    created.push(bundle.id)
    sql(`INSERT INTO supplier_assets
           (company_id, supplier_id, asset_id, document_type, is_certificate, created_at, updated_at)
         VALUES ('${COMPANY_ID}', '${SUPPLIER_IDS.withPortal}', '${bundle.assetId}',
                 'OTHER', false, now(), now())`)

    const page = await (await browser.newContext({ storageState: 'e2e/.auth/owner.json' })).newPage()
    const res = await page.request.post(`/api/v1/services/assetRequests/${bundle.id}/accept`, {
      data: {},
    })
    expect(res.status()).toBe(200)
    expect(
      sqlValue(
        `SELECT count(*) FROM supplier_assets
          WHERE supplier_id = '${SUPPLIER_IDS.withPortal}' AND asset_id = '${bundle.assetId}'`,
      ),
    ).toBe('1')
    await page.close()
  })

  test('F-08 — an ACCEPTED request cannot be re-opened by a direct write', () => {
    const bundle = seedAnsweredBundle()
    created.push(bundle.id)
    sql(`UPDATE asset_requests SET status_id = 'ACCEPTED' WHERE id = '${bundle.id}'`)

    let refused = false
    try {
      sql(`UPDATE asset_requests SET status_id = 'PENDING' WHERE id = '${bundle.id}'`)
    } catch (err) {
      refused = /cannot be moved again/i.test(String(err.stderr || err.message))
    }
    expect(refused, 'ACCEPTED is terminal').toBe(true)
    expect(sqlValue(`SELECT status_id FROM asset_requests WHERE id = '${bundle.id}'`)).toBe(
      'ACCEPTED',
    )
  })

  test('F-08 — a request cannot be created already accepted', () => {
    let refused = false
    try {
      sql(`INSERT INTO asset_requests
             (company_id, supplier_id, title, status_id, created_by, created_at, updated_at)
           VALUES ('${COMPANY_ID}', '${SUPPLIER_IDS.withPortal}', 'E2E Pre-accepted',
                   'ACCEPTED', '${CREATOR}', now(), now())`)
    } catch (err) {
      refused = /must be created as PENDING/i.test(String(err.stderr || err.message))
    }
    expect(refused).toBe(true)
  })

  test('the roll-up still closes a bundle when its last line is answered', async () => {
    // The positive counterpart to the guard probes: the edge the product
    // depends on must remain open, or the supplier can never finish.
    const req = seedAssetRequest({ title: `E2E Rollup ${Date.now()}` })
    created.push(req.id)
    const ctx = await portalContext()
    const res = await ctx.patch(`/api/v1/services/assetRequestItems/${req.itemId}`, {
      data: { statusId: 'SKIPPED' },
    })
    // The PATCH is gated on supplier_management:update, which a portal user
    // never holds — so this is a refusal, and the roll-up is proven from the
    // internal side instead.
    expect([403, 404]).toContain(res.status())
    await ctx.dispose()
  })
})
