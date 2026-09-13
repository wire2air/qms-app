// Shared plumbing for the service-account ADMIN-UI specs (`ui-*.spec.js`).
//
// Not a `.spec.js` (so `playwright test e2e/serviceAccounts/ui-*.spec.js` does
// not try to run it) and deliberately not in e2e/fixtures/: the credential half
// of this directory (`api-*.spec.js`) is written separately and a module in the
// shared fixtures folder is the kind of thing two concurrent authors edit into
// each other. `api-helpers.js` is that half's equivalent — nothing here imports
// it, and nothing there imports this.
//
// ── THREE THINGS THE BRIEF ASSUMED THAT MEASUREMENT CONTRADICTED ────────────
//
// 1. "E2E Reviewer holds document_control:read and nothing else, so granting it
//    is the escalation guard's ACCEPT case." It holds EIGHTEEN permissions
//    (capa:update, ncr:update, change_control:update, reports_dashboards:manage,
//    document_control:manage_access …) — §38 of the seed backfills a `read` on
//    every module a role touches, and earlier sections added the write verbs.
//    intAdmin holds five permissions, so granting E2E Reviewer is REFUSED.
//    The real ACCEPT case is intAdmin's own role, E2E Integration Admin:
//    exactly what the caller already holds, at the same scope.
//
// 2. "As intAdmin, create an account holding the E2E Author role." The create
//    dialog cannot express that. `roles_sel` (database/rls.sql) admits a role
//    to a reader who is an owner, holds `role_permission_management:read`, or
//    IS ASSIGNED THE ROLE — intAdmin is none of the first two, so
//    `db.Role.where('statusId','ACTIVE')` returns exactly one row and the
//    picker offers exactly one option. ui-7 pins that, with the owner control
//    that isolates it to the RLS read, and reaches the guard through the door
//    that IS drivable: key issuance re-runs assertNoPrivilegeEscalation against
//    the account's CURRENT roles (controllers/serviceAccounts.js, "ESCALATION,
//    SECOND DOOR").
//
// 3. The same RLS read is why `RoleBadgeById` renders NOTHING for a role the
//    viewer cannot read (`v-if="role"`). ui-1 documents that.
//
// ── THE COMMIT BARRIER, AND THE DEFECT BEHIND IT ────────────────────────────
// Every REST fixture below is followed by `waitForCommit`, and that is not
// belt-and-braces. `requireCompanyAccess` (backend/api/utils/permissions.js)
// opens a transaction on every request and commits it in `res.on('finish')` —
// which fires AFTER the response bytes have gone to the client — and no service
// account controller commits explicitly. So a client that acts on its own 201
// immediately can lose the race with that commit and be told, correctly from
// the second transaction's point of view, that the thing it just created does
// not exist.
//
// Measured, not theorised: 2 of ~40 create→issue pairs answered
//   404 {"error":{"message":"Service account not found"}}
// while `SELECT ... FROM users WHERE id = <that id>` from a separate connection
// returned the row, ACTIVE, undeleted, in the right company. The diagnosis is
// in the failure message on purpose — see `issueKeyVia`.
//
// The barrier polls Postgres over psql, whose own connection is READ COMMITTED
// and therefore cannot see the row until the API's transaction lands. It makes
// the FIXTURES deterministic; it does not paper over the defect, which is
// reported separately and is not specific to this module — it is the shared
// request-transaction lifecycle, so every REST route that does not commit
// explicitly has the same window.
//
// ── FIXTURE OWNERSHIP ───────────────────────────────────────────────────────
// The seed deliberately does not clean service accounts up: it runs in the
// `setup` project at the start of EVERY invocation, so a shared DELETE would
// let one concurrent suite wipe another's fixtures mid-test. Ownership is
// therefore per-spec — every account is named `E2E SA UI <spec> <random>` and
// removed by `purge()` on that spec's own prefix in its own teardown. Nothing
// here ever asserts on a total row count: the tenant carries leftovers from the
// `api-` half and from crashed runs by design.
import crypto from 'node:crypto'
import { expect } from '@playwright/test'
import { sql } from '../fixtures/db.js'

// The API origin, not the Vite proxy. Fixtures that a UI journey only needs to
// EXIST (an account whose keys the browser then revokes) are minted over REST;
// what is under test is the screen, not a second run through the create dialog.
export const API = 'http://e2elab.localhost:4000'
export const SA_ROOT = `${API}/v1/services/service-accounts`

// §39's roles. Not imported from fixtures/cast.js — `ROLES` there predates the
// integration-admin role, and cast.js is owned by another author this cycle.
export const ROLE_INTEGRATION_ADMIN = 'e2e30000-0000-4000-8000-000000000073'
export const ROLE_INTEGRATION_ADMIN_NAME = 'E2E Integration Admin'
export const ROLE_AUTHOR = 'e2e30000-0000-4000-8000-000000000001'
export const ROLE_AUTHOR_NAME = 'E2E Author'
export const ROLE_REVIEWER = 'e2e30000-0000-4000-8000-000000000002'
export const ROLE_REVIEWER_NAME = 'E2E Reviewer'

