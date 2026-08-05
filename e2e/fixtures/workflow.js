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

export { uniqueTitle }
