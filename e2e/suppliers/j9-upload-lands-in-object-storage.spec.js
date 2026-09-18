// SUP-J9 — A supplier's upload actually reaches object storage, and comes back.
//
// SUP-J5 proves the upload endpoint updates the right rows. That is not the
// same as proving the FILE exists: a storage failure that still wrote its
// database row would leave the request looking answered while the evidence was
// gone — the worst shape of bug for a regulated record, because it is invisible
// until an auditor asks for the document years later.
//
// So this journey checks the bytes at three layers:
//   1. the `assets` row the upload wrote (name, size, mime, storage path)
//   2. the object itself, inside MinIO
//   3. a round trip — download it back through the app's own authenticated
//      file route and compare against what was sent
//
// Layer 3 is the one that matters most: it is the path a reviewer actually
// uses, and it fails if storage, the path convention, or auth is wrong.
//
// It also pins the negative: the MIME allowlist must refuse a disallowed type
// BEFORE anything is written, since this endpoint takes files from a party
// outside the company.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sqlRow, sql } from '../fixtures/db.js'
import {
  portalContext,
  seedAssetRequest,
  objectExists,
  objectSize,
  cleanup,
} from '../fixtures/suppliers.js'

// A real (tiny) PDF: distinctive bytes so the round-trip comparison is
// meaningful rather than "some file came back".
const PDF_BYTES = Buffer.from(
  `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\nE2E-SUP-J9-MARKER\n`,
)

function assetRow(assetId) {
  const row = sqlRow(
    `SELECT filename, mime_type, file_size, storage_path, file_type FROM assets WHERE id = '${assetId}'`,
  )
  if (!row) return null
  return {
    filename: row[0],
    mimeType: row[1],
    fileSize: Number(row[2]),
    storagePath: row[3],
    fileType: row[4],
  }
}

test.describe('SUP-J9 · an upload reaches object storage and comes back intact', () => {
  const created = { assetRequestIds: [] }

  test.afterAll(() => cleanup(created))

  test('the file lands in MinIO and downloads back byte-for-byte', async ({ browser }) => {
    test.setTimeout(120_000)

    const req = seedAssetRequest({ title: 'E2E SUP-J9 Certificate of Analysis' })
    created.assetRequestIds.push(req.id)

    const portal = await portalContext()
    let assetId
    try {
      const res = await portal.post(`/api/v1/services/assetRequestItems/${req.itemId}/upload`, {
        multipart: {
          file: { name: 'coa.pdf', mimeType: 'application/pdf', buffer: PDF_BYTES },
        },
      })
      expect(res.status(), await res.text()).toBe(200)
      assetId = sqlRow(`SELECT asset_id FROM asset_request_items WHERE id = '${req.itemId}'`)[0]
      expect(assetId, 'the item is pointed at an asset').toBeTruthy()
    } finally {
      await portal.dispose()
    }

    // ── Layer 1 · the row describes the file that was sent ────────────────
    const asset = assetRow(assetId)
    expect(asset.filename).toBe('coa.pdf')
    expect(asset.mimeType).toBe('application/pdf')
    expect(asset.fileSize, 'recorded size matches the bytes uploaded').toBe(PDF_BYTES.length)
    expect(asset.fileType, 'ASSET uploads are categorised as documents by MIME').toBeTruthy()
    // storage_path is `<companyId>/<filename>` — the convention the download
    // route reconstructs from, so a drift here breaks retrieval silently.
    expect(asset.storagePath).toMatch(new RegExp(`^${COMPANY_ID}/`))

    // ── Layer 2 · the object is really in the bucket ──────────────────────
    expect(
      objectExists(asset.storagePath),
      `no object at ${asset.storagePath} — the row was written but the file was not stored`,
    ).toBe(true)
    expect(
      objectSize(asset.storagePath),
      'the stored object is not empty',
    ).toBeGreaterThanOrEqual(PDF_BYTES.length)

    // ── Layer 3 · a reviewer can fetch it back, unchanged ─────────────────
    // Through the app's own authenticated route, as the internal reviewer —
    // the supplier uploads, the company reads.
    const admin = await browser.newContext({ storageState: AUTH.owner })
    try {
      const dl = await admin.request.get(`/api/v1/files/${asset.storagePath}`)
      expect(dl.status(), 'the reviewer can download the evidence').toBe(200)
      const body = await dl.body()
      expect(body.equals(PDF_BYTES), 'the bytes come back exactly as sent').toBe(true)
    } finally {
      await admin.close()
    }
  })

  test('a disallowed file type is refused before anything is written', async () => {
    const req = seedAssetRequest({ title: 'E2E SUP-J9 Rejected Upload' })
    created.assetRequestIds.push(req.id)

    const assetsBefore = Number(
      sql(`SELECT count(*) FROM assets WHERE company_id = '${COMPANY_ID}'`).trim(),
    )

    const portal = await portalContext()
    try {
      const res = await portal.post(`/api/v1/services/assetRequestItems/${req.itemId}/upload`, {
        multipart: {
          file: {
            name: 'payload.html',
            mimeType: 'text/html',
            buffer: Buffer.from('<script>alert(1)</script>'),
          },
        },
      })
      expect(res.status(), 'text/html is not on the allowlist').toBe(400)
      expect(await res.text()).toMatch(/invalid file type/i)
    } finally {
      await portal.dispose()
    }

    // The refusal must be total: no asset row, and the item still open. A
    // rejection that had already stored the file would leave an orphan in the
    // bucket that nothing points at.
    expect(
      Number(sql(`SELECT count(*) FROM assets WHERE company_id = '${COMPANY_ID}'`).trim()),
      'no asset row was created',
    ).toBe(assetsBefore)
    expect(
      sqlRow(`SELECT status_id, asset_id FROM asset_request_items WHERE id = '${req.itemId}'`),
    ).toEqual(['PENDING', ''])
  })

  test('an upload with no file at all is refused', async () => {
    const req = seedAssetRequest({ title: 'E2E SUP-J9 Empty Upload' })
    created.assetRequestIds.push(req.id)

    const portal = await portalContext()
    try {
      const res = await portal.post(`/api/v1/services/assetRequestItems/${req.itemId}/upload`, {
        multipart: { note: 'no file attached' },
      })
      expect(res.status()).toBe(400)
      expect(await res.text()).toMatch(/no file uploaded/i)
    } finally {
      await portal.dispose()
    }
  })
})
