// Shared plumbing for the service-account CREDENTIAL specs (`api-*.spec.js`).
//
// This file is deliberately NOT a `.spec.js` and deliberately NOT in
// e2e/fixtures/: the UI-journey half of this directory is written separately,
// and a helper module in the shared fixtures folder is the kind of thing two
// concurrent authors edit into each other. Everything here is used only by the
// `api-` specs.
//
// ── THE ONE TRAP THIS FILE EXISTS TO CLOSE ──────────────────────────────────
// `playwright.request.newContext()` called inside a test INHERITS that test's
// `use.storageState` (e2e/README.md says the same thing about browser contexts).
// Every spec here declares `test.use({ storageState: AUTH.intAdmin })` so the
// session half works — which means a context built to carry "only an API key"
// silently carries intAdmin's `connect.sid` as well. And `requireAuthByApiKey`
// returns early when a session is present:
//
//     if (req.session?.passport?.user) return next()   // key never consulted
//
// So every key test would pass, measuring intAdmin's session instead of the
// credential. `keyContext()` therefore passes an explicit empty storageState,
// and `api-1` carries a CONTROL that strips the key header off the same context
// and requires a 401 — the assertion that proves no session leaked in.
import { expect } from '@playwright/test'
import crypto from 'node:crypto'
import { AUTH } from '../fixtures/cast.js'
import { sql } from '../fixtures/db.js'

// The API origin, not the Vite proxy — these are HTTP-level tests of the
// credential path and there is no reason to route them through the SPA's dev
// server. Same shape as e2e/users/*.spec.js.
export const API = 'http://e2elab.localhost:4000'
export const ALT_API = 'http://e2ealt.localhost:4000'

export const SA_ROOT = `${API}/v1/services/service-accounts`
export const GRAPHQL = `${API}/graphql`

// The gated read every credential test aims at: GET /v1/services/documents
// mounts `requireAuthByApiKey → requireCompanyAccess →
// enforcePermission('document_control','read')`, which is exactly the three
// links under test — key auth, tenant resolution, and the PDP.
export const GATED_READ = `${API}/v1/services/documents`

// ── Roles ───────────────────────────────────────────────────────────────────
// Not imported from fixtures/cast.js: `ROLES` there does not carry the §39
// integration-admin role, and cast.js is owned by another author this cycle.
//
// ACCEPT / REFUSE, and why these three:
//
//   INTEGRATION_ADMIN  is intAdmin's OWN role — api_integrations CRUD plus
//                      document_control:read and nothing else. Assigning it to
//                      a service account grants exactly what the caller already
//                      holds, at the same (tenant) scope, so
//                      assertNoPrivilegeEscalation must accept it. It is also
//                      what makes a key able to READ documents at all.
//
//   AUTHOR             grants 50 permissions intAdmin does not hold. The
//                      REFUSE case.
//
//   REVIEWER           the task brief expected this to be a second ACCEPT case
//                      ("document_control:read only"). It is not, and has not
//                      been for some time — see api-8, which pins the real
//                      behaviour and the reason.
export const ROLE_INTEGRATION_ADMIN = 'e2e30000-0000-4000-8000-000000000073'
export const ROLE_AUTHOR = 'e2e30000-0000-4000-8000-000000000001'
export const ROLE_REVIEWER = 'e2e30000-0000-4000-8000-000000000002'

// Every account these specs create carries this prefix, so a leftover from a
// crashed run is identifiable and nothing here can be confused with a fixture
// another suite owns. The seed deliberately does NOT clean service accounts up
// (a shared DELETE would let one concurrent run wipe another's fixtures
// mid-test), so ownership is per-spec — see `accountTracker`.
export const SA_PREFIX = 'E2E SA API'

/** A tenant-unique name for one test's own account. */
export function saName(label) {
  return `${SA_PREFIX} ${label} ${crypto.randomBytes(3).toString('hex')}`
}

/**
 * NEVER log a whole key. Diagnostics get the prefix and a length, which is
 * enough to tell two keys apart and useless to anyone reading a CI log.
 */
export function redact(secret) {
  const s = String(secret ?? '')
  return `${s.slice(0, 6)}…(${s.length} chars)`
}

/** The digest the server actually stores — `api_keys.key_hash`. */
export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

/**
 * Error bodies come in two shapes on this surface and a spec that assumes one
 * asserts against `undefined` half the time:
 *   `{ message }`          — middleware (requireAuthByApiKey, requireCompanyAccess)
 *   `{ error: { message } }` — a thrown ForbiddenError through the error handler
 */
export function errorMessage(body) {
  return body?.error?.message ?? body?.message ?? ''
}

/** Body + status in one await, without throwing on a non-2xx. */
export async function read(res) {
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // some failures answer with HTML; the raw text is still useful
  }
  return { status: res.status(), text, json }
}

// ── Contexts ────────────────────────────────────────────────────────────────

/**
 * A context carrying ONLY the key. The empty storageState is load-bearing —
 * see the header.
 *
 * @param {'x-api-key'|'bearer'} header which of the two accepted forms to send
 */
export function keyContext(playwright, secret, { header = 'x-api-key' } = {}) {
  const headers =
    header === 'bearer' ? { authorization: `Bearer ${secret}` } : { 'x-api-key': secret }
  return playwright.request.newContext({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: headers,
  })
}

/** A context carrying neither a key nor a session — the control for the above. */
export function bareContext(playwright) {
  return playwright.request.newContext({ storageState: { cookies: [], origins: [] } })
}

