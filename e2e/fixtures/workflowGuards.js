// Guard-layer helpers for the workflow ENGINE journeys PW-J14…PW-J18.
//
// `fixtures/workflow.js` builds and reads the runtime graph (instances, steps,
// assignments). This file covers the three things the GUARD journeys assert on
// and that file deliberately does not:
//
//   1. `task_instances` — the row API-15's assignment gate keys on, and the row
//      `signatures` binds to. Every claim in PW-J16/J17/J18 is ultimately about
//      a task, not about a step.
//   2. `signatures` — reachable from a step only through `task_instances`
//      (`source_type = 'WorkflowInstanceStep'`), which is easy to get wrong and
//      silently returns 0 when you do.
//   3. the disposable reviewer-less TEMPLATE PW-J15 needs, which cannot be
//      authored through the UI without becoming visible to every other suite's
//      workflow picker (see `seedReviewerlessTemplate` for why it is INACTIVE).
//   4. (added 2026-08-28) the TAKEOVER trail — `audit_logs.performed_by`,
//      `signatures.proxy_session_user_id` and the TASK_ACTED_BY_OTHER notice.
//      Since the 2026-08-19 assignee-verb rule a permitted non-assignee may act
//      on someone else's step, and the whole safety argument for allowing that
//      is that it is ATTRIBUTED and REPORTED. PW-J17 pins all three.
//
// Owned by the PW-J14…J18 specs only. `fixtures/workflow.js` and
// `fixtures/cast.js` are owned elsewhere and are imported, never edited.
import { execFileSync } from 'node:child_process'
import { expect } from '@playwright/test'
import { sql, sqlRow, sqlValue, waitForSqlValue } from './db.js'
import { COMPANY_ID, USERS } from './cast.js'

const REDIS_CONTAINER = process.env.E2E_REDIS_CONTAINER || 'qms-redis-1'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// ── Tasks ───────────────────────────────────────────────────────────────────

/**
 * Every task on an instance step, newest first.
 *
 * `sql()` not `sqlValue()`: the latter returns only psql's FIRST LINE, so a
 * multi-row read collapses to one task and every "no extra task was created"
 * assertion built on it would pass vacuously.
 */
export function tasksOnStep(instanceStepId) {
  const out = sql(
    `SELECT id, assigned_to, status_id, coalesce(comment,'')
       FROM task_instances
      WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(instanceStepId)}
        AND deleted_at IS NULL
      ORDER BY created_at DESC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, assignedTo, statusId, comment] = line.split('|')
    return { id, assignedTo, statusId, comment: comment || null }
  })
}

/** The single ASSIGNED task a given user holds on a step, or null. */
export function assignedTaskFor(instanceStepId, userId) {
  const row = sqlRow(
    `SELECT id, status_id FROM task_instances
      WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(instanceStepId)}
        AND assigned_to = ${q(userId)} AND status_id = 'ASSIGNED' AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
  return row ? { id: row[0], statusId: row[1] } : null
}

/** Wait for the engine to mint an ASSIGNED task for `userId` on `instanceStepId`. */
export async function waitForAssignedTask(instanceStepId, userId, timeoutMs = 45_000) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(instanceStepId)}
        AND assigned_to = ${q(userId)} AND status_id = 'ASSIGNED' AND deleted_at IS NULL`,
    { timeoutMs, label: `ASSIGNED task for ${userId} on step ${instanceStepId}` },
  )
  return assignedTaskFor(instanceStepId, userId)
}

export function taskStatus(taskId) {
  return sqlValue(`SELECT status_id FROM task_instances WHERE id = ${q(taskId)}`)
}

export function stepStatus(instanceStepId) {
  return sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = ${q(instanceStepId)}`)
}

/** The per-approver ledger rows on a step: userId → statusId. */
export function assignmentsOnStep(instanceStepId) {
  const out = sql(
    `SELECT user_id, status_id FROM users_on_workflow_instance_steps
      WHERE workflow_instance_step_id = ${q(instanceStepId)} AND deleted_at IS NULL
      ORDER BY created_at`,
  )
  if (!out) return {}
  return Object.fromEntries(out.split('\n').map((l) => l.split('|')))
}

// ── Signatures ──────────────────────────────────────────────────────────────

