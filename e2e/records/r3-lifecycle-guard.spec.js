// REC-J3 — `records_status_transition_guard`, both arms, from both trust paths.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS PINS
//
// Records F-05. `records` was the LAST regulated-lifecycle table in the product
// with no transition guard — CAPA (QMSCP), NC (QMSNC), CR (QMSCR), Audit
// (QMSAU), Complaints (QMSCM), Quality Events (QMSQE), QC lots (QMSQC), retain
// samples (QMSRS), field records (QMSFR) and task instances (QMSTI) all had
// one. Its only status control was the `records_status_id_fkey` lookup: "any of
// the ten seeded strings, from any other of the ten, at any time".
//
// The exposure was the SyncEngine. `records` is written through PostGraphile as
// role `app_user`, and `record_update_rls` inspects company + permission and
// never the NEW status. A holder of `<module_key>:update` — which every routed
// section assignee needs merely to fill in their own section — could
// `updateRecord(statusId: "CLOSED")` straight past the close gate: past the
// "all workflow tasks complete" check, past the payload assembly, past the
// analytics projection, past the owner's REVIEW task and past the schema seal.
//
// Closed by migration `20260902200000-lock-record-lifecycle.js`, SQLSTATE
// `QMSMR`. This file is the browser-project half of its regression coverage.
//
// ─────────────────────────────────────────────────────────────────────────────
// EVERY PROBE IS TWO-SIDED, AND ON THIS TABLE THAT IS NOT A FORMALITY
//
// There are two ways a write to `records` can fail to happen and they look
// nothing alike:
//
//   * the TRIGGER refuses  → the statement RAISES. `ok === false`, and the
//     SQLSTATE is QMSMR.
//   * the POLICY refuses   → the statement SUCCEEDS against ZERO ROWS. Nothing
//     throws. `ok === true`, `affectedRows === 0`.
//
// A probe that only checked `ok` would read the second as a passing guard, and
// a probe that only checked `rowCount` would read the first as a crash. So
// every refusal below is paired, in the same run and on the same row, with the
// write that MUST succeed — and the personas are chosen so the policy is never
// the thing doing the refusing when the trigger is what is under test.
//
// `reviewer` holds `e2emod:create/read/update/delete @tenant`, so
// `record_update_rls` admits her to every e2emod row in the tenant. When her
// status write is refused it is therefore the TRIGGER, and the paired payload
// write on the same row proves it — see "the row was writable all along" below.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED TO JUSTIFY THE EDGE LISTS (app-db, 2026-09-01)
//
// Every edge below was executed against the live trigger before it was written
// down, because the graph in this module's own docs is WRONG in two places and
// a guard written from them would have broken production:
//
//   module arm, trusted path       DRAFT->OPEN       ALLOWED
//                                  OPEN->DRAFT       ALLOWED
//                                  OPEN->CLOSED      ALLOWED
//                                  OPEN->CANCELLED   ALLOWED
//                                  DRAFT->CANCELLED  ALLOWED   ← not in doc 07
//                                  CLOSED->OPEN      ALLOWED   ← doc 07 calls
//                                                                CLOSED terminal
//                                  CANCELLED->OPEN   REFUSED   (truly terminal)
//                                  DRAFT->CLOSED     REFUSED
//                                  DRAFT->APPROVED   REFUSED   (plain vocabulary)
//   module arm, app_user           every status write REFUSED
//   plain arm,  app_user           DRAFT->APPROVED   ALLOWED
//                                  APPROVED->DRAFT   ALLOWED
//                                  everything else   REFUSED
//
// `CLOSED->OPEN` is the effectiveness reopen (`effectivenessFollowUpService`
// moduleHost.reopen) and `DRAFT->CANCELLED` is cancel-after-rejection, reached
// when `onRejection` has already returned the record to DRAFT while its
// workflow instance is still alive. Both are asserted here as LEGAL, on
// purpose: they are the two edges a future "tidy-up" of the edge list is most
// likely to delete, and deleting either breaks a real production path silently.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import {
  RECORDS,
  affectedRows,
  createProbeRecord,
  deleteProbeRecords,
  findRecord,
  forceStatus,
  provisionRecordsFixtures,
  statusWriteAsAppUser,
  statusWriteTrusted,
} from '../fixtures/records.js'

