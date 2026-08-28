// PW-J15 · F-12 — a reviewer-less step activates silently.
//
// The shape: publish a template step carrying no `workflow_step_roles` row and
// no `workflow_step_users` row — the readiness dialog raises only an advisory
// INFO about this, it does not block — then submit a record against it.
//
// What happened before the fix, and why it is worse than "a step with no
// reviewer":
//
//   · `submitResourceForReview` resolves the step's reviewers, gets an empty
//     list, and skips the `users_on_workflow_instance_steps` bulkCreate.
//   · `activateInstanceStep` flips the step to IN_PROGRESS anyway, then
//     `fireInstanceStepAssignments` returns on its first line
//     (`if (pendingAssignments.length === 0) return`) — so ZERO
//     `task_instances` rows are minted.
//   · **and that is the whole failure.** Every workflow notification except
//     NTF-05 is a side effect of a `task_instances` INSERT (doc 08 §D). No task
//     means no NTF-01, no NTF-04, nothing in anyone's feed. The record's owner
//     sees "Under Review". The step renders as live. Nobody is asked to do
//     anything, and nobody is told that nobody was asked.
//
// A stalled instance is unreachable through the product: there is no task to
// action, and the owner's step controls do not offer "assign someone now".
//
// The invariant this asserts is deliberately fix-agnostic, because doc 14
// accepts either remedy ("assert either publication is refused or the step
// refuses to activate with zero assignees"):
//
//     NO workflow_instance_step MAY BE IN_PROGRESS WITH ZERO LIVE ASSIGNEES
//     AND ZERO OPEN TASKS.
//
// If instantiation is refused up front, there is no instance and the invariant
// holds trivially — asserted as its own branch. If instantiation is allowed, the
// step must not be live-but-unassigned. Either way the journey ends by proving
// the notification path is intact rather than by proving an absence: an absence
// assertion after a fixed sleep is exactly the kind of test that passes whether
// or not the behaviour is correct.
//
// ⚠️ Expected RED until F-12 is closed. The diagnostic block below names which
// half is still biting so the failure is actionable rather than just "false !==
// true".
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { findCrByTitle, sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { createCr, uniqueTitle } from '../fixtures/changeRequests.js'
import {
  REVIEWERLESS,
  notificationsForInstance,
  purgeReviewerlessTemplate,
  seedReviewerlessTemplate,
} from '../fixtures/workflowGuards.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J15 · F-12 reviewer-less step', () => {
  test.afterEach(() => {
    // MTC-08 is explicit: never leave a stalled instance behind in a shared
    // environment. Runs even when the assertions fail, which is the case that
    // matters — a red F-12 run is exactly the run that creates one.
    purgeReviewerlessTemplate()
  })

  test('a step with no role and no user must not activate silently', async ({ page, browser }) => {
    test.setTimeout(240_000)

    seedReviewerlessTemplate()

    // Build a real CR through the UI (so the record, its owner and its audit
    // context are genuine), then point it at the probe version.
    //
    // The repoint is done in SQL rather than through the create form on purpose:
    // the form's workflow select is `required` and auto-fills because E2ELAB has
    // exactly ONE ACTIVE CHANGE_CONTROL workflow. Publishing the probe as a
    // second ACTIVE one would break that auto-fill for every other CR and
    // workflow spec running concurrently — see `seedReviewerlessTemplate`.
    const title = uniqueTitle('J15-reviewerless')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    expect(cr.statusId).toBe('DRAFT')
    // The submit below must be REFUSED for reviewer-less reasons or not at all —
    // a 403 would make branch A "pass" for a reason with nothing to do with F-12.
    //
    // What guards it changed on 2026-08-19. `assertOwner` is still the name in
    // changeRequests.js:47, but it no longer means "is this the owner": it now
    // delegates to `assertCanActOnRecord`, so custodianship supplies the SCOPE
    // and the matrix supplies the VERB (`change_control:update`, also enforced
    // at the route by `enforcePermission`). Aaron passes on both counts — he
    // holds the verb at TENANT scope, and he owns the record — so this premise
    // still holds, but it now pins two independent things. Both are asserted:
    // ownership (the scope input) and the grant (the verb), because either one
    // going missing produces the same misleading green.
    expect(cr.ownerId, 'the submitting persona owns the record (scope input)').toBe(USERS.author.id)
    expect(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions rmp
           JOIN roles_on_users ru ON ru.role_id = rmp.role_id AND ru.company_id = rmp.company_id
          WHERE ru.user_id = '${USERS.author.id}'
            AND rmp.module_id = 'change_control' AND rmp.action_id = 'update'`,
      ),
      'and holds change_control:update, which submitForReview now requires of them too',
    ).not.toBe('0')

    sql(
      `UPDATE change_requests
          SET workflow_version_id = '${REVIEWERLESS.versionId}', pending_reviewers = '{}'::jsonb
        WHERE id = '${cr.id}'`,
    )

    // Submit through the owner's real endpoint. `reviewers` falls back to the
    // (now empty) pendingReviewers, so the engine takes its legacy
    // role-expansion path — which resolves to nobody.
    const ctx = await browser.newContext({ storageState: AUTH.author })
    let submitStatus
    let submitBody
    try {
      const res = await ctx.request.post(
        `/api/v1/services/changeRequests/${cr.id}/submitForReview`,
        { data: {} },
      )
      submitStatus = res.status()
      submitBody = await res.text().catch(() => '')
    } finally {
      await ctx.close()
    }

    const instanceId = sqlValue(
      `SELECT id FROM workflow_instances
        WHERE resource_type = 'ChangeRequest' AND resource_id = '${cr.id}'
        ORDER BY created_at DESC LIMIT 1`,
    )

    // ── Branch A: instantiation refused. The invariant holds because no step
    //    exists at all — this is the "publication/submission is blocked" remedy.
    if (submitStatus >= 400) {
      expect(instanceId, 'a refused submit must leave no workflow instance behind').toBeNull()
      expect(
        sqlValue(`SELECT status_id FROM change_requests WHERE id = '${cr.id}'`),
        'the record stays DRAFT so the owner can fix the template',
      ).toBe('DRAFT')
      expect(
        submitStatus,
        'a reviewer-less template is a client-side configuration error, not a 500',
      ).toBeLessThan(500)
      expect(submitBody, 'the refusal explains the reviewer-less step').toMatch(
        /reviewer|assignee|assign|no user|not configured/i,
      )
      return
    }

    // ── Branch B: instantiation allowed. Then nothing may be live-and-orphaned.
    expect(instanceId, `submit returned ${submitStatus} but minted no instance`).toBeTruthy()

    const probeStepId = sqlValue(
      `SELECT id FROM workflow_instance_steps
        WHERE workflow_instance_id = '${instanceId}' AND step_id = '${REVIEWERLESS.stepId}'`,
    )
    expect(probeStepId, 'the probe step was instantiated').toBeTruthy()

    const stepStatusId = sqlValue(
      `SELECT status_id FROM workflow_instance_steps WHERE id = '${probeStepId}'`,
    )
    const liveAssignees = Number(
      sqlValue(
        `SELECT count(*) FROM users_on_workflow_instance_steps
          WHERE workflow_instance_step_id = '${probeStepId}' AND deleted_at IS NULL
            AND status_id NOT IN ('CANCELLED','REASSIGNED')`,
      ),
    )
    const openTasks = Number(
      sqlValue(
        `SELECT count(*) FROM task_instances
          WHERE source_type = 'WorkflowInstanceStep' AND source_id = '${probeStepId}'
            AND deleted_at IS NULL AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
      ),
    )
    const notifications = notificationsForInstance(instanceId, 'ChangeRequest', cr.id)

    // The diagnostic. `expect(false).toBe(true)` tells whoever picks this up
    // nothing; this tells them which half of F-12 is still open.
    const diagnostic =
      `step=${stepStatusId} liveAssignees=${liveAssignees} openTasks=${openTasks} ` +
      `notifications=${notifications} (instance ${instanceId}, step ${probeStepId})`

    expect(
      stepStatusId === 'IN_PROGRESS' && liveAssignees === 0,
      `F-12: a step activated with nobody assigned — ${diagnostic}`,
    ).toBe(false)

    expect(
      stepStatusId === 'IN_PROGRESS' && openTasks === 0,
      `F-12: a live step minted no task, so no notification can ever fire — ${diagnostic}`,
    ).toBe(false)

    // Positive proof that somebody was actually told. Written as a WAIT for a
    // notification to appear rather than a check that none did: notifications
    // are produced asynchronously by graphile-worker, so "count === 0 right now"
    // is indistinguishable from "the worker has not caught up", and a spec built
    // on that would go green the day the worker got slower.
    if (stepStatusId === 'IN_PROGRESS') {
      await waitForSqlValue(
        `SELECT count(*) > 0 FROM notifications n
          WHERE n.deleted_at IS NULL AND n.resource_type = 'TaskInstance'
            AND n.resource_id IN (
              SELECT id FROM task_instances
               WHERE source_type = 'WorkflowInstanceStep' AND source_id = '${probeStepId}')`,
        { timeoutMs: 60_000, label: `someone was notified about step ${probeStepId}` },
      )
    }
  })
})
