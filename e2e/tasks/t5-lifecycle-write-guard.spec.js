// TASK-T5 — 🔴 F-10 / HIGH-4 and F-04: what an authenticated browser session may
// write to `task_instances`, probed at the database.
//
// The write half of this pass, and the half nothing else in the suite reaches.
// `e2e/fixtures/tasks.js` was built with these probes in mind — `attemptTaskWriteAs`,
// `attemptTaskWriteMessageAs` and `attemptTaskWriteTrusted` exist for this file —
// but the file itself was never written, so until now the session's two headline
// changes (the QMSTI trigger of migration 20260901200000 and the rewritten
// `task_instance_update_rls`) shipped with no executable evidence at all.
//
// ── WHAT WAS THERE ──────────────────────────────────────────────────────────
//
// `task_instance_update_rls` was `company_id = mine AND (is_owner OR assigned_to
// = me)`. A relationship question and no other question: not WHAT may be
// written, not FROM WHICH state. `task_instances` carries no PostGraphile
// `@behavior` comment and `app_user` holds the UPDATE grant, so
// `updateTaskInstance` was live over GraphQL, and the only trigger on the table
// (`task_instances_set_completed_at_trigger`) has never rejected anything. An
// assignee's own browser session could therefore move any of their tasks from
// any status to any other — including REJECTED forward to APPROVED, and
// including APPROVED back to ASSIGNED.
//
// For a 21 CFR Part 11 system the first of those is the whole problem. The
// sanctioned path is POST /v1/services/taskInstances/:id/action, which verifies
// the e-signature and advances the workflow in one transaction; a status written
// anywhere else is an approval record with no attributable signature — the exact
// artefact the control exists to prevent.
//
// ── WHY EVERY PROBE HERE IS A PAIR ──────────────────────────────────────────
//
// Three different things produce "nothing happened" on this table and only one
// of them is a guard working:
//
//   NO_ERROR / 1 row   the write was ACCEPTED — every layer allowed it
//   NO_ERROR / 0 rows  RLS refused, SILENTLY. Postgres applies the UPDATE
//                      policy's USING as a filter, so a refused write is a
//                      SUCCESSFUL statement against zero rows — indistinguishable
//                      from a WHERE that matched nothing, and NOT an error
//   QMSTI    / 0 rows  the lifecycle trigger refused it, by name
//   42501    / 0 rows  the policy's WITH CHECK refused the resulting row
//
// So `expect().rejects` would be the wrong assertion for half of this file, and
// a bare row count would be the wrong assertion for the other half.
// `attemptTaskWriteAs` reports SQLSTATE and ROW_COUNT together, which is the only
// shape that tells the four apart — and every refusal below is paired, in the same
// run, with a persona or a row the same layer ADMITS, so a policy that had quietly
// stopped matching anything cannot read as a perfect guard.
//
// ── THE CARVE-OUT IS THE LOAD-BEARING HALF ──────────────────────────────────
//
// `DocumentCollaboratorTaskCard.vue:43-46` is the last client anywhere that
// writes a task status directly, and it writes exactly one transition:
// a DocumentCollaborator-sourced task, assigned to the caller, to APPROVED.
// Marking your own collaboration complete carries no signature requirement, so
// nothing is being bypassed — and `models/taskInstance.js` leaves `statusId` and
// `completedAt` open to GraphQL for it while locking twelve other fields.
//
// It is also the reason this file can prove anything. Without a write the guard
// is supposed to ALLOW, a policy that had simply been slammed shut would pass
// every test below.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import {
  attemptTaskWriteAs,
  attemptTaskWriteMessageAs,
  attemptTaskWriteTrusted,
  canSee,
  createPersonaPool,
  findTaskFor,
  mintCapaTask,
  mintCollaboratorTask,
  taskRow,
  uniqueTag,
} from '../fixtures/tasks.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const TI = 'public.task_instances'

