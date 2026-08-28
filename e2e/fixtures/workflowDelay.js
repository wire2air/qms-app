// Fixture for the DELAY-step journeys (PW-J9, PW-J10).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// A DELAY step is the only step type the engine parks instead of activating: it
// sits `SCHEDULED` until a wake-up job fires (worker/tasks/
// workflow_delay_step_activate.js). Nothing in the E2E tenant could reach one —
// `SELECT step_type, count(*) FROM workflow_steps` returns 31 APPROVAL + 33
// ACTION and **zero DELAY**, in every company on app-db. There is also no
// runtime path that mints one: `addChildStep` (CAPA/CR) hard-codes ACTION, and
// `activateInstanceStep` only sees `stepType` because instantiation copied it
// off a template row. So the journeys have to bring their own template.
//
// ── WHY IT IS PARKED `INACTIVE`, AND WHY THAT IS NOT A CHEAT ────────────────
// Every module's workflow picker (components/documents/WorkflowVersionSelect.vue
// :37-45) lists `workflow.statusId === 'ACTIVE'` × `version.statusId ===
// 'PUBLISHED'`, and auto-selects when exactly one entry matches. Three other
// suites — capas, nonconformances, changeRequests — depend on that
// single-entry auto-select, and `fixtures/changeRequests.js:createCr` asserts on
// it by name. Publishing a second ACTIVE CAPA workflow would change what those
// fixtures see, in a repo where four agents run Playwright concurrently.
//
// So the *workflow* is INACTIVE (invisible to every picker) while its
// *versions* are genuinely PUBLISHED, and the record binds to one by explicit
// `workflowVersionId` — the same field the picker itself writes, and the same
// field `submitResourceForReview` reads. Nothing about the instantiation path
// under test is bypassed: the engine never consults `workflows.status_id`.
//
// ── SHAPE ───────────────────────────────────────────────────────────────────
//   "tail" v1.0   1 Delay Review  ACTION   → 2 Effectiveness Wait  DELAY
//   "mid"  v1.0   1 Delay Review  ACTION   → 2 Effectiveness Wait  DELAY
//                                          → 3 Post-Delay Verification ACTION
//
// Two WORKFLOWS, one published version each — not two versions of one workflow.
// Publishing a version fires an audit side-effect
// (worker/services/workflowVersion/workflowVersions.js) that RETIRES every other
// PUBLISHED version of the same workflow; publishing both in one statement
// raced and left both RETIRED. One version per workflow removes the race
// entirely, and matches how a tenant would actually model two different flows.
//
// `tail` is what PW-J10 needs: with the DELAY last, it is the only non-terminal
// step at close time, so `countOpenStepsForClose` can actually exercise its
// deferred-delay exemption. `mid` is what PW-J9's skip test needs: a step AFTER
// the delay, so "the workflow advanced" is observable as a step activating
// rather than as an instance completing.
//
// The DELAY step carries `require_esignature = true` DELIBERATELY. Without it,
// "the extend path shows no e-signature prompt" would be trivially true and the
// spec would pass on a step that was never gated in the first place — the
// classic test that passes whether or not the behaviour is correct. With it,
// the same step demands a PIN to COMPLETE and demands nothing to EXTEND, which
// is the surgical distinction PW-J9 is there to pin (see F-16 / A2).
import { expect, request as pwRequest } from '@playwright/test'
import { sql, sqlValue, sqlRow, waitForSqlValue, findCapaByTitle } from './db.js'
import { AUTH, COMPANY_ID, SITES, DEPARTMENTS, USERS, BASE_URL } from './cast.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// Fixed ids so the template is created once and reused across runs (and so a
// failed run leaves nothing to clean up). The e2ef5xxx block is unused by
// e2e-seed.sql — the seed's workflow ids run e2ef0…e2ef3 plus e2eaf.
export const DELAY_TEMPLATES = {
  // DELAY is the last step — PW-J10's close-gate shape.
  tail: {
    name: 'E2E Delay Fixture Workflow (tail)',
    workflowId: 'e2ef5001-0000-4000-8000-000000000001',
    versionId: 'e2ef5002-0000-4000-8000-000000000001',
    action1: 'e2ef5003-0000-4000-8000-000000000001',
    delay: 'e2ef5003-0000-4000-8000-000000000002',
  },
  // DELAY is last AND captures an effectiveness verdict — PW-J4's shape.
  //
  // A separate template rather than a flag on `tail`: `captures_effectiveness`
  // makes the step refuse to complete until a verdict is picked
  // (WorkflowStep.vue completeDisabled — "Record the effectiveness outcome
  // first"), which would have broken every existing PW-J9/PW-J10 completion.
  eff: {
    name: 'E2E Delay Fixture Workflow (effectiveness)',
    workflowId: 'e2ef5001-0000-4000-8000-000000000003',
    versionId: 'e2ef5002-0000-4000-8000-000000000003',
    action1: 'e2ef5003-0000-4000-8000-000000000021',
    delay: 'e2ef5003-0000-4000-8000-000000000022',
  },
  // DELAY has a step after it — PW-J9's skip shape.
  mid: {
    name: 'E2E Delay Fixture Workflow (mid)',
    workflowId: 'e2ef5001-0000-4000-8000-000000000002',
    versionId: 'e2ef5002-0000-4000-8000-000000000002',
    action1: 'e2ef5003-0000-4000-8000-000000000011',
    delay: 'e2ef5003-0000-4000-8000-000000000012',
    action3: 'e2ef5003-0000-4000-8000-000000000013',
  },
}