// Probe ids, one per test, so a failure never leaves another test's row behind.
const P = {
  moduleUntrusted: 'e2e6f300-0000-4000-8000-000000000001',
  moduleTrusted: 'e2e6f300-0000-4000-8000-000000000002',
  moduleCancel: 'e2e6f300-0000-4000-8000-000000000003',
  moduleKeyLock: 'e2e6f300-0000-4000-8000-000000000004',
  plain: 'e2e6f300-0000-4000-8000-000000000005',
  insert: 'e2e6f300-0000-4000-8000-000000000006',
}

test.beforeAll(() => provisionRecordsFixtures())
test.afterAll(() => deleteProbeRecords(Object.values(P)))

test.describe('REC-J3 — the QMSMR lifecycle guard', () => {
  test('the probe itself is valid — SECURITY INVOKER, ten statuses, live trigger', () => {
    // ⚠ THIS TEST IS ABOUT THE VALIDITY OF EVERY OTHER TEST IN THIS FILE, and
    // it is first for that reason.
    //
    // Inside a SECURITY DEFINER function `current_user` is the function OWNER,
    // not the caller. The guard's trust check is
    //   v_trusted := (current_user <> 'app_user') OR <GUC>
    // so under DEFINER it is permanently TRUE, every untrusted-path assertion
    // below becomes a silent no-op, and the file passes green against a guard
    // that enforces nothing. A Quality Events guard shipped exactly that way
    // and sat dead for eight days before anyone noticed
    // (docs/modules/quality-events/23).
    expect(
      sqlValue(`SELECT prosecdef FROM pg_proc WHERE proname = 'enforce_record_status_transition'`),
      'enforce_record_status_transition is SECURITY INVOKER',
    ).toBe('f')

    // The trigger is actually attached, and to the columns that matter. `UPDATE
    // OF status_id, module_key` is what keeps a payload-only write off this
    // code path — and it is also what would silently disarm the immutability
    // check if module_key were ever dropped from the list.
    const trigger = sqlValue(`
      SELECT pg_get_triggerdef(oid) FROM pg_trigger
       WHERE tgname = 'records_status_transition_guard' AND NOT tgisinternal`)
    expect(trigger, 'the guard is attached to public.records').toContain('ON public.records')
    expect(trigger, '…on INSERT and on UPDATE of the two governed columns').toMatch(
      /INSERT OR UPDATE OF status_id, module_key/,
    )

    // Ten statuses, no eleventh. Every "illegal transition" assertion below is
    // an assertion about a string that `record_statuses` must actually hold: if
    // a status were missing, the write would fail on `records_status_id_fkey`
    // and the test would pass for the wrong reason entirely.
    expect(
      sqlValue(`SELECT string_agg(id, ',' ORDER BY id) FROM record_statuses`),
      'record_statuses holds exactly the ten seeded values',
    ).toBe('APPROVED,CANCELLED,CLOSED,COMPLETE,DRAFT,OBSOLETE,OPEN,PENDING,REJECTED,REVIEW')
  })

  test('module arm — app_user may never move a module record, however permitted', () => {
    const id = createProbeRecord({
      id: P.moduleUntrusted,
      templateId: RECORDS.module.templateId,
      moduleKey: RECORDS.module.key,
      ownerUserId: USERS.reviewer.id,
    })

    // ── The pair that makes the refusals mean something ─────────────────────
    // Rita holds e2emod:update at TENANT scope, so record_update_rls admits her
    // to this row. Proven here, on this row, in this run — without it every
    // refusal below is equally consistent with "the policy filtered her out",
    // which is a completely different (and non-)finding.
    const payloadWrite = sqlAsAppUser(
      `UPDATE records SET payload = payload || '{"section":"filled"}'::jsonb WHERE id = '${id}' RETURNING id;`,
      { userId: USERS.reviewer.id, companyId: COMPANY_ID },
    )
    expect(payloadWrite.ok, 'the permitted holder can write this row').toBeTruthy()
    expect(
      affectedRows(payloadWrite),
      'record_update_rls admits her — the row is writable all along',
    ).toBe(1)

    // ── The finding itself ─────────────────────────────────────────────────
    // CLOSED is the one that mattered: it is the close gate, and `<key>:update`
    // is the grant every section assignee already needs.
    for (const target of ['OPEN', 'CLOSED', 'CANCELLED', 'COMPLETE', 'APPROVED']) {
      const res = statusWriteAsAppUser(USERS.reviewer.id, id, target)
      expect(res.ok, `app_user cannot set a module record to ${target}`).toBeFalsy()
      expect(res.error, `…and the refusal is the lifecycle guard, not a policy or a FK`).toMatch(
        /Module record status cannot be changed directly/,
      )
    }

    // Not merely refused — unmoved. A trigger that raised AFTER writing would
    // pass every assertion above.
    expect(findRecord(id).statusId, 'the record is exactly where it started').toBe('DRAFT')
    expect(
      findRecord(id).payload,
      'and the payload write that proved reachability did land',
    ).toContain('filled')
  })

  test('module arm — the trusted path walks the real graph, including its two surprises', () => {
    const id = createProbeRecord({
      id: P.moduleTrusted,
      templateId: RECORDS.module.templateId,
      moduleKey: RECORDS.module.key,
      ownerUserId: USERS.reviewer.id,
    })

    // The service layer's own route, in order: start, reject-back, start again,
    // close — then the edge that is not in any document.
    for (const [from, to] of [
      ['DRAFT', 'OPEN'], // startRecord / shareSupplierRecord / onSendBack
      ['OPEN', 'DRAFT'], // moduleRecordHandler.onRejection
      ['DRAFT', 'OPEN'],
      ['OPEN', 'CLOSED'], // closeModuleRecord
    ]) {
      expect(findRecord(id).statusId, `precondition for ${from}->${to}`).toBe(from)
      const res = statusWriteTrusted(id, to)
      expect(res.ok, `${from} -> ${to} is legal for a trusted caller`).toBeTruthy()
      expect(findRecord(id).statusId).toBe(to)
    }

    // ── CLOSED -> OPEN ─────────────────────────────────────────────────────
    // Doc 07 calls CLOSED terminal. It is not: the REOPEN outcome of an
    // effectiveness check restarts the cycle on a closed record
    // (`effectivenessFollowUpService` moduleHost.reopen). A guard written from
    // the documentation would have broken every effectiveness reopen in
    // production, so this edge is pinned as LEGAL rather than left implicit.
    const reopen = statusWriteTrusted(id, 'OPEN')
    expect(reopen.ok, 'CLOSED -> OPEN is the effectiveness reopen, and it is legal').toBeTruthy()
    expect(findRecord(id).statusId).toBe('OPEN')

    // Illegal edges, same row, same caller — so the allowances above are not
    // simply "the trigger lets a superuser do anything".
    forceStatus(id, 'CANCELLED')
    for (const target of ['OPEN', 'DRAFT', 'CLOSED']) {
      const res = statusWriteTrusted(id, target)
      expect(res.ok, `CANCELLED -> ${target} is refused — CANCELLED is terminal`).toBeFalsy()
      expect(res.error).toMatch(/Illegal module record status transition/)
    }
    expect(findRecord(id).statusId, 'and the record stayed cancelled').toBe('CANCELLED')
  })

  test('module arm — DRAFT -> CANCELLED is legal, and the plain vocabulary is not', () => {
    // The second edge a docs-derived guard would have lost. `onCancel` reaches
    // a DRAFT record whenever `onRejection` has already sent it back to its
    // author while the workflow instance is still alive; blocking it would have
    // broken cancel-after-rejection, which is a normal outcome and not an
    // exotic one.
    const id = createProbeRecord({
      id: P.moduleCancel,
      templateId: RECORDS.module.templateId,
      moduleKey: RECORDS.module.key,
      ownerUserId: USERS.reviewer.id,
    })
    const cancel = statusWriteTrusted(id, 'CANCELLED')
    expect(cancel.ok, 'DRAFT -> CANCELLED is cancel-after-rejection, and it is legal').toBeTruthy()
    expect(findRecord(id).statusId).toBe('CANCELLED')

    // The other half of "two state machines in one table": a module record may
    // not be moved with the legacy submission vocabulary, even by a trusted
    // caller. Without this the arms would be a union rather than a partition,
    // which is the design the migration explicitly rejected.
    //
    // The row is RE-CREATED rather than walked back, because CANCELLED really
    // is terminal and `forceStatus` goes through the same trigger — there is no
    // legal edge out of it, which the test above has just finished asserting.
    createProbeRecord({
      id: P.moduleCancel,
      templateId: RECORDS.module.templateId,
      moduleKey: RECORDS.module.key,
      ownerUserId: USERS.reviewer.id,
    })
    expect(findRecord(id).statusId).toBe('DRAFT')
    for (const target of ['APPROVED', 'REVIEW', 'OBSOLETE', 'REJECTED', 'CLOSED']) {
      const res = statusWriteTrusted(id, target)
      expect(res.ok, `DRAFT -> ${target} is not on the module graph`).toBeFalsy()
      expect(res.error).toMatch(/Illegal module record status transition/)
    }
    expect(findRecord(id).statusId).toBe('DRAFT')
  })

  test('plain arm — app_user gets exactly the Approve/Unapprove toggle and nothing more', () => {
    // This arm exists because `app_user` CANNOT be locked out here. The only
    // thing in the product that moves a plain submission is RecordsTable.vue's
    // Approve / Unapprove menu, and it is a SyncEngine mutation — blocking
    // app_user outright would strand the feature, which is the trap the Quality
    // Events guard fell into before its endpoints existed. So the arm is
    // narrow rather than closed, and BOTH halves of that need pinning: the two
    // edges that must keep working, and the eight that must not open up.
    const id = createProbeRecord({
      id: P.plain,
      templateId: RECORDS.plain.templateId,
      moduleKey: null,
      ownerUserId: null,
      userId: USERS.author.id,
    })

    // Approve, then Unapprove — the exact pair the menu writes.
    const approve = statusWriteAsAppUser(USERS.author.id, id, 'APPROVED')
    expect(approve.ok, 'Approve still works from the Submissions table').toBeTruthy()
    expect(affectedRows(approve), '…and it touched the row').toBe(1)
    expect(findRecord(id).statusId).toBe('APPROVED')

    const unapprove = statusWriteAsAppUser(USERS.author.id, id, 'DRAFT')
    expect(unapprove.ok, 'and so does Unapprove').toBeTruthy()
    expect(affectedRows(unapprove)).toBe(1)
    expect(findRecord(id).statusId).toBe('DRAFT')

    // Everything else, from the same persona on the same row.
    for (const target of ['REVIEW', 'OBSOLETE', 'REJECTED', 'CLOSED', 'CANCELLED', 'COMPLETE']) {
      const res = statusWriteAsAppUser(USERS.author.id, id, target)
      expect(res.ok, `app_user cannot set a plain submission to ${target}`).toBeFalsy()
      expect(res.error).toMatch(/Record status cannot be changed to .* directly/)
    }
    expect(findRecord(id).statusId, 'the submission never left DRAFT').toBe('DRAFT')

    // The wider legacy graph stays open to trusted callers — PUT
    // /v1/services/records/:id is a real surface and this arm narrows the
    // SyncEngine, not the API.
    forceStatus(id, 'DRAFT')
    expect(statusWriteTrusted(id, 'REVIEW').ok, 'REST may still move it to REVIEW').toBeTruthy()
    expect(statusWriteTrusted(id, 'APPROVED').ok, 'and on to APPROVED').toBeTruthy()
    expect(findRecord(id).statusId).toBe('APPROVED')
  })

  test('module_key is immutable — the arm selector cannot be swapped underneath the guard', () => {
    // F-17 from the other direction. module_key is the arm selector AND this
    // table's permission namespace, so a writable module_key defeats both at
    // once: null it and the strict module arm is replaced by the permissive
    // plain one; point it at another module and the row moves into a namespace
    // its writer may not even be able to read.
    const id = createProbeRecord({
      id: P.moduleKeyLock,
      templateId: RECORDS.module.templateId,
      moduleKey: RECORDS.module.key,
      ownerUserId: USERS.reviewer.id,
    })

    for (const [label, value] of [
      ['NULL — demote to the permissive plain arm', 'NULL'],
      [`'${RECORDS.moduleB.key}' — move into another module's namespace`, `'${RECORDS.moduleB.key}'`],
    ]) {
      const asUser = sqlAsAppUser(
        `UPDATE records SET module_key = ${value} WHERE id = '${id}';`,
        { userId: USERS.reviewer.id, companyId: COMPANY_ID },
      )
      expect(asUser.ok, `app_user cannot set module_key to ${label}`).toBeFalsy()
      expect(asUser.error).toMatch(/module_key is immutable/)

      // Trusted too — this one is not a trust question. Nothing in the codebase
      // ever updates module_key, so there is no caller to strand.
      const trusted = statusWriteTrustedModuleKey(id, value)
      expect(trusted.ok, `and neither can a trusted caller (${label})`).toBeFalsy()
      expect(trusted.error).toMatch(/module_key is immutable/)
    }

    expect(findRecord(id).moduleKey, 'the record still belongs to the module it was raised under').toBe(
      RECORDS.module.key,
    )
  })

  test('INSERT admits DRAFT and nothing else, on both paths', () => {
    // Every writer already inserts DRAFT — insertRecord, createModuleRecord and
    // the effectiveness-follow-up spawn — so this costs nothing and closes the
    // obvious way around the UPDATE graph: create the row already CLOSED.
    //
    // Note this arm has NO trust check, deliberately: the superuser is refused
    // too, which is why `createProbeRecord` cannot take a status.
    for (const status of ['OPEN', 'CLOSED', 'APPROVED', 'CANCELLED']) {
      let error = ''
      try {
        sql(`
          INSERT INTO records (id, company_id, template_id, module_key, status_id, user_id, payload, created_at, updated_at)
          VALUES ('${P.insert}', '${COMPANY_ID}', '${RECORDS.module.templateId}', '${RECORDS.module.key}',
                  '${status}', '${USERS.reviewer.id}', '{}'::jsonb, NOW(), NOW())`)
      } catch (err) {
        error = `${err.stderr ?? err.message ?? ''}`
      }
      expect(error, `a record cannot be created in ${status}`).toMatch(
        /A record can only be created in DRAFT/,
      )
    }

    // The pair: the same INSERT in DRAFT succeeds, so the refusals above are
    // about the status and not about the statement being malformed.
    expect(() =>
      sql(`
        INSERT INTO records (id, company_id, template_id, module_key, status_id, user_id, payload, created_at, updated_at)
        VALUES ('${P.insert}', '${COMPANY_ID}', '${RECORDS.module.templateId}', '${RECORDS.module.key}',
                'DRAFT', '${USERS.reviewer.id}', '{}'::jsonb, NOW(), NOW())`),
    ).not.toThrow()
    expect(findRecord(P.insert).statusId).toBe('DRAFT')
  })
})

/** `module_key` write on the trusted path, kept out of the fixture: nothing in
 *  the product ever issues one, so it exists only to be refused. */
function statusWriteTrustedModuleKey(id, value) {
  try {
    sql(`UPDATE records SET module_key = ${value} WHERE id = '${id}'`)
    return { ok: true, error: '' }
  } catch (err) {
    return { ok: false, error: `${err.stderr ?? err.message ?? ''}` }
  }
}
