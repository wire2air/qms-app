// Shared setup for the multi-site journeys.
//
// The whole feature is: a `site`-scoped grant now reaches EVERY site assigned to
// the user, not just users.site_id. `siteRoamer` is the right subject — it
// already holds ncr:read/update at SITE scope and lives at Primary Site — so
// these journeys manipulate its ADDITIONAL sites and watch the NC row set move.
//
// The seeded tenant has all 295 NCs at Primary Site, so every journey needs one
// NC at Secondary to have anything to prove. We mint a dedicated one rather than
// moving a seeded row: moving one would silently change what the OTHER
// nonconformance journeys see.
import { execFileSync } from 'node:child_process'
import { sql, sqlValue } from '../fixtures/db.js'
import { COMPANY_ID, USERS, SITES } from '../fixtures/cast.js'

const REDIS_CONTAINER = process.env.E2E_REDIS_CONTAINER || 'qms-redis-1'

export const ROAMER = USERS.siteRoamer.id
export const PROBE_NC_TITLE = 'E2E MultiSite Probe NC'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * An NC at Secondary Site that ONLY a multi-site grant can reach.
 *
 * Both of these placements are load-bearing, and getting either wrong makes
 * every assertion in this suite pass for the wrong reason:
 *
 *  - owner is someone else. `scope_allowed` admits `rank >= 1 AND owner = me`,
 *    so a probe the roamer owns is visible with no site assignment at all.
 *  - department is Operations (at Secondary), NOT the roamer's Quality. The
 *    scope ladder is inclusive: a `site` grant is rank 3, which also satisfies
 *    `rank >= 2 AND dept = mine`. Cloning a seeded NC verbatim inherits Quality
 *    and the probe becomes visible via the DEPARTMENT tier — which is exactly
 *    how the first draft of this suite failed.
 */
export function probeDepartmentId() {
  const dept = sqlValue(
    `SELECT id FROM departments
      WHERE company_id = '${COMPANY_ID}' AND site_id = '${SITES.secondary.id}' AND deleted_at IS NULL
      LIMIT 1`,
  )
  if (!dept) {
    throw new Error(
      'ensureProbeNc: no department at Secondary Site. The probe must sit in a department the ' +
        'roamer does NOT belong to, or the department tier admits it regardless of site.',
    )
  }
  return dept
}

export function ensureProbeNc() {
  const dept = probeDepartmentId()
  const existing = sqlValue(
    `SELECT id FROM nonconformances WHERE title = ${q(PROBE_NC_TITLE)} AND deleted_at IS NULL LIMIT 1`,
  )
  if (existing) {
    // Re-assert placement in case an earlier run left it moved.
    sql(
      `UPDATE nonconformances SET site_id = '${SITES.secondary.id}', department_id = '${dept}'
        WHERE id = '${existing}'`,
    )
    return existing
  }

  // Clone a seeded NC's required FKs rather than guessing them — the table has
  // several NOT NULL lookups whose ids differ per seed. Owner/department are
  // overridden below; everything else is inherited.
  const template = sqlValue(
    `SELECT id FROM nonconformances
      WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL
        AND owner_id <> '${USERS.siteRoamer.id}'
      LIMIT 1`,
  )
  if (!template) throw new Error('ensureProbeNc: no seeded nonconformance to clone from')

  // Column list mirrors the table's actual NOT NULL / no-default set — do not
  // guess it; `nonconformances` has several required lookups whose names differ
  // from the obvious (type_id not issue_type_id, detected_at not detected_date).
  return sqlValue(`
    INSERT INTO nonconformances (
      id, company_id, nc_number, title, severity_id, type_id, source_id,
      site_id, department_id, owner_id, detected_at, created_by, updated_by,
      created_at, updated_at
    )
    SELECT gen_random_uuid(), company_id,
           'E2E-MS-' || substr(gen_random_uuid()::text, 1, 8),
           ${q(PROBE_NC_TITLE)}, severity_id, type_id, source_id,
           '${SITES.secondary.id}', '${dept}', owner_id, detected_at,
           created_by, updated_by, now(), now()
      FROM nonconformances WHERE id = '${template}'
    RETURNING id`)
}

/** Live ADDITIONAL site ids for a user (what user_sites actually holds). */
export function additionalSiteIds(userId) {
  const out = sql(
    `SELECT site_id FROM user_sites WHERE user_id = '${userId}' AND deleted_at IS NULL ORDER BY site_id`,
  )
  return out ? out.split('\n') : []
}

/** What the PDP itself resolves — the same function RLS and the session use. */
export function effectiveSiteIds(userId) {
  const out = sqlValue(
    `SELECT array_to_string(authz.effective_site_ids('${userId}'::uuid, '${COMPANY_ID}'::uuid), ',')`,
  )
  return out ? out.split(',') : []
}

// The audit trigger enqueues an audit_event job carrying whatever
// `app.current_user_id` held at write time — and audit_event.js SKIPS any
// payload without one ("missing user_id"). A bare psql write therefore produces
// a job that is silently dropped, which would make the audit journey below
// assert nothing. Real writes (REST and GraphQL alike) always carry the GUC, so
// these helpers set it too: the test should exercise the same path the product
// does, not a degenerate one.
const AS_ADMIN = `SELECT set_config('app.current_user_id', '${USERS.owner.id}', false),
                         set_config('app.current_company_id', '${COMPANY_ID}', false);`

export function assignSite(userId, siteId) {
  sql(`${AS_ADMIN}
    INSERT INTO user_sites (company_id, user_id, site_id, created_at, updated_at)
    VALUES ('${COMPANY_ID}', '${userId}', '${siteId}', now(), now())
    ON CONFLICT DO NOTHING`)
}

export function unassignSite(userId, siteId) {
  sql(`${AS_ADMIN}
    UPDATE user_sites SET deleted_at = now(), updated_at = now()
     WHERE user_id = '${userId}' AND site_id = '${siteId}' AND deleted_at IS NULL`)
}

/** Hard-reset a user's additional sites — tombstones included, so runs don't accrete. */
export function clearSites(userId) {
  sql(`DELETE FROM user_sites WHERE user_id = '${userId}'`)
}

/**
 * Bump the authz epoch so an ALREADY-LOGGED-IN session picks the change up on
 * its next request instead of at next login.
 *
 * These journeys write user_sites over SQL, which does fire the audit trigger →
 * worker → epoch bump. But that path is asynchronous, and a test that waits on
 * it is testing the worker's latency rather than the invalidation contract. So
 * we bump synchronously here, straight into Redis, and let the journey assert
 * the thing that matters: that a live session re-hydrates rather than serving a
 * stale site set.
 */
export function bumpEpoch(userId) {
  try {
    execFileSync(
      'docker',
      ['exec', '-i', REDIS_CONTAINER, 'redis-cli', 'INCR', `authz:epoch:${userId}`],
      { encoding: 'utf8', timeout: 10_000 },
    )
  } catch {
    // Redis unreachable → the epoch is fail-open by design (see
    // shared/utils/authzEpoch.js). The journey that depends on it says so.
  }
}
