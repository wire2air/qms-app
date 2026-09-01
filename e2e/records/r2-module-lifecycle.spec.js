// REC-J2 — the module-record lifecycle, end to end: create → start → routed
// section fills → close.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS PINS — F-03, and the close gate the QMSMR guard exists to protect
//
// Four endpoints ran on `requireAuthByApiKey` + `requireCompanyAccess` alone —
// membership of the tenant and nothing else:
//
//   POST /form-modules/records/:id/{start,share-supplier,close,cancel}
//
// Any authenticated member could start another department's module record,
// share it to a supplier, close it past its workflow, or cancel it. A fifth,
// `POST /form-modules/records`, was verb-gated but never checked SCOPE, so a
// grant scoped to one department could file a record into any other.
//
// The fix could not be a route middleware. `records` is the only table whose
// permission namespace is a COLUMN, so `enforcePermission('records','update')`
// here would be too WEAK (one generic grant unlocks every promoted module) and
// too STRONG (the holder of `e2emodb:update` is refused) at the same time.
// `utils/moduleRecordAccess.js` resolves the namespace from the row — or from
// the template, for create — and asks the same PDP the RLS policies ask.
//
// This file drives the whole lifecycle through the real endpoints, and pairs
// each gate with the refusal that proves it is a gate.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS RUNS ON e2emodb AND NOT ON THE SEEDED MODULE
//
// e2e-seed.sql §35's `e2emod` template cannot be started at all. Its schema has
// two `type: 'section'` entries and NEITHER carries a `routing` key, while
// `moduleRecordService.routedSections()` selects on
// `f.type === 'section' && f.routing && f.routing.type` — so it matches none of
// them and `startRecord` throws *"This module has no routed sections — add
// section routing to start it"*. §35's own comment asserts the opposite ("the
// schema is two SECTIONS … because `startRecord` synthesizes one workflow step
// per section"), so the seeded fixture cannot exercise the lifecycle it was
// written for. That is reported, not patched; `e2emodb` (e2e/fixtures/records.js)
// is a correctly-routed module built alongside it.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO CHECKS ON THE SECTION ASSIGNEE, MEASURED (app-db, 2026-09-01)
//
// Naming someone in `sectionAssignees` has to satisfy two unrelated layers, and
// each fails differently:
//
//   `submitResourceForReview` validates the pick against the step's ROLES
//        → a non-member makes the START itself 400.
//   `utils/workflowStepAccess.js` requires a GRANT on the record's module
//        before an assignee may action their own task
//        → 403 "Your role does not grant this action, even on a task assigned
//          to you." ASSIGNMENT DOES NOT CONFER THE VERB.
//
// Both were hit while writing this file. `approver` is used throughout because
// he is the only cast member who satisfies both for `e2emodb`.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SHAPE OF A COMPLETED LIFECYCLE, MEASURED
//
//   create        201  DRAFT   record_number NULL   (numbers mint at START, so a
//                                                    deleted draft burns none and
//                                                    the register has no gaps)
//   start         200  OPEN    record_number E2EMODB-NNNN, workflow instance,
//                              2 instance steps: IN_PROGRESS + PENDING,
//                              1 task_instance ASSIGNED (kind APPROVAL)
//   close (early) 400  "All workflow tasks must be completed…"
//   step 1 done   200  step 2 advances to IN_PROGRESS
//   step 2 done   200  a REVIEW task_instance is minted for the OWNER
//   close         200  CLOSED, payload merged, the REVIEW task resolved APPROVED
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  RECORDS,
  affectedRows,
  createPersonaPool,
  deleteProbeRecords,
  errorMessage,
  findRecord,
  provisionRecordsFixtures,
  recordsVisibleTo,
  restPost,
} from '../fixtures/records.js'

const B = RECORDS.moduleB
const created = []

const pool = createPersonaPool()
test.beforeAll(() => provisionRecordsFixtures())
test.afterAll(async () => {
  await pool.close()
  deleteProbeRecords(created)
})

