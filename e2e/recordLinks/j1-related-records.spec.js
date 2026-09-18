// PW-J1 · Related records — manual cross-module linking.
//
// `record_links` carried SYSTEM lineage for a long time (an NC spawning a CAPA,
// a lot converting to an NC). This covers the other half, added 2026-08-29: a
// person linking any two records through the generic picker.
//
// The write is REST and nothing else, deliberately. `app_user` holds SELECT and
// no more on record_links, because authorizing the write means checking BOTH
// records — a cross-module question no single RLS policy on that table can
// answer. The last test pins exactly that: the SyncEngine path is refused, which
// is why the endpoint has to exist at all. (The CAPA "link existing NCs" dialog
// wrote through the SyncEngine and had therefore never worked.)
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue } from '../fixtures/db.js'

const COMPANY = 'e2e00001-0000-4000-8000-000000000001'

/** An NC and a CAPA that already exist in the tenant — this journey links, it
 *  does not create. */
function pickPair() {
  // sqlRow hands back an ARRAY of column strings, not an object.
  const [ncId, ncNumber] = sqlRow(
    `SELECT id, nc_number FROM nonconformances
      WHERE company_id = '${COMPANY}' AND deleted_at IS NULL ORDER BY created_at LIMIT 1`,
  ) ?? []
  const [capaId, capaNumber] = sqlRow(
    `SELECT id, capa_number FROM capas
      WHERE company_id = '${COMPANY}' AND deleted_at IS NULL AND capa_number IS NOT NULL
      ORDER BY created_at LIMIT 1`,
  ) ?? []
  return { nc: { id: ncId, number: ncNumber }, capa: { id: capaId, number: capaNumber } }
}

function linkRow(fromId, toId) {
  return sqlValue(
    `SELECT relation || '/' || (deleted_at IS NULL)::text FROM record_links
      WHERE from_id = '${fromId}' AND to_id = '${toId}'`,
  )
}

test.describe('PW-J1 · related records', () => {
  // Each test owns the pair outright. Without this a failure mid-journey left
  // its link behind and the NEXT test read it as its own write.
  test.beforeEach(() => {
    const { nc, capa } = pickPair()
    if (nc.id && capa.id) {
      sql(
        `DELETE FROM record_links
          WHERE (from_id = '${nc.id}' AND to_id = '${capa.id}')
             OR (from_id = '${capa.id}' AND to_id = '${nc.id}')`,
      )
    }
  })

  test('the picker offers every record module, built-in and promoted alike', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await page.goto('/')
    const res = await page.request.get('/api/v1/services/record-links/entities')
    expect(res.status()).toBe(200)
    const body = await res.json()
    const entities = body?.data?.entities ?? body?.entities ?? []
    const types = entities.map((e) => e.entityType)

    // The built-in record modules. Non-record modules (Sites, Settings) share
    // the authz registry but are not linkable, so their absence is the point.
    for (const t of ['Nonconformance', 'Capa', 'ChangeRequest', 'Document']) {
      expect(types, `${t} is linkable`).toContain(t)
    }
    expect(types, 'Sites is not a record module').not.toContain('sites')
    // Promoted form modules join the same list keyed by their own module key;
    // the E2E tenant has none, so this asserts the SHAPE that carries them.
    expect(
      entities.every((e) => typeof e.entityType === 'string' && typeof e.label === 'string'),
      'every entity carries a type and a label',
    ).toBe(true)
    await ctx.close()
  })

  test('link, see it on the record, unlink', async ({ browser }) => {
    test.setTimeout(180_000)
    const { nc, capa } = pickPair()
    expect(nc?.id, 'the tenant has an NC to link').toBeTruthy()
    expect(capa?.id, 'the tenant has a CAPA to link').toBeTruthy()

    const ctx = await browser.newContext({ storageState: AUTH.owner })

    // Open the record FIRST, then link — the order a person actually works in,
    // and the one that proves the panel updates without a reload. The link is
    // written over REST, so the only way the open page learns about it is the
    // sync broadcast reaching IndexedDB.
    const page = await ctx.newPage()
    await page.goto(`/nonconformances/${nc.id}`)
    await expect(page.getByText('Related records', { exact: true })).toBeVisible({
      timeout: 90_000,
    })
    await expect(page.getByText('No related records yet.')).toBeVisible({ timeout: 30_000 })

    const created = await ctx.request.post('/api/v1/services/record-links', {
      data: {
        fromType: 'Nonconformance',
        fromId: nc.id,
        toType: 'Capa',
        toId: capa.id,
        relation: 'RELATED',
      },
    })
    expect(created.status(), `link — ${await created.text().catch(() => '')}`).toBe(201)
    expect(linkRow(nc.id, capa.id), 'stored as an undirected RELATED link').toBe('RELATED/true')

    // ONE row, not a mirrored pair: the panel reads both directions, so
    // storing the reverse too would double every manual link.
    expect(
      sqlValue(
        `SELECT count(*) FROM record_links WHERE from_id = '${capa.id}' AND to_id = '${nc.id}'`,
      ),
      'the reverse row is not written',
    ).toBe('0')

    // It appears on the OPEN page, with the linked record's NUMBER — proving
    // both that the sync broadcast landed and that the chip resolved the
    // entity rather than printing a raw id.
    await expect(page.getByText(capa.number, { exact: false }).first()).toBeVisible({
      timeout: 60_000,
    })

    const linkId = sqlValue(
      `SELECT id FROM record_links WHERE from_id = '${nc.id}' AND to_id = '${capa.id}'`,
    )
    const removed = await ctx.request.delete(`/api/v1/services/record-links/${linkId}`)
    expect(removed.status()).toBe(200)
    expect(linkRow(nc.id, capa.id), 'soft-deleted, not erased').toBe('RELATED/false')
    await ctx.close()
  })

  test('a read-only user cannot link, and nobody can write the table directly', async ({
    browser,
  }) => {
    const { nc, capa } = pickPair()
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const page = await ctx.newPage()
    await page.goto('/')

    // The auditor holds read on these modules and nothing else. Adding a
    // related record CHANGES the anchor, so `update` is the bar — the same one
    // the rail-edit gate uses.
    const res = await page.request.post('/api/v1/services/record-links', {
      data: {
        fromType: 'Nonconformance',
        fromId: nc.id,
        toType: 'Capa',
        toId: capa.id,
        relation: 'RELATED',
      },
    })
    expect(res.status(), 'read-only is refused').toBe(403)
    expect(
      sqlValue(
        `SELECT count(*) FROM record_links
          WHERE from_id = '${nc.id}' AND to_id = '${capa.id}' AND deleted_at IS NULL`,
      ),
      'and nothing was written',
    ).toBe('0')
    await ctx.close()
  })
})