/** Cap configured on the DELAY step — PW-J9 walks the counter up to it. */
export const MAX_DELAY_EXTENSIONS = 2

/**
 * Create (idempotently) the two DELAY-bearing workflow versions.
 *
 * Steps are inserted while the version is still DRAFT and the version is
 * published by a separate UPDATE, mirroring the real publish transition rather
 * than short-circuiting it — which also means the publish-time triggers
 * (20260807101000's send-back-target seeding) see a version that already has
 * its steps, exactly as a UI publish would.
 */
export function ensureDelayTemplates() {
  const t = DELAY_TEMPLATES.tail
  const m = DELAY_TEMPLATES.mid
  const e = DELAY_TEMPLATES.eff

  const step = (id, versionId, name, order, type, esign, maxExt, capturesEff = 'false') =>
    `(${q(id)}, ${q(versionId)}, ${q(name)}, ${order}, 'ALL', 5, false, ${esign}, '[]'::jsonb, ` +
    `${q(COMPANY_ID)}, false, ${q(type)}, ${maxExt ?? 'NULL'}, ${capturesEff}, NOW(), NOW())`

  const workflow = (id, name) =>
    `(${q(id)}, ${q(name)}, 'PW-J9 / PW-J10 fixture. Deliberately INACTIVE so it never appears in a ` +
    `module workflow picker.', 'CAPA', ${q(COMPANY_ID)}, 'INACTIVE', false, NOW(), NOW())`

  sql(`
    -- Self-heal a fixture version that is not PUBLISHED. RETIRED -> PUBLISHED is
    -- an illegal transition (enforce_workflow_version_transition), so a version
    -- left retired by an earlier mistake cannot be repaired in place — it has to
    -- be replaced. Guarded on "nothing has instantiated it", which is exactly
    -- when replacing is safe (and is also why workflow_instances' FK is
    -- ON DELETE RESTRICT).
    DELETE FROM workflow_versions v
     WHERE v.id IN (${q(t.versionId)}, ${q(m.versionId)}, ${q(e.versionId)})
       AND v.status_id IS DISTINCT FROM 'PUBLISHED'
       AND NOT EXISTS (SELECT 1 FROM workflow_instances wi WHERE wi.workflow_version_id = v.id);

    INSERT INTO workflows (id, name, description, module_id, company_id, status_id, is_default, created_at, updated_at)
    VALUES ${workflow(t.workflowId, t.name)},
           ${workflow(m.workflowId, m.name)},
           ${workflow(e.workflowId, e.name)}
    ON CONFLICT (id) DO UPDATE SET status_id = 'INACTIVE', deleted_at = NULL;

    INSERT INTO workflow_versions (id, workflow_id, version_major, version_minor, version_label,
                                   status_id, company_id, is_current, created_at, updated_at)
    VALUES (${q(t.versionId)}, ${q(t.workflowId)}, 1, 0, '1.0', 'DRAFT', ${q(COMPANY_ID)}, false, NOW(), NOW()),
           (${q(m.versionId)}, ${q(m.workflowId)}, 1, 0, '1.0', 'DRAFT', ${q(COMPANY_ID)}, false, NOW(), NOW()),
           (${q(e.versionId)}, ${q(e.workflowId)}, 1, 0, '1.0', 'DRAFT', ${q(COMPANY_ID)}, false, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO workflow_steps (id, workflow_version_id, name, step_order, approval_rule, sla_days,
                                require_comments, require_esignature, form_schema, company_id,
                                allow_child_steps, step_type, max_delay_extensions,
                                captures_effectiveness, created_at, updated_at)
    VALUES ${[
      step(t.action1, t.versionId, 'Delay Review', 1, 'ACTION', 'false', null),
      step(t.delay, t.versionId, 'Effectiveness Wait', 2, 'DELAY', 'true', MAX_DELAY_EXTENSIONS),
      step(m.action1, m.versionId, 'Delay Review', 1, 'ACTION', 'false', null),
      step(m.delay, m.versionId, 'Effectiveness Wait', 2, 'DELAY', 'true', MAX_DELAY_EXTENSIONS),
      step(m.action3, m.versionId, 'Post-Delay Verification', 3, 'ACTION', 'false', null),
      step(e.action1, e.versionId, 'Delay Review', 1, 'ACTION', 'false', null),
      step(e.delay, e.versionId, 'Effectiveness Wait', 2, 'DELAY', 'true', MAX_DELAY_EXTENSIONS, 'true'),
    ].join(',\n      ')}
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO workflow_step_roles (id, step_id, role_id, company_id, created_at, updated_at)
    SELECT gen_random_uuid(), v.step_id, r.id, ${q(COMPANY_ID)}, NOW(), NOW()
      FROM (VALUES
             (${q(t.action1)}::uuid, 'E2E Reviewer'),
             (${q(t.delay)}::uuid,   'E2E Approver'),
             (${q(m.action1)}::uuid, 'E2E Reviewer'),
             (${q(m.delay)}::uuid,   'E2E Approver'),
             (${q(m.action3)}::uuid, 'E2E Reviewer'),
             (${q(e.action1)}::uuid, 'E2E Reviewer'),
             (${q(e.delay)}::uuid,   'E2E Approver')
           ) AS v(step_id, role_name)
      JOIN roles r ON r.name = v.role_name AND r.company_id = ${q(COMPANY_ID)} AND r.deleted_at IS NULL
    ON CONFLICT DO NOTHING;

    UPDATE workflow_versions SET status_id = 'PUBLISHED', updated_at = NOW()
     WHERE id IN (${q(t.versionId)}, ${q(m.versionId)}, ${q(e.versionId)}) AND status_id = 'DRAFT';
  `)

  // Fail loudly and early rather than letting a half-built template surface as
  // a confusing mid-journey timeout. Roles are the piece most likely to be
  // missing (they depend on the seed having run); a non-PUBLISHED version means
  // the self-heal above could not run because live instances still point at it.
  const bound = sqlValue(
    `SELECT count(*) FROM workflow_step_roles wsr
       JOIN workflow_steps ws ON ws.id = wsr.step_id
      WHERE ws.workflow_version_id IN (${q(t.versionId)}, ${q(m.versionId)}, ${q(e.versionId)})
        AND wsr.deleted_at IS NULL`,
  )
  expect(Number(bound), 'every fixture step has a role pool bound').toBe(7)

  const published = sqlValue(
    `SELECT count(*) FROM workflow_versions
      WHERE id IN (${q(t.versionId)}, ${q(m.versionId)}, ${q(e.versionId)}) AND status_id = 'PUBLISHED'`,
  )
  expect(Number(published), 'all three fixture versions are PUBLISHED').toBe(3)
}

