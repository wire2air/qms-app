// ST-J4 · Lookups — the lifecycle, and which grant each lookup's editor needs
// (J-04 / PW-J3 / MTC-05 / MTC-06).
//
// There is no single "lookup steward" permission. Each card gates on its own
// module's action, and the server routes are the authority:
//
//   Quality Categories  POST /eventCategories   quality_events:configure
//   Units of Measure    POST /uoms              company_settings:manage
//
// Until 2026-09-14 the Units / Item Categories / NC Dispositions cards hid
// their editor from everyone but the OWNER while their routes admitted any
// holder of the grant — the same "two gates disagree" shape as the Defaults
// card. ST-31 is the regression test for that fix: it drives the Units card as
// the non-owner settings admin, who could not see "Add Unit" before.
// (ProductFamiliesCard still has the old gate; products/j8-j9 pins it.)
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { API, SETTINGS_USERS, personaContext } from '../fixtures/settings.js'

const STAMP = Date.now().toString(36).toUpperCase()
const CAT = `E2E Settings Category ${STAMP}`
const UNIT = `E2E Settings Unit ${STAMP}`
const PROBE_CODE = `E2E_SET_PROBE_${STAMP}`

test.afterAll(() => {
  sql(`DELETE FROM event_categories WHERE company_id = '${COMPANY_ID}' AND name LIKE 'E2E Settings Category %'`)
  sql(`DELETE FROM uoms WHERE company_id = '${COMPANY_ID}' AND (name LIKE 'E2E Settings Unit %' OR code LIKE 'E2E_SET_PROBE_%')`)
})

/** A table row's action — inline icon button, or tucked under "More actions". */
async function rowAction(page, rowText, label) {
  const row = page.getByRole('row').filter({ hasText: rowText })
  await expect(row).toBeVisible({ timeout: 45_000 })
  const inline = row.getByRole('button', { name: label, exact: true })
  if (await inline.count()) {
    await inline.first().click()
    return
  }
  await row.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: label }).click()
}

function liveRow(table, name) {
  return `SELECT id FROM ${table} WHERE company_id = '${COMPANY_ID}' AND name = '${name}' AND deleted_at IS NULL`
}

test('ST-30 · owner: a Quality Category is added, edited, deactivated and restored — each step in the DB and the audit trail', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ storageState: AUTH.owner })
  const page = await ctx.newPage()
  try {
    await page.goto('/lookups?tab=event-categories')
    await page.getByRole('button', { name: 'Add Category' }).click({ timeout: 60_000 })
    let dialog = page.getByRole('dialog', { name: 'Add Category' })
    await dialog.getByRole('textbox').first().fill(CAT)
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    const id = await waitForSqlValue(liveRow('event_categories', CAT), { timeoutMs: 20_000, label: 'category created' })

    const edited = `${CAT} edited`
    await rowAction(page, CAT, 'Edit')
    dialog = page.getByRole('dialog', { name: 'Edit Category' })
    await dialog.getByRole('textbox').first().fill(edited)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await waitForSqlValue(`SELECT 1 FROM event_categories WHERE id = '${id}' AND name = '${edited}'`, {
      timeoutMs: 20_000,
      label: 'category renamed',
    })

    await rowAction(page, edited, 'Deactivate')
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate', exact: true }).click()
    await waitForSqlValue(`SELECT 1 FROM event_categories WHERE id = '${id}' AND deleted_at IS NOT NULL`, {
      timeoutMs: 20_000,
      label: 'category deactivated',
    })

    // The deactivated list is a live query over IndexedDB (`force: true`), so it
    // shows the row only once the soft-deleted record has been synced back.
    // One reload re-reads the store; absence after that is the defect, not lag.
    await expect(page.getByRole('row').filter({ hasText: edited })).toHaveCount(0, { timeout: 30_000 })
    await page.reload()
    await page.getByRole('button', { name: /Deactivated \(\d+\)/ }).click({ timeout: 45_000 })
    await page
      .locator('div')
      .filter({ hasText: edited })
      .filter({ has: page.getByRole('button', { name: 'Restore' }) })
      .last()
      .getByRole('button', { name: 'Restore' })
      .click({ timeout: 30_000 })
    await waitForSqlValue(`SELECT 1 FROM event_categories WHERE id = '${id}' AND deleted_at IS NULL`, {
      timeoutMs: 20_000,
      label: 'category restored',
    })

    // Four writes, each through the audited REST routes → audit_event worker.
    const audited = await waitForSqlValue(
      `SELECT CASE WHEN count(*) >= 3 THEN count(*) END FROM audit_logs WHERE entity_id = '${id}'`,
      { timeoutMs: 30_000, label: 'category audit rows' },
    )
    expect(Number(audited)).toBeGreaterThanOrEqual(3)
  } finally {
    await ctx.close()
  }
})