/** The record's workflow instance steps, in order, RLS bypassed. */
function stepsOf(recordId) {
  const out = sql(`
    SELECT ws.name, wis.status_id, wis.id
      FROM workflow_instance_steps wis
      JOIN workflow_steps ws ON ws.id = wis.step_id
     WHERE wis.workflow_instance_id = (SELECT workflow_instance_id FROM records WHERE id = '${recordId}')
     ORDER BY ws.step_order`)
  if (!out) return []
  return out.split('\n').map((l) => {
    const [name, statusId, id] = l.split('|')
    return { name, statusId, id }
  })
}

/** The record's task instances, RLS bypassed. */
function tasksOf(recordId) {
  const out = sql(`
    SELECT id, status_id, task_kind_id, coalesce(assigned_to::text, '')
      FROM task_instances WHERE entity_id = '${recordId}' AND deleted_at IS NULL`)
  if (!out) return []
  return out.split('\n').map((l) => {
    const [id, statusId, kind, assignedTo] = l.split('|')
    return { id, statusId, kind, assignedTo }
  })
}

async function completeOpenTasks(ctx, recordId) {
  // Only the section STEP tasks are actionable through API-15. The owner's
  // REVIEW task is minted by the completion handler and is resolved by
  // `closeModuleRecord` itself, not by an action call — asking API-15 for it
  // answers 404, which is how this loop knows to stop.
  for (let round = 0; round < 5; round++) {
    const open = tasksOf(recordId).filter((t) => t.statusId === 'ASSIGNED' && t.kind !== 'REVIEW')
    if (!open.length) return round
    for (const task of open) {
      const res = await restPost(ctx, `/taskInstances/${task.id}/action`, {
        action: 'COMPLETE_AND_ADVANCE',
        outcomeId: 'COMPLETE_AND_ADVANCE',
      })
      expect(res.status(), `completing step task ${task.id} (${await errorMessage(res)})`).toBe(200)
    }
  }
  throw new Error('the workflow never ran out of open step tasks')
}

/**
 * Raise a module record and WAIT FOR IT TO BE DURABLE before returning.
 *
 * ⚠ REC-N3 — the wait is not politeness, it is working around a real race, and
 * it is documented here rather than hidden behind a retry.
 *
 * `requireCompanyAccess` (utils/permissions.js) opens the request transaction
 * and commits it from `res.on('finish')` — a handler that fires only once the
 * response has been FULLY SENT. `createFormModuleRecord` answers with
 * `sendCreated(...)` and never commits itself, so the commit happens strictly
 * AFTER the client has the `201 { record: { id } }` in hand.
 *
 * So a client that chains create → act on the returned id can lose the race:
 * the second request opens its own transaction, `findOrFail` cannot see the
 * uncommitted row, and the caller gets `404 Record not found` for a record the
 * API just told them it had created. The SPA does exactly this chaining (raise
 * a module record, then Start it), and the window widens under load.
 *
 * MEASURED: this suite hit it once in a full-suite run (5.2 min, with another
 * Playwright project running against the same stack) — `start` answered 404
 * immediately after a 201 create. It has never reproduced in an isolated run.
 * Reported, not patched: the fix is to commit before responding, which is a
 * change to a middleware every route in the product depends on.
 */
async function createModuleRecord(ctx) {
  const res = await restPost(ctx, '/form-modules/records', {
    templateId: B.templateId,
    payload: {},
  })
  expect(res.status(), `create (${await errorMessage(res)})`).toBe(201)
  const record = (await res.json()).record
  created.push(record.id)
  await waitForSqlValue(`SELECT count(*) FROM records WHERE id = '${record.id}'`, {
    timeoutMs: 15_000,
    label: 'the created record is committed and visible',
  })
  return record
}

/** Raise, start, action and close one e2emodb record. Returns its id. */
async function driveToClosed(ctx) {
  const record = await createModuleRecord(ctx)
  const started = await restPost(ctx, `/form-modules/records/${record.id}/start`, {
    sectionAssignees: { quality: [USERS.approver.id], commercial: [USERS.approver.id] },
  })
  expect(started.status(), `start (${await errorMessage(started)})`).toBe(200)
  await completeOpenTasks(ctx, record.id)
  const close = await restPost(ctx, `/form-modules/records/${record.id}/close`, {})
  expect(close.status(), `close (${await errorMessage(close)})`).toBe(200)
  expect(findRecord(record.id).statusId).toBe('CLOSED')
  return record.id
}

