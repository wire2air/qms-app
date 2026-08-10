// Helpers for the multi-approver (PW-J6) and owner-control (PW-J7/J8) workflow
// journeys. Owned by the j6/j7/j8 specs only — fixtures/workflow.js is the
// shared surface and is deliberately not touched from here.
//
// ── Why this file needs an SQL setup path at all ────────────────────────────
//
// The engine mints exactly ONE assignment per step, because every seeded E2E
// workflow step's reviewer pool has exactly one member:
//
//   E2E CR Review & Approval / Impact Review    -> role "E2E Reviewer" -> [reviewer]
//   E2E CR Review & Approval / Change Approval  -> role "E2E Approver" -> [approver]
//   E2E CR Review & Approval / Implementation   -> role "E2E Author"   -> [author]
//
// A second assignee therefore cannot be produced through the reviewer picker,
// and the two ways to widen the pool at template level — adding a role member,
// or adding a `workflow_step_users` row — both mutate a template SHARED with
// every other suite running against this stack (CR/CAPA/NCR/audits all
// auto-select "the sole pool member" in their submit dialogs). Widening it, even
// briefly, would hand another suite the wrong reviewer.
//
// So the multi-assignee shape is built directly on the INSTANCE, replicating
// exactly what `createActiveStepAssignments` (workflowInstanceService.js:218)
// writes for a genuine two-reviewer pool: one `users_on_workflow_instance_steps`
// row (ASSIGNED) plus one `task_instances` row (ASSIGNED / kind APPROVAL /
// source WorkflowInstanceStep). Nothing about the RULE EVALUATION is faked — the
// approvals themselves are driven through the real API-15 action endpoint, as
// the assignee, and every assertion reads the database afterwards.
//
// Same reasoning for `setInstanceApprovalRule`: since F-05's fix (migration
// 20260805130000) the engine reads `workflow_instance_steps.approval_rule` in
// preference to the template's, so ANY is configured on the instance copy. That
// is not a workaround — it is the property under test. The template still says
// ALL throughout the ANY journey, which is what makes the assertion honest:
// the engine can only behave as ANY if it really is reading the instance copy.
import { sql, sqlRow, sqlValue, waitForSqlValue, findNcByTitle } from './db.js'
import { raiseNc, openNc, uniqueTitle as ncTitle } from './nonconformances.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * Wait until the syncEngine's IndexedDB actually holds the reference data a
 * create page's selects render from.
 *
 * A Playwright context starts with an empty IndexedDB *and* an empty
 * localStorage (the saved storageState carries no origins), so `bootstrapAll()`
 * runs from scratch on every single test — a full paginated GraphQL delta-sync
 * over every INSTANT model. When the dev stack is otherwise idle that finishes
 * well inside the 30 s the shared `selectFirstOption` helper allows; when it is
 * not (several suites driving the same api/postgres at once), the lookup tables
 * a create form needs can still be empty when the form is filled, and the
 * failure surfaces as "the listbox opened with no options" — which reads like a
 * UI defect and is not one.
 *
 * Barriering on the DATA rather than on a timeout keeps that out of the
 * journeys. Store names are the `@ClientModel` table names.
 */
export async function warmUpSyncEngine(page, stores, { timeoutMs = 300_000 } = {}) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  const deadline = Date.now() + timeoutMs
  let last = {}
  while (Date.now() < deadline) {
    // The SPA can still be resolving its post-login route while this polls, and
    // an in-flight navigation tears the evaluate context down. That is noise,
    // not a result — retry rather than fail the journey on it.
    try {
      last = await page.evaluate(async (wanted) => {
        const names = (await indexedDB.databases()).map((d) => d.name)
        const target = names.find((n) => n && n.startsWith('qms-'))
        if (!target) return {}
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open(target)
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        })
        const out = {}
        for (const store of wanted) {
          if (!db.objectStoreNames.contains(store)) {
            out[store] = -1
            continue
          }
          out[store] = await new Promise((resolve) => {
            const req = db.transaction(store).objectStore(store).count()
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => resolve(-1)
          })
        }
        db.close()
        return out
      }, stores)
    } catch {
      last = {}
    }
    if (stores.every((s) => last[s] > 0)) return last
    await page.waitForTimeout(2_000)
  }
  throw new Error(`syncEngine bootstrap never populated ${JSON.stringify(last)}`)
}

/** Reference stores the CR create form's required selects read from. */
export const CR_CREATE_STORES = [
  'changeTypes',
  'sites',
  'departments',
  'workflows',
  'workflowVersions',
  'workflowSteps',
]

/** Reference stores the NC create form's required selects read from. */
export const NC_CREATE_STORES = [
  'ncTypes',
  'ncSources',
  'sites',
  'departments',
  'workflows',
  'workflowVersions',
  'workflowSteps',
]