// ─── Reading the engine's own tables ────────────────────────────────────────

/** The live workflow instance for a CAPA. */
export function instanceOfCapa(capaId) {
  const row = sqlRow(
    `SELECT id, status_id, current_step FROM workflow_instances
      WHERE resource_type = 'Capa' AND resource_id = ${q(capaId)}
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return { id: row[0], statusId: row[1], currentStep: row[2] === '' ? null : Number(row[2]) }
}

/**
 * Every instance step of a CAPA's workflow, newest run per template step last.
 *
 * `sql()` (not `sqlValue`) because this is multi-row: sqlValue returns only the
 * FIRST LINE of psql output, which would silently collapse the list to one step.
 */
export function stepsOfCapa(capaId) {
  const out = sql(
    `SELECT wis.id, wis.step_number, wis.step_order, wis.status_id, wis.step_type,
            coalesce(wis.require_esignature::text, ''), wis.delay_extension_count,
            coalesce(extract(epoch from wis.delay_until)::bigint::text, ''),
            coalesce(wis.step_id::text, ''), coalesce(wis.name, '')
       FROM workflow_instance_steps wis
       JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Capa' AND wi.resource_id = ${q(capaId)}
        AND wis.deleted_at IS NULL
      ORDER BY wis.step_number`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, num, order, statusId, type, esign, extCount, until, stepId, name] = line.split('|')
    return {
      id,
      stepNumber: Number(num),
      stepOrder: Number(order),
      statusId,
      stepType: type,
      // ::text on a boolean gives 'true'/'false', NOT the 't'/'f' psql prints
      // for a raw boolean column. Accept both so dropping the cast can never
      // make this silently read false.
      requireEsignature: esign === '' ? null : esign === 'true' || esign === 't',
      delayExtensionCount: Number(extCount),
      delayUntilEpoch: until === '' ? null : Number(until),
      stepId: stepId || null,
      name,
    }
  })
}

/** The (single) DELAY step of a CAPA's workflow, re-read fresh each call. */
export function delayStepOf(capaId) {
  const step = stepsOfCapa(capaId).find((s) => s.stepType === 'DELAY')
  if (!step) throw new Error(`no DELAY instance step found for CAPA ${capaId}`)
  return step
}

/** Assignment rows on an instance step, as `status → count`. */
export function assignmentStatusesOn(instanceStepId) {
  const out = sql(
    `SELECT status_id, count(*) FROM users_on_workflow_instance_steps
      WHERE workflow_instance_step_id = ${q(instanceStepId)} AND deleted_at IS NULL
      GROUP BY status_id ORDER BY status_id`,
  )
  const map = {}
  if (out) for (const line of out.split('\n')) {
    const [status, n] = line.split('|')
    map[status] = Number(n)
  }
  return map
}

/** Task rows sourced from an instance step, as `status → count`. */
export function taskStatusesOn(instanceStepId) {
  const out = sql(
    `SELECT status_id, count(*) FROM task_instances
      WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(instanceStepId)}
        AND deleted_at IS NULL
      GROUP BY status_id ORDER BY status_id`,
  )
  const map = {}
  if (out) for (const line of out.split('\n')) {
    const [status, n] = line.split('|')
    map[status] = Number(n)
  }
  return map
}

/** The actionable task id on a step for a given user (null when none). */
export function actionableTaskFor(instanceStepId, userId) {
  return sqlValue(
    `SELECT id FROM task_instances
      WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(instanceStepId)}
        AND assigned_to = ${q(userId)} AND status_id IN ('ASSIGNED','FORM_SUBMITTED')
        AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
}