test.describe('REC-J2 — module record lifecycle', () => {
  test('create: gated on the MODULE’s create verb, DRAFT, and deliberately unnumbered', async ({
    browser,
  }) => {
    const owner = await pool.context(browser, AUTH.approver)

    const res = await restPost(owner, '/form-modules/records', {
      templateId: B.templateId,
      payload: { qualityFinding: '' },
    })
    expect(res.status(), 'the module’s create-verb holder may raise a record').toBe(201)
    const record = (await res.json()).record
    created.push(record.id)

    const row = findRecord(record.id)
    expect(row.statusId, 'it starts DRAFT — the only INSERT state the guard admits').toBe('DRAFT')
    expect(row.moduleKey, 'stamped with the module that produced it').toBe(B.key)
    expect(row.ownerUserId, 'and owned by the person who raised it').toBe(USERS.approver.id)

    // Numbers mint at START, not at create (a deliberate 2026-08-27 decision):
    // a draft that is abandoned must not burn a number, because a record
    // register with holes in it is itself an audit finding.
    expect(row.recordNumber, 'a DRAFT module record carries no number yet').toBeNull()

    // ← The refusals. `createModuleRecord` hand-evaluates record_insert_rls's
    // predicate because REST bypasses RLS, so this is the only place that check
    // can be observed.
    for (const persona of ['noAccess', 'author', 'reviewer']) {
      const ctx = await pool.context(browser, AUTH[persona])
      const denied = await restPost(ctx, '/form-modules/records', {
        templateId: B.templateId,
        payload: {},
      })
      expect(
        denied.status(),
        `${persona} holds no e2emodb:create and cannot raise a record in it`,
      ).toBe(403)
    }

    // `author` and `reviewer` above are the interesting two: `author` holds the
    // full generic `records` CRUD set and `reviewer` the full CRUD set on the
    // OTHER promoted module. Neither is a key to this one.
  })

  test('start: OPEN, numbered, sealed, and routed to the section assignee', async ({ browser }) => {
    const owner = await pool.context(browser, AUTH.approver)
    const record = await createModuleRecord(owner)

    // ← First: the gate. Start was one of the four endpoints that ran on tenant
    // membership alone, so the refusal is the finding and it comes first.
    const stranger = await pool.context(browser, AUTH.reviewer)
    const denied = await restPost(stranger, `/form-modules/records/${record.id}/start`, {
      sectionAssignees: { quality: [USERS.approver.id], commercial: [USERS.approver.id] },
    })
    expect(
      denied.status(),
      'a member of the tenant holding another module’s full CRUD cannot start this record',
    ).toBe(403)
    expect(findRecord(record.id).statusId, 'and the record did not move').toBe('DRAFT')

    // → Then the permitted caller, same record, same call.
    const res = await restPost(owner, `/form-modules/records/${record.id}/start`, {
      sectionAssignees: { quality: [USERS.approver.id], commercial: [USERS.approver.id] },
    })
    expect(res.status(), `start (${await errorMessage(res)})`).toBe(200)

    const row = findRecord(record.id)
    expect(row.statusId, 'the record is now OPEN').toBe('OPEN')
    expect(row.recordNumber, 'and the number mints HERE, in the module’s own sequence').toMatch(
      new RegExp(`^${B.code}-\\d{4}$`),
    )

    // The owner-level seal. `schema_snapshot` freezes at Start — the twin of the
    // per-step form freeze — so a later edit to the template cannot retroactively
    // change what this record asked.
    expect(
      sqlValue(`SELECT jsonb_array_length(schema_snapshot) FROM records WHERE id = '${record.id}'`),
      'the form is frozen onto the record at Start',
    ).toBe(String(B.sections.length))
    expect(
      sqlValue(`SELECT workflow_instance_id IS NOT NULL FROM records WHERE id = '${record.id}'`),
      'and it is back-linked to its workflow instance',
    ).toBe('t')

    // One synthesized step per routed section, the first live and the second
    // waiting. This is what `synthesizeSectionWorkflow` is for, and it is the
    // reason a module template needs more than one section to be worth testing.
    const steps = stepsOf(record.id)
    expect(steps.map((s) => s.name), 'one step per routed section, in order').toEqual([
      'Quality Review',
      'Commercial Review',
    ])
    expect(steps[0].statusId, 'the first section is live').toBe('IN_PROGRESS')
    expect(steps[1].statusId, 'the second is queued behind it').toBe('PENDING')

    const tasks = tasksOf(record.id).filter((t) => t.statusId === 'ASSIGNED')
    expect(tasks, 'exactly one task is open — the routing is sequential').toHaveLength(1)
    expect(tasks[0].assignedTo, 'and it is on the named section assignee').toBe(USERS.approver.id)
  })

  test('the close gate holds, then the sections complete and the record closes', async ({
    browser,
  }) => {
    const owner = await pool.context(browser, AUTH.approver)
    const record = await createModuleRecord(owner)
    await restPost(owner, `/form-modules/records/${record.id}/start`, {
      sectionAssignees: { quality: [USERS.approver.id], commercial: [USERS.approver.id] },
    })

    // ── The close gate ─────────────────────────────────────────────────────
    // This is the check the QMSMR guard exists to protect. Before the guard, a
    // holder of `<module_key>:update` — which every section assignee needs
    // merely to fill in their own section — could reach CLOSED with a single
    // SyncEngine mutation and skip all of it. Both halves are asserted: the
    // endpoint refuses, AND (below) the direct write refuses too.
    const early = await restPost(owner, `/form-modules/records/${record.id}/close`, {})
    expect(early.status(), 'an OPEN record with live steps cannot be closed').toBe(400)
    expect(await errorMessage(early)).toMatch(/All workflow tasks must be completed/i)
    expect(findRecord(record.id).statusId, 'and it stays OPEN').toBe('OPEN')

    // …and the same shortcut is refused at the database, by the record's OWNER,
    // who is the person most able to take it. Repeated here rather than left to
    // REC-J3 because the gate and the guard only matter TOGETHER: an endpoint
    // check with no trigger behind it is one raw mutation away from useless.
    const shortcut = sqlAsAppUser(
      `UPDATE records SET status_id = 'CLOSED' WHERE id = '${record.id}';`,
      { userId: USERS.approver.id, companyId: COMPANY_ID },
    )
    expect(shortcut.ok, 'the SyncEngine shortcut past the close gate is refused').toBeFalsy()
    expect(shortcut.error).toMatch(/Module record status cannot be changed directly/)

    // ── The section fills ──────────────────────────────────────────────────
    // The per-section answers are written by the assignee as `app_user` — the
    // path the browser uses. This also exercises the narrowed
    // `module_section_records` read policy live: it dispatches on the PARENT
    // record's module_key, so answers to an e2emodb record are gated on
    // `e2emodb:read` exactly as their parent is.
    const firstStep = stepsOf(record.id)[0]
    const openTask = tasksOf(record.id).find((t) => t.statusId === 'ASSIGNED')
    // `module_section_records_submitted_requires_task_chk` is
    // `submitted_at IS NULL OR task_instance_id IS NOT NULL` — a SUBMITTED set
    // of section answers must name the task it was submitted against, so the
    // answers can never be orphaned from the step that asked for them. Found by
    // writing this insert without it.
    const answers = sqlAsAppUser(
      `INSERT INTO module_section_records (id, company_id, record_id, workflow_instance_step_id, task_instance_id, user_id, payload, submitted_at, created_at, updated_at)
       VALUES (gen_random_uuid(), '${COMPANY_ID}', '${record.id}', '${firstStep.id}', '${openTask.id}', '${USERS.approver.id}',
               '{"qualityFinding":"REC-J2 section answer"}'::jsonb, NOW(), NOW(), NOW());`,
      { userId: USERS.approver.id, companyId: COMPANY_ID },
    )
    expect(answers.ok, `the assignee records their section answers (${answers.error})`).toBeTruthy()

    const seenBy = (persona) =>
      Number(
        /RESULT=(\d+)/.exec(
          sqlAsAppUser(
            `SELECT 'RESULT=' || count(*)::text FROM module_section_records WHERE record_id = '${record.id}';`,
            { userId: USERS[persona].id, companyId: COMPANY_ID },
          ).output,
        )?.[1],
      )
    expect(seenBy('approver'), 'the module’s own grant holder reads the answers').toBe(1)
    // …and the two personas holding a full CRUD set on a NEIGHBOURING namespace
    // of the same table read none of them. Before the fix, `records:read` — and
    // via has_permission's read-fallback, any grant on `records` at all —
    // returned every promoted module's answer set in the tenant.
    expect(seenBy('author'), 'a records:* holder reads none of them').toBe(0)
    expect(seenBy('reviewer'), 'nor does the other module’s CRUD holder').toBe(0)

    // ── Completing the sections advances the workflow ──────────────────────
    const rounds = await completeOpenTasks(owner, record.id)
    expect(rounds, 'both sections were actioned, one after the other').toBeGreaterThanOrEqual(2)
    expect(
      stepsOf(record.id).map((s) => s.statusId),
      'every synthesized step is terminal',
    ).not.toContain('IN_PROGRESS')

    // The owner's REVIEW task, minted by the completion handler. It is the
    // thing `closeModuleRecord` resolves, and it is why the close endpoint is a
    // real step rather than a formality.
    const review = tasksOf(record.id).filter((t) => t.kind === 'REVIEW')
    expect(review, 'the owner is handed a REVIEW task when the sections finish').toHaveLength(1)
    expect(review[0].statusId).toBe('ASSIGNED')
    expect(review[0].assignedTo).toBe(USERS.approver.id)

    // ── Close ──────────────────────────────────────────────────────────────
    // `closeModuleRecord` merges `req.body.payload` into the record — the
    // owner's own non-routed answers. Sending the fields at the top level is
    // silently ignored, which is how this was first written.
    const close = await restPost(owner, `/form-modules/records/${record.id}/close`, {
      payload: { commercialNotes: 'REC-J2 owner close' },
    })
    expect(close.status(), `close (${await errorMessage(close)})`).toBe(200)

    const closed = findRecord(record.id)
    expect(closed.statusId, 'the record is CLOSED').toBe('CLOSED')
    expect(
      closed.payload,
      'and the owner’s own non-routed answers were merged in on the way',
    ).toContain('REC-J2 owner close')
    expect(
      tasksOf(record.id).find((t) => t.kind === 'REVIEW').statusId,
      'the owner’s REVIEW task is resolved — APPROVED is the task vocabulary for done',
    ).toBe('APPROVED')
  })

  test('a CLOSED record is not frozen — it stays visible and reopenable', async ({ browser }) => {
    // The property doc 07 gets wrong. CLOSED is NOT terminal on this table: the
    // REOPEN outcome of an effectiveness check calls `moduleHost.reopen` and
    // puts the record back to OPEN. REC-J3 pins the edge at the trigger; this
    // pins the two things around it that a browser-level suite can see — the
    // closed record is still READABLE by its module's grant holders, and still
    // not directly writable by them.
    // Self-contained rather than reusing the record the previous test closed:
    // Playwright starts a FRESH WORKER after a failed test and runs this file's
    // `afterAll` on the way out, which deletes every row this suite made. A test
    // that leans on its predecessor therefore fails with "there is no closed
    // record" and buries the real first failure.
    const owner = await pool.context(browser, AUTH.approver)
    const closedId = await driveToClosed(owner)

    expect(
      recordsVisibleTo(USERS.approver.id, [closedId]),
      'the module’s grant holder still reads a closed record',
    ).toBe(1)
    expect(
      recordsVisibleTo(USERS.reviewer.id, [closedId]),
      'and the other module’s holder still reads none of it',
    ).toBe(0)

    // Still writable in the ways that are not the lifecycle — the guard governs
    // status_id, not the row.
    const payloadWrite = sqlAsAppUser(
      `UPDATE records SET payload = payload || '{"note":"after close"}'::jsonb WHERE id = '${closedId}' RETURNING id;`,
      { userId: USERS.approver.id, companyId: COMPANY_ID },
    )
    expect(affectedRows(payloadWrite), 'a non-lifecycle write still lands').toBe(1)

    // …and not in the way that is.
    const reopen = sqlAsAppUser(`UPDATE records SET status_id = 'OPEN' WHERE id = '${closedId}';`, {
      userId: USERS.approver.id,
      companyId: COMPANY_ID,
    })
    expect(reopen.ok, 'reopening is the effectiveness service’s job, not app_user’s').toBeFalsy()
    expect(reopen.error).toMatch(/Module record status cannot be changed directly/)
    expect(findRecord(closedId).statusId).toBe('CLOSED')
  })
})
