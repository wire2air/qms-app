// CAPA-backed suites' pre-flight: purge the CAPAs left behind by previous runs.
//
// WHY THIS EXISTS. The `rca` and `riskAssessment` projects have no entity of
// their own to create — both modules are embedded widgets inside a workflow
// step's task form (docs/modules/rca/01, risk-assessment/01), so every journey
// mints a whole CAPA to carry the widget. Nothing ever removed them. Measured
// 2026-09-15 on app-db: 540 CAPAs in E2ELAB, 434 of them `E2E CAPA%` leftovers,
// alongside 3,855 task_instances and 1,929 workflow_instances.
//
// Capa/TaskInstance/WorkflowInstance are INSTANT-strategy synced models, so the
// syncEngine pages all of them into IndexedDB on every fresh browser context —
// and these suites open a new context per persona, several times per journey.
// The symptom is not a failing assertion but a *timeout that moves around*:
// RCA-J1 began timing out on "Start CAPA" inside the shared createCapa fixture,
// and PW-J3's category create stopped landing within its 15s poll — while the
// identical sequence driven by hand, against the same code, worked every time.
// That is data growth, not a race in any one spec. Same reason qcSetup,
// documentsSetup and inspectionsLogsSetup exist.
//
// HARD DELETE, NOT SOFT. `capas` is paranoid, so setting deleted_at would be
// the reversible-looking option — but it does not fix anything: the bootstrap
// still pages soft-deleted rows, which is exactly why qc.setup.js says
// "leaving soft-deleted rows behind would defeat the point".
//
// SCOPE. Only `title LIKE 'E2E CAPA%'` inside E2ELAB — the prefix every
// fixtures/capas.js#uniqueTitle mints. It cannot reach demo or customer data,
// and it leaves the 106 non-E2E CAPAs in this tenant untouched.
//
// SIGNATURES. `signatures_capa_id_fkey` is ON DELETE RESTRICT, deliberately —
// a Part-11 signature must not vanish because someone deleted what it signed.
// That guarantee is worth more than this cleanup, so the purge works WITH it:
// it drops the signatures THIS suite's own throwaway CAPAs produced (257
// measured across all four subject arms), explicitly and scoped, rather than
// relaxing the constraint.
//
// ⚠️ `signatures.workflow_instance_step_id` is ON DELETE **CASCADE**, unlike the
// RESTRICT on capa_id. So deleting workflow_instance_steps silently removes any
// signature hanging off them. Deleting the signatures explicitly first (below)
// makes that cascade a no-op instead of a surprise.
//
// That is not hypothetical: a dry run on app-db (2026-09-15) found exactly one
// signature in this purge's blast radius with capa_id = NULL AND
// task_instance_id = NULL — reachable ONLY through the workflow step, so the
// three obvious subject-arm deletes all missed it and the cascade would have
// taken it silently. The fourth DELETE below exists for that row. Verified
// after the fix: 0 signatures uncovered, and 0 signatures belonging to
// non-E2E CAPAs anywhere in the blast radius.
import { test as setup, expect } from '@playwright/test'
import { COMPANY_ID } from './cast.js'
import { sql, sqlValue } from './db.js'

const MINE = `company_id = '${COMPANY_ID}' AND title LIKE 'E2E CAPA%'`