/**
 * Signature rows bound to a specific task.
 *
 * `signatures` has no step column — the subject CHECK permits exactly one of
 * seven foreign keys and the workflow one is `task_instance_id`. Anything that
 * joins `signatures` to a STEP has to go through `task_instances`.
 */
export function signaturesForTask(taskId) {
  const out = sql(
    `SELECT id, user_id, meaning, coalesce(comments,''), coalesce(proxy_session_user_id::text,'')
       FROM signatures WHERE task_instance_id = ${q(taskId)} ORDER BY created_at`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, userId, meaning, comments, proxySessionUserId] = line.split('|')
    return {
      id,
      userId,
      meaning,
      comments: comments || null,
      // Added 2026-08-28 for PW-J17's takeover case. Since the assignee-verb
      // rule (2026-08-19) a permitted NON-assignee may complete someone else's
      // step; `signatures.user_id` is then the ACTOR and this column names whose
      // task it was. Part 11 needs both — who signed, and on whose behalf. NULL
      // (rendered here as null, not '') is the correct value for an ordinary
      // self-signed step, so callers must distinguish the two.
      proxySessionUserId: proxySessionUserId || null,
    }
  })
}

/**
 * Every audit row the DB trigger wrote for one task, newest first.
 *
 * `audit_logs.entity_type` is the PLURALISED model name ('TaskInstances'), not
 * the singular `sourceType`/`entityType` string used on `task_instances` itself
 * — getting that wrong returns zero rows and every attribution assertion built
 * on it passes vacuously.
 *
 * `performed_by` comes from the `app.current_user_id` GUC that
 * `requireCompanyAccess` sets transaction-locally, so it names whoever actually
 * made the request — which on a takeover is the ACTOR, not the assignee. That is
 * the property PW-J17 asserts.
 */
export function auditRowsForTask(taskId) {
  const out = sql(
    `SELECT action, coalesce(performed_by::text,'')
       FROM audit_logs
      WHERE entity_type = 'TaskInstances' AND entity_id = ${q(taskId)}
      ORDER BY performed_at DESC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [action, performedBy] = line.split('|')
    return { action, performedBy: performedBy || null }
  })
}

/**
 * Wait for the "someone else actioned your task" notice to reach an assignee.
 *
 * `notifyAssigneeOfTakeover` enqueues a graphile job inside the request's own
 * transaction; the `notifications` row is written later by the worker's
 * `send_notification` task. So this has to be a BARRIER — reading the count
 * straight after the 200 is indistinguishable from "the worker has not caught
 * up yet", and a spec built on that goes green the day the worker gets slower.
 *
 * Deliberately keyed on (recipient, type, task) rather than on the message text:
 * the copy is a product decision and will be reworded; who was told, about what,
 * and why is the control.
 */
export async function waitForTakeoverNotice(assigneeUserId, taskInstanceId, timeoutMs = 60_000) {
  await waitForSqlValue(
    `SELECT count(*) FROM notifications
      WHERE deleted_at IS NULL
        AND user_id = ${q(assigneeUserId)}
        AND notification_type_id = 'TASK_ACTED_BY_OTHER'
        AND resource_type = 'TaskInstance'
        AND resource_id = ${q(taskInstanceId)}`,
    { timeoutMs, label: `TASK_ACTED_BY_OTHER notice to ${assigneeUserId} for task ${taskInstanceId}` },
  )
}

/** Total signatures across every task of every step of one workflow instance. */
export function signatureCountForInstance(instanceId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM signatures s
        WHERE s.task_instance_id IN (
          SELECT ti.id FROM task_instances ti
           WHERE ti.source_type = 'WorkflowInstanceStep'
             AND ti.source_id IN (
               SELECT id FROM workflow_instance_steps WHERE workflow_instance_id = ${q(instanceId)}
             )
        )`,
    ),
  )
}

// ── Reviewer pools ──────────────────────────────────────────────────────────

/**
 * The eligible-reviewer pool the engine itself computes for an INSTANCE step —
 * directly-assigned template users UNION the members of the template step's
 * roles. Mirrors `resolveStepReviewerUserIds(stepId, companyId, null, …)`.
 *
 * PW-J18 asserts its ineligible target really is outside this set rather than
 * trusting the seed comment, so a seed change that widens the pool turns the
 * journey red instead of leaving it passing for the wrong reason.
 */