export const UI_PREFIX = 'E2E SA UI'

/** This spec's prefix — every name it creates starts with it, and only it. */
export function specPrefix(spec) {
  return `${UI_PREFIX} ${spec}`
}

/** A tenant-unique name under one spec's prefix (`assertNameAvailable` is real). */
export function saName(spec, label) {
  return `${specPrefix(spec)} ${label} ${crypto.randomBytes(3).toString('hex')}`
}

/**
 * NEVER log a whole key. Diagnostics get the prefix and a length — enough to
 * tell two credentials apart, useless to anyone reading a CI log or a trace.
 */
export function redact(secret) {
  const s = String(secret ?? '')
  return `${s.slice(0, 6)}…(${s.length} chars)`
}

/** The digest the server actually stores in `api_keys.key_hash`. */
export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * Remove every account under ONE spec's prefix, and its keys.
 *
 * A hard delete rather than `DELETE /service-accounts/:id`, which soft-deletes:
 * `users` is a synced model, and rows that accumulate in the E2E tenant slow
 * every fresh browser context's syncEngine bootstrap until UI steps time out
 * (the reason `documents.setup.js`, `qc.setup.js` and `inspectionsLogs.setup.js`
 * exist at all). Failures are swallowed — a teardown that throws masks the real
 * failure that preceded it, and the prefix makes an orphan identifiable.
 */
export function purge(prefix) {
  const like = quote(`${prefix}%`)
  const owned = `SELECT id FROM users WHERE is_service_account = true AND first_name LIKE ${like}`
  try {
    sql(`DELETE FROM api_keys WHERE user_id IN (${owned})`)
    sql(`DELETE FROM roles_on_users WHERE user_id IN (${owned})`)
    sql(`DELETE FROM users WHERE is_service_account = true AND first_name LIKE ${like}`)
  } catch (err) {
    console.warn(`[serviceAccounts/ui] purge(${prefix}) failed: ${err.message}`)
  }
}

/** The account row as Postgres holds it (the UI cannot show most of this). */
export function accountRow(name) {
  const out = sql(
    `SELECT id, user_status_id, deleted_at IS NOT NULL, email IS NULL, password IS NULL
       FROM users WHERE is_service_account = true AND first_name = ${quote(name)}
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!out) return null
  const [id, statusId, deleted, noEmail, noPassword] = out.split('\n')[0].split('|')
  return {
    id,
    statusId,
    deleted: deleted === 't',
    noEmail: noEmail === 't',
    noPassword: noPassword === 't',
  }
}

/** `[{ id, name, revoked, keyHash }]` for one account, newest first. */
export function keyRows(accountId) {
  const out = sql(
    `SELECT id, name, revoked, key_hash FROM api_keys
      WHERE user_id = ${quote(accountId)} ORDER BY created_at DESC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, name, revoked, keyHash] = line.split('|')
    return { id, name, revoked: revoked === 't', keyHash }
  })
}

// ── REST fixtures ───────────────────────────────────────────────────────────

/**
 * A request context for a cast member.
 *
 * The explicit `storageState` matters: `playwright.request.newContext()` called
 * inside a test INHERITS that test's `use.storageState` (e2e/README.md), so a
 * context meant to act as the owner would silently act as whoever the spec
 * declared. Nothing here ever LOGS IN — a login regenerates the session and
 * would invalidate the saved `e2e/.auth/<role>.json` for every later spec.
 */
export function apiAs(playwright, storageState) {
  return playwright.request.newContext({ storageState })
}

/**
 * Poll until a row is visible to a SEPARATE connection — i.e. until the API's
 * request transaction has actually committed. See the header.
 */
async function waitForCommit(query, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (sql(query) === '1') return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`${label} never became visible to a second connection within ${timeoutMs}ms`)
}

/** Create a service account over REST and assert it worked. */
export async function createAccountVia(ctx, { name, description, roleIds } = {}) {
  const res = await ctx.post(SA_ROOT, {
    data: {
      name,
      ...(description === undefined ? {} : { description }),
      ...(roleIds === undefined ? {} : { roleIds }),
    },
  })
  const body = await res.text()
  expect(res.status(), `create "${name}" → ${res.status()}: ${body.slice(0, 300)}`).toBe(201)
  const account = JSON.parse(body).serviceAccount
  await waitForCommit(
    `SELECT 1 FROM users WHERE id = ${quote(account.id)}`,
    `service account "${name}"`,
  )
  return account
}

/**
 * Issue a key over REST. Returns `{ key, secret }` — never log `secret`.
 *
 * A failure here is always in a `beforeAll`, where Playwright reports the hook
 * and not the request, so the diagnosis has to be carried in the message: the
 * account's row is read straight from Postgres and appended. "404 Service
 * account not found" and "404, and the row is right there, ACTIVE and
 * undeleted" are very different findings, and without this you cannot tell them
 * apart after the fact.
 */