setup('purge CAPAs from previous RCA / Risk Assessment runs', async () => {
  const before = Number(sqlValue(`SELECT count(*) FROM capas WHERE ${MINE}`))

  sql(`
    -- Signatures first, every subject arm that can point at this suite's rows.
    DELETE FROM signatures WHERE capa_id IN (SELECT id FROM capas WHERE ${MINE});
    DELETE FROM signatures WHERE workflow_instance_step_id IN (
      SELECT wis.id FROM workflow_instance_steps wis
        JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
       WHERE wi.resource_type = 'Capa'
         AND wi.resource_id IN (SELECT id FROM capas WHERE ${MINE}));
    DELETE FROM signatures WHERE task_instance_id IN (
      SELECT id FROM task_instances
       WHERE entity_type = 'Capa' AND entity_id IN (SELECT id FROM capas WHERE ${MINE}));
    -- The arm the three above MISS. Measured 2026-09-15 on app-db: one
    -- signature in this purge's blast radius carries capa_id = NULL AND
    -- task_instance_id = NULL, hanging off the workflow step alone (a SKIPPED
    -- meaning, on 'E2E CAPA J10skip 1788778630770'). The DELETE of
    -- workflow_instances below would have CASCADEd it away silently — the
    -- exact surprise the ⚠️ note above describes, present in real data rather
    -- than hypothetically. Delete it explicitly so the cascade stays a no-op.
    DELETE FROM signatures WHERE workflow_instance_step_id IN (
      SELECT wis.id FROM workflow_instance_steps wis
       WHERE wis.workflow_instance_id IN (
         SELECT id FROM workflow_instances
          WHERE resource_type = 'Capa'
            AND resource_id IN (SELECT id FROM capas WHERE ${MINE})));

    -- The two derived records these suites exist to produce. Both FK to
    -- workflow_instance_steps with ON DELETE SET NULL, so they would survive
    -- as orphans rather than cascade — remove them by resource instead.
    DELETE FROM root_causes WHERE resource_type = 'Capa'
       AND resource_id IN (SELECT id FROM capas WHERE ${MINE});
    DELETE FROM risk_assessments WHERE resource_type = 'Capa'
       AND resource_id IN (SELECT id FROM capas WHERE ${MINE});

    -- Effectiveness checks FK to capas with CASCADE, but also to
    -- task_instances with SET NULL; drop them by capa so neither path leaves
    -- a dangling row behind.
    DELETE FROM capa_effectiveness_checks WHERE capa_id IN (SELECT id FROM capas WHERE ${MINE});

    -- Step answer rows (capa_records CASCADEs off both task_instances and
    -- workflow_instance_steps, so this is belt-and-braces before the parents).
    DELETE FROM capa_records WHERE capa_id IN (SELECT id FROM capas WHERE ${MINE});

    -- Two INSTANT-strategy synced tables carry polymorphic Capa pointers with
    -- NO foreign key to capas, so nothing above reaches them and no cascade
    -- ever fires: the rows would simply outlive their CAPA and keep paging
    -- into IndexedDB on every bootstrap — defeating the purpose of this purge.
    -- Measured 2026-09-15: 318 entity_field_values + 97 notifications.
    -- (search_entries and record_embeddings hold 868 more, but have no client
    -- model at all, so they never reach IndexedDB; audit_logs is 'lazy' AND is
    -- compliance history — both deliberately left alone.)
    DELETE FROM entity_field_values WHERE entity_type = 'Capa'
       AND entity_id IN (SELECT id FROM capas WHERE ${MINE});
    DELETE FROM notifications WHERE resource_type = 'Capa'
       AND resource_id IN (SELECT id FROM capas WHERE ${MINE});

    -- Workflow instances (steps CASCADE off the instance) then tasks.
    DELETE FROM workflow_instances WHERE resource_type = 'Capa'
       AND resource_id IN (SELECT id FROM capas WHERE ${MINE});
    DELETE FROM task_instances WHERE entity_type = 'Capa'
       AND entity_id IN (SELECT id FROM capas WHERE ${MINE});

    DELETE FROM capas WHERE ${MINE};
  `)

  const after = Number(sqlValue(`SELECT count(*) FROM capas WHERE ${MINE}`))
  expect(after, `purged ${before} leftover E2E CAPAs`).toBe(0)

  // The FK-less synced tables are the easiest part of this purge to lose: no
  // constraint fails if a future schema change orphans them again, so nothing
  // would surface except the slow return of the bootstrap timeouts this
  // fixture exists to prevent. Assert them by their dangling-pointer shape.
  expect(
    Number(
      sqlValue(
        `SELECT count(*) FROM entity_field_values efv WHERE efv.entity_type = 'Capa'
           AND NOT EXISTS (SELECT 1 FROM capas c WHERE c.id = efv.entity_id)`,
      ),
    ),
    'no entity_field_values left pointing at a deleted CAPA',
  ).toBe(0)
  expect(
    Number(
      sqlValue(
        `SELECT count(*) FROM notifications n WHERE n.resource_type = 'Capa'
           AND NOT EXISTS (SELECT 1 FROM capas c WHERE c.id = n.resource_id)`,
      ),
    ),
    'no notifications left pointing at a deleted CAPA',
  ).toBe(0)

  // The seeded workflow fixtures must survive — both suites bind their widget
  // field to a step on these, so losing one fails every journey confusingly.
  expect(
    sqlValue(
      `SELECT count(*) FROM workflow_steps WHERE id = 'e2ef7003-0000-4000-8000-000000000001'`,
    ),
    'seeded RCA Review step intact',
  ).toBe('1')
  expect(
    sqlValue(
      `SELECT count(*) FROM workflow_steps WHERE id = 'e2ef6003-0000-4000-8000-000000000001'`,
    ),
    'seeded Risk Assessment Review step intact',
  ).toBe('1')
  expect(
    sqlValue(`SELECT count(*) FROM rca_templates WHERE id = 'e2ec1000-0000-4000-8000-000000000001'`),
    'seeded RCA template intact',
  ).toBe('1')
  expect(
    sqlValue(
      `SELECT count(*) FROM risk_assessment_templates WHERE id = 'e2eba000-0000-4000-8000-000000000001'`,
    ),
    'seeded risk matrix intact',
  ).toBe('1')

  // Non-E2E CAPAs in this tenant are none of this purge's business.
  expect(
    Number(
      sqlValue(
        `SELECT count(*) FROM capas WHERE company_id = '${COMPANY_ID}' AND title NOT LIKE 'E2E CAPA%'`,
      ),
    ),
    'untouched non-E2E CAPAs still present',
  ).toBeGreaterThan(0)
})
