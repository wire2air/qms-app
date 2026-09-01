// REC-J5 — DELETE /v1/services/records/:id actually deletes, and only for the
// people allowed to.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS PINS — REC-D1 / F-01
//
// The delete endpoint was broken for the entire life of the endpoint. It wrote
//
//     await record.update({ statusId: db.Record.Status.DELETED }, …)
//
// and `record_statuses` holds APPROVED, CANCELLED, CLOSED, COMPLETE, DRAFT,
// OBSOLETE, OPEN, PENDING, REJECTED, REVIEW. There is no DELETED row and no
// migration ever seeded one — `DELETED` existed only as a constant on the
// Sequelize model. So `records_status_id_fkey` rejected every call:
//
//     DELETE /v1/services/records/:id
//     -> 400 {"error":{"message":"Invalid reference","detail":"…records_status_id_fkey"}}
//
// 100% of calls, since the endpoint was written. And because the failing write
// rode `req.transaction`, the rollback ALSO discarded the audit row for the
// attempted delete — so the failures left no trace. It survived because this is
// an API-key-only surface with no frontend caller.
//
// The fix is `record.destroy()` — the model is paranoid, the route is gated on
// `records:delete`, the OpenAPI block says "Delete a record" and the response
// says "deleted", so a delete is what was intended. It is also the one-liner
// the twelve sibling delete controllers already use.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE STATUS ASSERTION IS THE IMPORTANT ONE
//
// "DELETE returns 200" is the weak half. The interesting regression is a fix
// that reintroduces a status flip — writing OBSOLETE or CANCELLED instead of
// soft-deleting — which would answer 200, leave the row LIVE in every list, and
// make `delete` a silent duplicate of `updateRecord` (which already accepts an
// arbitrary statusId). So this file asserts all three properties together:
// `deleted_at` is set, `status_id` is UNCHANGED, and the row leaves the list.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO-SIDED, AND THE DENIALS ARE ERRORS HERE RATHER THAN ZERO ROWS
//
// This is REST, not RLS: the gate is `enforcePermission('records','delete')`
// plus the controller's per-row `assertRecordPermission`, both of which raise
// `ForbiddenError` → HTTP 403. That is a genuinely different failure mode from
// the silent zero-row refusals in REC-J3/J4, so the assertions differ on
// purpose — and each refusal is paired with the SAME call succeeding for a
// permitted caller on an equivalent row, so a 403 can never be an endpoint
// that is simply broken again.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  RECORDS,
  createPersonaPool,
  createProbeRecord,
  deleteProbeRecords,
  errorMessage,
  findRecord,
  provisionRecordsFixtures,
  restDelete,
  restGet,
  restPost,
  restPut,
} from '../fixtures/records.js'

const PROBE = {
  deletable: 'e2e6f500-0000-4000-8000-000000000001',
  guarded: 'e2e6f500-0000-4000-8000-000000000002',
  moduleRow: 'e2e6f500-0000-4000-8000-000000000003',
}

const pool = createPersonaPool()
test.beforeAll(() => provisionRecordsFixtures())
test.afterAll(async () => {
  await pool.close()
  deleteProbeRecords(Object.values(PROBE))
})