export function eligiblePoolForInstanceStep(instanceStepId) {
  const out = sql(
    `SELECT DISTINCT uid FROM (
       SELECT wsu.user_id AS uid
         FROM workflow_instance_steps wis
         JOIN workflow_step_users wsu ON wsu.step_id = wis.step_id
        WHERE wis.id = ${q(instanceStepId)}
       UNION
       SELECT ru.user_id AS uid
         FROM workflow_instance_steps wis
         JOIN workflow_step_roles wsr ON wsr.step_id = wis.step_id
         JOIN roles_on_users ru ON ru.role_id = wsr.role_id AND ru.company_id = wsr.company_id
        WHERE wis.id = ${q(instanceStepId)}
     ) p WHERE uid IS NOT NULL ORDER BY uid`,
  )
  return out ? out.split('\n') : []
}

// ── Notifications ───────────────────────────────────────────────────────────

/**
 * "Was anybody actually told?" — for one workflow instance.
 *
 * Every workflow notification except NTF-05 rides a `task_instances` INSERT and
 * is stored as `resource_type = 'TaskInstance'`; NTF-05 (send-back to the owner)
 * is stored against the RECORD. Counting only one of the two would make the
 * F-12 silence look narrower than it is, so this counts both.
 */
export function notificationsForInstance(instanceId, resourceType, resourceId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM notifications n
        WHERE n.deleted_at IS NULL
          AND (
            (n.resource_type = 'TaskInstance' AND n.resource_id IN (
               SELECT ti.id FROM task_instances ti
                WHERE ti.source_type = 'WorkflowInstanceStep'
                  AND ti.source_id IN (
                    SELECT id FROM workflow_instance_steps WHERE workflow_instance_id = ${q(instanceId)}
                  )))
            OR (n.resource_type = ${q(resourceType)} AND n.resource_id = ${q(resourceId)})
          )`,
    ),
  )
}

// ── PW-J15's disposable reviewer-less template ──────────────────────────────

// Fixed ids, not Date.now() ones: a crashed run must still be cleanable on the
// next attempt, and `ON CONFLICT DO NOTHING` makes re-seeding idempotent.
export const REVIEWERLESS = {
  workflowId: 'e2efa120-0000-4000-8000-000000000001',
  versionId: 'e2efa120-0000-4000-8000-000000000002',
  stepId: 'e2efa120-0000-4000-8000-000000000003',
  name: 'E2E J15 Reviewer-less Template (F-12 probe)',
}

/**
 * A PUBLISHED workflow version whose only step carries no `workflow_step_roles`
 * and no `workflow_step_users` — the exact template shape F-12 describes, which
 * the readiness dialog raises only an advisory INFO about.
 *
 * The parent `workflows` row is deliberately **INACTIVE**. Every module's
 * workflow picker filters on `statusId === 'ACTIVE'`
 * (ChangeRequestsCreate.vue:161), so an INACTIVE template is invisible to every
 * other suite running concurrently — while `submitResourceForReview` only ever
 * requires the VERSION to be PUBLISHED, so the engine still instantiates it.
 * Authoring this through the wizard instead would put a second ACTIVE
 * CHANGE_CONTROL workflow in front of every other CR spec's auto-filling,
 * `required` workflow select and break them.
 */
export function seedReviewerlessTemplate() {
  sql(
    `INSERT INTO workflows (id, company_id, name, description, module_id, status_id, is_default, created_at, updated_at)
     VALUES (${q(REVIEWERLESS.workflowId)}, ${q(COMPANY_ID)}, ${q(REVIEWERLESS.name)},
             'Disposable. One ACTION step with no role and no user — PW-J15 only.',
             'CHANGE_CONTROL', 'INACTIVE', false, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING;

     INSERT INTO workflow_versions (id, workflow_id, version_major, version_minor, version_label,
                                    change_summary, status_id, is_current, created_by, company_id,
                                    created_at, updated_at)
     VALUES (${q(REVIEWERLESS.versionId)}, ${q(REVIEWERLESS.workflowId)}, 1, 0, '1.0',
             'F-12 probe', 'PUBLISHED', false, ${q(USERS.owner.id)}, ${q(COMPANY_ID)}, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING;

     INSERT INTO workflow_steps (id, workflow_version_id, name, description, step_order, step_type,
                                 approval_rule, sla_days, require_comments, require_esignature,
                                 allow_child_steps, form_schema, company_id, created_at, updated_at)
     VALUES (${q(REVIEWERLESS.stepId)}, ${q(REVIEWERLESS.versionId)}, 'J15 Unassigned Review',
             'No workflow_step_roles row and no workflow_step_users row.',
             1, 'ACTION', 'ALL', 7, false, false, false, '[]', ${q(COMPANY_ID)}, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING;`,
  )

  // The premise of the whole journey. If a later seed change ever attaches a
  // role or user here, PW-J15 would probe a perfectly ordinary template and pass
  // for the wrong reason.
  expect(
    Number(
      sqlValue(
        `SELECT count(*) FROM workflow_step_roles WHERE step_id = ${q(REVIEWERLESS.stepId)}`,
      ),
    ),
    'the probe step must carry no role',
  ).toBe(0)
  expect(
    Number(
      sqlValue(
        `SELECT count(*) FROM workflow_step_users WHERE step_id = ${q(REVIEWERLESS.stepId)}`,
      ),
    ),
    'the probe step must carry no directly-assigned user',
  ).toBe(0)
  return REVIEWERLESS
}

/**
 * Remove the probe template and any instance graph it spawned.
 *
 * MTC-08 is explicit that a stalled instance must not be left behind in a shared
 * environment — a step sitting IN_PROGRESS with zero tasks is invisible to every
 * UI and would quietly pollute later runs' "open steps" counts.
 */
export function purgeReviewerlessTemplate() {
  sql(
    `DELETE FROM task_instances WHERE source_type = 'WorkflowInstanceStep' AND source_id IN (
       SELECT id FROM workflow_instance_steps WHERE step_id = ${q(REVIEWERLESS.stepId)});
     DELETE FROM users_on_workflow_instance_steps WHERE workflow_instance_step_id IN (
       SELECT id FROM workflow_instance_steps WHERE step_id = ${q(REVIEWERLESS.stepId)});
     DELETE FROM workflow_instances WHERE id IN (
       SELECT workflow_instance_id FROM workflow_instance_steps WHERE step_id = ${q(REVIEWERLESS.stepId)});
     DELETE FROM workflow_instance_steps WHERE step_id = ${q(REVIEWERLESS.stepId)};
     DELETE FROM allowed_outcomes_on_steps WHERE step_id = ${q(REVIEWERLESS.stepId)};
     DELETE FROM workflow_steps WHERE id = ${q(REVIEWERLESS.stepId)};
     DELETE FROM workflow_versions WHERE id = ${q(REVIEWERLESS.versionId)};
     DELETE FROM workflows WHERE id = ${q(REVIEWERLESS.workflowId)};`,
  )
}

// ── HTTP ────────────────────────────────────────────────────────────────────

/** The `{ error: { message, code? } }` envelope every REST error uses. */
export async function errorBody(res) {
  const body = await res.json().catch(() => null)
  return {
    message: body?.error?.message ?? '',
    code: body?.error?.code ?? null,
    raw: body,
  }
}

/** POST API-15 (`/taskInstances/:id/action`) on an existing browser context. */
export function postApi15(ctx, taskId, data) {
  return ctx.request.post(`/api/v1/services/taskInstances/${taskId}/action`, { data })
}

/**
 * Clear a user's e-signature PIN failure counter.
 *
 * `utils/esignPinGuard.js` locks a user out for 15 minutes after 5 bad PINs
 * (`esign:pinfail:<userId>` in Redis) and then answers **429 ESIGN_PIN_LOCKED**
 * instead of the 400 a wrong PIN produces. Any spec that deliberately submits a
 * bad PIN therefore has to clean up after itself, or it poisons its own
 * correct-PIN step and every later spec that signs as the same persona — the
 * `authentication` project clears the same class of state in teardown for
 * exactly this reason.
 *
 * Best-effort: a missing container or key is not a test failure.
 */
export function clearEsignPinLockout(userId) {
  try {
    execFileSync(
      'docker',
      ['exec', '-i', REDIS_CONTAINER, 'redis-cli', 'DEL', `esign:pinfail:${userId}`],
      { encoding: 'utf8', timeout: 10_000 },
    )
  } catch {
    /* best effort */
  }
}
