// AR-J6 · URS-SUP-05 — a supplier acting on an ASSIGNED QUALITY-RECORD step:
// isolation, and attribution.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS, AND WHY IT IS IN `assetRequest/`
//
// URS-SUP-05's evidence today is `j2-supplier-portal-review.spec.js`: a portal
// user answering an ASSET REQUEST, where isolation is asserted (RLS withholds
// another supplier's request from the page) and attribution is asserted
// (`asset_request_items.uploaded_by` is the portal user, not spoofable from the
// client). Both claims are real — for a document request. Neither has ever been
// made about a QUALITY RECORD, which is the harder and more consequential case:
// an asset request is a file upload, whereas a quality-record workflow step is
// a decision inside the company's controlled process.
//
// This file is the quality-record twin of that journey and sits beside it
// deliberately: the `assetRequest` project is the one place in this repository
// where a supplier PORTAL SESSION drives real Vue surfaces rather than a raw
// `APIRequestContext`, and its fixtures already carry the portal-login idiom.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHAT THE PRODUCT ACTUALLY DOES — verified in code and live, not assumed
//
// The capability is BUILT and SHIPPED. A supplier-facing NC re-points every
// non-APPROVAL workflow step at the supplier's portal account:
//
//   controllers/nonconformances.js  `convertNcToSupplierFacing`
//     · resolves { companyId, supplierId, kind: 'EXTERNAL_SUPPLIER',
//                  userStatusId: 'ACTIVE' }
//     · users_on_workflow_instance_steps → prior holder REASSIGNED, supplier ASSIGNED
//     · task_instances                   → prior task REASSIGNED (+ reassigned_to_user_id),
//                                          fresh task assignedTo = the portal user
//     · shared_with_user                 → granted_via 'WORKFLOW_ASSIGNMENT', so the
//                                          supplier's RLS opens the NC detail page
//     · audit_log                        → CONVERTED_TO_SUPPLIER_FACING, performed_by
//                                          the INTERNAL converter
//
// `e2e/nonconformances/j5-convert-supplier-facing.spec.js` already asserts every
// row in that list — and then STOPS. Nothing in this repository has ever had the
// supplier ACT on the step they were handed, which is the half URS-SUP-05 names.
//
// ─────────────────────────────────────────────────────────────────────────────
// AND HERE IS THE FINDING. THE ASSIGNMENT IS REAL; THE ACTION IS REFUSED.
//
// `POST /v1/services/taskInstances/:id/action` carries NO permission
// middleware (routes/workflowInstances.js:253-260 — `requireAuthByApiKey`,
// `requireCompanyAccess`, `express.json()`, `validate`, handler). The gate is
// `assertCanActOnStep` (utils/workflowStepAccess.js), and since 2026-08-19 it
// no longer short-circuits for the assignee. Its own comment:
//
//     // The assignee used to short-circuit here, unchecked. … Assignment
//     // routes work; it does not confer the verb (2026-08-19). The matrix now
//     // decides for the assignee too.
//
// It maps `Nonconformance → module 'ncr'`, resolves `ACTION → 'update'`, and
// calls `canActOnRecord`, which reduces to
//
//     authz.has_permission('ncr','update') AND authz.scope_allowed(...)
//
// `authz.has_permission` is PURE ROLE MEMBERSHIP — it has no `kind` predicate
// and no share/assignment fallback (functions.sql; `canActOnRecord`'s only
// unconditional bypass is `user.isOwner`). A portal account holds no role by
// default, so it fails the gate and gets a 403 whose message is exactly:
//
//     "Your role does not grant this action, even on a task assigned to you."
//
// So the product ASSIGNS a supplier a step it will then refuse to let them
// complete. That is the honest position, and it is what this file asserts:
// **AR-J6-KD1** below is written as the refusal it actually is, not as a
// weakened "the button is not offered". Two reasons that matters:
//
//   · Asserting a green completion here would be fiction — the endpoint 403s.
//   · Asserting nothing would leave URS-SUP-05 Covered by a file that never
//     probed the acting path at all, which is the false-Covered this programme
//     must not produce.
//
// When the gap is closed (by an `extra_write_sql` arm on the `ncr` binding, by
// a share/assignment fallback in `canActOnRecord`, or by a product decision to
// grant portal accounts a scoped role), AR-J6-KD1 goes RED — which is the
// signal to rewrite it as a real completion journey and to assert the
// attribution the three `…-attribution` tests below already prepare for.
//
// ─────────────────────────────────────────────────────────────────────────────
// ISOLATION — what it IS and what it is NOT, measured
//
// There is **no supplier tenancy boundary anywhere in RLS**. No
// `app.current_user_supplier_id` GUC exists; `authz.has_permission` and
// `authz.scope_allowed` take (module, action, owner, dept, site) and no
// supplier parameter; the generated module policies have no supplier arm.
//
// Isolation is achieved PER RECORD and INCIDENTALLY: a supplier sees a given NC
// only because a `shared_with_user` row or a `task_instances` row exists FOR
// THEM SPECIFICALLY — the two extra SELECT arms `authz.apply_module_rls`
// appends. That is a real, sufficient boundary for the journey under test, and
// it is what the isolation tests below assert. What they deliberately do NOT
// claim is a rule of the form "supplier A may never see supplier B's records":
// no such rule exists, and asserting one would be asserting a control the
// product does not implement. AR-J6-KD2 pins that distinction explicitly rather
// than leaving it as an unstated limitation of the coverage.
//
// ═════════════════════════════════════════════════════════════════════════════
// THE CAST
//
// `supplier@e2e.test` (Sam, SUPPLIER_IDS.withPortal) — the ASSIGNED supplier.
// `supplier2@e2e.test` (Sofia, e2e-seed.sql §50, a THIRD supplier) — the
//   UNASSIGNED one. §50's header explains at length why a third supplier was
//   added rather than giving `SUPPLIER_IDS.noPortal` a portal account: NC-J5's
//   third case asserts that that supplier has NO active portal user, and
//   seeding one there would turn a real guard test green for the wrong reason.
// Neither holds a role — see §50. That is the DEFAULT shape of a supplier
// account in this product, and giving one `ncr:update` to make a journey pass
// would be testing a configuration almost no tenant runs.
import { test, expect } from '../../video/fixtures/videoTest.js'
import {
  AUTH,
  COMPANY_ID,
  DEPARTMENTS,
  SITES,
  SUPPLIER_IDS,
  SUPPLIER_USER,
  USERS,
} from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { freshContext } from '../fixtures/sites.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// ─── e2e-seed.sql §50 (deliberately NOT added to cast.js) ───────────────────
//
// `SUPPLIER_IDS` is read by `suppliers/j12`, `j13` and `j15` — the last of
// which iterates `Object.values(SUPPLIER_IDS)` in a "nothing leaked" guard. A
// third member would change what four existing specs iterate over, so the ids
// live here, in the one spec that needs them.
const SECOND_SUPPLIER = {
  id: 'e2e70000-0000-4000-8000-000000000004',
  name: 'E2E-SUP05 Second Portal Supplier',
}
const SECOND_PORTAL_USER = {
  id: 'e2e10000-0000-4000-8000-0000000009c0',
  email: 'supplier2@e2e.test',
  name: 'Sofia Secondsupplier',
}

