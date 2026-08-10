// Shared setup for the `workflow` project.
//
// The workflow engine owns no page of its own that can create a live instance —
// an instance only exists because some RECORD was submitted for review. So these
// journeys ride the Change Request flow to manufacture a real
// workflow_instance → workflow_instance_steps → users_on_workflow_instance_steps
// graph, then probe the engine's own tables directly.
//
// CR is the right carrier: it is the largest live population of the 12 resource
// types (346 instances on app-db), its seeded template has three steps including
// an e-sign-required APPROVAL step, and its fixture is already the most complete
// in the harness.
import { sql, sqlRow, sqlValue, waitForSqlValue } from './db.js'
import { createCr, assignDraftReviewers, submitCrForApproval, uniqueTitle } from './changeRequests.js'
import { findCrByTitle } from './db.js'
import { COMPANY_ID } from './cast.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * Drive the UI far enough to produce a live, IN_PROGRESS workflow instance and
 * return the engine-side ids the journeys assert against.
 *
 * @returns {Promise<{crId: string, title: string, instanceId: string}>}
 */
export async function createLiveWorkflowInstance(page, tag) {
  const title = uniqueTitle(tag)
  await createCr(page, title)
  const cr = findCrByTitle(title)
  await assignDraftReviewers(page, cr.id)
  await submitCrForApproval(page, cr.id)

  const instanceId = sqlValue(
    `SELECT id FROM workflow_instances
      WHERE resource_type = 'ChangeRequest' AND resource_id = ${q(cr.id)}
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!instanceId) throw new Error(`no workflow_instance created for CR ${cr.id}`)

  // Barrier on the ASSIGNMENTS, not just the instance. `submitCrForApproval`
  // returns as soon as the CR shows "Under Review", but the first step's
  // `users_on_workflow_instance_steps` rows are written by the activation path
  // immediately after — so reading them straight away is a race. Every journey
  // here picks a persona out of those rows, and without this barrier the suite
  // fails intermittently (observed once in three runs).
  await waitForSqlValue(
    `SELECT count(*) > 0 FROM users_on_workflow_instance_steps uawis
       JOIN workflow_instance_steps wis ON wis.id = uawis.workflow_instance_step_id
      WHERE wis.workflow_instance_id = ${q(instanceId)} AND uawis.deleted_at IS NULL`,
    { timeoutMs: 30_000, label: `assignments exist on workflow instance ${instanceId}` },
  )

  return { crId: cr.id, title, instanceId }
}

/**
 * Every instance step, ordered.
 *
 * Uses `sql()` (all rows, newline-separated / pipe-separated) rather than
 * `sqlValue()` — the latter returns only the FIRST LINE of psql output, so an
 * aggregate carrying embedded newlines silently collapses to one step.
 */
export function stepsOf(instanceId) {
  const out = sql(
    `SELECT id, step_number, status_id, coalesce(step_type,''),
            coalesce(require_esignature::text,''), coalesce(approval_rule,'')
       FROM workflow_instance_steps
      WHERE workflow_instance_id = ${q(instanceId)} AND deleted_at IS NULL
      ORDER BY step_number`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, stepNumber, statusId, stepType, requireEsignature, approvalRule] = line.split('|')
    return {
      id,
      stepNumber: Number(stepNumber),
      statusId,
      stepType: stepType || null,
      // ::text on a boolean yields 'true'/'false' — NOT the 't'/'f' psql prints
      // for a raw boolean column in unaligned mode. Accept both so this does not
      // silently read as `false` if the cast is ever dropped.
      requireEsignature:
        requireEsignature === '' ? null : requireEsignature === 'true' || requireEsignature === 't',
      approvalRule: approvalRule || null,
    }
  })
}

// `sqlRow` returns an ARRAY of column strings, not a named object — these two
// wrappers give the journeys named fields so a column re-order can't silently
// swap two uuids.
function assignmentFromRow(row) {
  if (!row) return null
  const [id, userId, statusId, workflowInstanceStepId] = row
  return { id, userId, statusId, workflowInstanceStepId }
}

/** The assignment (ledger) row for a given user on a given instance step. */
export function assignmentFor(instanceStepId, userId) {
  return assignmentFromRow(
    sqlRow(
      `SELECT id, user_id, status_id, workflow_instance_step_id
         FROM users_on_workflow_instance_steps
        WHERE workflow_instance_step_id = ${q(instanceStepId)} AND user_id = ${q(userId)}
        ORDER BY created_at DESC LIMIT 1`,
    ),
  )
}

/** Any assignment row on the instance, whoever holds it. */
export function anyAssignmentOn(instanceId) {
  return assignmentFromRow(
    sqlRow(
      `SELECT uawis.id, uawis.user_id, uawis.status_id, uawis.workflow_instance_step_id
         FROM users_on_workflow_instance_steps uawis
         JOIN workflow_instance_steps wis ON wis.id = uawis.workflow_instance_step_id
        WHERE wis.workflow_instance_id = ${q(instanceId)}
          AND uawis.deleted_at IS NULL
        ORDER BY uawis.created_at ASC LIMIT 1`,
    ),
  )
}

// ───────────────────────────────────────────────────────────────────────────
// TEMPLATE-side helpers (PW-J1 authoring, PW-J3 create-draft clone).
//
// Everything above this line reads the RUNTIME graph (workflow_instances…).
// The journeys below assert against the DESIGN graph — workflows →
// workflow_versions → workflow_steps → {roles, users, allowed outcomes} — which
// no fixture covered before, because until PW-J1 no spec had ever driven the
// template-authoring surface at all.
// ───────────────────────────────────────────────────────────────────────────

/** Template header row by exact name (E2E names carry a Date.now() suffix). */
export function findWorkflowByName(name) {
  const row = sqlRow(
    `SELECT id, module_id, status_id, coalesce(description,'')
       FROM workflows
      WHERE name = ${q(name)} AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return { id: row[0], moduleId: row[1], statusId: row[2], description: row[3] }
}

/** Every live version of a template, oldest first. */
export function workflowVersionsOf(workflowId) {
  const out = sql(
    `SELECT id, version_major, version_minor, status_id, coalesce(is_current::text,'')
       FROM workflow_versions
      WHERE workflow_id = ${q(workflowId)} AND deleted_at IS NULL
      ORDER BY version_major, version_minor`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, major, minor, statusId, isCurrent] = line.split('|')
    return {
      id,
      versionMajor: Number(major),
      versionMinor: Number(minor),
      label: `${major}.${minor}`,
      statusId,
      isCurrent: isCurrent === 'true' || isCurrent === 't',
    }
  })
}

