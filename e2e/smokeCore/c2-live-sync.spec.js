// SMK-004 · a change made in one browser reaches another open browser live.
//
// The product's read path is the SyncEngine: pages render from IndexedDB, and the
// sync server (:4003) pushes row changes over socket.io from Postgres logical
// replication. If replication, the socket, or the client apply step breaks, every
// page still renders — from stale IDB — and nothing else in the suite notices,
// because each journey reads its own writes. This is the one test that watches a
// SECOND, untouched browser pick up a change without a reload.
//
// Setup is REST (POST /v1/services/nonconformances/draft — title-only draft, the
// cheapest NC the API will mint). The change itself goes through the UI: B uses
// the detail page's inline title editor (NonconformancesPageId.vue "Edit NC title"
// → BaseTextInput → Enter; the page autosaves). Both contexts are the owner —
// two independent browser contexts means two IDBs and two sockets, which is what
// the test is about; persona variety is not.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue, findNcByTitle } from '../fixtures/db.js'
import { smokeTitle, sqlQuote as q } from '../fixtures/smoke.js'

function titleControl(page) {
  // BaseClickableRow with aria-label; renders the current title as its text.
  return page.locator('[aria-label="Edit NC title"]').first()
}

test.describe('SMK-004 · live sync across two browsers', () => {
  test(
    'B renames an NC in the UI; A sees the new title within 15s without reloading',
    { tag: ['@smoke', '@p0'] },
    async ({ browser }) => {
      test.setTimeout(180_000)
      const original = smokeTitle('C2-live')
      const renamed = `${original} RENAMED`

      const ctxA = await browser.newContext({ storageState: AUTH.owner })
      const ctxB = await browser.newContext({ storageState: AUTH.owner })
      try {
        // ── Create the NC over REST ──
        const res = await ctxA.request.post('/api/v1/services/nonconformances/draft', {
          data: { title: original },
          failOnStatusCode: false,
        })
        const body = await res.json().catch(() => null)
        expect(
          res.ok(),
          `create draft NC → ${res.status()}: ${JSON.stringify(body)?.slice(0, 300)}`,
        ).toBe(true)
        const ncId = body?.nonconformance?.id ?? findNcByTitle(original)?.id
        expect(ncId, 'draft NC id').toBeTruthy()
        expect(
          sqlValue(`SELECT title FROM nonconformances WHERE id = ${q(ncId)}`),
          'persisted title',
        ).toBe(original)

        // Complete the draft's classification before anyone edits it. The client
        // model (models/nonconformance.js) marks severity/type/source/site/
        // department/owner `required`, and BaseModel.save() validates EVERY
        // required field on EVERY save — so a title-only draft cannot take a
        // title-only edit: the autosave throws "Field 'severityId' is required"
        // and nothing reaches the server (found 2026-09-28; a product defect of
        // its own, not what this test is about). Copied from any complete
        // E2ELAB NC so the ids stay valid whatever the seed holds.
        sql(`UPDATE nonconformances n
                SET severity_id = c.severity_id, type_id = c.type_id, source_id = c.source_id,
                    site_id = c.site_id, department_id = c.department_id, owner_id = c.owner_id
               FROM (SELECT severity_id, type_id, source_id, site_id, department_id, owner_id
                       FROM nonconformances
                      WHERE company_id = ${q(COMPANY_ID)} AND deleted_at IS NULL
                        AND severity_id IS NOT NULL AND type_id IS NOT NULL AND source_id IS NOT NULL
                        AND site_id IS NOT NULL AND department_id IS NOT NULL AND owner_id IS NOT NULL
                      LIMIT 1) c
              WHERE n.id = ${q(ncId)}`)
        expect(
          sqlValue(`SELECT severity_id IS NOT NULL FROM nonconformances WHERE id = ${q(ncId)}`),
          'draft classification completed',
        ).toBe('t')

        // ── A opens the detail page and settles on the original title ──
        const pageA = await ctxA.newPage()
        await pageA.goto(`/nonconformances/${ncId}`)
        await expect(titleControl(pageA), 'A rendered the NC from its own IDB').toContainText(
          original,
          {
            timeout: 60_000,
          },
        )
        let reloadsA = 0
        pageA.on('load', () => reloadsA++)
        const urlA = pageA.url()

        // ── B renames it through the inline editor ──
        const pageB = await ctxB.newPage()
        await pageB.goto(`/nonconformances/${ncId}`)
        await expect(titleControl(pageB)).toContainText(original, { timeout: 60_000 })
        await titleControl(pageB).click()
        const input = pageB.getByPlaceholder('NC title')
        await expect(
          input,
          'inline title editor opened (B is allowed to edit a DRAFT)',
        ).toBeVisible({ timeout: 10_000 })
        await input.fill(renamed)
        await input.press('Enter')

        // Persisted — the autosave reached Postgres (this is what replication ships).
        await waitForSqlValue(
          `SELECT count(*) FROM nonconformances WHERE id = ${q(ncId)} AND title = ${q(renamed)}`,
          { timeoutMs: 20_000, intervalMs: 500, label: 'renamed title persisted' },
        )

        // ── A sees it live ──
        await expect(
          titleControl(pageA),
          'A picked up the rename via sync (socket push → IDB → live query) without a reload',
        ).toContainText(renamed, { timeout: 15_000 })
        expect(reloadsA, 'A was never reloaded').toBe(0)
        expect(pageA.url(), 'A never navigated').toBe(urlA)

        // And the DB still says so (no later write from A reverted it).
        expect(sqlValue(`SELECT title FROM nonconformances WHERE id = ${q(ncId)}`)).toBe(renamed)
      } finally {
        await ctxA.close()
        await ctxB.close()
      }
    },
  )
})
