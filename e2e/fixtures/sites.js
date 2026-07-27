// Shared flows for the sites journeys.
//
// Two things here are specific to this module and worth knowing before reading
// the specs:
//
//  1. `sites` has NO REST write path in the app. The Sites page creates, edits
//     and deletes purely through the syncEngine (GraphQL + RLS). The REST
//     routes exist but only the write three are permission-gated; the app never
//     calls them. Assertions that "the write was GraphQL, not REST" are
//     therefore load-bearing, not decorative — see j1.
//
//  2. Several journeys need a session minted AFTER a permission or site
//     reassignment, because the app snapshots both into the session at login
//     (backend/api/utils/permissions.js:660-662). `freshContext` exists for
//     exactly that, and PW-J7 is built around the difference between a stale
//     context and a fresh one.
import { expect, request } from '@playwright/test'
import { BASE_URL, PASSWORD, USERS } from './cast.js'
import { sql, sqlRow, sqlValue } from './db.js'

/** Unique, greppable site name for one test run. */
export function uniqueSiteName(tag) {
  return `E2E Site ${tag} ${Date.now()}`
}

/** Unique site code — <=20 chars, uppercase, matches the app's own shape. */
export function uniqueSiteCode(tag) {
  return `E2E${tag}${String(Date.now()).slice(-6)}`.toUpperCase().slice(0, 20)
}

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Site row by exact name (E2E names are unique per run). Includes soft-deleted. */
export function findSiteByName(name) {
  const row = sqlRow(
    `SELECT id, code, address, deleted_at FROM sites WHERE name = ${quote(name)} ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return { id: row[0], code: row[1] || null, address: row[2] || null, deletedAt: row[3] || null }
}

/** Hard-remove a site created by a test (keeps the tenant's site list stable). */
export function purgeSiteByName(name) {
  sql(`DELETE FROM sites WHERE name = ${quote(name)}`)
}

/**
 * A browser context whose session was minted just now.
 *
 * Every AUTH.* storageState in this repo is created once by auth.setup.js. That
 * is correct for permission checks that never change mid-suite — and wrong for
 * the two journeys that deliberately change a user's grants or site while they
 * are logged in, because the backend caches both into the session at login.
 * Those tests need to distinguish "the policy denies this" from "the session is
 * stale", which requires being able to produce both.
 */
export async function freshContext(browser, userKey, { baseURL = BASE_URL } = {}) {
  // Accepts a cast key, or any { email } — the supplier persona has no
  // storageState of its own because only this module needs it.
  const user = typeof userKey === 'string' ? USERS[userKey] : userKey
  if (!user?.email) throw new Error(`freshContext: unknown cast member '${JSON.stringify(userKey)}'`)
  const api = await request.newContext({ baseURL })
  const login = await api.post('/api/v1/auth/login', {
    data: { email: user.email, password: PASSWORD },
  })
  expect(login.ok(), `fresh login ${userKey} → ${login.status()}`).toBeTruthy()
  const state = await api.storageState()
  await api.dispose()
  return browser.newContext({ storageState: state, baseURL })
}

/**
 * Post a raw GraphQL operation on an existing context, bypassing the syncEngine
 * entirely. This is the layer an attacker actually has, and the layer the RLS
 * policies are the only defence at — the UI's permission computeds are not in
 * the path at all.
 */
export async function graphql(ctx, query, variables = {}) {
  const res = await ctx.request.post('/api/graphql', { data: { query, variables } })
  const body = await res.json().catch(() => null)
  return { status: res.status(), body, errors: body?.errors ?? null }
}

/**
 * Assert a GraphQL mutation field actually exists on the schema.
 *
 * Without this, a typo'd mutation name produces a GraphQL error that a
 * "was it rejected?" assertion happily accepts — the test would pass while
 * probing nothing. Every raw-GraphQL denial probe in this project calls this
 * first so a schema drift fails loudly instead of silently going green.
 */
export async function expectMutationExists(ctx, fieldName) {
  const { status, body } = await graphql(ctx, '{ __type(name: "Mutation") { fields { name } } }')
  const fields = (body?.data?.__type?.fields ?? []).map((f) => f.name)
  expect(fields.length, `introspection must succeed (HTTP ${status})`).toBeGreaterThan(0)
  // Surface near-misses in the failure message — a renamed mutation is the most
  // likely cause and the least obvious from a bare "not in array".
  const stem = fieldName.replace(/^(create|update|delete)/, '')
  const near = fields.filter((f) => f.includes(stem.slice(0, 12)))
  expect(
    fields,
    `GraphQL Mutation.${fieldName} must exist (schema drift check). Similar fields: ${JSON.stringify(near)}`,
  ).toContain(fieldName)
}

/** Open the Sites list and wait for it to resolve past its loading state. */
export async function gotoSites(page) {
  await page.goto('/sites', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Sites' }).first()).toBeVisible({ timeout: 20_000 })
}

/**
 * Create a site through the Sites page dialog. Leaves the dialog closed and the
 * row present in the table. Returns { name, code }.
 */
export async function createSiteViaUi(page, { name, code = null, address = null }) {
  await gotoSites(page)
  await page.getByRole('button', { name: 'Create New Site' }).click()
  await expect(page.getByText('Create New Site', { exact: true }).last()).toBeVisible({ timeout: 10_000 })

  const nameInput = page.getByPlaceholder('e.g. New York Headquarters')
  await nameInput.fill(name)
  // Blur triggers the code auto-suggestion (create mode only).
  await page.getByPlaceholder('e.g. NY-HQ').click()

  if (code) await page.getByPlaceholder('e.g. NY-HQ').fill(code)
  if (address) await page.getByPlaceholder('e.g. 123 Main St, New York, NY').fill(address)

  await page.getByRole('button', { name: 'Create Site' }).click()
  await expect(page.getByRole('cell', { name, exact: true }).first()).toBeVisible({ timeout: 20_000 })
  return { name, code }
}

/** Open a site's row menu and pick an action ('Edit' | 'Delete'). */
export async function openRowAction(page, siteName, action) {
  const row = page.getByRole('row').filter({ hasText: siteName }).first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  // BaseMenu's trigger is labelled "More actions"; its items are role=menuitem.
  await row.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: action, exact: true }).click()
}

/** Delete a site through the row menu + confirm dialog. */
export async function deleteSiteViaUi(page, siteName) {
  await openRowAction(page, siteName, 'Delete')
  await expect(page.getByText('Delete Site', { exact: true }).last()).toBeVisible({ timeout: 10_000 })
  // The row menu also carries a "Delete" item; the dialog's is the last one.
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
}

/**
 * Run a single statement as `app_user` with a given identity, i.e. under RLS.
 *
 * This is the only way to observe what a policy actually decides. The REST
 * surface connects as the DB superuser (REST_RLS_ENABLED defaults off) so it
 * bypasses RLS entirely, and the GraphQL path answers "did the app allow it",
 * which conflates the policy with everything layered above it. Several findings
 * in this module are specifically about the policy expression, so the probe has
 * to sit at the policy.
 *
 * Returns the statement's output with psql's BEGIN/SET/COMMIT chatter stripped.
 */
export function asAppUser({ userId, companyId, isOwner = false }, statement) {
  const raw = sql(
    `BEGIN;
     SET LOCAL ROLE app_user;
     SET LOCAL app.current_user_id = '${userId}';
     SET LOCAL app.current_company_id = '${companyId}';
     SET LOCAL app.current_user_is_owner = '${isOwner}';
     ${statement};
     COMMIT;`,
  )
  return raw
    .split('\n')
    // Drop psql's transaction chatter AND the command tags ("UPDATE 1",
    // "DELETE 0") that -tA still emits for non-SELECT statements. Leaving the
    // tags in makes every RETURNING-based assertion compare against a string
    // that contains the answer twice, in two different formats.
    .filter((line) => !/^(BEGIN|SET|COMMIT|ROLLBACK)$/.test(line.trim()))
    .filter((line) => !/^(INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+)$/.test(line.trim()))
    .join('\n')
    .trim()
}

/** Count of live (non-soft-deleted) sites in a company. */
export function liveSiteCount(companyId) {
  return Number(
    sqlValue(`SELECT count(*) FROM sites WHERE company_id = '${companyId}' AND deleted_at IS NULL`),
  )
}