// The seeded NCR flow: step 1 ACTION (→ the supplier on conversion), step 2
// APPROVAL + e-sign (→ stays internal, by `resolveDefaultReviewers`' rule that
// supplier users take non-APPROVAL steps only).
const NCR_WORKFLOW_VERSION_ID = 'e2ef1002-0000-4000-8000-000000000001'

function uniqueTitle(tag) {
  return `E2E AR-J6 ${tag} ${Date.now()}`
}

function findNcByTitle(title) {
  const row = sqlRow(
    `SELECT id, nc_number, status_id, is_supplier_facing, coalesce(supplier_id::text, '')
       FROM nonconformances WHERE title = ${q(title)} ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return {
    id: row[0],
    ncNumber: row[1] || null,
    statusId: row[2],
    isSupplierFacing: row[3] === 't',
    supplierId: row[4] || null,
  }
}

/** The NC's step-1 (ACTION) instance step, and whoever currently holds it. */
function actionStepOf(ncId) {
  const row = sqlRow(
    `SELECT wis.id, wis.step_type, wis.status_id, coalesce(wis.completed_at::text, '')
       FROM workflow_instance_steps wis
       JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Nonconformance' AND wi.resource_id = ${q(ncId)}
        AND wis.step_type = 'ACTION'
      ORDER BY wis.step_order LIMIT 1`,
  )
  if (!row) return null
  return { id: row[0], stepType: row[1], statusId: row[2], completedAt: row[3] || null }
}

/** A user's assignment row on one instance step (the per-person record). */
function assignmentStatus(stepId, userId) {
  return sqlValue(
    `SELECT status_id FROM users_on_workflow_instance_steps
      WHERE workflow_instance_step_id = ${q(stepId)} AND user_id = ${q(userId)}
      ORDER BY created_at DESC LIMIT 1`,
  )
}

/** The open inbox task a given user holds on this NC, if any. */
function openTaskFor(ncId, userId) {
  const row = sqlRow(
    `SELECT id, status_id, source_type, coalesce(source_id::text, '')
       FROM task_instances
      WHERE entity_type = 'Nonconformance' AND entity_id = ${q(ncId)}
        AND assigned_to = ${q(userId)} AND deleted_at IS NULL
        AND status_id NOT IN ('CANCELLED','REASSIGNED','SUPERSEDED')
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return { id: row[0], statusId: row[1], sourceType: row[2], sourceId: row[3] || null }
}

function shareRow(entityType, entityId, userId) {
  const row = sqlRow(
    `SELECT granted_via, coalesce(granted_by::text, '') FROM shared_with_user
      WHERE entity_type = ${q(entityType)} AND entity_id = ${q(entityId)}
        AND user_id = ${q(userId)} AND deleted_at IS NULL LIMIT 1`,
  )
  if (!row) return null
  return { grantedVia: row[0], grantedBy: row[1] || null }
}

/**
 * Create an OPEN internal NC over REST, then convert it to supplier-facing.
 *
 * Both halves are the REAL product path. A statically seeded NC would carry the
 * assignment / task / share rows without ever having exercised the code that
 * writes them — and those rows are precisely what this file asserts on.
 *
 * `typeId` / `sourceId` / `severityId` are global lookups with stable string
 * ids (`SELECT id FROM nc_types` → AUDIT_FINDING, …, SUPPLIER), not per-tenant
 * uuids, so naming them here cannot drift away from the tenant.
 */
async function raiseSupplierFacingNc(ctx, { title, supplierId }) {
  const create = await ctx.request.post('/api/v1/services/nonconformances', {
    data: {
      title,
      description: 'AR-J6 — supplier acts on an assigned quality-record step.',
      siteId: SITES.primary.id,
      departmentId: DEPARTMENTS.quality.id,
      typeId: 'SUPPLIER',
      sourceId: 'INCOMING_INSPECTION',
      severityId: 'MAJOR',
      detectedAt: new Date().toISOString(),
      ownerId: USERS.author.id,
      supplierId,
      workflowVersionId: NCR_WORKFLOW_VERSION_ID,
      // Internal at intake. The conversion below is the path under test, and
      // it is also the ONE sanctioned exception to the
      // `nc_immutable_supplier_facing` trigger once the NC has left DRAFT.
      isSupplierFacing: false,
    },
  })
  expect(create.ok(), `NC create failed: ${await create.text()}`).toBe(true)

  const nc = findNcByTitle(title)
  expect(nc, 'the NC row exists').not.toBeNull()

  // The conversion only accepts an OPEN NC (`j5`'s second case asserts a DRAFT
  // is refused). Whether create auto-opens has moved before, so submit only if
  // it did not, rather than assuming either way.
  if (nc.statusId !== 'OPEN') {
    const submit = await ctx.request.post(
      `/api/v1/services/nonconformances/${nc.id}/submitForReview`,
      { data: {} },
    )
    expect(submit.ok(), `NC submit failed: ${await submit.text()}`).toBe(true)
    await waitForSqlValue(
      `SELECT status_id = 'OPEN' FROM nonconformances WHERE id = ${q(nc.id)}`,
      { timeoutMs: 30_000, label: 'NC reached OPEN' },
    )
  }

  const convert = await ctx.request.post(
    `/api/v1/services/nonconformances/${nc.id}/convertSupplierFacing`,
    { data: { supplierId } },
  )
  expect(convert.ok(), `convert to supplier-facing failed: ${await convert.text()}`).toBe(true)

  await waitForSqlValue(
    `SELECT is_supplier_facing FROM nonconformances WHERE id = ${q(nc.id)}`,
    { timeoutMs: 30_000, label: 'NC is supplier-facing' },
  )
  return findNcByTitle(title)
}

/** Hard-remove an NC and everything hanging off it, so runs do not accumulate. */
function purgeNc(ncId) {
  if (!ncId) return
  sql(`DELETE FROM task_instances WHERE entity_type = 'Nonconformance' AND entity_id = ${q(ncId)}`)
  sql(`DELETE FROM shared_with_user WHERE entity_type = 'Nonconformance' AND entity_id = ${q(ncId)}`)
  sql(`DELETE FROM users_on_workflow_instance_steps
        WHERE workflow_instance_step_id IN (
          SELECT wis.id FROM workflow_instance_steps wis
            JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
           WHERE wi.resource_type = 'Nonconformance' AND wi.resource_id = ${q(ncId)})`)
  sql(`DELETE FROM workflow_instance_steps
        WHERE workflow_instance_id IN (
          SELECT id FROM workflow_instances
           WHERE resource_type = 'Nonconformance' AND resource_id = ${q(ncId)})`)
  sql(`DELETE FROM workflow_instances
        WHERE resource_type = 'Nonconformance' AND resource_id = ${q(ncId)}`)
  sql(`DELETE FROM nonconformances WHERE id = ${q(ncId)}`)
}

test.describe('AR-J6 · supplier on an assigned quality-record step', () => {
  const raised = []

  test.beforeAll(() => {
    // ── Fixture premises, stated once. Each failure here is a seed problem,
    // and saying which one is worth more than a journey failing obscurely.
    expect(
      sqlValue(
        `SELECT user_status_id FROM users WHERE id = ${q(SECOND_PORTAL_USER.id)}
           AND kind = 'EXTERNAL_SUPPLIER' AND supplier_id = ${q(SECOND_SUPPLIER.id)}`,
      ),
      'e2e-seed.sql §50 seeded the SECOND portal account — without it there is no isolation pair',
    ).toBe('ACTIVE')
    expect(
      sqlValue(
        `SELECT user_status_id FROM users WHERE id = ${q(SUPPLIER_USER.id)}
           AND kind = 'EXTERNAL_SUPPLIER' AND supplier_id = ${q(SUPPLIER_IDS.withPortal)}`,
      ),
      'the original portal account is ACTIVE — convertSupplierFacing 400s without one',
    ).toBe('ACTIVE')

    // THE PREMISE THE WHOLE FILE TURNS ON. Both portal accounts must hold NO
    // role: `authz.has_permission` has no `kind` predicate, so a role attached
    // to an external account is a real module permission. If a future seed
    // change grants one, AR-J6-KD1's refusal would silently become an
    // acceptance and this file would start describing a different product.
    for (const u of [SUPPLIER_USER, SECOND_PORTAL_USER]) {
      expect(
        sqlValue(
          `SELECT count(*) FROM roles_on_users WHERE user_id = ${q(u.id)} AND deleted_at IS NULL`,
        ),
        `${u.email} holds no role — that is the DEFAULT shape of a portal account (see e2e-seed.sql §50)`,
      ).toBe('0')
    }
  })

  test.afterAll(() => {
    for (const id of raised) purgeNc(id)
  })

  test('the supplier is HANDED the step: assignment, task and the share that opens the record', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    try {
      const title = uniqueTitle('assigned')
      const nc = await raiseSupplierFacingNc(ctx, {
        title,
        supplierId: SUPPLIER_IDS.withPortal,
      })
      raised.push(nc.id)

      expect(nc.isSupplierFacing).toBe(true)
      expect(nc.supplierId).toBe(SUPPLIER_IDS.withPortal)

      const step = actionStepOf(nc.id)
      expect(step, 'the NCR flow has an ACTION step').not.toBeNull()
      expect(step.stepType, 'and it is the non-APPROVAL step suppliers take').toBe('ACTION')

      // The per-person record of the assignment. `users_on_workflow_instance_steps`
      // is where "who owes this step" actually lives — the step row itself has
      // no assignee column.
      expect(
        assignmentStatus(step.id, SUPPLIER_USER.id),
        'the portal user holds the ACTION step',
      ).toBe('ASSIGNED')
      expect(
        assignmentStatus(step.id, USERS.reviewer.id),
        'and the internal reviewer it was taken from is parked REASSIGNED, not deleted — the history survives',
      ).toBe('REASSIGNED')

      // The inbox task: what the supplier actually sees at /task-instances,
      // which is reachable to them (it is in neither the frontend guard's
      // SUPPLIER_EXEMPT nor its SUPPLIER_BLOCKED map, and MainSidebar links it
      // for suppliers on purpose).
      const task = openTaskFor(nc.id, SUPPLIER_USER.id)
      expect(task, 'the portal user has an open task on the NC').not.toBeNull()
      expect(task.sourceType).toBe('WorkflowInstanceStep')
      expect(task.sourceId, 'sourced from the step they were handed').toBe(step.id)

      // The share is what opens the record. Without it RLS would show the
      // supplier the TASK and not the NC it is about — the failure mode
      // `autoShareSupplierUsers`' header calls out by name.
      const share = shareRow('Nonconformance', nc.id, SUPPLIER_USER.id)
      expect(share, 'the assignment auto-granted a read of the parent record').not.toBeNull()
      expect(share.grantedVia).toBe('WORKFLOW_ASSIGNMENT')

      // The APPROVAL step stays internal. `resolveDefaultReviewers` and
      // `convertNcToSupplierFacing` both exclude `stepType === 'APPROVAL'`, so
      // a supplier never signs off the company's own record — which is the
      // boundary that makes handing them the ACTION step safe at all.
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM users_on_workflow_instance_steps uowis
               JOIN workflow_instance_steps wis ON wis.id = uowis.workflow_instance_step_id
               JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
              WHERE wi.resource_type = 'Nonconformance' AND wi.resource_id = ${q(nc.id)}
                AND wis.step_type = 'APPROVAL' AND uowis.user_id = ${q(SUPPLIER_USER.id)}
                AND uowis.status_id NOT IN ('REASSIGNED','CANCELLED')`,
          ),
        ),
        'the e-signed APPROVAL step is never handed to the supplier',
      ).toBe(0)
    } finally {
      await ctx.close()
    }
  })

  test('the assigned supplier can OPEN the quality record in the portal session', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.owner })
    let nc
    try {
      const title = uniqueTitle('open')
      nc = await raiseSupplierFacingNc(ownerCtx, {
        title,
        supplierId: SUPPLIER_IDS.withPortal,
      })
      raised.push(nc.id)
    } finally {
      await ownerCtx.close()
    }

    // The portal user has no storageState of its own — `auth.setup.js` logs in
    // every USERS entry and one broken portal login would take the whole suite
    // down, which is why cast.js keeps SUPPLIER_USER out of USERS/AUTH.
    // `freshContext` accepts any `{ email }` for exactly this.
    const portal = await freshContext(browser, SUPPLIER_USER)
    const page = await portal.newPage()
    try {
      // `/nonconformances` is in SUPPLIER_EXEMPT_SEGMENTS — a portal user may
      // reach the record modules RLS scopes for them, by design and with a
      // sidebar link. The share row granted above is what RLS matches on.
      await page.goto(`/nonconformances/${nc.id}`, { waitUntil: 'domcontentloaded' })

      await expect(
        page.getByText(nc.ncNumber, { exact: false }).first(),
        'the assigned supplier sees the NC they were given a step on',
      ).toBeVisible({ timeout: 90_000 })

      // NOT bounced to /no-access. Asserting the URL as well as the content
      // separates "RLS withheld the row" from "the router refused the route" —
      // two very different outcomes that both render an empty-looking page.
      expect(page.url(), 'the router did not bounce the portal user').not.toContain('/no-access')
    } finally {
      await portal.close()
    }
  })

  test('ISOLATION: a different supplier’s portal user cannot see or touch the record, its step or its task', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.owner })
    let nc
    try {
      const title = uniqueTitle('isolation')
      nc = await raiseSupplierFacingNc(ownerCtx, {
        title,
        supplierId: SUPPLIER_IDS.withPortal,
      })
      raised.push(nc.id)
    } finally {
      await ownerCtx.close()
    }

    const step = actionStepOf(nc.id)
    const assignedTask = openTaskFor(nc.id, SUPPLIER_USER.id)
    expect(assignedTask, 'the assigned supplier has the task').not.toBeNull()

    // The OTHER supplier's portal user: same tenant, same kind, no share row,
    // no task row. Under `authz.apply_module_rls`' generated SELECT policy the
    // only arms that could admit them are exactly those two — so their absence
    // is the whole boundary.
    expect(
      shareRow('Nonconformance', nc.id, SECOND_PORTAL_USER.id),
      'the unassigned supplier was granted nothing',
    ).toBeNull()
    expect(
      openTaskFor(nc.id, SECOND_PORTAL_USER.id),
      'and holds no task on this record',
    ).toBeNull()

    const portal = await freshContext(browser, SECOND_PORTAL_USER)
    const page = await portal.newPage()
    try {
      // ── The record itself, over REST.
      const read = await page.request.get(`/api/v1/services/nonconformances/${nc.id}`)
      expect(
        [403, 404],
        `the unassigned supplier must not read another supplier's NC (got ${read.status()})`,
      ).toContain(read.status())

      // ── The step task. This is the sharper probe: acting on a task by id is
      // the attack an assigned-but-not-entitled party actually has, and the
      // endpoint carries no permission middleware of its own.
      const act = await page.request.post(
        `/api/v1/services/taskInstances/${assignedTask.id}/action`,
        { data: { action: 'COMPLETE_AND_ADVANCE', outcomeId: 'COMPLETE_AND_ADVANCE', comment: 'AR-J6 isolation probe' } },
      )
      expect(
        act.ok(),
        `a portal user must not complete another supplier's step (got ${act.status()}: ${await act.text()})`,
      ).toBe(false)
      expect([401, 403, 404]).toContain(act.status())

      // AND NOTHING MOVED. A refusal that still advanced the workflow would be
      // worse than an acceptance, because it would look like a working guard.
      expect(actionStepOf(nc.id).statusId, 'the step is where it was').toBe(step.statusId)
      expect(actionStepOf(nc.id).completedAt, 'and was not completed').toBeNull()
      expect(
        assignmentStatus(step.id, SUPPLIER_USER.id),
        "the assigned supplier's own assignment is untouched",
      ).toBe('ASSIGNED')

      // ── The UI half. `/nonconformances/:id` is SUPPLIER_EXEMPT, so the
      // ROUTE opens for them and RLS is the only thing withholding the row —
      // which is exactly why the content assertion matters more than the URL.
      await page.goto(`/nonconformances/${nc.id}`, { waitUntil: 'domcontentloaded' })
      await expect(
        page.getByText(nc.ncNumber, { exact: false }),
        "another supplier's NC number never renders for this portal user",
      ).toHaveCount(0, { timeout: 30_000 })
    } finally {
      await portal.close()
    }
  })

  test('ISOLATION: the assigned supplier reaches THIS record and no further', async ({ browser }) => {
    test.setTimeout(300_000)

    // The paired positive. An isolation test that only shows an absence passes
    // identically when the seed never applied, the portal login broke, or the
    // page is simply dead — so the same session must also be shown REACHING
    // something. Two NCs at two different suppliers, one portal session: the
    // only variable between them is the share/task the assignment created.
    const ownerCtx = await browser.newContext({ storageState: AUTH.owner })
    let mine
    let theirs
    try {
      mine = await raiseSupplierFacingNc(ownerCtx, {
        title: uniqueTitle('reach-mine'),
        supplierId: SUPPLIER_IDS.withPortal,
      })
      raised.push(mine.id)
      theirs = await raiseSupplierFacingNc(ownerCtx, {
        title: uniqueTitle('reach-theirs'),
        supplierId: SECOND_SUPPLIER.id,
      })
      raised.push(theirs.id)
    } finally {
      await ownerCtx.close()
    }

    expect(theirs.supplierId, 'the second NC belongs to the OTHER supplier').toBe(
      SECOND_SUPPLIER.id,
    )
    expect(
      assignmentStatus(actionStepOf(theirs.id).id, SECOND_PORTAL_USER.id),
      "and its step went to that supplier's own portal user",
    ).toBe('ASSIGNED')

    const portal = await freshContext(browser, SUPPLIER_USER)
    const page = await portal.newPage()
    try {
      const own = await page.request.get(`/api/v1/services/nonconformances/${mine.id}`)
      expect(
        own.ok(),
        `the assigned supplier reads their OWN record (got ${own.status()}) — without this leg the refusal below proves nothing`,
      ).toBe(true)

      const other = await page.request.get(`/api/v1/services/nonconformances/${theirs.id}`)
      expect(
        [403, 404],
        `and not the other supplier's (got ${other.status()})`,
      ).toContain(other.status())
    } finally {
      await portal.close()
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // The acting path. See the file header for the full diagnosis.
  // ═══════════════════════════════════════════════════════════════════════════

  test('🔴 AR-J6-KD1: the assigned supplier is REFUSED the step they were handed (FAILS TODAY)', async ({
    browser,
  }) => {
    test.setTimeout(300_000)

    // KNOWN DEFECT AR-J6-KD1 — the product assigns a supplier a quality-record
    // step and then refuses to let them complete it.
    //
    //   routes/workflowInstances.js:253  POST /v1/services/taskInstances/:id/action
    //                                    — no permission middleware at all
    //   utils/workflowStepAccess.js      assertCanActOnStep → canActOnRecord
    //                                    (the 2026-08-19 change removed the
    //                                    assignee short-circuit)
    //   utils/recordAccess.js            authz.has_permission('ncr','update')
    //                                    AND authz.scope_allowed(...)
    //   functions.sql                    has_permission is pure role membership;
    //                                    no `kind` predicate, no share fallback,
    //                                    isOwner the only bypass
    //
    // A portal account holds no role (asserted in beforeAll), so the call 403s
    // with "Your role does not grant this action, even on a task assigned to
    // you." The RLS layer agrees independently: `authz.apply_module_rls` adds
    // the task and share arms to the SELECT policy ONLY, and the `ncr` binding
    // carries `extra_write_sql = NULL`, so an assignment grants READ and never
    // WRITE at the database either.
    //
    // THIS TEST ASSERTS WHAT URS-SUP-05 DEMANDS — that the assignee can act —
    // and is expected to FAIL until the gap is closed. It is deliberately not
    // rewritten as "the refusal is correct": a workflow that routes work to a
    // party who cannot perform it is a defect, not a control, and pinning the
    // refusal as intended behaviour would close the requirement on the wrong
    // answer. When it goes green, delete this banner and extend the assertions
    // below to the completed-step attribution the next test prepares.
    const ownerCtx = await browser.newContext({ storageState: AUTH.owner })
    let nc
    try {
      nc = await raiseSupplierFacingNc(ownerCtx, {
        title: uniqueTitle('act'),
        supplierId: SUPPLIER_IDS.withPortal,
      })
      raised.push(nc.id)
    } finally {
      await ownerCtx.close()
    }

    const step = actionStepOf(nc.id)
    const task = openTaskFor(nc.id, SUPPLIER_USER.id)
    expect(task, 'the supplier holds the task — the premise of the whole test').not.toBeNull()

    const portal = await freshContext(browser, SUPPLIER_USER)
    try {
      const res = await portal.request.post(
        `/api/v1/services/taskInstances/${task.id}/action`,
        {
          data: {
            action: 'COMPLETE_AND_ADVANCE',
            outcomeId: 'COMPLETE_AND_ADVANCE',
            comment: 'AR-J6 — supplier completes the action step assigned to them.',
          },
        },
      )
      const body = await res.text()

      expect(
        res.ok(),
        `URS-SUP-05: the supplier the step was ASSIGNED to must be able to complete it. ` +
          `Got ${res.status()}: ${body} — AR-J6-KD1, assertCanActOnStep requires ncr:update ` +
          `and a portal account holds no role.`,
      ).toBe(true)

      // Only reached once the defect is fixed. These are the assertions the
      // requirement's ATTRIBUTION half needs, written now so the fix lands
      // against a complete test rather than a stub.
      await waitForSqlValue(
        `SELECT status_id = 'APPROVED' FROM workflow_instance_steps WHERE id = ${q(step.id)}`,
        { timeoutMs: 60_000, label: 'the ACTION step completed' },
      )
      expect(
        assignmentStatus(step.id, SUPPLIER_USER.id),
        'the supplier’s own assignment row records that THEY completed it',
      ).toBe('APPROVED')
      expect(
        actionStepOf(nc.id).completedAt,
        'and the step carries WHEN it was completed',
      ).toBeTruthy()
      await waitForSqlValue(
        `SELECT count(*) FROM audit_logs
          WHERE entity_type = 'UsersOnWorkflowInstanceSteps' AND action = 'USER_APPROVED'
            AND performed_by = ${q(SUPPLIER_USER.id)}`,
        { timeoutMs: 90_000, label: 'the completion is attributed to the supplier' },
      )
    } finally {
      await portal.close()
    }
  })

  test('the attribution surface a completed supplier step would land on exists and is populated', async ({
    browser,
  }) => {
    test.setTimeout(180_000)

    // WHY THIS EXISTS SEPARATELY FROM AR-J6-KD1. That test cannot reach its
    // attribution assertions while the defect stands, so the requirement's
    // "attribution" half would otherwise rest on nothing observable. This
    // asserts the same mechanism on the SAME step of the SAME workflow, driven
    // by an INTERNAL assignee who does hold the verb — which establishes that
    // the attribution path works and that the supplier case is blocked at the
    // permission gate specifically, not by a missing mechanism.
    //
    // It also records, precisely, WHERE attribution does and does not live —
    // measured against the live schema, because the obvious columns are absent:
    //
    //   task_instances            → assigned_to, completed_at.  NO completed_by.
    //   workflow_instance_steps   → completed_at.               NO completed_by.
    //   users_on_workflow_instance_steps → user_id + status_id APPROVED.
    //                                      ★ the per-person record of who acted
    //   audit_logs                → STEP_APPROVED / USER_APPROVED, performed_by
    //
    // Measured fill rates on this database when the file was written:
    //   WorkflowInstanceSteps STEP_APPROVED      574 rows / 574 performers
    //   UsersOnWorkflowInstanceSteps USER_APPROVED 574 / 574
    // i.e. 100% — so a NULL performer here is a real regression, not noise.
    const ownerCtx = await browser.newContext({ storageState: AUTH.owner })
    let nc
    try {
      // Internal (NOT converted), so the seeded reviewer keeps step 1.
      const title = uniqueTitle('internal-attrib')
      const create = await ownerCtx.request.post('/api/v1/services/nonconformances', {
        data: {
          title,
          description: 'AR-J6 control — internal assignee completes the same ACTION step.',
          siteId: SITES.primary.id,
          departmentId: DEPARTMENTS.quality.id,
          typeId: 'SUPPLIER',
          sourceId: 'INCOMING_INSPECTION',
          severityId: 'MAJOR',
          detectedAt: new Date().toISOString(),
          ownerId: USERS.author.id,
          supplierId: SUPPLIER_IDS.withPortal,
          workflowVersionId: NCR_WORKFLOW_VERSION_ID,
          isSupplierFacing: false,
        },
      })
      expect(create.ok(), `control NC create failed: ${await create.text()}`).toBe(true)
      nc = findNcByTitle(title)
      raised.push(nc.id)
      if (nc.statusId !== 'OPEN') {
        const submit = await ownerCtx.request.post(
          `/api/v1/services/nonconformances/${nc.id}/submitForReview`,
          { data: {} },
        )
        expect(submit.ok(), `control NC submit failed: ${await submit.text()}`).toBe(true)
        await waitForSqlValue(
          `SELECT status_id = 'OPEN' FROM nonconformances WHERE id = ${q(nc.id)}`,
          { timeoutMs: 30_000, label: 'control NC reached OPEN' },
        )
      }
    } finally {
      await ownerCtx.close()
    }

    const step = actionStepOf(nc.id)
    expect(step, 'the control NC has the same ACTION step').not.toBeNull()

    const task = openTaskFor(nc.id, USERS.reviewer.id)
    expect(
      task,
      'the internal reviewer holds it — the same step the supplier would have been handed',
    ).not.toBeNull()

    const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
    try {
      const res = await reviewerCtx.request.post(
        `/api/v1/services/taskInstances/${task.id}/action`,
        {
          data: {
            action: 'COMPLETE_AND_ADVANCE',
            outcomeId: 'COMPLETE_AND_ADVANCE',
            comment: 'AR-J6 control — internal completion.',
          },
        },
      )
      expect(
        res.ok(),
        `the internal assignee (ncr:update holder) completes the step: ${res.status()} ${await res.text()}`,
      ).toBe(true)
    } finally {
      await reviewerCtx.close()
    }

    await waitForSqlValue(
      `SELECT status_id = 'APPROVED' FROM workflow_instance_steps WHERE id = ${q(step.id)}`,
      { timeoutMs: 60_000, label: 'the control step completed' },
    )

    // WHO — the per-person assignment row.
    expect(
      assignmentStatus(step.id, USERS.reviewer.id),
      'the actor’s own assignment row is stamped APPROVED — this is where "who acted" lives',
    ).toBe('APPROVED')

    // WHEN — on the step.
    expect(
      actionStepOf(nc.id).completedAt,
      'the step carries when it was completed',
    ).toBeTruthy()

    // WHO + WHEN together, in the trail. Written by the `*_audit_trigger` →
    // graphile_worker → `audit_event` chain, so it is asynchronous.
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE entity_type = 'UsersOnWorkflowInstanceSteps' AND action = 'USER_APPROVED'
          AND performed_by = ${q(USERS.reviewer.id)} AND company_id = ${q(COMPANY_ID)}
          AND performed_at > now() - INTERVAL '10 minutes'`,
      { timeoutMs: 120_000, label: 'the completion is attributed in the audit trail' },
    )

    // ── The honest limitation, asserted rather than left unsaid. Neither
    // `task_instances` nor `workflow_instance_steps` has a `completed_by`
    // column, so on a step with no e-signature the ONLY identity artefacts are
    // the assignment row and the audit trail above. If a permitted NON-assignee
    // takes the step over, the task row still reads as the original assignee's.
    // That is a real attribution gap in the product and it belongs in the
    // record, not in a comment nobody runs.
    for (const [table, column] of [
      ['task_instances', 'completed_by'],
      ['workflow_instance_steps', 'completed_by'],
      ['workflow_instance_steps', 'completed_by_user_id'],
    ]) {
      expect(
        sqlValue(
          `SELECT 1 FROM information_schema.columns
            WHERE table_name = ${q(table)} AND column_name = ${q(column)} LIMIT 1`,
        ),
        `${table}.${column} does not exist — step attribution rests on users_on_workflow_instance_steps + audit_logs alone`,
      ).toBeNull()
    }
  })

  test('AR-J6-KD2: there is no supplier-level tenancy boundary — isolation is per-record, by construction', async () => {
    // NOT a coverage arm, and deliberately not tagged to URS-SUP-05's isolation
    // claim. It records the SHAPE of the isolation the tests above assert, so
    // the requirement is not read as promising a control the product does not
    // implement.
    //
    // There is no `app.current_user_supplier_id` GUC, `authz.has_permission`
    // and `authz.scope_allowed` take no supplier parameter, and the generated
    // module policies have no supplier arm. A portal user sees a quality record
    // only because a `shared_with_user` or `task_instances` row names THEM —
    // never because of who their supplier is. So "supplier A cannot see
    // supplier B's NC" holds only for as long as nobody shares one or assigns a
    // task on one; an internal user who does either is not stopped by any
    // supplier-tenancy rule, because there is none.
    //
    // Per-supplier checks DO exist, hand-written, in exactly two controllers —
    // `assetRequests.js` (kind + supplier_id must match) and `qualityEvents.js`
    // ("Supplier user must belong to this event supplier."). NCR, CAPA, Change
    // Request and Complaint have no equivalent.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'nonconformances'
              AND (coalesce(qual,'') || coalesce(with_check,'')) ILIKE '%supplier_id%'`,
        ),
      ),
      'no nonconformances RLS policy references supplier_id — isolation is per-record (share/task), not per-supplier',
    ).toBe(0)

    expect(
      sqlValue(
        `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'authz' AND p.proname = 'scope_allowed'
            AND pg_get_function_identity_arguments(p.oid) ILIKE '%supplier%' LIMIT 1`,
      ),
      'authz.scope_allowed takes no supplier argument — there is no supplier scope tier',
    ).toBeNull()

    // The two arms that DO carry the isolation, on a live module policy. If
    // these ever disappear, every isolation assertion above becomes vacuous —
    // a portal user would see nothing at all and the refusals would still pass.
    const selectPolicy = sqlValue(
      `SELECT coalesce(qual,'') FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'nonconformances'
          AND policyname ILIKE '%sel%' LIMIT 1`,
    )
    expect(selectPolicy, 'the nonconformances SELECT policy exists').toBeTruthy()
    expect(
      selectPolicy,
      'it admits an assignee via task_instances — one of the two arms the supplier reaches the record through',
    ).toContain('task_instances')
    expect(
      selectPolicy,
      'and a grantee via shared_with_user — the other',
    ).toContain('shared_with_user')
  })
})