/**
 * The NC twin of `createLiveWorkflowInstance` — a live instance whose steps have
 * an EMPTY reviewer pool.
 *
 * PW-J8 needs both halves of F-11's pool validation, and they only coexist
 * across two modules. `resolveStepReviewerUserIds` skips role expansion when the
 * workflow's module is NON_CONFORMANCE (workflowInstanceService.js:32) because
 * NC's supplier-facing steps are assigned to EXTERNAL_SUPPLIER users who hold no
 * internal role — so the seeded NCR steps resolve to an empty pool, and an empty
 * pool is deliberately left UNCONSTRAINED by the reassign validator. CR's steps
 * carry a role and therefore a real pool. Same code path, opposite outcomes,
 * both correct.
 */
export async function createLiveNcInstance(page, tag) {
  await warmUpSyncEngine(page, NC_CREATE_STORES)
  const title = ncTitle(tag)
  await raiseNc(page, title)
  const nc = findNcByTitle(title)
  if (!nc) throw new Error(`no NC created for "${title}"`)
  await openNc(page, nc.id)

  const instanceId = sqlValue(
    `SELECT id FROM workflow_instances
      WHERE resource_type = 'Nonconformance' AND resource_id = ${q(nc.id)}
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!instanceId) throw new Error(`no workflow_instance created for NC ${nc.id}`)

  // Barrier on the assignments, not the instance — same race documented in
  // fixtures/workflow.js.
  await waitForSqlValue(
    `SELECT count(*) > 0 FROM users_on_workflow_instance_steps uawis
       JOIN workflow_instance_steps wis ON wis.id = uawis.workflow_instance_step_id
      WHERE wis.workflow_instance_id = ${q(instanceId)} AND uawis.deleted_at IS NULL`,
    { timeoutMs: 30_000, label: `assignments exist on NC workflow instance ${instanceId}` },
  )

  return { ncId: nc.id, title, instanceId }
}

// ── Instance-side setup ────────────────────────────────────────────────────

/**
 * Add a second (third, …) assignee to a live instance step, exactly as the
 * engine would for a multi-member reviewer pool.
 *
 * Runs as the postgres superuser (`sql()`), so the F-01/F-02 trust-boundary
 * triggers — which fire only for `current_user = 'app_user'` — are not in play.
 * That is deliberate: this is fixture construction, not a probe of the guard
 * (j11/j12 own that).
 *
 * @returns {string} the new task_instances id
 */
export function addStepAssignee(instanceStepId, { userId, companyId, entityType, entityId }) {
  sql(
    `INSERT INTO users_on_workflow_instance_steps
       (workflow_instance_step_id, user_id, status_id, company_id, created_at, updated_at)
     VALUES (${q(instanceStepId)}, ${q(userId)}, 'ASSIGNED', ${q(companyId)}, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
  )
  // sqlValue, not sql: psql prints the RETURNING tuple AND the `INSERT 0 1`
  // command tag, so the raw output is two lines and using it as an id silently
  // produces "<uuid>\nINSERT 0 1".
  return sqlValue(
    `INSERT INTO task_instances
       (assigned_to, task_kind_id, status_id, entity_type, entity_id,
        source_type, source_id, company_id, created_at, updated_at)
     VALUES (${q(userId)}, 'APPROVAL', 'ASSIGNED', ${q(entityType)}, ${q(entityId)},
             'WorkflowInstanceStep', ${q(instanceStepId)}, ${q(companyId)}, NOW(), NOW())
     RETURNING id`,
  )
}

/** Force the INSTANCE's snapshotted approval rule (the copy the engine reads). */
export function setInstanceApprovalRule(instanceStepId, rule) {
  sql(
    `UPDATE workflow_instance_steps SET approval_rule = ${q(rule)}, updated_at = NOW()
      WHERE id = ${q(instanceStepId)}`,
  )
}

// ── Instance-side reads ────────────────────────────────────────────────────

export function stepStatus(instanceStepId) {
  return sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = ${q(instanceStepId)}`)
}

export function taskStatus(taskId) {
  return sqlValue(`SELECT status_id FROM task_instances WHERE id = ${q(taskId)}`)
}

/** The (single) open-or-terminal task a user holds on a step, newest first. */
export function taskIdFor(instanceStepId, userId) {
  return sqlValue(
    `SELECT id FROM task_instances
      WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(instanceStepId)}
        AND assigned_to = ${q(userId)} AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
}

export function assignmentStatus(instanceStepId, userId) {
  return sqlValue(
    `SELECT status_id FROM users_on_workflow_instance_steps
      WHERE workflow_instance_step_id = ${q(instanceStepId)} AND user_id = ${q(userId)}`,
  )
}

/** The template step's OWN approval rule — contrasted with the instance copy. */
export function templateApprovalRule(instanceStepId) {
  return sqlValue(
    `SELECT ws.approval_rule FROM workflow_instance_steps wis
       JOIN workflow_steps ws ON ws.id = wis.step_id
      WHERE wis.id = ${q(instanceStepId)}`,
  )
}

/** Every step id on an instance (ordered) — the PW-J7 identity comparison. */
export function stepIdsOf(instanceId) {
  const out = sql(
    `SELECT id FROM workflow_instance_steps
      WHERE workflow_instance_id = ${q(instanceId)} ORDER BY step_number`,
  )
  return out ? out.split('\n') : []
}

