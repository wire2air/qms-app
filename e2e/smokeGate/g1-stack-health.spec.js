// SMOKE GATE · is the stack alive enough to be worth seeding and logging into?
//
// Runs as the `smokeGate` project, which `setup` depends on — so every project in
// the suite pays these few seconds first, and a dead api/worker/sync fails HERE
// with the process named, instead of 30s later as "login owner → ECONNREFUSED" or
// minutes later as a UI timeout that looks like a product defect.
//
// API + SQL only. No browser, no storageState, no dependence on the E2E seed
// having been applied (the gate runs before the seed does).
import { test, expect, request } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { BASE_URL, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  SERVICES,
  GRAPHQL_PATH,
  MIGRATIONS_DIR,
  RLS_SQL,
  APPLY_RLS_SCRIPT,
  probeServiceHealth,
  freshLoginContext,
  gql,
  graphileQueueDepth,
  sqlQuote as q,
} from '../fixtures/smoke.js'

const TAGS = { tag: ['@smoke', '@p0', '@gate'] }

test.describe('SMOKE GATE · stack health', () => {
  test(
    'SMK-001 · api, worker and sync answer health; GraphQL and /version are mounted',
    TAGS,
    async () => {
      const ctx = await request.newContext({ storageState: { cookies: [], origins: [] } })
      try {
        // ── Health: /health/ready, falling back to /health while ready is not deployed ──
        for (const svc of SERVICES) {
          const r = await probeServiceHealth(ctx, svc, { budgetMs: 2_000 })
          if (r.usedFallback) {
            test.info().annotations.push({
              type: 'health-fallback',
              description: `${svc.name}: /health/ready → 404, used static /health (liveness only, no dependency checks)`,
            })
          } else if (r.body?.checks) {
            test.info().annotations.push({
              type: 'health-checks',
              description: `${svc.name}: ${JSON.stringify(r.body.checks)}`,
            })
          }
        }

        // ── /version (api, public) ──
        const api = SERVICES.find((s) => s.name === 'api')
        const version = await ctx.get(`${api.base}/version`, {
          timeout: 2_000,
          failOnStatusCode: false,
        })
        expect(version.status(), `[api] GET ${api.base}/version`).toBe(200)
        expect(
          (await version.json().catch(() => null))?.version,
          '[api] /version carries a version string',
        ).toMatch(/^\d+\.\d+\.\d+/)

        // ── GraphQL, anonymous ──
        // NOTE: the smoke plan expected 200 here. It is 401 BY DESIGN: GraphQL is a
        // session-only surface (api/app.js mounts requireCompanyAccessWithoutTransaction
        // ahead of grafserv, which answers 401 {message:'Authentication required'} with
        // no session). A 200 would be a security regression, so the anonymous leg pins
        // the 401 and the authenticated leg below proves grafserv itself answers.
        // Through the Vite proxy (`/api/` → api `/`), so this also proves the app
        // origin can reach the api — the path the SPA actually uses.
        const anon = await ctx.post(`${BASE_URL}${GRAPHQL_PATH}`, {
          data: { query: '{ __typename }' },
          timeout: 5_000,
          failOnStatusCode: false,
        })
        expect(
          anon.status(),
          `anonymous POST ${BASE_URL}${GRAPHQL_PATH} must be refused 401 (GraphQL is session-only); ` +
            '502/504 = Vite cannot reach the api, 404 = the /api proxy or graphqlPath moved',
        ).toBe(401)
      } finally {
        await ctx.dispose()
      }

      // ── GraphQL, authenticated ──
      // Needs a real session, and the gate runs before the seed — so only when the
      // owner persona already exists (any DB that has ever run the suite).
      const ownerExists = sqlValue(
        `SELECT count(*) FROM users WHERE id = ${q(USERS.owner.id)} AND company_id = ${q(COMPANY_ID)}`,
      )
      if (ownerExists !== '1') {
        test.info().annotations.push({
          type: 'skipped-leg',
          description:
            'authenticated GraphQL leg skipped: E2E owner not seeded yet (first run on a fresh DB)',
        })
        return
      }
      const authed = await freshLoginContext(BASE_URL, USERS.owner)
      try {
        const { status, body } = await gql(authed, '{ __typename }')
        expect(
          status,
          `authenticated POST ${BASE_URL}${GRAPHQL_PATH} → ${status}: ${JSON.stringify(body)}`,
        ).toBe(200)
        expect(body?.data?.__typename, 'grafserv resolved the root Query type').toBe('Query')
      } finally {
        await authed.dispose()
      }
    },
  )

  test('SMK-002 · migrations are current and rls.sql is applied without drift', TAGS, async () => {
    // ── Migrations: every file in the checkout is recorded in SequelizeMeta ──
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.js'))
      .sort()
    expect(files.length, `migration files found in ${MIGRATIONS_DIR}`).toBeGreaterThan(0)
    const newestFile = files[files.length - 1]

    const applied = new Set(sql(`SELECT name FROM "SequelizeMeta"`).split('\n').filter(Boolean))
    const pending = files.filter((f) => !applied.has(f))
    expect(
      pending,
      `${pending.length} migration(s) in the checkout are NOT applied to the DB — run the api migrate first:\n  ${pending.join('\n  ')}`,
    ).toEqual([])

    const newestApplied = sqlValue(`SELECT max(name) FROM "SequelizeMeta"`)
    expect(
      newestApplied,
      `newest applied migration (${newestApplied}) must equal the newest file in the checkout (${newestFile}). ` +
        'Applied > file means the DB was migrated from ANOTHER branch (wrong checkout, or a migration the checkout lacks).',
    ).toBe(newestFile)

    // ── rls.sql: stored file hash == sha256 of the file on disk ──
    // Semantics confirmed from backend/api/scripts/apply-rls.js: it stores
    // sha256(utf8 file contents) as rls_apply_state.file_sha256, and an md5
    // fingerprint of pg_policies + RLS flags + app_user grants as live_sha256.
    const state = sql(`SELECT file_sha256 || '|' || live_sha256 FROM rls_apply_state WHERE id`)
    expect(
      state,
      'rls_apply_state has a row — apply-rls has run at least once on this DB',
    ).toBeTruthy()
    const [storedFileSha, storedLiveFp] = state.split('|')

    const fileSha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(RLS_SQL, 'utf8'))
      .digest('hex')
    expect(
      storedFileSha,
      `database/rls.sql on disk (sha256 ${fileSha}) is NOT the version applied to the DB (${storedFileSha}) — run db:apply-rls`,
    ).toBe(fileSha)

    // ── Live drift: recompute the live fingerprint with apply-rls.js's OWN query ──
    // Extracted from the script at runtime rather than copied, so the two can never
    // disagree about what "the live RLS state" means. If the constant is renamed the
    // leg is skipped with an annotation instead of silently comparing something else.
    const script = fs.readFileSync(APPLY_RLS_SCRIPT, 'utf8')
    const m = script.match(/const LIVE_FINGERPRINT_SQL = `([\s\S]*?)`/)
    if (!m) {
      test.info().annotations.push({
        type: 'skipped-leg',
        description: 'live RLS drift check skipped: LIVE_FINGERPRINT_SQL not found in apply-rls.js',
      })
      return
    }
    const liveFp = sqlValue(m[1])
    expect(
      liveFp,
      'live policies/grants differ from what apply-rls recorded (DRIFT) — something changed RLS outside rls.sql; run db:apply-rls',
    ).toBe(storedLiveFp)
  })

  test(
    'SMK-003 · the worker drains an audit job within 20s (trigger → graphile → audit_logs)',
    TAGS,
    async () => {
      // A throwaway department this test owns outright. Departments carry a DB audit
      // trigger that only ENQUEUES an `audit_event` job; the worker writes
      // audit_logs. So a landed UPDATE row proves: trigger fired → job queued → worker
      // picked it up → worker could write. Same mechanism auditLogs/a3 relies on.
      //
      // Deliberately not the auditLogs suite's probe department (e2ead000-…): its
      // rows are asserted on elsewhere. Site-less, so it touches no scope fixture.
      const companyId = sqlValue(`SELECT id FROM companies WHERE id = ${q(COMPANY_ID)}`)
      test.skip(
        !companyId,
        'E2ELAB tenant not seeded yet (fresh DB) — worker liveness probe needs a tenant',
      )
      const stamp = Date.now().toString(36).toUpperCase()
      const id = crypto.randomUUID()
      const code = `S${stamp}`.slice(0, 10)
      const name = `E2E SMK worker probe ${Date.now()}`
      const since = sqlValue('SELECT now()::text')
      const actor = `SELECT set_config('app.current_user_id', ${q(USERS.owner.id)}, false);`

      try {
        sql(
          `${actor} INSERT INTO departments (id, code, company_id, name, description, site_id, supervisor_user_id, created_at, updated_at)
           VALUES (${q(id)}, ${q(code)}, ${q(COMPANY_ID)}, ${q(name)}, 'SMK-003 worker liveness probe', NULL, NULL, NOW(), NOW());`,
        )
        sql(
          `${actor} UPDATE departments SET description = ${q(`SMK-003 touched ${stamp}`)}, updated_at = NOW() WHERE id = ${q(id)};`,
        )

        try {
          await waitForSqlValue(
            `SELECT id FROM audit_logs
            WHERE entity_type = 'Departments' AND entity_id = ${q(id)} AND action = 'UPDATE'
              AND created_at > ${q(since)}
            LIMIT 1`,
            {
              timeoutMs: 20_000,
              intervalMs: 500,
              label: 'audit UPDATE row for the probe department',
            },
          )
        } catch {
          const created = sqlValue(
            `SELECT count(*) FROM audit_logs WHERE entity_type = 'Departments' AND entity_id = ${q(id)}`,
          )
          throw new Error(
            `worker did not write the audit row within 20s — the worker is down, stalled, or backlogged.\n` +
              `  audit rows for the probe so far: ${created}\n` +
              `  graphile_worker queue: ${graphileQueueDepth()}\n` +
              `  worker health: ${SERVICES.find((s) => s.name === 'worker').base}/health`,
          )
        }
      } finally {
        sql(`DELETE FROM departments WHERE id = ${q(id)}`)
      }
    },
  )
})
