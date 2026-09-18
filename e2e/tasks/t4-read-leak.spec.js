// TASK-T4 — 🔴 HIGH-3 / F-03: a Document Control grant no longer releases every
// task in the tenant.
//
// The single most consequential change in this pass, and the one a test can
// actually pin.
//
// ── WHAT WAS THERE ──────────────────────────────────────────────────────────
//
// `task_instance_select_rls` carried `OR authz.has_permission('document_control',
// 'read')` as an UNCONDITIONAL disjunct — not scoped, not qualified by
// entity_type. A bare "does this person hold Document Control read", asked
// against every row in the table. 49 active roles in `app-db` hold that grant;
// in the two seeded product tenants it is 43 of 45 roles, the baseline
// Department User included. So the branch released CAPA, NCR, Change Request,
// Complaint, Training, QC, Retain Sample and Quality Event tasks — with assignee
// identity, due date and the producer-stamped `comment`, which routinely names
// the record and the reason — to very nearly everybody.
//
// Measured on app-db 2026-09-01 as the E2E Doc Controller persona:
// 3 672 of 3 672 tasks visible before, 641 after (542 DocumentVersion + 99
// Document). The whole tenant, to one unrelated grant.
//
// ── WHY THIS PROBE IS AT THE DATABASE AND NOT IN THE UI ─────────────────────
//
// It cannot be seen through the inbox. `taskInstancesTable.vue:24` filters
// `assignedTo = me` in the client, so the leak was invisible on every rendered
// surface in the product and only reachable over raw GraphQL — which is exactly
// how it survived. `sqlAsAppUser` is that path: the `app_user` role PostGraphile
// switches to, with the same GUCs `requireCompanyAccess` sets.
//
// ── FIVE PERSONAS, ONE PAIR OF ROWS, ONE RUN ────────────────────────────────
//
// An RLS refusal is a zero-row SUCCESS. "Carla sees no CAPA task" is therefore
// equally consistent with the fix working, with the seed being broken, and with
// the policy having stopped matching anything at all — so the refusal is only
// evidence alongside personas the policy still admits, asked the same question
// about the same rows in the same run:
//
//   Rita (assignee)      — `assigned_to = me`, the first disjunct, which asks
//                          for no permission at all. Sees BOTH.
//   Ava (auditor)        — holds capa:read AND document_control:read, is
//                          assignee of neither. Reaches the CAPA task through
//                          `can_read_workflow_resource`, which is the rule that
//                          REPLACED the leak. Sees BOTH.
//   Rosa (role admin)    — the only role in the tenant holding
//                          role_permission_management:update, and therefore the
//                          only one migration 20260901210000 backfills
//                          `tasks:read` onto. Holds no capa and no
//                          document_control grant whatsoever, so `scope_allowed
//                          ('tasks','read', …)` is her ONLY way in. Sees BOTH,
//                          and sees the whole tenant — which is what the new
//                          permission is for.
//   Carla (doc control)  — document_control read/update/delete and nothing else.
//                          Keeps every Document task; loses the CAPA task she
//                          was never entitled to.
//   Noah (no access)     — no module grant anywhere, assignee of nothing, so
//                          every disjunct in the policy is false for him. He is
//                          the FLOOR: without a persona the policy refuses
//                          outright, "Rita sees both" is equally consistent with
//                          a policy that admits the tenant. Rita cannot play that
//                          part herself — she holds capa:read and
//                          document_control:read, and would reach both rows
//                          through can_read_workflow_resource even with the
//                          assignee disjunct deleted.
//
// Rosa is the assertion that stops this file from being a one-way ratchet: she
// proves the table is still readable BY DESIGN to a grant that means it, so a
// future "just delete every disjunct" tightening fails here rather than shipping.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser } from '../fixtures/db.js'
import {
  canSee,
  createPersonaPool,
  mintCapaTask,
  mintCollaboratorTask,
  tenantTaskCount,
  uniqueTag,
  visibleTaskCount,
} from '../fixtures/tasks.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

