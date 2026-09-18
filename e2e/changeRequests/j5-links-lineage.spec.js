// PW-J5 · links + lineage (P2).
//
// Two distinct relationship tables:
//   change_request_links — owner-curated "affected records" (API-13/14).
//   record_links         — automatic lineage written by linkRecords() when a
//                          CR is spawned from an NC/CAPA (sourceType+sourceId).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { createCr, uniqueTitle } from '../fixtures/changeRequests.js'
import { findCrByTitle, findNcByTitle, sqlValue, sqlRow } from '../fixtures/db.js'
import { raiseNc, uniqueTitle as uniqueNcTitle } from '../fixtures/nonconformances.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J5 · change-request links', () => {
  test('owner adds a link, lists it, then removes it', async ({ page }) => {
    test.setTimeout(120_000)
    const title = uniqueTitle('J5-link')
    await createCr(page, title)
    const cr = findCrByTitle(title)

    // Link a document (target rows are free-form type+id pointers).
    const targetId = '11111111-2222-4333-8444-555555555555'
    const addRes = await page.request.post(`/api/v1/services/changeRequests/${cr.id}/links`, {
      data: {
        targetType: 'Document',
        targetId,
        linkRole: 'AFFECTED',
        notes: 'E2E — SOP affected by this change.',
      },
    })
    expect(addRes.ok(), await addRes.text()).toBeTruthy()
    const linkId = (await addRes.json()).link.id

    const row = sqlRow(
      `SELECT target_type, target_id, link_role, created_by FROM change_request_links WHERE id = '${linkId}'`,
    )
    expect(row[0]).toBe('Document')
    expect(row[1]).toBe(targetId)
    expect(row[2]).toBe('AFFECTED')
    expect(row[3], 'link is attributed to its creator').toBe(USERS.author.id)

    // GET returns it.
    const listRes = await page.request.get(`/api/v1/services/changeRequests/${cr.id}/links`)
    expect(listRes.ok()).toBeTruthy()
    const links = (await listRes.json()).links
    expect(links.map((l) => l.id)).toContain(linkId)

    // DELETE removes it (paranoid — assert it leaves the live set).
    const delRes = await page.request.delete(
      `/api/v1/services/changeRequests/${cr.id}/links/${linkId}`,
    )
    expect(delRes.ok()).toBeTruthy()

    const afterRes = await page.request.get(`/api/v1/services/changeRequests/${cr.id}/links`)
    expect((await afterRes.json()).links.map((l) => l.id)).not.toContain(linkId)
  })

  test('negative: removing an unknown link id is rejected 400', async ({ page }) => {
    test.setTimeout(90_000)
    const title = uniqueTitle('J5-badlink')
    await createCr(page, title)
    const cr = findCrByTitle(title)

    const res = await page.request.delete(
      `/api/v1/services/changeRequests/${cr.id}/links/99999999-8888-4777-8666-555555555555`,
    )
    expect(res.status()).toBe(400)
  })

  test('a CR spawned from an NC records the lineage link', async ({ page }) => {
    test.setTimeout(150_000)
    // Source NC first.
    const ncTitle = uniqueNcTitle('J5-source')
    await raiseNc(page, ncTitle)
    const nc = findNcByTitle(ncTitle)
    expect(nc).toBeTruthy()

    // The create page reads ?source=NC&sourceId=… and seeds the CR's
    // sourceType/sourceId, which createChangeRequest turns into a record_links
    // row via linkRecords().
    const title = uniqueTitle('J5-lineage')
    await page.goto(`/change-requests/create?source=NC&sourceId=${nc.id}`)
    await page.getByPlaceholder('Short summary of the change').fill(title)
    await page.getByRole('button', { name: 'Create Draft' }).click()
    await expect(page).toHaveURL(/\/change-requests\/(?!create)[0-9a-f-]{36}/, { timeout: 45_000 })

    const cr = findCrByTitle(title)
    expect(cr).toBeTruthy()
    expect(sqlValue(`SELECT source_type FROM change_requests WHERE id = '${cr.id}'`)).toBe('NC')
    expect(sqlValue(`SELECT source_id FROM change_requests WHERE id = '${cr.id}'`)).toBe(nc.id)

    // Lineage: Nonconformance → ChangeRequest.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM record_links
            WHERE from_type = 'Nonconformance' AND from_id = '${nc.id}'
              AND to_type = 'ChangeRequest' AND to_id = '${cr.id}'`,
        ),
      ),
      'lineage row links the source NC to the new CR',
    ).toBe(1)
  })
})