test.describe('REC-J5 — soft delete (REC-D1)', () => {
  test('the root cause is still absent — record_statuses has no DELETED row', () => {
    // The constant `db.Record.Status.DELETED` had no row behind it, and that is
    // the whole defect. Pinned here so that a "fix" which re-seeds a DELETED
    // status — making the old status-flip code path work again, and putting a
    // deleted record back in every list under a new name — fails on this line
    // with the reason stated, rather than three tests later as a puzzle.
    expect(
      sqlValue(`SELECT count(*) FROM record_statuses WHERE id = 'DELETED'`),
      'no DELETED status exists; delete is a soft delete, not a status',
    ).toBe('0')
  })

  test('DELETE soft-deletes: 200, deleted_at set, status untouched, row gone from the list', async ({
    browser,
  }) => {
    const ctx = await pool.context(browser, AUTH.author)

    // Created through the real endpoint, so the row under test is one the
    // product actually produces — record number, frozen schema and all.
    const created = await restPost(ctx, '/records', {
      templateId: RECORDS.plain.templateId,
      payload: { probeSubject: 'REC-J5 delete probe', probeNote: 'created to be deleted' },
    })
    expect(created.status(), 'the permitted caller can create a submission').toBe(201)
    const id = (await created.json())?.record?.id
    expect(id, 'the create returned a record id').toBeTruthy()

    const before = findRecord(id)
    expect(before.deletedAt, 'it starts live').toBeNull()
    expect(before.statusId, 'and DRAFT, per the INSERT arm of the lifecycle guard').toBe('DRAFT')

    // It is in the list beforehand. Without this, "gone from the list"
    // afterwards is consistent with it never having been there.
    const listBefore = await restGet(ctx, '/records')
    expect((await listBefore.json())?.records?.map((r) => r.id) ?? []).toContain(id)

    // ── The call that used to 400 on every single invocation ────────────────
    const res = await restDelete(ctx, `/records/${id}`)
    expect(res.status(), 'DELETE answers 200 — this is F-01 itself').toBe(200)
    expect(await errorMessage(res), 'and says so').toMatch(/deleted successfully/i)

    // ── The three properties that together mean "soft delete", not "status flip"
    const after = findRecord(id)
    expect(after, 'the row still exists — paranoid delete keeps it for the audit trail').not.toBeNull()
    expect(after.deletedAt, 'deleted_at is stamped').not.toBeNull()
    expect(
      after.statusId,
      'status_id is UNCHANGED — a fix that flips a status instead fails here',
    ).toBe(before.statusId)
    expect(
      sqlValue(`SELECT count(*) FROM record_statuses WHERE id = '${after.statusId}'`),
      'and whatever status it carries is one record_statuses actually holds',
    ).toBe('1')

    // ── And it leaves the surface it is supposed to leave ───────────────────
    const listAfter = await restGet(ctx, '/records')
    expect(
      (await listAfter.json())?.records?.map((r) => r.id) ?? [],
      'the deleted submission is gone from GET /records',
    ).not.toContain(id)

    const fetched = await restDelete(ctx, `/records/${id}`)
    expect(
      fetched.status(),
      'and a second delete cannot find it — the paranoid scope is applied on read too',
    ).toBe(404)
  })

  test('the gate is real — records:read is not records:delete, and no grant is neither', async ({
    browser,
  }) => {
    createProbeRecord({
      id: PROBE.guarded,
      templateId: RECORDS.plain.templateId,
      moduleKey: null,
      userId: USERS.author.id,
    })

    // ← `controller` holds records:read at tenant and NO delete verb. She is the
    // interesting refusal: she can SEE this row perfectly well, so the 403 is
    // the delete verb being asked for and not a visibility accident.
    const readerCtx = await pool.context(browser, AUTH.controller)
    const readerList = await restGet(readerCtx, '/records')
    expect(
      (await readerList.json())?.records?.map((r) => r.id) ?? [],
      'the read-only persona can see the record she is about to fail to delete',
    ).toContain(PROBE.guarded)

    const readerDelete = await restDelete(readerCtx, `/records/${PROBE.guarded}`)
    expect(readerDelete.status(), 'records:read does not confer records:delete').toBe(403)

    // ← and a user holding nothing at all.
    const noneCtx = await pool.context(browser, AUTH.noAccess)
    const noneDelete = await restDelete(noneCtx, `/records/${PROBE.guarded}`)
    expect(noneDelete.status(), 'a user with no grant is refused too').toBe(403)

    // Neither refusal touched the row.
    expect(findRecord(PROBE.guarded).deletedAt, 'the record survived both attempts').toBeNull()

    // → The pair. The SAME call, the SAME row, by a caller who holds the verb.
    // Without this both 403s are equally consistent with the endpoint being
    // broken again in a new way.
    const authorCtx = await pool.context(browser, AUTH.author)
    const allowed = await restDelete(authorCtx, `/records/${PROBE.guarded}`)
    expect(allowed.status(), 'the records:delete holder deletes the identical row').toBe(200)
    expect(findRecord(PROBE.guarded).deletedAt, '…and it is gone').not.toBeNull()
  })

  test('REC-N1 — the two write routes demand BOTH the generic verb and the row’s own', async ({
    browser,
  }) => {
    // ⚠ THIS TEST ASSERTS A LIVE DEFECT, DELIBERATELY, AND IT IS WRITTEN THE
    // WAY THE PRODUCT BEHAVES TODAY RATHER THAN THE WAY IT SHOULD.
    //
    // `PUT` and `DELETE /v1/services/records/:id` are gated TWICE, by two gates
    // that ask different questions and are ANDed:
    //
    //   routes/records.js     enforcePermission('records', 'delete')   ← generic
    //   controllers/records.js assertRecordPermission(…, 'delete', …)  ← the row's
    //                                                                   own module
    //
    // So deleting a promoted module's record over REST needs `records:delete`
    // AND `e2emod:delete`. Measured on app-db 2026-09-01, and the two refusals
    // are distinguishable by message, which is how this test tells which gate
    // fired:
    //
    //   persona   grants                    PUT / DELETE   message
    //   reviewer  e2emod:* @tenant          403 / 403      "Not permitted to
    //                                                       delete on records"   ← ROUTE
    //   author    records:* @tenant         403 / 403      "You do not have
    //                                                       permission to delete
    //                                                       this record"         ← CONTROLLER
    //   owner     (isOwner bypass)          200 / 200
    //
    // The `reviewer` row is the defect. She holds the FULL CRUD set on the
    // module that owns the record, at tenant scope — she is the person the
    // module's own permission namespace entitles — and the route refuses her
    // before the controller's namespaced check is ever reached. That is exactly
    // the "too STRONG" failure mode `utils/moduleRecordAccess.js`'s own header
    // says the design exists to avoid: *"and too STRONG (the person actually
    // granted `supplier_qual:update` would be refused)"*. The sibling READS
    // (`GET /records`, `GET /records/:id`) dropped their route gate for
    // precisely this reason and gate in the controller instead; the two WRITES
    // kept theirs, so the two halves of the same endpoint family disagree.
    //
    // Consequence: over this REST surface, a promoted module's records can be
    // written only by someone holding a grant on `records` that the module's
    // administrator never issued — or by the company owner. Severity is held
    // down by the same fact that let F-01 survive for the life of the endpoint:
    // this is a legacy API-key-only surface with no frontend caller, and the UI
    // writes over GraphQL, where `record_update_rls` dispatches on the row's
    // module correctly and does NOT ask for `records:update`.
    //
    // Reported, not patched — the fix is a product decision about the legacy
    // REST surface, not a test concern. WHEN IT IS FIXED THIS TEST SHOULD FAIL,
    // and the failure is the signal to rewrite it, not a regression.
    createProbeRecord({
      id: PROBE.moduleRow,
      templateId: RECORDS.module.templateId,
      moduleKey: RECORDS.module.key,
      ownerUserId: USERS.reviewer.id,
    })

    // ← Gate 2, the correct one: the generic grant does NOT reach a module row.
    // This half is the design working — one `records:delete` must not be a
    // skeleton key into every admin-promoted module in the tenant.
    const authorCtx = await pool.context(browser, AUTH.author)
    const generic = await restDelete(authorCtx, `/records/${PROBE.moduleRow}`)
    expect(
      generic.status(),
      'records:delete alone does not reach an e2emod record — the namespace is per row',
    ).toBe(403)
    expect(
      await errorMessage(generic),
      '…and the refusal came from the CONTROLLER’s per-row check',
    ).toMatch(/permission to delete this record/i)

    // ← Gate 1, the defect: the module's own delete holder is refused too, and
    // one message earlier in the stack.
    const reviewerCtx = await pool.context(browser, AUTH.reviewer)
    const specific = await restDelete(reviewerCtx, `/records/${PROBE.moduleRow}`)
    expect(
      specific.status(),
      'REC-N1: e2emod:delete @tenant is ALSO refused — the route wants records:delete',
    ).toBe(403)
    expect(
      await errorMessage(specific),
      '…and the refusal came from the ROUTE’s static gate, before the row was consulted',
    ).toMatch(/Not permitted to delete on records/i)

    // The same disagreement on the update verb, so a partial fix to one route
    // does not leave the other silently unpinned.
    const specificPut = await restPut(reviewerCtx, `/records/${PROBE.moduleRow}`, {
      payload: { touched: true },
    })
    expect(specificPut.status(), 'REC-N1 applies to PUT as well as DELETE').toBe(403)
    expect(await errorMessage(specificPut)).toMatch(/Not permitted to update on records/i)

    expect(
      findRecord(PROBE.moduleRow).deletedAt,
      'nobody with a single grant deleted it',
    ).toBeNull()

    // → The pair, without which every 403 above is consistent with the endpoint
    // simply being broken again: the company owner bypasses both gates and the
    // soft delete works exactly as REC-D1 requires.
    const ownerCtx = await pool.context(browser, AUTH.owner)
    const allowed = await restDelete(ownerCtx, `/records/${PROBE.moduleRow}`)
    expect(allowed.status(), 'the owner bypass reaches it, so the endpoint works').toBe(200)
    const after = findRecord(PROBE.moduleRow)
    expect(after.deletedAt, '…and it soft-deletes').not.toBeNull()
    expect(
      after.statusId,
      'a module record soft-deletes the same way — no status flip here either',
    ).toBe('DRAFT')
  })
})