test.describe('TASK-T4 — the cross-module read leak (HIGH-3 / F-03)', () => {
  let capa
  let doc
  let docTaskId

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(420_000)
    const tag = uniqueTag('T4')
    const authorPage = await pool.page(browser, AUTH.author)
    // Two tasks assigned to the SAME person, differing only in the record they
    // hang off. That is the whole experiment: the policy is supposed to decide
    // by the record, and these two rows agree on everything else.
    capa = await mintCapaTask(authorPage, tag)
    doc = await mintCollaboratorTask(authorPage, { tag, collaborators: [USERS.reviewer] })
    docTaskId = doc.tasks[USERS.reviewer.id]
  })

  test('the assignee sees their own tasks, and a bystander sees neither', async () => {
    // The first disjunct, and the reason the module has no route gate: an inbox
    // is assignee-centric and nobody should need a module permission to work
    // their own queue.
    expect(canSee(USERS.reviewer, capa.taskId), 'own CAPA task').toBe(true)
    expect(canSee(USERS.reviewer, docTaskId), 'own collaboration task').toBe(true)

    // The floor, and the only persona in the cast who can establish it. Rita is
    // NOT a clean read of the assignee disjunct — she also holds capa:read and
    // document_control:read, so she would reach both rows through
    // can_read_workflow_resource even with `assigned_to = me` deleted. Noah holds
    // no module grant at all and is the assignee of nothing, so he is the one
    // persona for whom every disjunct in the policy is false. Both halves are
    // needed: without his zero the "true"s above are consistent with a policy
    // that admits everyone, and without theirs his zero is consistent with the
    // fixture never having written a row.
    expect(visibleTaskCount(USERS.noAccess, [capa.taskId, docTaskId]), 'no grant, no rows').toBe(0)
    expect(
      visibleTaskCount(USERS.noAccess),
      'and no view of the tenant either — the table fails closed',
    ).toBe(0)
  })

  test('a reader of the underlying record still sees the task hanging off it', async () => {
    // `authz.can_read_workflow_resource` is the rule that replaced the leak, and
    // it was already in the policy before this pass — this is the arm that has
    // to keep working, or "Carla sees nothing" below would just mean the SELECT
    // policy had been broken for everyone.
    //
    // Ava holds capa:read and document_control:read at tenant scope and is the
    // assignee of neither row.
    expect(canSee(USERS.auditor, capa.taskId), 'capa:read reaches a CAPA task').toBe(true)
    expect(canSee(USERS.auditor, docTaskId), 'document_control:read reaches a Document task').toBe(
      true,
    )
  })

  test('the tasks:read grant releases the tenant — the permission is not decorative', async () => {
    // Rosa holds NO capa grant and NO document_control grant. If she can see
    // these rows, it is through `scope_allowed('tasks','read', assigned_to, …)`
    // and nothing else.
    //
    // `scope_allowed`, not `has_permission`, is deliberate. Both carry the
    // read-fallback (`action_id = p_action OR p_action = 'read'`), but
    // has_permission returns a bare boolean while scope_allowed compares the
    // role's highest SCOPE RANK — and with no `module_table_bindings` row for
    // `tasks` it collapses to `v_rank >= 4`. So only a tenant grant passes, and
    // a mis-set own/department/site grant DENIES instead of silently releasing
    // the table.
    expect(canSee(USERS.roleAdmin, capa.taskId), 'tasks:read reaches a CAPA task').toBe(true)
    expect(canSee(USERS.roleAdmin, docTaskId), 'tasks:read reaches a Document task').toBe(true)

    // Snapshot the denominator BEFORE the persona's count, and compare with >=.
    // An equality between two separately-issued statements is a race against
    // every other E2E project writing this tenant — the workflow, documents and
    // auditLogs suites all mint tasks, and one landing between these two reads
    // would fail a spec that is not about them. Rows are never hard-deleted
    // here (the table is paranoid), so "she saw at least the whole table as it
    // stood a moment ago" is the invariant with no false negative in it.
    const tenantBefore = tenantTaskCount()
    expect(
      visibleTaskCount(USERS.roleAdmin),
      'a tenant-scope tasks:read grant means the whole tenant, by design',
    ).toBeGreaterThanOrEqual(tenantBefore)
  })

  test('🔴 document_control:read no longer reaches a CAPA task', async () => {
    // The finding itself. Carla holds document_control read/update/delete and
    // nothing else — no capa grant at all, verified in `e2e-seed.sql` §4.
    expect(
      canSee(USERS.controller, capa.taskId),
      'a Document Control grant says nothing about CAPA work',
    ).toBe(false)

    // And the same persona, in the same statement, against the sibling row: the
    // Document task is still hers. Without this line the assertion above passes
    // just as well if the policy stopped matching anything, if the fixture never
    // wrote a row, or if the GUCs were never set.
    expect(
      canSee(USERS.controller, docTaskId),
      'while every Document task remains visible to her',
    ).toBe(true)
  })

  test('and the tenant-wide shape matches: bounded, not blinded', async () => {
    const tenant = tenantTaskCount()
    const carla = visibleTaskCount(USERS.controller)

    // Deliberately not an exact figure. The measured 641 was a snapshot of a
    // tenant every other E2E project also writes to; pinning it would make this
    // spec fail on the next unrelated run. The invariant is the SHAPE — a strict
    // subset, and not an empty one.
    expect(carla, 'the leak released the whole table').toBeLessThan(tenant)
    expect(carla, 'and the fix is a narrowing, not a blackout').toBeGreaterThan(0)

    // The rows she keeps are exactly the ones her grant is about. Anything else
    // in her result set would be a second leak wearing the first one's clothes.
    const offRecord = visibleTaskCountByEntityType(USERS.controller)
    expect(
      offRecord.filter((r) => !['Document', 'DocumentVersion'].includes(r.entityType)),
      'a Document Control grant reaches document tasks and nothing else',
    ).toEqual([])
  })
})

/**
 * Which entity types this persona's SELECT actually returns.
 *
 * Kept local rather than in the fixture module because it exists for exactly one
 * assertion: proving the residue is the RIGHT residue. A count alone would be
 * satisfied by a policy that had simply swapped one over-broad arm for another.
 */
function visibleTaskCountByEntityType(user) {
  const res = sqlAsAppUser(
    `SELECT entity_type, count(*) FROM task_instances
      WHERE company_id = '${COMPANY_ID}' GROUP BY 1 ORDER BY 1;`,
    { userId: user.id, companyId: COMPANY_ID },
  )
  if (!res.ok) throw new Error(res.error)
  return res.output
    .trim()
    .split('\n')
    .map((l) => l.split('|'))
    .filter((c) => c.length === 2 && /^\d+$/.test(c[1]))
    .map(([entityType, count]) => ({ entityType, count: Number(count) }))
}
