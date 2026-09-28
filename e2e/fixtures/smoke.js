// Shared helpers for the smoke suites (e2e/smokeGate, e2e/smokeCore).
//
// smokeGate runs BEFORE `setup` (see playwright.config.js) so a dead stack fails
// in seconds instead of after the seed + ~40 persona logins. Nothing in here may
// therefore assume the E2E seed has been applied or that any storageState file is
// fresh — the gate helpers talk to the services directly.
import { expect, request } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPANY_ID, PASSWORD } from './cast.js'
import { sql, sqlValue } from './db.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// qms-app/e2e/fixtures → repo-root/qms/… (same resolution auth.setup.js uses for SEED_SQL)
export const QMS_ROOT = path.resolve(HERE, '../../../qms')
export const MIGRATIONS_DIR = path.join(QMS_ROOT, 'backend/api/migrations')
export const RLS_SQL = path.join(QMS_ROOT, 'database/rls.sql')
export const APPLY_RLS_SCRIPT = path.join(QMS_ROOT, 'backend/api/scripts/apply-rls.js')

/**
 * The three backend processes. Direct ports (not through Vite) so a failure names
 * the process that is down rather than "the proxy returned 502".
 */
export const SERVICES = [
  { name: 'api', base: process.env.E2E_API_URL || 'http://localhost:4000' },
  { name: 'worker', base: process.env.E2E_WORKER_URL || 'http://localhost:4002' },
  { name: 'sync', base: process.env.E2E_SYNC_URL || 'http://localhost:4003' },
]

/** GraphQL through the Vite proxy: `/api/` is rewritten to the api's `/graphql`. */
export const GRAPHQL_PATH = '/api/graphql'

/** Unique, greppable title for one smoke run. */
export function smokeTitle(tag) {
  return `E2E SMK ${tag} ${Date.now()}`
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
export { q as sqlQuote }

/**
 * Probe one service's readiness endpoint, falling back to the static /health when
 * /health/ready is not deployed yet (404). Returns a description of what answered;
 * throws with the service name + URL on anything else.
 *
 * @param {import('@playwright/test').APIRequestContext} ctx
 * @param {{ name: string, base: string }} svc
 * @param {{ budgetMs?: number }} [opts]
 */
export async function probeServiceHealth(ctx, svc, { budgetMs = 2_000 } = {}) {
  const readyUrl = `${svc.base}/health/ready`
  const liveUrl = `${svc.base}/health`

  async function hit(url) {
    const started = Date.now()
    let res
    try {
      res = await ctx.get(url, { timeout: budgetMs, failOnStatusCode: false, maxRedirects: 0 })
    } catch (err) {
      throw new Error(
        `[${svc.name}] ${url} did not answer within ${budgetMs}ms — is the ${svc.name} process running? (${err.message.split('\n')[0]})`,
      )
    }
    const elapsed = Date.now() - started
    const text = await res.text().catch(() => '')
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      // non-JSON body — reported verbatim below
    }
    return { url, status: res.status(), elapsed, body, text }
  }

  let r = await hit(readyUrl)
  let usedFallback = false
  if (r.status === 404) {
    usedFallback = true
    r = await hit(liveUrl)
  }
  const detail = `[${svc.name}] GET ${r.url} → ${r.status} in ${r.elapsed}ms; body: ${r.text.slice(0, 400)}`
  expect(r.status, `${detail}\n(503 = a dependency check is failing; see body.checks)`).toBe(200)
  expect(r.elapsed, `${detail}\nhealth must answer within ${budgetMs}ms`).toBeLessThan(budgetMs)
  expect(r.body?.status, `${detail}\nhealth body must say status "ok"`).toBe('ok')
  return { ...r, usedFallback }
}

/**
 * A cookie-free APIRequestContext that has logged `user` in through the real
 * /v1/auth/login → handoff flow on `baseURL`. Login is additive (it mints a new
 * session and never touches the persona's stored storageState session). Caller
 * disposes.
 */