/** Part-11 signature rows hanging off any task of an instance step. */
export function signatureCountOn(instanceStepId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM signatures s
        WHERE s.task_instance_id IN (
          SELECT id FROM task_instances
           WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(instanceStepId)}
        )`,
    ),
  )
}

/**
 * Is the graphile wake-up job for this delay step still queued?
 *
 * `scheduleDelayStepActivation` uses jobKey `wf-delay-step:<instanceStepId>`
 * with jobKeyMode 'replace', so there is at most one live row per step. This is
 * how PW-J10 proves the deferred check survives the record's close rather than
 * merely that a row was left behind in a status column.
 */
export function delayJobQueued(instanceStepId) {
  return (
    Number(
      sqlValue(
        `SELECT count(*) FROM graphile_worker.jobs
          WHERE key = ${q(`wf-delay-step:${instanceStepId}`)}`,
      ),
    ) > 0
  )
}

// ─── Driving the record ─────────────────────────────────────────────────────

/** Unique, greppable CAPA title for one test run. */
export function uniqueTitle(tag) {
  return `E2E DelayCAPA ${tag} ${Date.now()}`
}

/**
 * Create a DRAFT CAPA bound to one of the fixture versions.
 *
 * Uses the REST create endpoint rather than the create FORM on purpose: the
 * form's workflow picker cannot offer an INACTIVE workflow (see the header),
 * and the create form is already covered end-to-end by e2e/capas/j1. What is
 * under test here starts at the DELAY step, and every write below still goes
 * through the real controller, schema validation and reviewer-pool check.
 */
export async function createDelayCapa(page, { versionId, reviewers, tag }) {
  const title = uniqueTitle(tag)
  const res = await page.request.post('/api/v1/services/capas', {
    data: {
      title,
      description: 'PW-J9 / PW-J10 delay-step fixture record.',
      siteId: SITES.primary.id,
      departmentId: DEPARTMENTS.quality.id,
      typeId: 'CORRECTIVE',
      sourceType: 'INTERNAL_OBSERVATION',
      priorityId: 'MEDIUM',
      initiatedAt: new Date().toISOString(),
      ownerId: USERS.author.id,
      workflowVersionId: versionId,
      reviewers,
    },
  })
  expect(res.status(), `POST /capas — ${await res.text().catch(() => '')}`).toBe(200)
  const capa = findCapaByTitle(title)
  expect(capa, `CAPA "${title}" exists after create`).toBeTruthy()
  return { capaId: capa.id, title }
}

/** Owner opens the CAPA — the only path that instantiates the workflow. */
export async function openDelayCapa(page, capaId) {
  const res = await page.request.post(`/api/v1/services/capas/${capaId}/submitForReview`, {
    data: {},
  })
  expect(res.status(), `submitForReview — ${await res.text().catch(() => '')}`).toBe(200)
}

/**
 * Complete step 1 as the assigned reviewer, through the real task-action
 * endpoint in the reviewer's own session.
 *
 * Driven over `context.request` rather than the UI because step 1 is scaffolding
 * — a plain no-form, no-e-sign ACTION step whose UI path is already gated by
 * e2e/capas/j2. Barriers on the DELAY step actually parking before returning, so
 * callers never race the activation cascade.
 */
export async function completeFirstStepAsReviewer(browser, capaId) {
  const steps = stepsOfCapa(capaId)
  const first = steps.find((s) => s.stepOrder === 1)
  expect(first?.statusId, 'step 1 is live before the reviewer acts').toBe('IN_PROGRESS')

  const taskId = await waitForTaskId(first.id, USERS.reviewer.id)
  const ctx = await browser.newContext({ storageState: AUTH.reviewer })
  try {
    const res = await ctx.request.post(`/api/v1/services/taskInstances/${taskId}/action`, {
      data: { action: 'COMPLETE_AND_ADVANCE', outcomeId: 'COMPLETE_AND_ADVANCE' },
    })
    expect(res.status(), `reviewer COMPLETE_AND_ADVANCE — ${await res.text().catch(() => '')}`).toBe(200)
  } finally {
    await ctx.close()
  }

  await waitForSqlValue(
    `SELECT count(*) FROM workflow_instance_steps wis
       JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Capa' AND wi.resource_id = ${q(capaId)}
        AND wis.step_type = 'DELAY' AND wis.status_id = 'SCHEDULED'`,
    { timeoutMs: 30_000, label: `DELAY step parked SCHEDULED on CAPA ${capaId}` },
  )
}

async function waitForTaskId(instanceStepId, userId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(instanceStepId)}
        AND assigned_to = ${q(userId)} AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: `task assigned on step ${instanceStepId}` },
  )
  return actionableTaskFor(instanceStepId, userId)
}

/**
 * Everything up to "a DELAY step is parked and awaiting the owner's decision".
 * Returns the ids the journeys assert against.
 */
export async function reachScheduledDelay(page, browser, { template = 'tail', tag }) {
  const tpl = DELAY_TEMPLATES[template]
  const reviewers = { [tpl.action1]: [USERS.reviewer.id], [tpl.delay]: [USERS.approver.id] }
  if (tpl.action3) reviewers[tpl.action3] = [USERS.reviewer.id]

  const { capaId, title } = await createDelayCapa(page, {
    versionId: tpl.versionId,
    reviewers,
    tag,
  })
  await openDelayCapa(page, capaId)
  await completeFirstStepAsReviewer(browser, capaId)
  return { capaId, title, template: tpl }
}

// ─── Owner-side delay actions (the module step-action endpoint) ─────────────

/** POST {module}/:id/delayStepAction as whoever `requester` is authenticated as. */
export async function delayStepAction(requester, capaId, body) {
  return requester.post(`/api/v1/services/capas/${capaId}/delayStepAction`, { data: body })
}

/**
 * Barrier on the DELAY step reaching some state, then return it.
 *
 * ⚠️ A 2xx from these endpoints does NOT mean the write is visible yet.
 * `withStepActionTransaction` reuses `req.transaction` when the request already
 * carries one, and that transaction is committed by middleware AFTER the handler
 * has written its response — so a test reading over its own psql connection can
 * (and intermittently does) observe the pre-write row. Reading straight after
 * the POST produced a one-in-several-runs "expected 2, received 1" on the
 * extension counter. Barrier, don't read.
 */
export async function awaitDelayStep(capaId, predicateSql, label) {
  await waitForSqlValue(
    `SELECT count(*) FROM workflow_instance_steps wis
       JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Capa' AND wi.resource_id = ${q(capaId)}
        AND wis.step_type = 'DELAY' AND wis.deleted_at IS NULL AND ${predicateSql}`,
    { timeoutMs: 30_000, label },
  )
  return delayStepOf(capaId)
}

/** The same barrier for the CAPA row itself. */
export async function awaitCapaStatus(capaId, statusId) {
  await waitForSqlValue(
    `SELECT count(*) FROM capas WHERE id = ${q(capaId)} AND status_id = ${q(statusId)}`,
    { timeoutMs: 30_000, label: `CAPA ${capaId} reached ${statusId}` },
  )
}

/**
 * Arm the delay to fire immediately: schedule it at a date already in the past.
 *
 * ~~`setDelayScheduleCore` accepts a past date by design.~~ Not since
 * `ccaec342` (2026-08-18, "Delay steps: validation, extend-to-a-date, and keep
 * the work open"). A fixed date earlier than tomorrow is now refused outright:
 *
 *   "A delay step must activate on a future date — pick tomorrow or later."
 *
 * and the reasoning is sound — "a delay must actually delay", scheduling in the
 * past fires immediately and the wait-then-verify semantics are silently lost.
 * So the old one-call trick is gone, and with it PW-J9, PW-J10 and CAPA PW-J4:
 * every one of them died on a 400 from this helper.
 *
 * Two steps now. SCHEDULE the earliest the API will accept — `delayDays: 1`,
 * which takes the days branch and skips the calendar-day gate entirely — then
 * pull the wake-up backwards ourselves. BOTH halves have to move: the step's
 * own `delay_until`, and the graphile job's `run_at`. The job was queued with
 * `runAt = delayUntil`, so moving only the column leaves it asleep until
 * tomorrow and the barrier below times out. `graphile_worker.jobs` is a VIEW —
 * write to `_private_jobs`.
 */
export async function fireDelayNow(requester, capaId, instanceStepId) {
  const res = await delayStepAction(requester, capaId, {
    workflowInstanceStepId: instanceStepId,
    intent: 'SCHEDULE',
    delayDays: 1,
  })
  expect(res.status(), `SCHEDULE +1 day — ${await res.text().catch(() => '')}`).toBe(200)

  const past = "NOW() - interval '1 minute'"
  sql(`UPDATE workflow_instance_steps SET delay_until = ${past} WHERE id = ${q(instanceStepId)}`)
  sql(
    `UPDATE graphile_worker._private_jobs SET run_at = ${past}
      WHERE key = ${q(`wf-delay-step:${instanceStepId}`)}`,
  )

  // The worker (JOB-01) does the rest: SCHEDULED → IN_PROGRESS, assignments
  // PENDING → ASSIGNED, one task per assignee. Barrier on the TASK, not the
  // step: the notification/side-effect chain rides the task INSERT, and a
  // caller that reads assignments the moment the step flips races it.
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(instanceStepId)}
        AND status_id = 'ASSIGNED'`,
    { timeoutMs: 60_000, label: `delay step ${instanceStepId} fired and minted its task` },
  )
}