/** All workflow instances for a resource, oldest first: [{id, statusId}]. */
export function instancesFor(resourceType, resourceId) {
  const out = sql(
    `SELECT id, status_id FROM workflow_instances
      WHERE resource_type = ${q(resourceType)} AND resource_id = ${q(resourceId)}
      ORDER BY created_at ASC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, statusId] = line.split('|')
    return { id, statusId }
  })
}

/** `stepsOf`-style read but including step_id, for the reopen/cancel journeys. */
export function stepRowsOf(instanceId) {
  const out = sql(
    `SELECT id, step_number, status_id, coalesce(step_type,''), coalesce(step_id::text,''),
            coalesce(name,'')
       FROM workflow_instance_steps
      WHERE workflow_instance_id = ${q(instanceId)} AND deleted_at IS NULL
      ORDER BY step_number`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, stepNumber, statusId, stepType, stepId, name] = line.split('|')
    return {
      id,
      stepNumber: Number(stepNumber),
      statusId,
      stepType: stepType || null,
      stepId: stepId || null,
      name: name || null,
    }
  })
}

/** Task rows on a step: [{id, assignedTo, statusId}]. */
export function tasksOnStep(instanceStepId) {
  const out = sql(
    `SELECT id, assigned_to, status_id FROM task_instances
      WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(instanceStepId)}
        AND deleted_at IS NULL
      ORDER BY created_at ASC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, assignedTo, statusId] = line.split('|')
    return { id, assignedTo, statusId }
  })
}

export function crStatus(crId) {
  return sqlValue(`SELECT status_id FROM change_requests WHERE id = ${q(crId)}`)
}

export function reassignedToOf(taskId) {
  const row = sqlRow(
    `SELECT status_id, coalesce(reassigned_to_user_id::text,'') FROM task_instances WHERE id = ${q(taskId)}`,
  )
  return row ? { statusId: row[0], reassignedToUserId: row[1] || null } : null
}

// ── Acting as a persona over HTTP ──────────────────────────────────────────

/**
 * POST as a specific cast member, through the same REST endpoints the UI calls.
 *
 * A fresh browser context per call is the cheapest way to get that persona's
 * session cookie onto an APIRequestContext; `browser.newContext()` inherits the
 * project's baseURL, so relative `/api/...` paths resolve.
 *
 * Returns `{ status, body }` rather than throwing — most of these journeys are
 * asserting that a call was REFUSED, and with what message.
 */
export async function postAs(browser, storageState, url, data) {
  const ctx = await browser.newContext({ storageState })
  try {
    // Retry ONLY on a transport failure — the request provably never reached the
    // server, so replaying it cannot double-apply a workflow action. A 4xx/5xx
    // is returned as-is: those are answers, and several of these journeys are
    // asserting exactly which answer came back.
    let lastErr
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await ctx.request.post(url, { data, timeout: 60_000 })
        const body = await res.json().catch(() => null)
        return { status: res.status(), body }
      } catch (err) {
        lastErr = err
        await new Promise((r) => setTimeout(r, 3_000))
      }
    }
    throw lastErr
  } finally {
    await ctx.close()
  }
}

export async function getAs(browser, storageState, url) {
  const ctx = await browser.newContext({ storageState })
  try {
    // Reads are idempotent, so a 5xx is also retried here — the dev API is
    // restarted by nodemon whenever another agent touches backend source, and a
    // read that lands in that window says nothing about the product.
    let last = { status: 0, body: null }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await ctx.request.get(url, { timeout: 60_000 })
        const body = await res.json().catch(() => null)
        last = { status: res.status(), body }
        if (res.status() < 500) return last
      } catch {
        /* transport failure — fall through to the retry */
      }
      await new Promise((r) => setTimeout(r, 3_000))
    }
    return last
  } finally {
    await ctx.close()
  }
}

/** The error message the API returned, whatever envelope it used. */
export function errorMessage(body) {
  return body?.error?.message ?? body?.message ?? JSON.stringify(body ?? {})
}

/**
 * Complete/approve a task through API-15 — the exact body the frontend sends
 * (WorkflowStep.vue sends BOTH `action` and `outcomeId`; the controller only
 * maps through OUTCOME_STATUS_MAP when `outcomeId` is present, so sending
 * `action` alone would resolve to the literal string 'COMPLETE_AND_ADVANCE'
 * and silently skip every downstream branch).
 */
export async function approveTaskAs(browser, storageState, taskId, extra = {}) {
  return postAs(browser, storageState, `/api/v1/services/taskInstances/${taskId}/action`, {
    action: 'COMPLETE_AND_ADVANCE',
    outcomeId: 'COMPLETE_AND_ADVANCE',
    ...extra,
  })
}

/** That persona's open approval inbox, straight off the server (not IDB). */
export async function openInboxTaskIds(browser, storageState) {
  const { body } = await getAs(browser, storageState, '/api/v1/services/taskInstances?statusId=ASSIGNED')
  const list = body?.taskInstances ?? body?.data?.taskInstances ?? []
  return list.map((t) => t.id)
}
