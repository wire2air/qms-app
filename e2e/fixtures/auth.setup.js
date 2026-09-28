// Auth bootstrap — runs once before the documents project (Playwright "setup"
// dependency). Applies the dedicated E2E seed, then logs in each cast member
// via the real /v1/auth/login flow and saves a storageState per role.
//
// Requires the full dev stack (api/worker/sync + vite) — see e2e/README.md.
import { test as setup, expect, request } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE_URL, PASSWORD, COMPANY_ID } from './cast.js'
import { personas, loginToStateFile } from './authSession.js'
import { sqlValue } from './db.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// qms-app/e2e/fixtures → repo-root/qms/database/e2e-seed.sql
const SEED_SQL = path.resolve(HERE, '../../../qms/database/e2e-seed.sql')
const CONTAINER = process.env.E2E_PSQL_CONTAINER || 'qms-postgres-1'
const PG_USER = process.env.E2E_PSQL_USER || 'postgres'
const PG_DB = process.env.E2E_PSQL_DB || 'app-db'

setup('apply the E2E seed (idempotent)', async () => {
  expect(fs.existsSync(SEED_SQL), `seed file exists at ${SEED_SQL}`).toBeTruthy()
  const sqlText = fs.readFileSync(SEED_SQL, 'utf8')
  // Pipe the seed into psql inside the dev postgres container.
  execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-v', 'ON_ERROR_STOP=1'], {
    input: sqlText,
    encoding: 'utf8',
    timeout: 30_000,
  })
  const users = sqlValue(`SELECT count(*) FROM users WHERE company_id = '${COMPANY_ID}'`)
  expect(Number(users), 'E2ELAB users seeded').toBeGreaterThanOrEqual(8)
})

setup('stack is up', async () => {
  // Playwright's request API, NOT global fetch: undici captures dns.lookup at
  // process start, so the `*.localhost` DNS shim (e2e/fixtures/localhostDns.js)
  // can't reach it — global fetch ENOTFOUNDs on machines without /etc/hosts
  // entries while Playwright's own stack resolves fine.
  const ctx = await request.newContext({ baseURL: BASE_URL })
  let status
  try {
    status = (await ctx.get('/')).status()
  } catch {
    throw new Error(
      `E2E stack is not running at ${BASE_URL}.\n` +
        `Start it first: ./dev.sh (repo root) — api :4000, worker :4002, sync :4003, app :5173.`,
    )
  } finally {
    await ctx.dispose().catch(() => {})
  }
  expect(status, `GET ${BASE_URL}`).toBe(200)
})

setup('login all roles and save storage state', async () => {
  fs.mkdirSync('e2e/.auth', { recursive: true })

  // Every E2ELAB role, plus the E2EALT owner for cross-tenant tests. The same
  // login keeps these files fresh mid-run — see e2e/authKeepAlive.global.js.
  for (const p of personas()) {
    await loginToStateFile(p.baseURL, p.user, p.statePath, PASSWORD, p.role)
  }
})