/**
 * Open a CAPA detail page and wait for its workflow section to actually render.
 *
 * These journeys create the record over REST and then deep-link straight to it,
 * so the very first navigation of the test is a COLD SyncEngine install —
 * `bootstrapAll()` has to delta-sync every INSTANT model before the page's live
 * queries resolve and the breadcrumb stops saying "Loading…". Under four agents
 * sharing one dev stack that has been observed to take well over 30s; the other
 * suites never see it because they arrive via the create form and the bootstrap
 * runs while the user is still filling it in.
 *
 * Reload-tolerant on the same reasoning as documents.js:clickWhenReady — a
 * patient window per load, a reload only as a fallback (reloading sooner just
 * restarts the bootstrap clock and starves it).
 *
 * Anchors on the DELAY step's name rather than the record title: the title
 * renders as soon as the Capa row lands, which is several models earlier than
 * WorkflowInstanceStep, and waiting on it would hand the caller a page whose
 * workflow section is still empty.
 */
export async function gotoCapaWorkflow(page, capaId, { timeout = 150_000 } = {}) {
  const anchor = page.getByText('Effectiveness Wait').first()
  await page.goto(`/capas/${capaId}`, { waitUntil: 'domcontentloaded' })
  await expect(async () => {
    await expect(anchor)
      .toBeVisible({ timeout: 20_000 })
      .catch(async () => {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(anchor).toBeVisible({ timeout: 25_000 })
      })
  }).toPass({ timeout })
}

/** Body message of a rejected REST call, for assertions on the gate text. */
export async function errorMessage(res) {
  const body = await res.json().catch(() => null)
  return body?.error?.message ?? body?.message ?? ''
}

/** A request context authenticated as one of the cast, with no browser page. */
export async function requestAs(storageState) {
  return pwRequest.newContext({ baseURL: BASE_URL, storageState })
}
