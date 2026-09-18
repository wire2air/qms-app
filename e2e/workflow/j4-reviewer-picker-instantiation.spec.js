// PW-J4 · Submit a record and walk the reviewer-picker flow (J-04).
//
// This is the moment a TEMPLATE becomes a RUNNING APPROVAL: the owner picks a
// named reviewer per step from that step's role pool, and the engine expands one
// `workflow_version` into a `workflow_instance`, one `workflow_instance_step` per
// template step, and one `users_on_workflow_instance_steps` ledger row per
// resolved reviewer — then activates the first root step and nothing else.
//
// Six modules instantiate through this one function
// (`workflowInstanceService.createWorkflowInstance`) and, before this journey,
// none of their suites asserted the SHAPE it produces. They assert what happens
// afterwards — reviewer completes, approver signs — which passes just as
// happily against an instance that quietly minted the wrong number of steps,
// activated two of them, or dropped a reviewer.
//
// Three properties are pinned here, each of which is a real defect if it breaks:
//
//   1. **Exactly one instance.** A double-submit that mints two instances gives a
//      record two live approval chains and a reviewer two competing tasks.
//   2. **All steps PENDING, then the FIRST ROOT step activated — alone.** The
//      pack's own wording ("all PENDING" *and* "the first root step activates")
//      reads as a contradiction; the code resolves it — every step is created
//      `PENDING`, then one `activateInstanceStep` call promotes the lowest-order
//      root. Activating more than one would let a later approver sign before the
//      earlier work exists.
//   3. **One ledger row per resolved reviewer, on the right step.** Rows for
//      non-active steps are created up front with status `PENDING` so the chain
//      is inspectable before it runs; only the active step's rows are `ASSIGNED`
//      and carry a task.
//
// The picker half matters as much as the shape: the picker's candidate pool is
// the step's ROLE POOL, and a pick outside it is rejected server-side. That
// server check is asserted directly, because the picker cannot offer an
// out-of-pool user and therefore cannot prove the rule holds for anyone who
// isn't using the picker.
//
// (2026-08-14: CAPA create no longer collects reviewers in a dialog — the CAPA
// lands as a DRAFT and the owner picks per-step reviewers on the detail page's
// Workflow Plan (CapaWorkflowDraftPreview), which parks them in
// `pending_reviewers` exactly like the old dialog did. Same pool, same parked
// map, same instantiation on Open CAPA — this spec drives the new surface.)
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue, findCapaByTitle } from '../fixtures/db.js'
import { createCapa, openCapa, uniqueTitle } from '../fixtures/capas.js'

// The seeded CAPA workflow (qms/database/e2e-seed.sql §14, 'E2E CAPA Review &
// Approval'): two steps, one role each, one member per role. Referenced by id
// so the assertions below say "the instance step points at THIS template
// step" rather than "some step exists".
const TEMPLATE = {
  step1: { id: 'e2ef2003-0000-4000-8000-000000000001', name: 'Reviewer Check', type: 'ACTION' },
  step2: { id: 'e2ef2003-0000-4000-8000-000000000002', name: 'Final Approval', type: 'APPROVAL' },
}

// `author` owns CAPAs in this tenant (capa:create/read/update, and `owner_id`
// lands on them) — the record-owner persona the journey calls for.
test.use({ storageState: AUTH.author })

/**
 * The draft Workflow Plan's reviewer picker for one step: the first combobox
 * AFTER the step's name in document order. The plan's rows render name →
 * picker → next row, and the rail's own selects come later in the DOM, so
 * `following::*[@role="combobox"][1]` lands on that row's picker.
 */
function stepPicker(page, stepName) {
  return page
    .getByText(stepName, { exact: true })
    .first()
    .locator('xpath=following::*[@role="combobox"][1]')
}

/**
 * Open one step's reviewer picker, return every candidate it offers, and select
 * `pick` by name.
 *
 * The options render the user's name AND their role list on a second line, so
 * an exact-name match never hits — matching is on the leading line.
 */
async function pickReviewer(page, combo, pick) {
  const listboxId = await combo.getAttribute('aria-controls')
  const listbox = page.locator(`[id="${listboxId}"]`)
  await expect(async () => {
    if (!(await listbox.isVisible().catch(() => false))) await combo.click()
    await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })

  const candidates = (await listbox.getByRole('option').allInnerTexts()).map((t) =>
    t.split('\n')[0].trim(),
  )
  await listbox.getByRole('option').filter({ hasText: pick }).first().click()
  return candidates
}