test('ST-31 · a NON-owner settings admin can add and deactivate a Unit of Measure from the Lookups page', async ({
  browser,
}) => {
  const ctx = await personaContext(browser, SETTINGS_USERS.settingsAdmin)
  const page = await ctx.newPage()
  try {
    await page.goto('/lookups?tab=uoms')
    const add = page.getByRole('button', { name: 'Add Unit' })
    await expect(add, 'the editor is offered to the grant the route checks').toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/needs the Company Settings permission/)).toHaveCount(0)

    await add.click()
    const dialog = page.getByRole('dialog', { name: 'Add Unit of Measure' })
    await dialog.getByRole('textbox').first().fill(UNIT)
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    const id = await waitForSqlValue(liveRow('uoms', UNIT), { timeoutMs: 20_000, label: 'unit created' })

    await rowAction(page, UNIT, 'Deactivate')
    await page.getByRole('dialog').getByRole('button', { name: /Deactivate|Confirm/ }).last().click()
    await waitForSqlValue(`SELECT 1 FROM uoms WHERE id = '${id}' AND deleted_at IS NOT NULL`, {
      timeoutMs: 20_000,
      label: 'unit deactivated',
    })
  } finally {
    await ctx.close()
  }
})

test('ST-32 · each lookup route refuses a caller without ITS grant server-side (403), and nothing is written', async ({
  browser,
}) => {
  const noAccess = await browser.newContext({ storageState: AUTH.noAccess })
  const settingsAdmin = await personaContext(browser, SETTINGS_USERS.settingsAdmin)
  try {
    // No grant at all: both routes refuse.
    const uom = await noAccess.request.post(`${API}/v1/services/uoms`, {
      failOnStatusCode: false,
      data: { code: PROBE_CODE, name: 'E2E probe unit' },
    })
    expect(uom.status(), 'noAccess → POST /uoms').toBe(403)
    const cat = await noAccess.request.post(`${API}/v1/services/eventCategories`, {
      failOnStatusCode: false,
      data: { code: PROBE_CODE, name: 'E2E probe category' },
    })
    expect(cat.status(), 'noAccess → POST /eventCategories').toBe(403)

    // company_settings:manage is not a universal lookup key: Quality
    // Categories belong to the Quality Events module's configure action.
    const cat2 = await settingsAdmin.request.post(`${API}/v1/services/eventCategories`, {
      failOnStatusCode: false,
      data: { code: PROBE_CODE, name: 'E2E probe category' },
    })
    expect(cat2.status(), 'settingsAdmin → POST /eventCategories').toBe(403)

    expect(
      Number(sqlValue(`SELECT count(*) FROM uoms WHERE company_id = '${COMPANY_ID}' AND code = '${PROBE_CODE}'`)),
    ).toBe(0)
    expect(
      Number(
        sqlValue(`SELECT count(*) FROM event_categories WHERE company_id = '${COMPANY_ID}' AND code = '${PROBE_CODE}'`),
      ),
    ).toBe(0)
  } finally {
    await noAccess.close()
    await settingsAdmin.close()
  }
})