export async function issueKeyVia(ctx, accountId, name) {
  const res = await ctx.post(`${SA_ROOT}/${accountId}/keys`, { data: { name } })
  const body = await res.text()
  if (res.status() !== 201) {
    const row = sql(
      `SELECT user_status_id, deleted_at, company_id FROM users WHERE id = ${quote(accountId)}`,
    )
    expect(
      res.status(),
      `issue "${name}" on ${accountId} → ${res.status()}: ${body.slice(0, 300)} — users row: ${row || '(no such row)'}`,
    ).toBe(201)
  }
  const issued = JSON.parse(body)
  await waitForCommit(`SELECT 1 FROM api_keys WHERE id = ${quote(issued.key.id)}`, `key "${name}"`)
  return issued
}

// ── UI locators ─────────────────────────────────────────────────────────────

/** Open the screen and wait for the list request to have painted. */
export async function gotoServiceAccounts(page) {
  await page.goto('/service-accounts', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Service Accounts' })).toBeVisible({
    timeout: 20_000,
  })
}

/**
 * One account's row.
 *
 * Structural rather than class-based on purpose: the components are built from
 * Tailwind `tw:` utilities that will change, so a `.tw\:rounded-xl` chain is a
 * test that breaks on a restyle. The innermost div containing BOTH this
 * account's (unique) name and a "Delete service account" button is the row
 * HEADER — inside it the name and the buttons are in sibling subtrees, so
 * nothing deeper can contain both — and the header's parent is the row, which
 * also holds the keys panel.
 */
export function rowFor(page, name) {
  return page
    .locator('div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Delete service account' }) })
    .last()
    .locator('xpath=..')
}

/** The name + status cell — `toContainText('Active' | 'Disabled')`. */
export function statusCellFor(page, name) {
  return page
    .locator('div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .last()
}

/** Drive the create dialog. `roleName` null = no role. */
export async function createViaDialog(page, { name, description, roleName }) {
  await page.getByRole('button', { name: 'New Service Account' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('New Service Account')).toBeVisible()

  await dialog.getByLabel('Name', { exact: true }).fill(name)
  if (description) {
    await dialog.getByPlaceholder('e.g., Nightly supplier master sync').fill(description)
  }
  if (roleName) {
    // The trigger is toggled shut rather than dismissed with Escape: a multiple
    // BaseSelect keeps its menu open after a pick, and Escape bubbles to
    // document — where the HeadlessUI Dialog is listening — so it would close
    // the create dialog along with the menu.
    const trigger = dialog.getByRole('combobox').first()
    await trigger.click()
    await page.getByRole('option', { name: roleName, exact: true }).click()
    await trigger.click()
    await expect(page.getByRole('option', { name: roleName, exact: true })).toHaveCount(0)
  }
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
}

/** Expand a row and wait for its keys panel. */
export async function expandRow(page, name) {
  const row = rowFor(page, name)
  await row.getByRole('button', { name: 'Expand keys' }).click()
  await expect(row.getByText('API keys', { exact: true })).toBeVisible()
  return row
}

/**
 * Is `userId` in this page's IndexedDB `users` store?
 *
 * The premise ui-8 needs and cannot get any other way. Without it, "the picker
 * does not offer the service account" passes just as happily when the row never
 * reached the client at all — which would prove nothing about
 * `User.hiddenFromLists`, the thing under test. The syncEngine exposes no global
 * in dev, so this goes at the raw store: every company DB is timestamped, so the
 * scan looks for whichever one owns a `users` object store.
 */
export function idbHasUser(page, userId) {
  return page.evaluate(async (id) => {
    const dbs = (await indexedDB.databases?.()) ?? []
    for (const { name } of dbs) {
      if (!name) continue
      const hit = await new Promise((resolve) => {
        const req = indexedDB.open(name)
        req.onerror = () => resolve(false)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('users')) {
            db.close()
            return resolve(false)
          }
          const get = db.transaction('users', 'readonly').objectStore('users').get(id)
          get.onsuccess = () => {
            const found = !!get.result
            db.close()
            resolve(found)
          }
          get.onerror = () => {
            db.close()
            resolve(false)
          }
        }
      })
      if (hit) return true
    }
    return false
  }, userId)
}

/**
 * Does `secret` appear ANYWHERE a user could read it back?
 *
 * `toContainText` alone is not enough: an `<input>`'s value is not text content,
 * and the secret is rendered into exactly such an input. This checks both.
 */
export function secretIsRecoverable(page, secret) {
  return page.evaluate((s) => {
    if (document.body.innerText.includes(s)) return true
    return [...document.querySelectorAll('input, textarea')].some((el) =>
      String(el.value ?? '').includes(s),
    )
  }, secret)
}
