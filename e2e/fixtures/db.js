// Direct-database assertion helper for E2E tests.
//
// Runs psql inside the dev postgres container (zero npm dependencies). Override
// via env when the stack runs elsewhere:
//   E2E_PSQL_CONTAINER  (default qms-postgres-1)
//   E2E_PSQL_USER       (default postgres)
//   E2E_PSQL_DB         (default app-db)
import { execFileSync } from 'node:child_process'

const CONTAINER = process.env.E2E_PSQL_CONTAINER || 'qms-postgres-1'
const PG_USER = process.env.E2E_PSQL_USER || 'postgres'
const PG_DB = process.env.E2E_PSQL_DB || 'app-db'

/**
 * Run a SQL statement; returns trimmed stdout (tuples-only, unaligned).
 * Rows are newline-separated, columns pipe-separated.
 */
export function sql(query) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-v', 'ON_ERROR_STOP=1', '-tAc', query],
    { encoding: 'utf8', timeout: 15_000 },
  ).trim()
}

/** First row as an array of column strings (or null when no rows). */
export function sqlRow(query) {
  const out = sql(query)
  if (!out) return null
  return out.split('\n')[0].split('|')
}

/** Single scalar value (or null). */
export function sqlValue(query) {
  const row = sqlRow(query)
  return row ? row[0] : null
}

/**
 * SQL truthiness, not JavaScript truthiness.
 *
 * `sqlValue` hands back psql stdout as a *string*, so the natural
 * `if (value)` test is wrong for the two idioms these barriers actually use:
 * `SELECT count(*)` yields "0" and a boolean column yields "f" — both truthy
 * strings in JS. Reading them as ready made every count(*)-based
 * `waitForSqlValue` return on its first poll without waiting for anything,
 * silently turning ~25 barriers across the documents + nonconformances suites
 * into no-ops (the specs still passed because the UI assertions around them
 * retry on their own; single-shot API assertions do not).
 */
function isSqlReady(value) {
  if (value === null || value === '') return false // no rows
  if (value === '0') return false // count(*) with no matches
  if (value === 'f') return false // boolean false
  return true
}

/**
 * Poll until `query` returns a ready scalar (worker-produced state: snapshots,
 * training, notifications). Throws with the last value on timeout.
 */
export async function waitForSqlValue(query, { timeoutMs = 60_000, intervalMs = 1_500, label = query } = {}) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = sqlValue(query)
    if (isSqlReady(last)) return last
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`waitForSqlValue timed out (${timeoutMs}ms): ${label} — last value: ${JSON.stringify(last)}`)
}

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * The two site GUCs the real request path sets (`api/config/authzPgSettings.js`).
 *
 * These are easy to leave out of a raw-SQL probe and expensive to leave out. With
 * neither set, `authz.current_site_ids()` resolves to an empty array, so EVERY
 * site-scoped policy correctly matches nothing — and the probe reads as "site
 * scope returns no rows" when the truth is "this session never said what site the
 * user is at." That is a fail-closed default we want in production and a false
 * positive we do not want in a test.
 *
 * Derived from the database via `authz.effective_site_ids` — the same function the
 * API calls — so the helper cannot drift away from the product it is probing.
 *
 * Emitted as a DO block because `PERFORM` prints nothing; a bare `SELECT
 * set_config(...)` would add result rows to output the callers parse.
 *
 * @param {boolean} isLocal - true inside an explicit BEGIN/COMMIT, false for a
 *   session-level script (`SET ROLE` without a transaction).
 */
export function siteGucSql(userId, companyId, isLocal) {
  const local = isLocal ? 'true' : 'false'
  return `DO $do$ BEGIN
    PERFORM set_config('app.current_user_site_id',
      coalesce((SELECT site_id::text FROM users WHERE id = ${quote(userId)}), ''), ${local});
    PERFORM set_config('app.current_user_site_ids',
      coalesce((SELECT '{' || string_agg(s::text, ',') || '}'
                  FROM unnest(authz.effective_site_ids(${quote(userId)}::uuid, ${quote(companyId)}::uuid)) s),
               ''), ${local});
  END $do$;`
}

/**
 * Run SQL as the untrusted `app_user` DB role — the role PostGraphile uses for
 * every GraphQL request. This is the only way to exercise RLS policies and the
 * status-transition triggers from a test: Sequelize/REST connects as the
 * superuser DB_USER, which bypasses both.
 *
 * The session GUCs mirror what `requireCompanyAccess` sets, minus the
 * per-module `*_transition_context = 'trusted'` marker — so a guard trigger
 * sees exactly what a raw GraphQL mutation would.
 *
 * Returns `{ ok, output, error }` rather than throwing, since the interesting
 * assertion is usually that the statement was REJECTED.
 */
export function sqlAsAppUser(query, { userId, companyId }) {
  const script = [
    // Derive the site GUCs BEFORE dropping to app_user — the lookup reads `users`,
    // which is itself RLS-protected, and would come back empty afterwards.
    siteGucSql(userId, companyId, false),
    'SET ROLE app_user;',
    `SELECT set_config('app.current_user_id', ${quote(userId)}, false);`,
    `SELECT set_config('app.current_company_id', ${quote(companyId)}, false);`,
    "SELECT set_config('app.current_user_is_owner', 'false', false);",
    query,
  ].join('\n')
  try {
    const output = execFileSync(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-v', 'ON_ERROR_STOP=1', '-tA'],
      { encoding: 'utf8', timeout: 15_000, input: script },
    )
    return { ok: true, output: output.trim(), error: '' }
  } catch (err) {
    return { ok: false, output: err.stdout ?? '', error: `${err.stderr ?? ''}` }
  }
}

/** Document row by exact title (E2E titles are unique per run). */
export function findDocumentByTitle(title) {
  const row = sqlRow(
    `SELECT id, doc_number, status_id FROM documents WHERE title = ${quote(title)} ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return { id: row[0], docNumber: row[1] || null, statusId: row[2] }
}

/** Nonconformance row by exact title (E2E titles are unique per run). */
export function findNcByTitle(title) {
  const row = sqlRow(
    `SELECT id, nc_number, status_id, owner_id FROM nonconformances WHERE title = ${quote(title)} ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return { id: row[0], ncNumber: row[1] || null, statusId: row[2], ownerId: row[3] }
}

/** CAPA row by exact title (E2E titles are unique per run). */
export function findCapaByTitle(title) {
  const row = sqlRow(
    `SELECT id, capa_number, status_id, owner_id FROM capas WHERE title = ${quote(title)} ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return { id: row[0], capaNumber: row[1] || null, statusId: row[2], ownerId: row[3] }
}

/** Change Request row by exact title (E2E titles are unique per run). */
export function findCrByTitle(title) {
  const row = sqlRow(
    `SELECT id, cr_number, status_id, owner_id, created_by FROM change_requests WHERE title = ${quote(title)} ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return { id: row[0], crNumber: row[1] || null, statusId: row[2], ownerId: row[3], createdBy: row[4] }
}

export function versionsOf(documentId) {
  const out = sql(
    `SELECT id, version_label, status_id, is_latest, snapshot_sha256 FROM document_versions WHERE document_id = ${quote(documentId)} AND deleted_at IS NULL ORDER BY version_major, version_minor`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, label, statusId, isLatest, sha] = line.split('|')
    return { id, label, statusId, isLatest: isLatest === 't', snapshotSha256: sha || null }
  })
}