test.describe('PW-J4 · reviewer picker → workflow instantiation', () => {
  test('picking a reviewer per step mints one instance, one step per template step, one ledger row per reviewer, and activates only the first root step', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    const title = uniqueTitle('J4-picker')
    await createCapa(page, title)

    const capa = findCapaByTitle(title)
    expect(capa, 'the CAPA was created').toBeTruthy()
    expect(capa.statusId, 'created as a DRAFT — nothing has started').toBe('DRAFT')
    expect(capa.ownerId).toBe(USERS.author.id)

    // The draft Workflow Plan previews the CHAIN, in template order, before
    // anything runs — one picker per step.
    await expect(page.getByText('Workflow Plan')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(TEMPLATE.step1.name).first()).toBeVisible()
    await expect(page.getByText(TEMPLATE.step2.name).first()).toBeVisible()

    // Step 1's pool is the E2E Reviewer role; step 2's is E2E Approver. This is
    // the assertion that makes the pick meaningful: the picker is not offering
    // the whole roster and happening to land on the right person. `author` —
    // the very user driving these pickers — is in neither pool and must not
    // appear in either list.
    const step1Candidates = await pickReviewer(
      page,
      stepPicker(page, TEMPLATE.step1.name),
      USERS.reviewer.name,
    )
    // The Reviewer role carries TWO members since seed §31b (Riley is the
    // reassignment target CAPA-J8 needs) — the pool is exactly those two.
    expect(
      step1Candidates.slice().sort(),
      "step 1's candidates are exactly its role pool",
    ).toEqual([USERS.reviewer2.name, USERS.reviewer.name].sort())
    const step2Candidates = await pickReviewer(
      page,
      stepPicker(page, TEMPLATE.step2.name),
      USERS.approver.name,
    )
    expect(step2Candidates, "step 2's candidates are exactly its role pool").toEqual([
      USERS.approver.name,
    ])
    expect(
      [...step1Candidates, ...step2Candidates],
      'the submitter is not an eligible reviewer on either step',
    ).not.toContain(USERS.author.name)

    // The picks are PARKED on the record until it is opened (the plan
    // autosaves each pick). Asserting this is what separates "the plan
    // collected the picks" from "the plan started an approval", and the CAPA
    // controller wipes `pending_reviewers` on submit — so this is the only
    // point at which it is readable at all.
    await waitForSqlValue(
      `SELECT count(*) FROM capas WHERE id = '${capa.id}'
        AND pending_reviewers->'${TEMPLATE.step1.id}'->>0 = '${USERS.reviewer.id}'
        AND pending_reviewers->'${TEMPLATE.step2.id}'->>0 = '${USERS.approver.id}'`,
      { timeoutMs: 30_000, label: 'both picks parked in pending_reviewers' },
    )
    expect(
      sqlValue(
        `SELECT pending_reviewers->'${TEMPLATE.step1.id}'->>0 FROM capas WHERE id = '${capa.id}'`,
      ),
      'step 1 pick parked against the right template step',
    ).toBe(USERS.reviewer.id)
    expect(
      sqlValue(
        `SELECT pending_reviewers->'${TEMPLATE.step2.id}'->>0 FROM capas WHERE id = '${capa.id}'`,
      ),
      'step 2 pick parked against the right template step',
    ).toBe(USERS.approver.id)
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM workflow_instances WHERE resource_type = 'Capa' AND resource_id = '${capa.id}'`,
        ),
      ),
      'no workflow instance exists until the record is submitted for review',
    ).toBe(0)

    // ── Submit for review — this is the instantiation ───────────────────────
    await openCapa(page, capa.id)

    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instances
        WHERE resource_type = 'Capa' AND resource_id = '${capa.id}'`,
      { timeoutMs: 45_000, label: 'workflow instance created' },
    )

    // 1 — exactly one instance.
    const instances = sql(
      `SELECT id, status_id, workflow_version_id, submitted_by FROM workflow_instances
        WHERE resource_type = 'Capa' AND resource_id = '${capa.id}'`,
    )
    expect(instances.split('\n').length, 'exactly one workflow instance').toBe(1)
    const [instanceId, instanceStatus, versionId, submittedBy] = instances.split('|')
    expect(instanceStatus).toBe('IN_PROGRESS')
    expect(versionId, 'instantiated from the CAPA template the create form chose').toBe(
      sqlValue(`SELECT workflow_version_id FROM capas WHERE id = '${capa.id}'`),
    )
    expect(submittedBy, 'attributed to the owner who submitted').toBe(USERS.author.id)

    // 2 — one instance step per template step, in order, each pointing back at
    //     its own template row.
    const steps = sql(
      `SELECT step_id, step_number, status_id, coalesce(step_type,''), coalesce(name,''),
              coalesce(parent_instance_step_id::text,''), coalesce(started_at::text,'')
         FROM workflow_instance_steps
        WHERE workflow_instance_id = '${instanceId}' AND deleted_at IS NULL
        ORDER BY step_number`,
    )
      .split('\n')
      .map((l) => {
        const [stepId, stepNumber, statusId, stepType, name, parentId, startedAt] = l.split('|')
        return {
          stepId,
          stepNumber: Number(stepNumber),
          statusId,
          stepType,
          name,
          parentId: parentId || null,
          startedAt: startedAt || null,
        }
      })

    expect(steps.length, 'one instance step per template step — no more, no fewer').toBe(2)
    expect(steps.map((s) => s.stepId)).toEqual([TEMPLATE.step1.id, TEMPLATE.step2.id])
    expect(steps.map((s) => s.stepType)).toEqual([TEMPLATE.step1.type, TEMPLATE.step2.type])
    expect(steps.map((s) => s.name)).toEqual([TEMPLATE.step1.name, TEMPLATE.step2.name])
    expect(steps.map((s) => s.parentId), 'both are root steps').toEqual([null, null])

    // 3 — the first root step, and only it, is live.
    expect(steps[0].statusId, 'the first root step activates automatically').toBe('IN_PROGRESS')
    expect(steps[0].startedAt, 'activation stamps startedAt').not.toBeNull()
    for (const later of steps.slice(1)) {
      expect(later.statusId, `${later.name} stays PENDING until its turn`).toBe('PENDING')
      expect(later.startedAt, `${later.name} has not started`).toBeNull()
    }

    // 4 — one ledger row per resolved reviewer, on the right step, with the
    //     status that reflects whether that step is live yet.
    const assignments = sql(
      `SELECT wis.step_id, u.user_id, u.status_id
         FROM users_on_workflow_instance_steps u
         JOIN workflow_instance_steps wis ON wis.id = u.workflow_instance_step_id
        WHERE wis.workflow_instance_id = '${instanceId}' AND u.deleted_at IS NULL
        ORDER BY wis.step_number, u.user_id`,
    )
      .split('\n')
      .map((l) => {
        const [stepId, userId, statusId] = l.split('|')
        return { stepId, userId, statusId }
      })

    expect(assignments.length, 'exactly one assignment per resolved reviewer').toBe(2)
    expect(assignments[0], 'step 1 went to the reviewer the owner picked, ASSIGNED because it is live').toEqual({
      stepId: TEMPLATE.step1.id,
      userId: USERS.reviewer.id,
      statusId: 'ASSIGNED',
    })
    expect(
      assignments[1],
      'step 2 went to the approver the owner picked and is parked PENDING — the chain is inspectable before it runs',
    ).toEqual({
      stepId: TEMPLATE.step2.id,
      userId: USERS.approver.id,
      statusId: 'PENDING',
    })

    // 5 — a task exists for the live step's assignee and for nobody else. This
    //     is what turns the ledger row into something a reviewer can see: every
    //     notification in the module rides the task INSERT (F-12), so a step
    //     that activates with zero tasks is silent.
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.reviewer.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: "reviewer's task minted" },
    )
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM task_instances
            WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
              AND deleted_at IS NULL AND status_id NOT IN ('CANCELLED')`,
        ),
      ),
      'only the ACTIVE step has a task — the approver is not asked to act yet',
    ).toBe(1)
  })

  test('the role pool is enforced on the server, not just drawn in the picker', async ({ page }) => {
    test.setTimeout(180_000)

    // The picker can only ever offer the pool, so driving it can never prove the
    // rule holds. The submit endpoint accepts a `reviewers` map straight off the
    // wire — that is the surface an out-of-pool pick would actually arrive on,
    // and `createWorkflowInstance` re-derives the pool and rejects. Without this,
    // a UI-only journey would report the pool as enforced while the server let
    // any tenant user be routed a controlled-record approval. (No UI picks
    // needed here — an explicit `reviewers` body overrides `pending_reviewers`.)
    const title = uniqueTitle('J4-pool')
    await createCapa(page, title)

    const capa = findCapaByTitle(title)

    // `noAccess` holds no CAPA grants and neither workflow role — the clearest
    // "should never be routed this approval" persona in the cast.
    const res = await page.request.post(`/api/v1/services/capas/${capa.id}/submitForReview`, {
      data: { reviewers: { [TEMPLATE.step2.id]: [USERS.noAccess.id] } },
    })
    expect(res.status(), 'an out-of-pool reviewer pick is rejected').toBe(400)
    const body = await res.json().catch(() => null)
    expect(body?.error?.message ?? '', 'and the rejection names the reason').toMatch(
      /outside the role pool/i,
    )

    // The rejection is atomic: no half-built instance is left behind. The whole
    // submit runs in one transaction, and a partially-instantiated chain would
    // strand the record with steps nobody can action.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM workflow_instances WHERE resource_type = 'Capa' AND resource_id = '${capa.id}'`,
        ),
      ),
      'the rejected submit left no workflow instance behind',
    ).toBe(0)
    expect(
      sqlValue(`SELECT status_id FROM capas WHERE id = '${capa.id}'`),
      'and the CAPA is still a DRAFT the owner can resubmit',
    ).toBe('DRAFT')

    // CONTROL: the same endpoint, with an IN-pool pick, succeeds — so the
    // assertion above is about the pool rule and not about the endpoint being
    // unreachable, mis-shaped, or gated on something else entirely.
    const ok = await page.request.post(`/api/v1/services/capas/${capa.id}/submitForReview`, {
      data: {
        reviewers: {
          [TEMPLATE.step1.id]: [USERS.reviewer.id],
          [TEMPLATE.step2.id]: [USERS.approver.id],
        },
      },
    })
    expect(ok.status(), 'an in-pool pick on the same endpoint is accepted').toBe(200)
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instances
        WHERE resource_type = 'Capa' AND resource_id = '${capa.id}'`,
      { timeoutMs: 30_000, label: 'instance created by the in-pool submit' },
    )
  })
})
