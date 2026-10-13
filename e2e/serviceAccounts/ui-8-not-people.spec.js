// SA-UI-8 — 🟢 A service account is not a person, so no picker offers it.
// (Journey 9.)
//
// `User` declares `static hiddenFromLists = 'isServiceAccount'`, which the
// syncEngine's QueryBuilder applies to every `where()` and deliberately NOT to
// `findByPk()`. The asymmetry is the whole design: a machine identity must stay
// out of every picker in the product — it has no inbox, cannot open an email,
// cannot sign an approval and cannot be trained — while still resolving by id,
// so an audit-log line written by an integration still renders a name instead
// of a uuid. `UserSelectMenu` relies on it and says so in a comment: "Service
// accounts never reach here ... so this menu needs no filter." That is a claim
// about a shared engine, made by one of the ~40 components that depend on it.
//
// ── WHY THE INDEXEDDB PROBE IS HERE ────────────────────────────────────────
// "The service account is not in the picker" passes just as happily when the
// row never reached the browser at all — because RLS withheld it, because the
// bootstrap had not finished, because the name was misspelt. Then the test is
// green and `hiddenFromLists` could be deleted without anything noticing. So the
// premise is established first, at the raw store: the row IS in this page's
// IndexedDB, and the picker still does not offer it. The engine exposes no
// global in dev, hence the direct read.
//
// ── AND WHY THERE IS A CONTROL ──────────────────────────────────────────────
// An empty picker, a broken query, a dialog whose slot silently discarded its
// children — all satisfy "the service account is absent". A real user, in the
// same open menu, must be present.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { apiAs, createAccountVia, idbHasUser, purge, saName, specPrefix } from './ui-helpers.js'

const SPEC = 'j9'
const PREFIX = specPrefix(SPEC)

const account = saName(SPEC, 'picker')
let accountId

// ── Worker-discard guard ────────────────────────────────────────────────────
// This file arranges a service account + key ONCE in `beforeAll` and purges it
// in `afterAll`. Playwright discards a worker after a failing test and RUNS the
// file's pending `afterAll` before continuing in a fresh one — but the
// `beforeAll` of an already-entered describe does NOT re-run. Without serial
// mode the purge would therefore delete the account out from under every later
// test in the file, and each would report the 401/404 it was written to catch:
// one real failure printed as N false authentication findings.
//
// Serial mode makes Playwright SKIP the remainder instead of replaying it, so
// one failure stays one failure. See complaints/j11 for the alternative fix
// (arrange per describe), which suits files whose tests can afford their own
// fixtures; minting a real API key per test would not be cheap here.
test.describe.configure({ mode: 'serial' })

test.describe('SA-UI-8 · service accounts are not people', () => {
  // Viewed as the owner: the picker has to be looked at by someone who may read
  // the whole roster, or "the service account is missing" is just RLS.
  test.use({ storageState: AUTH.owner })

  test.beforeAll(async ({ playwright }) => {
    const api = await apiAs(playwright, AUTH.intAdmin)
    accountId = (await createAccountVia(api, { name: account })).id
    await api.dispose()
  })

  test.afterAll(() => purge(PREFIX))

  test('a shared UserSelectMenu lists a real user and not the machine identity', async ({
    page,
  }) => {
    // `/groups` → Create Group → Members is the shared `UserSelectMenu`, the
    // component reused by assignee, reviewer and owner pickers across the app.
    // Nothing is submitted here, so this test creates no group.
    await page.goto('/groups', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 20_000 })

    // ── The premise ────────────────────────────────────────────────────────
    // The row must have reached this page's IndexedDB, or the absence below
    // proves nothing about hiddenFromLists.
    await expect
      .poll(() => idbHasUser(page, accountId), {
        timeout: 60_000,
        message: 'the service account row must reach the client before its absence means anything',
      })
      .toBe(true)

    await page.getByRole('button', { name: 'Create Group' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Create New Group')).toBeVisible()

    // The Members picker — the first (and only) BaseSelect in this dialog.
    await dialog.getByRole('combobox').first().click()
    const search = page.getByPlaceholder('Search…')
    await expect(search).toBeVisible()

    // ── CONTROL, first: the menu works ─────────────────────────────────────
    await search.fill(USERS.reviewer.name)
    await expect(
      page.getByRole('option', { name: USERS.reviewer.name, exact: false }),
      'CONTROL — a real user IS offered, so an empty menu cannot pass the next assertion',
    ).toBeVisible({ timeout: 10_000 })

    // ── The claim ──────────────────────────────────────────────────────────
    await search.fill(account)
    await expect(
      page.getByRole('option', { name: account, exact: false }),
      'a machine identity has no inbox and cannot approve anything — it must not be assignable',
    ).toHaveCount(0)
    await expect(
      page.getByText('No matches found', { exact: true }),
      'the menu searched and found nothing, rather than never having been searched',
    ).toBeVisible({ timeout: 10_000 })

    // Not just the search: nothing in the unfiltered list either.
    await search.fill('')
    await expect(page.getByRole('option', { name: account, exact: false })).toHaveCount(0)
    await expect(
      page.getByRole('option', { name: USERS.reviewer.name, exact: false }),
      'CONTROL — and the unfiltered list is populated',
    ).toBeVisible({ timeout: 10_000 })
  })
})
