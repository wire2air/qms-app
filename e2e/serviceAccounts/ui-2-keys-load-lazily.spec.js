// SA-UI-2 — 🟢 A collapsed row has not fetched its keys. (Journey 3.)
//
// `serviceAccountListItem.vue` loads keys on FIRST expand, not with the list,
// and says why in a comment: "A tenant with twenty integrations would otherwise
// fire twenty requests to render a page on which most rows stay collapsed."
// That is a design decision, and a design decision nothing asserts is one
// refactor away from being undone silently — nobody notices twenty extra
// requests on a page that still looks right.
//
// SO THIS COUNTS REQUESTS, and the counting is only trustworthy because the
// same counter goes UP on the very next line: an expand must produce exactly
// one fetch, for exactly that account's id. A matcher that had gone stale (the
// route renamed, the proxy path changed) would report zero for both halves and
// read as a perfect pass — which is why "zero while collapsed" is never
// asserted on its own here.
//
// Two accounts, because the second is what proves the fetch is per-row rather
// than a single list-wide call that happens to be deferred.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import {
  apiAs,
  createAccountVia,
  gotoServiceAccounts,
  issueKeyVia,
  purge,
  rowFor,
  saName,
  specPrefix,
} from './ui-helpers.js'

const SPEC = 'j3'
const PREFIX = specPrefix(SPEC)

const alpha = saName(SPEC, 'alpha')
const beta = saName(SPEC, 'beta')
let alphaId
let betaId

test.describe('SA-UI-2 · keys load lazily', () => {
  test.use({ storageState: AUTH.intAdmin })

  test.beforeAll(async ({ playwright }) => {
    // Minted over REST: what is under test is when the BROWSER asks for keys,
    // not a second run through the create dialog (ui-1 owns that).
    const api = await apiAs(playwright, AUTH.intAdmin)
    alphaId = (await createAccountVia(api, { name: alpha })).id
    betaId = (await createAccountVia(api, { name: beta })).id
    await issueKeyVia(api, alphaId, 'alpha key')
    await issueKeyVia(api, betaId, 'beta key')
    await api.dispose()
  })

  test.afterAll(() => purge(PREFIX))

  test('the list paints with no key requests; expanding fires exactly one, per row', async ({
    page,
  }) => {
    /** @type {string[]} account ids whose keys were fetched, in order. */
    const fetched = []
    page.on('request', (req) => {
      if (req.method() !== 'GET') return
      const m = req.url().match(/\/service-accounts\/([0-9a-f-]{36})\/keys(?:\?|$)/)
      if (m) fetched.push(m[1])
    })

    await gotoServiceAccounts(page)
    const rowA = rowFor(page, alpha)
    const rowB = rowFor(page, beta)
    await expect(rowA).toBeVisible({ timeout: 15_000 })
    await expect(rowB).toBeVisible()

    // Both rows are painted — name, status, roles, both action buttons — and
    // neither account's keys have been asked for.
    expect(fetched, 'a rendered list must not have fetched anybody keys').toEqual([])

    await rowA.getByRole('button', { name: 'Expand keys' }).click()
    await expect(rowA.getByText('alpha key', { exact: true })).toBeVisible({ timeout: 15_000 })
    expect(fetched, 'expanding fetches exactly that row, exactly once').toEqual([alphaId])

    await rowB.getByRole('button', { name: 'Expand keys' }).click()
    await expect(rowB.getByText('beta key', { exact: true })).toBeVisible({ timeout: 15_000 })
    expect(fetched, 'the second row is its own fetch — the deferral is per row').toEqual([
      alphaId,
      betaId,
    ])

    // Collapse and re-expand: `keys.value === null` is the load guard, so a
    // row that has already answered the question must not ask again.
    await rowA.getByRole('button', { name: 'Collapse keys' }).click()
    await expect(rowA.getByText('alpha key', { exact: true })).toHaveCount(0)
    await rowA.getByRole('button', { name: 'Expand keys' }).click()
    await expect(rowA.getByText('alpha key', { exact: true })).toBeVisible()
    expect(fetched, 're-expanding reuses what the row already has').toEqual([alphaId, betaId])
  })
})