/**
 * The full step DEFINITION of a template version — every field the create-draft
 * clone is supposed to carry forward, in one row per step.
 *
 * Two deliberate encodings, both forced by `db.js`'s psql plumbing:
 *   - `formSchema` is reduced to (length, md5 of the jsonb text) rather than
 *     returned raw. A form schema contains free text with embedded newlines and
 *     pipes, either of which would split or mis-column the row — the exact
 *     failure mode documented on `stepsOf` above. `jsonb::text` normalises key
 *     order, so the md5 is a safe equality token between a source step and its
 *     clone, which is all PW-J3 needs.
 *   - the three child collections come back as sorted comma-joined id lists via
 *     correlated subqueries, so one step is still one line.
 */
export function templateStepsOf(versionId) {
  const out = sql(
    `SELECT s.id,
            s.step_order,
            s.name,
            coalesce(s.step_type,''),
            coalesce(s.approval_rule,''),
            coalesce(s.require_esignature::text,''),
            coalesce(s.require_comments::text,''),
            coalesce(s.sla_days::text,''),
            coalesce(s.delay_days::text,''),
            coalesce(s.delay_until_date::text,''),
            coalesce(s.max_delay_extensions::text,''),
            coalesce(s.allow_child_steps::text,''),
            coalesce(s.parent_step_id::text,''),
            (CASE WHEN jsonb_typeof(s.form_schema) = 'array'
                  THEN jsonb_array_length(s.form_schema) ELSE -1 END)::text,
            coalesce(md5(s.form_schema::text),'null'),
            coalesce((SELECT string_agg(r.role_id::text, ',' ORDER BY r.role_id::text)
                        FROM workflow_step_roles r
                       WHERE r.step_id = s.id AND r.deleted_at IS NULL), ''),
            coalesce((SELECT string_agg(u.user_id::text, ',' ORDER BY u.user_id::text)
                        FROM workflow_step_users u
                       WHERE u.step_id = s.id AND u.deleted_at IS NULL), ''),
            coalesce((SELECT string_agg(o.outcome_id, ',' ORDER BY o.outcome_id)
                        FROM allowed_outcomes_on_steps o
                       WHERE o.step_id = s.id), '')
       FROM workflow_steps s
      WHERE s.workflow_version_id = ${q(versionId)} AND s.deleted_at IS NULL
      ORDER BY s.step_order, s.created_at`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [
      id,
      stepOrder,
      name,
      stepType,
      approvalRule,
      requireEsignature,
      requireComments,
      slaDays,
      delayDays,
      delayUntilDate,
      maxDelayExtensions,
      allowChildSteps,
      parentStepId,
      formFieldCount,
      formSchemaHash,
      roleIds,
      userIds,
      outcomeIds,
    ] = line.split('|')
    // ::text on a boolean yields 'true'/'false', a raw boolean column yields
    // 't'/'f' — accept both so a dropped cast can't silently read as false.
    const bool = (v) => (v === '' ? null : v === 'true' || v === 't')
    const num = (v) => (v === '' ? null : Number(v))
    const list = (v) => (v === '' ? [] : v.split(','))
    return {
      id,
      stepOrder: Number(stepOrder),
      name,
      stepType: stepType || null,
      approvalRule: approvalRule || null,
      requireEsignature: bool(requireEsignature),
      requireComments: bool(requireComments),
      slaDays: num(slaDays),
      delayDays: num(delayDays),
      delayUntilDate: delayUntilDate || null,
      maxDelayExtensions: num(maxDelayExtensions),
      allowChildSteps: bool(allowChildSteps),
      parentStepId: parentStepId || null,
      formFieldCount: Number(formFieldCount),
      formSchemaHash,
      roleIds: list(roleIds),
      userIds: list(userIds),
      outcomeIds: list(outcomeIds),
    }
  })
}