test.describe('TASK-T5 — the lifecycle guard (F-10) and the UPDATE policy (F-04)', () => {
  let capa
  let docTaskId
  let documentId
  /** An already-closed task of Rita's. Read, not minted — see findTaskFor. */
  let approvedId

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(420_000)
    const tag = uniqueTag('T5')
    const authorPage = await pool.page(browser, AUTH.author)
    // The two shapes the guard treats differently, assigned to the same person
    // so that persona can never be the variable that explains a difference.
    capa = await mintCapaTask(authorPage, tag)
    const doc = await mintCollaboratorTask(authorPage, { tag, collaborators: [USERS.reviewer] })
    docTaskId = doc.tasks[USERS.reviewer.id]
    documentId = doc.documentId
    approvedId = findTaskFor(USERS.reviewer, 'APPROVED')
  })

  test('🔴 an approval task cannot be actioned over GraphQL — and the collaborator card still can', async () => {
    // The finding. Rita is the assignee and the task is ASSIGNED, so the UPDATE
    // policy ADMITS this row — USING is satisfied on both its clauses. Nothing
    // between her and an unsigned approval but the trigger.
    const engine = attemptTaskWriteAs(
      USERS.reviewer,
      `UPDATE ${TI} SET status_id = 'APPROVED' WHERE id = '${capa.taskId}'`,
    )
    expect(engine.sqlstate, 'the lifecycle guard refuses it by name').toBe('QMSTI')
    expect(engine.rows, 'and nothing was written').toBe(0)

    // The pair, and the whole reason the line above means something: the SAME
    // persona, the SAME transition, on a sibling row that differs only in what
    // raised it. A guard drawn around the engine has to leave this working.
    const carveOut = attemptTaskWriteAs(
      USERS.reviewer,
      `UPDATE ${TI} SET status_id = 'APPROVED' WHERE id = '${docTaskId}'`,
    )
    expect(carveOut.sqlstate, 'the collaboration task is not the engine’s').toBe('NO_ERROR')
    expect(carveOut.rows, 'and "Mark complete" still writes exactly one row').toBe(1)

    // The refusal names the sanctioned endpoint rather than failing bare. This
    // is asserted because it is the difference between a user retrying the same
    // broken action and a developer finding API-03 — and because a HINT is the
    // first thing dropped by a well-meaning refactor.
    const message = attemptTaskWriteMessageAs(
      USERS.reviewer,
      `UPDATE ${TI} SET status_id = 'APPROVED' WHERE id = '${capa.taskId}'`,
    )
    expect(message, 'an unexplained refusal is a support ticket').toMatch(
      /approval task cannot be actioned directly/i,
    )
    expect(message, 'and it points at the endpoint that signs').toMatch(
      /taskInstances\/:id\/action/i,
    )

    // Both probes roll themselves back, so the fixture is exactly as it was —
    // which is also the assertion that the refusal was a refusal and not a
    // partial write.
    expect(taskRow(capa.taskId).statusId, 'the approval task is untouched').toBe('ASSIGNED')
    expect(taskRow(capa.taskId).completedAt).toBeNull()
    expect(taskRow(docTaskId).statusId, 'and so is the collaboration task').toBe('ASSIGNED')
  })

  test('the identity columns are pinned — on the one row a client may still write', async () => {
    // Why this is probed on the COLLABORATION task and not the CAPA one: the
    // engine clause already refuses every write to the CAPA task, so a "cannot
    // re-point it" assertion there would pass for the wrong reason. This row is
    // one the policy AND the trigger both admit a status write to (proved one
    // test up), which makes it the only place the identity rule can be observed
    // doing its own work.
    //
    // The attack it closes is a two-step: null out `source_type` in one mutation
    // — a status no-op the trigger's fast path would otherwise wave through —
    // and then approve in the next, now that the row no longer looks like the
    // engine's.
    const unsource = attemptTaskWriteAs(
      USERS.reviewer,
      `UPDATE ${TI} SET source_type = NULL WHERE id = '${docTaskId}'`,
    )
    expect(unsource.sqlstate, 'a task cannot be re-pointed').toBe('QMSTI')
    expect(unsource.rows).toBe(0)

    const repoint = attemptTaskWriteAs(
      USERS.reviewer,
      `UPDATE ${TI} SET entity_id = '${capa.capaId}', entity_type = 'Capa' WHERE id = '${docTaskId}'`,
    )
    expect(repoint.sqlstate, 'nor aimed at a different record').toBe('QMSTI')

    const rekind = attemptTaskWriteAs(
      USERS.reviewer,
      `UPDATE ${TI} SET task_kind_id = 'ACTION' WHERE id = '${docTaskId}'`,
    )
    expect(rekind.sqlstate, 'nor re-kinded').toBe('QMSTI')

    const row = taskRow(docTaskId)
    expect(row.sourceType, 'the row still says what raised it').toBe('DocumentCollaborator')
    expect(row.entityId).toBe(documentId)
    expect(row.taskKindId).toBe('REVIEW')
  })

  test('somebody else’s task is not writable, even by a persona who can READ it', async () => {
    // Carla is the right stranger and the only one who makes this test mean
    // anything. She holds document_control:read, so `task_instance_select_rls`
    // admits her to this exact row (TASK-T4 asserts that, and it is re-asserted
    // here because it is this test's premise): the zero below is therefore the
    // UPDATE policy refusing a write, not the SELECT policy hiding the row.
    // A persona who could not see it at all would produce the same zero for a
    // reason that proves nothing.
    expect(canSee(USERS.controller, docTaskId), 'she can read the row…').toBe(true)

    const stranger = attemptTaskWriteAs(
      USERS.controller,
      `UPDATE ${TI} SET status_id = 'APPROVED' WHERE id = '${docTaskId}'`,
    )
    expect(stranger.sqlstate, '…and the refusal is SILENT, as RLS refusals are').toBe('NO_ERROR')
    expect(stranger.rows, 'zero rows: the policy filtered it out of the UPDATE').toBe(0)

    // The pair: the identical statement, from the assignee, one row. Without it
    // "Carla wrote nothing" is equally consistent with the statement being
    // malformed or the row not existing.
    const assignee = attemptTaskWriteAs(
      USERS.reviewer,
      `UPDATE ${TI} SET status_id = 'APPROVED' WHERE id = '${docTaskId}'`,
    )
    expect(assignee.rows, 'the same write, from the assignee, lands').toBe(1)
  })

  test('a closed task is not reachable for update at all (the USING half of F-04)', async () => {
    // "Terminal -> ASSIGNED" is the reopening the finding names, and over GraphQL
    // it is refused one layer EARLIER than you would expect: the UPDATE policy's
    // USING pins the status set, so a closed row is filtered out before the
    // trigger is consulted. That is why this probe expects a silent zero and the
    // trusted probe below expects QMSTI — same rule, two enforcement points, and
    // asserting the wrong one for the path would encode a fiction.
    expect(approvedId, 'the tenant has a closed task of Rita’s to probe').toBeTruthy()
    expect(canSee(USERS.reviewer, approvedId), 'which she can still read').toBe(true)

    const reopen = attemptTaskWriteAs(
      USERS.reviewer,
      `UPDATE ${TI} SET status_id = 'ASSIGNED' WHERE id = '${approvedId}'`,
    )
    expect(reopen.sqlstate, 'silent, not an error').toBe('NO_ERROR')
    expect(reopen.rows, 'a closed task is outside the policy’s USING').toBe(0)

    // Two-sided on the row rather than on the persona this time: the same user,
    // a write that touches nothing but a comment, on an OPEN task of hers.
    const open = attemptTaskWriteAs(
      USERS.reviewer,
      `UPDATE ${TI} SET comment = comment WHERE id = '${docTaskId}'`,
    )
    expect(open.rows, 'while an open task of hers is writable').toBe(1)

    expect(taskRow(approvedId).statusId, 'and the closed task is still closed').toBe('APPROVED')
  })

  test('the transition graph binds the TRUSTED path too — and is a graph, not a freeze', async () => {
    // The trigger's closed-status rule is deliberately NOT gated on v_trusted:
    // a recorded decision is not the server's to rewrite either. Only a
    // superuser probe reaches it (RLS refuses the untrusted caller first, above),
    // and only a superuser probe can tell the graph apart from a blanket freeze.
    //
    // The graph is not a design preference — it was read out of 5 518 audit_logs
    // rows. APPROVED -> CANCELLED has happened 50 times (cancelWorkflowInstance
    // sweeps a whole instance with no status predicate) and APPROVED ->
    // SUPERSEDED 9 times (reopenApprovedStep retiring a stale approval).
    // APPROVED -> ASSIGNED and APPROVED -> REJECTED have never happened and are
    // the two the finding is about.
    expect(approvedId).toBeTruthy()

    const reopen = attemptTaskWriteTrusted(
      `UPDATE ${TI} SET status_id = 'ASSIGNED' WHERE id = '${approvedId}'`,
    )
    expect(reopen.sqlstate, 'no task returns to an inbox once it is done').toBe('QMSTI')

    const flip = attemptTaskWriteTrusted(
      `UPDATE ${TI} SET status_id = 'REJECTED' WHERE id = '${approvedId}'`,
    )
    expect(flip.sqlstate, 'and a signed approval cannot be flipped to a refusal').toBe('QMSTI')

    // The other half. If these two refused as well, the guard would be a freeze
    // on terminal states, workflow cancellation would break on every instance
    // that had made progress, and this file would be asserting that a bug had
    // shipped.
    const cancel = attemptTaskWriteTrusted(
      `UPDATE ${TI} SET status_id = 'CANCELLED' WHERE id = '${approvedId}'`,
    )
    expect(cancel.sqlstate, 'cancelling a workflow sweeps its completed tasks').toBe('NO_ERROR')
    expect(cancel.rows).toBe(1)

    const supersede = attemptTaskWriteTrusted(
      `UPDATE ${TI} SET status_id = 'SUPERSEDED' WHERE id = '${approvedId}'`,
    )
    expect(supersede.sqlstate, 'and reopening a step retires its stale approval').toBe('NO_ERROR')
    expect(supersede.rows).toBe(1)

    // Every probe above rolled itself back, which is the point of the wrapper —
    // four writes against one row and the record is as the regulator left it.
    expect(taskRow(approvedId).statusId).toBe('APPROVED')
  })

  test('🔴 F-02b / HIGH-5 — a client cannot mint a task, in either status', async () => {
    // The INSERT policy used to carry `OR source_type IS DISTINCT FROM
    // 'WorkflowInstanceStep'`, which is true for every other value AND for NULL
    // on a nullable column — so any authenticated member could create a task
    // row. That is not inert data: the audit trigger's INSERT event enqueues
    // send_task_assigned_notification, which copies the caller's free-text
    // `comment` verbatim into an in-app notification AND an email from the
    // company's own SMTP identity, with a deep link built from the caller's
    // entity_type / entity_id. An authenticated phishing primitive behind no
    // permission and no rate limit.
    //
    // Both halves are probed because they are refused by DIFFERENT layers, and
    // the order is the interesting part: a BEFORE ROW trigger runs before RLS
    // evaluates WITH CHECK, so a pre-completed task is refused by name while a
    // well-formed one is refused by the policy.
    // The column list is every NOT NULL column without a default, plus the
    // `comment` that carries the payload — so a future NOT NULL addition breaks
    // this loudly rather than quietly turning both probes into "malformed
    // statement, refused for the wrong reason".
    const mint = (status) =>
      `INSERT INTO ${TI}
         (assigned_to, task_kind_id, status_id, entity_type, entity_id, company_id, comment, created_at, updated_at)
       VALUES ('${USERS.controller.id}', 'REVIEW', '${status}', 'Document', '${documentId}',
               '${COMPANY_ID}', 'E2E probe — urgent, please click', now(), now())`

    const preApproved = attemptTaskWriteAs(USERS.reviewer, mint('APPROVED'))
    expect(preApproved.sqlstate, 'a task cannot be created already decided').toBe('QMSTI')

    const wellFormed = attemptTaskWriteAs(USERS.reviewer, mint('ASSIGNED'))
    expect(
      wellFormed.sqlstate,
      'and an ASSIGNED one is refused by the policy instead — 42501, not a silent zero, ' +
        'because WITH CHECK raises where USING filters',
    ).toBe('42501')
    expect(wellFormed.rows).toBe(0)
  })
})