/** A session context for a named cast member (AUTH.* path). */
export function sessionContext(playwright, storageState = AUTH.intAdmin) {
  return playwright.request.newContext({ storageState })
}

// ── Fixture ownership ───────────────────────────────────────────────────────

/**
 * Per-spec ownership of the accounts a file creates.
 *
 * Cleanup runs as `owner`, not as the creating persona: half these specs
 * deliberately have an account created BY the owner (the escalation-on-issuance
 * probe needs an account intAdmin could never have made), and the owner can
 * delete every one of them. Failures are swallowed — a teardown that throws
 * masks the real failure that preceded it, and the `E2E SA API` prefix makes an
 * orphan identifiable.
 *
 * TWO PASSES, and the second is not redundant:
 *
 *   1. `DELETE /service-accounts/:id` — the real endpoint, so teardown also
 *      exercises the route the product ships. It SOFT-deletes.
 *   2. a hard delete of the same ids in SQL. `users` is a synced model, and
 *      soft-deleted rows still cost every fresh browser context's syncEngine
 *      bootstrap — the reason documents.setup.js / qc.setup.js /
 *      inspectionsLogs.setup.js exist at all. This file creates ~20 accounts
 *      per run, so without pass 2 the tenant grows by that much every time and
 *      the UI half of this directory pays for it.
 *
 * Scoped to the tracked IDS rather than to the `E2E SA API` prefix, on purpose.
 * A prefix-wide DELETE is the trap e2e-seed.sql §39 warns about: two concurrent
 * runs would have one wipe the other's fixtures mid-test. Ids cannot collide.
 */
export function accountTracker() {
  const ids = new Set()
  return {
    track(id) {
      if (id) ids.add(id)
      return id
    },
    async cleanup(playwright) {
      if (!ids.size) return
      const ctx = await sessionContext(playwright, AUTH.owner)
      for (const id of ids) {
        try {
          await ctx.delete(`${SA_ROOT}/${id}`)
        } catch {
          // best effort — the prefix makes anything left behind identifiable
        }
      }
      await ctx.dispose()

      const list = [...ids].map((id) => `'${id}'`).join(',')
      ids.clear()
      try {
        sql(`DELETE FROM api_keys WHERE user_id IN (${list})`)
        sql(`DELETE FROM roles_on_users WHERE user_id IN (${list})`)
        sql(`DELETE FROM users WHERE is_service_account = true AND id IN (${list})`)
      } catch (err) {
        console.warn(`[serviceAccounts/api] hard cleanup failed: ${err.message}`)
      }
    },
  }
}

// ── The two calls every spec makes ──────────────────────────────────────────

/**
 * A pause after a write, before anything reads what it wrote.
 *
 * NOT politeness, and not a substitute for a wait condition. These routes write
 * inside `req.transaction` and never commit it themselves: the commit is done
 * by the `res.on('finish')` safety net in utils/permissions.js, i.e. AFTER the
 * 201 has been flushed to the client. A caller that acts on the id it was just
 * handed can therefore lose the race — measured here on 2026-09-10, `POST
 * /service-accounts` → `POST /service-accounts/:id/keys` back to back answered
 * 404 "Service account not found" against an account the previous response had
 * just reported as created.
 *
 * That is a real defect and it has a test of its own (api-5, the revoke race,
 * which is the same ordering with a security consequence). It is absorbed HERE
 * so it cannot masquerade as a failure of whatever each spec is actually about.
 */
const COMMIT_SETTLE_MS = 250
const settleCommit = () => new Promise((resolve) => setTimeout(resolve, COMMIT_SETTLE_MS))

/**
 * Create a service account and assert it worked. Returns the presented account.
 * `roleIds` omitted means an account with NO authority at all, which is api-2's
 * whole subject.
 */
export async function createAccount(request, { label, roleIds, description } = {}) {
  const name = saName(label)
  const res = await request.post(SA_ROOT, {
    data: {
      name,
      ...(description === undefined ? {} : { description }),
      ...(roleIds === undefined ? {} : { roleIds }),
    },
  })
  const { status, json } = await read(res)
  expect(status, `create "${name}" → ${status}: ${errorMessage(json)}`).toBe(201)
  await settleCommit()
  return json.serviceAccount
}

/**
 * Issue a key and assert the shape of what comes back. Returns
 * `{ key, secret, warning }` — the ONLY moment `secret` is ever obtainable.
 */
export async function issueKey(request, accountId, { name = 'E2E SA API key', expiresAt } = {}) {
  const body = { name, ...(expiresAt === undefined ? {} : { expiresAt }) }
  let { status, json } = await read(
    await request.post(`${SA_ROOT}/${accountId}/keys`, { data: body }),
  )

  // ONE retry, and only on 404 — the commit race described above. Observed on a
  // loaded machine even with the settle: `findServiceAccountOrFail` answers 404
  // for an account the create response has already reported. Retrying anything
  // else would hide a real refusal (a 403 from the escalation guard, say), which
  // is why the condition is this narrow.
  if (status === 404) {
    await settleCommit()
    await settleCommit()
    ;({ status, json } = await read(
      await request.post(`${SA_ROOT}/${accountId}/keys`, { data: body }),
    ))
  }
  expect(status, `issue key on ${accountId} → ${status}: ${errorMessage(json)}`).toBe(201)
  // `sk_` + 32 CSPRNG bytes rendered hex. Asserted here rather than in one spec
  // because every later assertion depends on having a real credential.
  expect(json.secret, 'issuance returns a well-formed secret').toMatch(/^sk_[0-9a-f]{64}$/)
  await settleCommit()
  return json
}