/**
 * Remove every template whose name starts with `prefix` from the E2E tenant.
 *
 * The authoring journeys mint real templates, and a leftover ACTIVE workflow
 * with a PUBLISHED version becomes a second candidate in every record-create
 * workflow picker (`WorkflowVersionSelect` lists ACTIVE + PUBLISHED). The CR
 * fixture asserts its picker auto-fills with exactly one named template, so an
 * un-purged leftover would break a suite three other agents depend on.
 *
 * `workflow_instance_steps.step_id` and `workflow_instances.workflow_version_id`
 * are ON DELETE RESTRICT, so anything that ever ran is skipped rather than
 * throwing — versions/steps/roles/users/outcomes cascade from `workflows`.
 */
export function purgeWorkflowsNamed(prefix) {
  sql(
    `DELETE FROM workflows w
      WHERE w.company_id = ${q(COMPANY_ID)}
        AND w.name LIKE ${q(`${prefix}%`)}
        AND NOT EXISTS (
          SELECT 1 FROM workflow_versions v
            JOIN workflow_instances i ON i.workflow_version_id = v.id
           WHERE v.workflow_id = w.id)`,
  )
}

/**
 * Record every REST call the page makes, so a journey can assert a NEGATIVE:
 * that a UI flow never touched a given endpoint family.
 *
 * Attaches on `request` (not `response`) deliberately — a request that is
 * issued and then fails, aborts or 404s still counts as "the UI called it",
 * which is exactly the claim under test in PW-J1.
 */
export function watchRestWrites(page) {
  const calls = []
  page.on('request', (req) => {
    const method = req.method()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
    calls.push({ method, url: req.url() })
  })
  return {
    all: () => calls,
    /** Non-GET calls whose path matches `pattern` (a RegExp over the URL). */
    matching: (pattern) => calls.filter((c) => pattern.test(c.url)),
    graphql: () => calls.filter((c) => c.url.includes('/api/graphql')),
  }
}

export { uniqueTitle }
