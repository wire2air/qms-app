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