export async function freshLoginContext(baseURL, user, password = PASSWORD) {
  const ctx = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  const login = await ctx.post('/api/v1/auth/login', {
    data: { email: user.email, password },
    maxRedirects: 0,
    failOnStatusCode: false,
  })
  if (login.status() !== 302) {
    await ctx.dispose()
    throw new Error(
      `fresh login ${user.email} on ${baseURL} → ${login.status()} (429 = auth rate limiter)`,
    )
  }
  const token = new URL(login.headers()['location']).searchParams.get('token')
  const handoff = await ctx.get(`/api/v1/auth/handoff?token=${token}`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  })
  if (![200, 302].includes(handoff.status())) {
    await ctx.dispose()
    throw new Error(`handoff ${user.email} → ${handoff.status()}`)
  }
  return ctx
}

/** POST a GraphQL document; returns { status, body }. Never throws on HTTP status. */
export async function gql(ctx, query, variables = {}) {
  const res = await ctx.post(GRAPHQL_PATH, { data: { query, variables }, failOnStatusCode: false })
  const body = await res.json().catch(() => null)
  return { status: res.status(), body }
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser error collection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Console output that is expected on an AUTHENTICATED page and is not a defect.
 * Narrower than e2e/smoke.spec.js's BENIGN (that suite mocks the backend, so it
 * has to ignore every failed call): here a 5xx resource failure is kept as an
 * error on purpose. 4xx resource failures are permission-gated fetches and
 * avatar/asset misses; aborted/failed fetches are the previous route's in-flight
 * requests cancelled by the navigation the crawl itself performs.
 */
const BENIGN_CONSOLE = [
  /favicon/i,
  /ResizeObserver loop/i,
  /Failed to load resource: the server responded with a status of 4\d\d/i,
  /net::ERR_(ABORTED|CONNECTION_REFUSED|NETWORK_CHANGED)/i,
  /socket\.io|WebSocket/i,
  /\[vite\]/i,
  /AbortError|The user aborted a request|signal is aborted/i,
  /Failed to fetch|NetworkError when attempting|Load failed/i,
]

const BENIGN_PAGEERROR = [/ResizeObserver loop/i, /AbortError|signal is aborted/i]

export function isBenignConsole(text) {
  return BENIGN_CONSOLE.some((re) => re.test(text))
}

/**
 * Start collecting uncaught page errors + non-benign console errors. The returned
 * `take()` drains and returns what was collected since the last call, so one
 * collector can be reused across a sequence of navigations.
 */
export function collectPageErrors(page) {
  let pageErrors = []
  let consoleErrors = []
  page.on('pageerror', (err) => {
    const msg = err?.message || String(err)
    if (!BENIGN_PAGEERROR.some((re) => re.test(msg))) pageErrors.push(msg)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isBenignConsole(msg.text())) consoleErrors.push(msg.text())
  })
  return {
    take() {
      const out = { pageErrors, consoleErrors }
      pageErrors = []
      consoleErrors = []
      return out
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker queue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Jobs that are due NOW and nobody has picked up — the only honest "backlog"
 * figure. Future-dated cron/reminder jobs (run_at > now) are excluded: the dev DB
 * routinely holds a hundred-plus of those while the worker is perfectly healthy.
 */
export function graphileQueueDepth() {
  try {
    return sql(
      `SELECT 'due_unlocked=' || count(*) FILTER (WHERE locked_at IS NULL AND run_at <= now() AND attempts < max_attempts)
           || ' locked=' || count(*) FILTER (WHERE locked_at IS NOT NULL)
           || ' failed_permanently=' || count(*) FILTER (WHERE attempts >= max_attempts)
           || ' future=' || count(*) FILTER (WHERE run_at > now())
         FROM graphile_worker.jobs`,
    )
  } catch (err) {
    return `unavailable (${err.message.split('\n')[0]})`
  }
}

/** Does `table` have `column`? (public schema) */
export function hasColumn(table, column) {
  return (
    sqlValue(
      `SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${q(table)} AND column_name = ${q(column)}`,
    ) === '1'
  )
}

/** One E2ELAB row id from `table`, preferring a live (non-soft-deleted) row. */
export function sampleLabId(table) {
  const live = hasColumn(table, 'deleted_at') ? ' AND deleted_at IS NULL' : ''
  return sqlValue(`SELECT id FROM ${table} WHERE company_id = ${q(COMPANY_ID)}${live} LIMIT 1`)
}
