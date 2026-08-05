// PW-J5 · F-05 — a published-template edit must not change the rules of an
// approval already in flight.
//
// The pack specified PW-J2 as "publish, then attempt to edit the published
// version — assert the edit is blocked". That framing was not adopted, and the
// reason is worth recording: blocking the edit means putting a DRAFT predicate on
// `workflow_version_upd`/`workflow_step_upd`, and those same policies carry the
// publish (DRAFT→PUBLISHED) and retire (PUBLISHED→RETIRED) transitions, so a
// naive predicate breaks the lifecycle it is meant to protect. It also does
// nothing for instances already running against a template edited earlier.
//
// The actual harm F-05 describes is narrower and sharper: the engine re-read the
// CONTROL fields (`requireEsignature`, `approvalRule`) from the LIVE template at
// action time, so editing a published version retroactively changed the rules of
// a live approval — flipping `requireEsignature` to false let an assignee
// complete a Part-11 approval with no signature.
//
// Migration 20260805130000 freezes those fields onto `workflow_instance_steps` at
// instantiation. This journey asserts the invariant that actually matters: EDIT
// THE PUBLISHED TEMPLATE, AND THE LIVE INSTANCE DOES NOT MOVE.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { createLiveWorkflowInstance, stepsOf } from '../fixtures/workflow.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J5 · F-05 control-field snapshot', () => {
  test('instantiation snapshots requireEsignature and approvalRule onto the instance step', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    const { instanceId } = await createLiveWorkflowInstance(page, 'J5-snapshot')
    const steps = stepsOf(instanceId)
    expect(steps.length).toBeGreaterThan(0)

    // Every template-spawned step carries its own frozen copy. (NULL is reserved
    // for ad-hoc child steps, which have no template row to copy from.)
    for (const step of steps) {
      const templateValues = sqlValue(
        `SELECT coalesce(ws.require_esignature::text,'null') || '/' || coalesce(ws.approval_rule,'null')
           FROM workflow_instance_steps wis
           JOIN workflow_steps ws ON ws.id = wis.step_id
          WHERE wis.id = '${step.id}'`,
      )
      const [tmplEsign, tmplRule] = templateValues.split('/')
      if (tmplEsign !== 'null') {
        expect(
          step.requireEsignature,
          `step ${step.stepNumber} froze requireEsignature from its template`,
        ).toBe(tmplEsign === 'true')
      }
      if (tmplRule !== 'null') {
        expect(step.approvalRule, `step ${step.stepNumber} froze approvalRule`).toBe(tmplRule)
      }
    }
  })

  test('BLOCKS the F-05 bypass: flipping requireEsignature on the PUBLISHED template does not disarm a live approval', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    const { instanceId } = await createLiveWorkflowInstance(page, 'J5-tamper')
    const steps = stepsOf(instanceId)

    // Find a step whose template demands a signature — the thing worth removing.
    const guarded = steps.find((s) => s.requireEsignature === true)
    expect(guarded, 'the seeded CR template has an e-sign-required step').toBeTruthy()

    const templateStepId = sqlValue(
      `SELECT step_id FROM workflow_instance_steps WHERE id = '${guarded.id}'`,
    )

    // The attack: a workflows_templates:update holder edits the PUBLISHED
    // version's step. This is permitted — no DRAFT predicate exists, and this
    // journey deliberately does not assert that it is blocked.
    sql(`UPDATE workflow_steps SET require_esignature = false WHERE id = '${templateStepId}'`)
    try {
      expect(
        sqlValue(`SELECT require_esignature FROM workflow_steps WHERE id = '${templateStepId}'`),
        'the published-template edit itself still goes through (F-05 is not fixed by blocking it)',
      ).toBe('f')

      // ...and the live instance is unmoved. Pre-fix, the engine read the
      // template here and the approval could then be completed with no signature.
      expect(
        sqlValue(`SELECT require_esignature FROM workflow_instance_steps WHERE id = '${guarded.id}'`),
        'the in-flight approval keeps the signature requirement it started under',
      ).toBe('t')
    } finally {
      sql(`UPDATE workflow_steps SET require_esignature = true WHERE id = '${templateStepId}'`)
    }
  })

  test('terminal steps are deliberately left unsnapshotted by the backfill', async () => {
    // Migration 20260805130000 backfilled only non-terminal rows. Re-freezing a
    // step whose outcome is already recorded would imply an assertion about the
    // rules in force at the time that the schema cannot actually support.
    const leaked = sqlValue(
      `SELECT count(*) FROM workflow_instance_steps
        WHERE status_id IN ('APPROVED','REJECTED','CANCELLED','SKIPPED')
          AND deleted_at IS NULL
          AND approval_rule IS NOT NULL
          AND created_at < NOW() - INTERVAL '1 hour'`,
    )
    expect(Number(leaked), 'pre-existing terminal steps were not backfilled').toBe(0)
  })
})
