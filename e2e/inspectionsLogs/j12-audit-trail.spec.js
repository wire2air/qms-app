// IL-J12 — The audit trail: can an inspector reconstruct what happened?
//
// URS-LOG-09 / TC-10-09. The coverage matrix scored this "Not automated" with
// the note "integrity is proven only at revision level" — which is fair. IL-J2,
// IL-J3 and IL-J4 all assert `field_record_revisions`, the module's OWN ledger,
// and that ledger is excellent. But it is not the audit trail. It records what
// the module chose to write; the audit trail records what the DATABASE saw,
// including changes the module did not intend and changes made by nobody.
// TC-10-09 asks for the second thing, and nothing asserted it.
//
// HOW THE TRAIL IS WRITTEN, because every assertion below is shaped by it:
//
//   1. `<table>_audit_trigger` fires AFTER INSERT/UPDATE/DELETE and does NOT
//      write `audit_logs`. It builds a jsonb payload and enqueues a
//      graphile-worker job (`audit_event`).
//   2. The worker's `audit_event` task looks the table up in its registry. A
//      table with no config, or an UPDATE that touched no TRACKED field, is
//      dropped — the trail is deliberately not a byte-for-byte replica.
//   3. Only then is the row inserted.
//
// Three consequences run through this file:
//
//   ASYNC. The row lands a second or two after the write. Every read of it is
//     wrapped in `expect.poll`; a bare read would be a coin toss.
//   AN UPDATE ROW IS A DIFF, NOT A SNAPSHOT. `buildAuditValues` puts ONLY the
//     tracked columns that actually changed into `old_value_json` /
//     `new_value_json`. So an UPDATE that moved the status carries
//     `{statusId: …}` and nothing else — not the record's other fields, not
//     even its id. A CREATE, by contrast, carries the whole tracked set. Every
//     assertion below is written to the shape of the row it is reading, and
//     the "which row is this?" question is answered by the WHERE on
//     `entity_id`, never by a field inside the payload.
//   PLURAL. `entity_type` is `toPascalCase(table)` with no singularisation, so
//     it is `FieldRecords` / `LogBooks`, while `audit_entity_types` catalogues
//     the SINGULAR `FieldRecord` / `LogBook`. The two are reconciled by
//     `audit_entity_type_aliases`, which the read policy unions in. Asserting
//     the plural is asserting the product as it is.
//
// ATTRIBUTION IS REAL HERE, AND THAT IS WORTH SAYING. `audit_trigger()` reads
// `app.current_user_id` off the session, and on many worker-driven paths that
// GUC is unset, so `performed_by` comes back NULL — the worker's `audit_event`
// header documents that at length as the representation of a system actor.
// None of these journeys take that path: every write below is an interactive
// REST request whose connection carries the GUC, so `performed_by` is the real
// user and TC-10-09 step 3's "performer and timestamp" is satisfied on the
// audit row itself rather than only on the revision. Asserted explicitly,
// because a regression that dropped the GUC on this path would turn an
// attributed trail into an anonymous one without any other symptom.
//
// NOTHING HERE DELETES FROM `audit_logs`, including in cleanup. The table is
// append-only by policy (there is no UPDATE or DELETE policy at all) and by
// trigger, and the last test proves it — a teardown that reached into it would
// be disproving the thing this file exists to assert.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import {
  amendEntry,
  createPersonaPool,
  expireEditWindow,
  findRecord,
  flagsOf,
  raiseFlag,
  reviewEntry,
  revisionsOf,
  submitEntry,
  uniqueTag,
  voidEntry,
} from '../fixtures/inspectionsLogs.js'

const OPS = INSPECTIONS_LOGS.operations
const CTRL = INSPECTIONS_LOGS.controlled

const pool = createPersonaPool()
test.afterAll(() => pool.close())

/**
 * Audit rows for one entity, newest first.
 *
 * `new_value_json` is fetched SEPARATELY, per row, rather than joined into the
 * pipe-delimited line: it is jsonb, Postgres renders it with spaces and it can
 * contain both '|' and newlines, either of which would corrupt a single-query
 * parse. The extra round trips are cheap and the alternative is a helper that
 * works until someone writes a pipe into a log entry.
 */
function auditRows(entityType, entityId) {
  const out = sql(
    `SELECT id, action, coalesce(performed_by::text, ''), performed_at
       FROM audit_logs
      WHERE entity_type = '${entityType}' AND entity_id = '${entityId}'
      ORDER BY performed_at, created_at`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, action, performedBy, performedAt] = line.split('|')
    return { id, action, performedBy: performedBy || null, performedAt }
  })
}

/** One audit row's diff, parsed. */
function auditValues(auditId) {
  const newRaw = sqlValue(`SELECT coalesce(new_value_json::text, 'null') FROM audit_logs WHERE id = '${auditId}'`)
  const oldRaw = sqlValue(`SELECT coalesce(old_value_json::text, 'null') FROM audit_logs WHERE id = '${auditId}'`)
  return { newValue: JSON.parse(newRaw), oldValue: JSON.parse(oldRaw) }
}

/**
 * Wait for, and return, the row for one specific ACTION on one entity.
 *
 * Needed because several rows land per entity and `performed_at` is stamped by
 * the WORKER at insert time, not by the trigger at write time — two audit jobs
 * enqueued a millisecond apart are drained in whatever order the pool reaches
 * them, so ordering by it does not reconstruct the order of events. Selecting
 * on the action (and, where several share one, on a value in the payload) is
 * the only stable way to name a row.
 */
async function waitForAuditAction(entityType, entityId, action, label) {
  await expect
    .poll(() => auditRows(entityType, entityId).some((r) => r.action === action), {
      message: `${label}: a ${action} row for ${entityType} ${entityId}`,
      timeout: 45_000,
      intervals: [500, 1_000, 2_000],
    })
    .toBe(true)
  return auditRows(entityType, entityId).find((r) => r.action === action)
}

/**
 * Wait for the UPDATE row that BINDS a Part-11 signature to a revision.
 *
 * A signed revision is written in two steps, and the trail records both: the
 * revision is INSERTed with `signature_id` NULL, the signature row is minted,
 * and a follow-up UPDATE points the revision at it. So the CREATE row of any
 * signed revision always reads `signatureId: null` — which looks alarming and
 * is not. The binding is its own audited event, which is arguably the better
 * shape: an inspector can see the exact moment the record became signed rather
 * than only that it was created signed.
 */
async function waitForSignatureBinding(revisionId, label) {
  await expect
    .poll(
      () =>
        auditRows('FieldRecordRevisions', revisionId).some(
          (r) => r.action === 'UPDATE' && auditValues(r.id).newValue?.signatureId,
        ),
      { message: `${label}: the signature binding`, timeout: 45_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe(true)
  const row = auditRows('FieldRecordRevisions', revisionId).find(
    (r) => r.action === 'UPDATE' && auditValues(r.id).newValue?.signatureId,
  )
  return { row, ...auditValues(row.id) }
}

/**
 * Wait for the worker to have written at least `count` rows for this entity.
 *
 * The whole pipeline is exercised — trigger → graphile-worker queue → the
 * `audit_event` task's registry filter → the INSERT. Nothing is stubbed, so a
 * registry regression that started dropping these rows (exactly the defect the
 * fieldRecords registry module was created in 2026-09-08 to fix, where every
 * `field_record_revisions` UPDATE was silently discarded) fails here rather
 * than passing quietly.
 */
async function waitForAudit(entityType, entityId, count, label) {
  await expect
    .poll(() => auditRows(entityType, entityId).length, {
      message: `${label}: ${count} audit row(s) for ${entityType} ${entityId}`,
      timeout: 45_000,
      intervals: [500, 1_000, 2_000],
    })
    .toBeGreaterThanOrEqual(count)
  return auditRows(entityType, entityId)
}

test.describe('IL-J12 — the audit trail', () => {
  test('filing an entry writes the record AND its revision into the trail', async ({ browser }) => {
    // TC-10-09 step 1, the "entries" clause, and step 3's timestamp half.
    const page = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J12F')
    const record = await submitEntry(page, {
      book: OPS,
      values: { Operator: tag, Reading: '22.4', Note: 'Audit-trail probe' },
      submitterId: USERS.logOperator.id,
    })

    // The entry itself. Plural entity type, and CREATE — `resolveAction` maps
    // every INSERT to CREATE regardless of table.
    //
    // The CREATE row is SELECTED rather than read off index 0. Submitting an
    // entry writes the record and then points it at its first revision, so two
    // rows land, and both audit jobs are drained by the same worker pool at
    // whatever order it gets to them — `performed_at` is stamped by the worker
    // (NOW() at insert), not by the trigger, so it does not reliably preserve
    // the order the writes happened in. Any assertion that depended on which
    // row came first would be a race.
    await waitForAudit('FieldRecords', record.id, 1, 'entry created')
    await expect
      .poll(() => auditRows('FieldRecords', record.id).some((r) => r.action === 'CREATE'), {
        message: 'the CREATE row for the entry',
        timeout: 45_000,
        intervals: [500, 1_000, 2_000],
      })
      .toBe(true)
    const recordRows = auditRows('FieldRecords', record.id)
    const create = recordRows.find((r) => r.action === 'CREATE')
    expect(
      create.performedAt,
      'every audit row carries a timestamp — TC-10-09 step 3, the half that always holds',
    ).toBeTruthy()

    // TC-10-09 step 3, the performer half. The interactive REST path carries
    // `app.current_user_id` on its connection, so the trigger sees it and the
    // row names the operator. This is the assertion that would catch a
    // regression dropping that GUC: the trail would keep every row, keep every
    // value, and silently stop saying who did anything.
    expect(
      create.performedBy,
      'the entry is attributed in the trail, not merely timestamped',
    ).toBe(USERS.logOperator.id)
    expect(
      revisionsOf(record.id)[0].authorUserId,
      'and the module’s own ledger agrees — the two attributions cannot drift apart unnoticed',
    ).toBe(USERS.logOperator.id)

    // The revision ledger is audited too, and this is the table whose trail was
    // entirely blank until 2026-09-08 (it had no registry config, so it
    // inherited trackFields none of its columns have and every write was
    // dropped). Asserting it is a live regression guard on that fix.
    const revisionId = record.currentRevisionId
    const revRows = [
      await waitForAuditAction(
        'FieldRecordRevisions',
        revisionId,
        'CREATE',
        'initial revision audited',
      ),
    ]

    // The content is in the trail, not just the fact of it. An audit row that
    // recorded `{id}` and nothing else — which is precisely what the pre-fix
    // behaviour produced — would satisfy a bare count and tell an inspector
    // nothing.
    const { newValue } = auditValues(revRows[0].id)
    expect(newValue.revisionType).toBe('INITIAL_SUBMIT')
    expect(newValue.authorUserId, 'the trail records WHO authored the revision').toBe(
      USERS.logOperator.id,
    )
    expect(
      newValue.payload[OPS.fields.reading.name],
      'and the values as recorded',
    ).toBe('22.4')
  })

  test('a correction shows both the original and the corrected value, with the reason', async ({
    browser,
  }) => {
    // TC-10-09 step 2 — "Inspect a correction entry: original and corrected
    // values both shown, with the reason." This is the step the whole test case
    // turns on, and it is answered from two different places, because the trail
    // answers it differently from the ledger.
    const opPage = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J12C')
    const record = await submitEntry(opPage, {
      book: OPS,
      values: { Operator: tag, Reading: '45.0', Note: 'As first recorded' },
      submitterId: USERS.logOperator.id,
    })
    expireEditWindow(record.id)

    const adminPage = await pool.page(browser, AUTH.logAdmin)
    await amendEntry(adminPage, record.id, {
      values: { Reading: '46.5' },
      comment: 'Re-read against the calibrated reference; original was low.',
    })

    // ── Reading 1: the record row's trail ────────────────────────────────
    // An amendment repoints `current_revision_id`, which is a TRACKED field on
    // `field_records`, so the UPDATE survives the registry filter and the trail
    // records that the authoritative content of this entry moved.
    //
    // `after.currentRevisionId` is read from the live row rather than compared
    // against a captured `oldValue`: the pointer is set in a SECOND write just
    // after the INSERT (the record is created, then pointed at its first
    // revision), so several UPDATE rows touch this column and matching on the
    // new value is what identifies the amendment's one unambiguously.
    const after = findRecord(record.id)
    await waitForAudit('FieldRecords', record.id, 2, 'amend audited')
    await expect
      .poll(
        () =>
          auditRows('FieldRecords', record.id).some(
            (r) =>
              r.action === 'UPDATE' &&
              auditValues(r.id).newValue?.currentRevisionId === after.currentRevisionId,
          ),
        {
          message: 'the pointer move reached the trail',
          timeout: 45_000,
          intervals: [500, 1_000, 2_000],
        },
      )
      .toBe(true)

    const update = auditRows('FieldRecords', record.id)
      .map((r) => ({ row: r, ...auditValues(r.id) }))
      .find((r) => r.newValue?.currentRevisionId === after.currentRevisionId)
    expect(
      update.oldValue.currentRevisionId,
      'the trail shows which revision WAS authoritative before the correction',
    ).toBe(record.currentRevisionId)
    expect(
      update.row.performedBy,
      'and attributes the pointer move to the amender, not to the original operator',
    ).toBe(USERS.logAdmin.id)

    // ── Reading 2: the revision the amendment minted ─────────────────────
    // This is where step 2's three facts actually are, all on one row.
    const amendCreate = await waitForAuditAction(
      'FieldRecordRevisions',
      after.currentRevisionId,
      'CREATE',
      'amendment revision audited',
    )
    const amendValues = auditValues(amendCreate.id).newValue
    expect(amendValues.revisionType).toBe('ADMIN_AMENDMENT')
    expect(amendValues.payload[OPS.fields.reading.name], 'the corrected value').toBe('46.5')
    expect(
      amendValues.comment,
      'and WHY — the reason is mandatory at the endpoint and survives into the trail',
    ).toMatch(/calibrated reference/)
    expect(amendValues.authorUserId, 'and who made the correction').toBe(USERS.logAdmin.id)

    // The signature is a SECOND audited event, not a field on the first. The
    // revision is inserted unsigned, the signature row is minted, and the two
    // are bound by a follow-up UPDATE — so the CREATE above legitimately reads
    // `signatureId: null` and the binding has its own row. Both are asserted:
    // the null on the create (so a future refactor that folded them into one
    // write shows up here rather than silently), and the binding itself.
    expect(
      amendValues.signatureId,
      'the create row is written before the signature exists',
    ).toBeNull()

    const binding = await waitForSignatureBinding(
      after.currentRevisionId,
      'the amendment is signed',
    )
    expect(
      binding.newValue.signatureId,
      'and the trail records the moment the correction became a signed Part-11 act',
    ).toBeTruthy()
    expect(
      sqlValue(
        `SELECT s.meaning || '' FROM signatures s WHERE s.id = '${binding.newValue.signatureId}'`,
      ),
      'bound to a signature whose meaning is the amendment',
    ).toBe('AMENDED')
    expect(binding.row.performedBy, 'signed by the amender').toBe(USERS.logAdmin.id)

    // The ORIGINAL value. It is not on the amendment's audit row — an amendment
    // APPENDS a revision rather than editing one, so there is no old/new diff
    // to carry it. It is on the first revision's own CREATE row, which is
    // append-only and can never be rewritten. That is the trail's answer to
    // "the original remains visible": not a diff, a second immutable row.
    const originalRow = await waitForAuditAction(
      'FieldRecordRevisions',
      record.currentRevisionId,
      'CREATE',
      'original revision audited',
    )
    expect(
      auditValues(originalRow.id).newValue.payload[OPS.fields.reading.name],
      'the original value is preserved in its own audit row, untouched by the correction',
    ).toBe('45.0')
  })

  test('review, flag and void all reach the trail, each with its own semantics', async ({
    browser,
  }) => {
    // TC-10-09 step 1's remaining clauses — "sign-offs", and the exception and
    // retraction paths beside them. Three different acts on one controlled
    // entry, so the trail can be read end to end as a single story, which is
    // what an inspector actually does.
    const opPage = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J12L')
    const record = await submitEntry(opPage, {
      book: CTRL,
      values: { Area: tag, Temperature: '4.6' },
      submitterId: USERS.logOperator.id,
    })

    // ── Sign-off ─────────────────────────────────────────────────────────
    const supPage = await pool.page(browser, AUTH.logSupervisor)
    await reviewEntry(supPage, record.id, 'APPROVED', { comment: 'Checked against the SOP.' })

    const reviewRevision = revisionsOf(record.id).find((r) => r.revisionType === 'REVIEW_OUTCOME')
    const reviewRevisionId = sqlValue(
      `SELECT id FROM field_record_revisions
        WHERE field_record_id = '${record.id}' AND revision_type = 'REVIEW_OUTCOME'`,
    )
    const reviewCreate = await waitForAuditAction(
      'FieldRecordRevisions',
      reviewRevisionId,
      'CREATE',
      'review outcome audited',
    )
    const reviewValues = auditValues(reviewCreate.id).newValue
    expect(reviewValues.reviewOutcome, 'the decision itself is in the trail').toBe('APPROVED')
    expect(reviewValues.authorUserId, 'attributed to the reviewer on the revision').toBe(
      USERS.logSupervisor.id,
    )
    expect(
      reviewValues.comment,
      'with the reviewer’s own words — a sign-off with no rationale is a rubber stamp',
    ).toMatch(/Checked against the SOP/)

    // Same two-step shape as the amendment: the outcome is written, then bound
    // to its signature by a follow-up UPDATE. Both events are in the trail.
    const reviewBinding = await waitForSignatureBinding(reviewRevisionId, 'the review is signed')
    expect(
      sqlValue(
        `SELECT meaning || '' FROM signatures WHERE id = '${reviewBinding.newValue.signatureId}'`,
      ),
      'bound to a signature whose meaning is the approval',
    ).toBe('APPROVED')
    expect(reviewBinding.row.performedBy, 'signed by the supervisor').toBe(USERS.logSupervisor.id)
    expect(reviewRevision.signed, 'consistent with the module’s own ledger').toBe(true)

    // The record row saw the sign-off too — status and lock both moved, and
    // both are tracked fields.
    const recordRows = await waitForAudit('FieldRecords', record.id, 2, 'approval audited')
    const statusRow = recordRows
      .filter((r) => r.action === 'UPDATE')
      .map((r) => ({ row: r, ...auditValues(r.id) }))
      .find((r) => r.newValue?.statusId === 'APPROVED')
    expect(statusRow, 'the status change is in the trail').toBeTruthy()
    expect(statusRow.oldValue.statusId, 'with the state it came FROM').toBe('UNDER_REVIEW')
    expect(
      statusRow.newValue.lockReason,
      'and the reason the entry sealed, which is what makes the approval final',
    ).toBe('REVIEW_COMPLETE')

    // ── Flag ─────────────────────────────────────────────────────────────
    // The exception channel. Raising is open to any member, so a flag is the
    // one thing on a sealed entry that an unprivileged user can still cause —
    // which makes its presence in the trail load-bearing.
    const flag = await raiseFlag(opPage, record.id, {
      severity: 'WARN',
      notes: 'Sensor drifted during the shift; recorded for the supervisor.',
    })
    const flagCreate = await waitForAuditAction(
      'FieldRecordFlags',
      flag.id,
      'CREATE',
      'flag audited',
    )
    expect(
      flagCreate.performedBy,
      'the trail records WHO raised the exception, on the row itself',
    ).toBe(USERS.logOperator.id)

    // KNOWN DEFECT (IL-D4): the flag's audit row carries `{id}` and nothing
    // else — no severity, no notes, no subject, no resolution.
    //
    // This is precisely the defect class that
    // worker/services/audit/registry/modules/fieldRecords.js was created on
    // 2026-09-08 to fix, reached through the one door that pass left open. That
    // file gave `field_records`, `field_record_revisions` and `log_books` real
    // configs; `field_record_flags` was not included, so it still falls through
    // to DEFAULT_CONFIG — `mode: 'fields'` with
    // `trackFields: ['statusId','stateId','name','title','code']`. The table
    // has NONE of those five columns, so `filterRow` keeps only the id it
    // always appends, and `hasRelevantChanges` drops every UPDATE outright.
    //
    // Two consequences, and the second is the worse one:
    //   CREATE  records that a flag exists, with no indication of what it says
    //           or how serious it is. A CRITICAL excursion and a typo note are
    //           indistinguishable in the trail.
    //   UPDATE  is dropped entirely, so RESOLVING a flag — who closed a
    //           supervisor escalation, when, and with what justification — is
    //           not in the audit trail at all. The facts live on the
    //           `field_record_flags` row, which IL-J5 asserts, so nothing is
    //           lost from the database; what is missing is the immutable
    //           append-only record of the act.
    //
    // Asserted as it IS. The fix is a `field_record_flags` entry in that
    // registry module (severity, notes, flaggedByUserId, resolvedAt,
    // resolvedByUserId, resolutionNotes); when it lands, this flips to
    // asserting those fields and the `toEqual(['id'])` below will fail loudly.
    expect(
      Object.keys(auditValues(flagCreate.id).newValue),
      'IL-D4 — a flag audits as a bare id; its severity and notes are not in the trail',
    ).toEqual(['id'])
    expect(
      flagsOf(record.id)[0].severity,
      'the severity IS on the flag row — the gap is the trail, not the data',
    ).toBe('WARN')

    // ── Void ─────────────────────────────────────────────────────────────
    const adminPage = await pool.page(browser, AUTH.logAdmin)
    await voidEntry(adminPage, record.id, 'Cold room door was open — reading is not representative.')

    await expect
      .poll(
        () =>
          auditRows('FieldRecords', record.id)
            .map((r) => auditValues(r.id).newValue?.statusId)
            .includes('VOIDED'),
        { message: 'the void reached the trail', timeout: 45_000, intervals: [500, 1_000, 2_000] },
      )
      .toBe(true)

    const voidRow = auditRows('FieldRecords', record.id)
      .map((r) => ({ row: r, ...auditValues(r.id) }))
      .find((r) => r.newValue?.statusId === 'VOIDED')
    expect(
      voidRow.newValue.voidReason,
      'a retraction without its reason is not a retraction — the trail carries it',
    ).toMatch(/door was open/)
    expect(voidRow.newValue.voidedByUserId, 'and who retracted it').toBe(USERS.logAdmin.id)
    expect(
      voidRow.oldValue.statusId,
      'and what it was retracted FROM — an approved, signed record',
    ).toBe('APPROVED')
  })

  test('the book’s own definition changes are in the trail alongside its entries', async ({
    browser,
  }) => {
    // TC-10-09 step 1's FIRST clause — "Definition, activation, assignments…".
    // Every other test in this file looks at entries; this one looks at the
    // book, because a trail that recorded perfect entries against a form that
    // could be changed unrecorded would prove nothing about the entries.
    //
    // Run against a throwaway DRAFT book: the seeded ones are ACTIVE and their
    // contract is frozen (IL-J9), so the only definition change available on
    // them is the one the product refuses.
    const page = await pool.page(browser, AUTH.logAdmin)
    const code = `E2EJ12-${Date.now()}`
    let bookId = null
    try {
      const created = await page.request.post('/api/v1/services/logBooks', {
        data: {
          code,
          title: 'E2E J12 Audited Definition',
          recordClassification: 'OPERATIONAL_LOG',
          logBookTypeId: INSPECTIONS_LOGS.logBookTypeId,
          editWindowMode: 'TIME_WINDOW',
          editWindowMinutes: 60,
          schema: [{ name: 'reading', type: 'number', label: 'Reading', required: true }],
        },
      })
      expect(created.status(), await created.text()).toBe(201)
      bookId = sqlValue(
        `SELECT id FROM log_books WHERE company_id = '${COMPANY_ID}' AND code = '${code}'`,
      )
      expect(bookId, 'the book was created').toBeTruthy()

      const createRows = await waitForAudit('LogBooks', bookId, 1, 'book definition audited')
      expect(createRows[0].action).toBe('CREATE')
      const created0 = auditValues(createRows[0].id).newValue
      expect(created0.statusId, 'born DRAFT, and the trail says so').toBe('DRAFT')
      expect(created0.recordClassification).toBe('OPERATIONAL_LOG')
      expect(
        created0.editWindowMinutes,
        'the edit window a future entry will inherit is on the record from day one',
      ).toBe(60)

      // Now change two of the controls the book imposes on its records. Both
      // are legal while the book is a draft, and both must be traceable —
      // `signatureRequired` most of all, because it decides whether an entry
      // needs a Part-11 signature at all.
      const patched = await page.request.patch(`/api/v1/services/logBooks/${bookId}`, {
        data: { signatureRequired: true, supervisorUserId: USERS.logSupervisor.id },
      })
      expect(patched.status(), await patched.text()).toBe(200)

      const afterRows = await waitForAudit('LogBooks', bookId, 2, 'definition change audited')
      const change = afterRows.find((r) => r.action === 'UPDATE')
      expect(change, 'the control change produced its own row').toBeTruthy()
      const diff = auditValues(change.id)
      expect(
        diff.oldValue.signatureRequired,
        'the trail records the setting as it WAS',
      ).toBe(false)
      expect(diff.newValue.signatureRequired, 'and as it now is').toBe(true)
      expect(
        diff.newValue.supervisorUserId,
        'and who the book now routes its reviews to',
      ).toBe(USERS.logSupervisor.id)

      // Label enrichment resolves the UUID to a readable name before the row is
      // written, which is what makes the trail legible to an inspector who has
      // no way to look a UUID up. Best-effort in the worker, so its absence
      // would not fail anything else — asserted here because a silent
      // regression turns the whole trail back into opaque ids.
      expect(
        diff.newValue.supervisorUserIdLabel,
        'resolved to a name, not left as a bare UUID',
      ).toBe(USERS.logSupervisor.name)

      // The entry form itself. Worth asserting deliberately, because the two
      // halves of the registry do different jobs and it is easy to read the
      // first as limiting the second:
      //   `trackFields` decides WHETHER an UPDATE produces an audit row at all
      //     (`hasRelevantChanges`). `schema` is NOT in the log_books list, so a
      //     schema edit alone would be dropped — it survives only because a
      //     real rework also bumps `schemaVersion`, which IS tracked.
      //   `buildAuditValues` then writes EVERY changed column into the diff,
      //     tracked or not. So the row that the version bump admitted carries
      //     the whole before-and-after form with it.
      // The net effect is the right one and this asserts it, but it rests on
      // that coupling: if `schemaVersion` ever stopped moving on a rework
      // (see IL-D3 in IL-J9, which is the same comparison from the other side),
      // the form change would become invisible rather than merely unversioned.
      const reworked = await page.request.patch(`/api/v1/services/logBooks/${bookId}`, {
        data: {
          schema: [
            { name: 'reading', type: 'number', label: 'Reading', required: true },
            { name: 'witness', type: 'text', label: 'Witness', required: true },
          ],
        },
      })
      expect(reworked.status(), await reworked.text()).toBe(200)

      await expect
        .poll(
          () =>
            auditRows('LogBooks', bookId)
              .map((r) => auditValues(r.id).newValue?.schemaVersion)
              .filter((v) => v === 2).length,
          { message: 'the schema rework reached the trail', timeout: 45_000, intervals: [500, 1_000, 2_000] },
        )
        .toBeGreaterThanOrEqual(1)

      const schemaRow = auditRows('LogBooks', bookId)
        .map((r) => ({ row: r, ...auditValues(r.id) }))
        .find((r) => r.newValue?.schemaVersion === 2)
      expect(
        schemaRow.oldValue.schemaVersion,
        'the trail records that the form moved a generation',
      ).toBe(1)
      expect(
        schemaRow.oldValue.schema.map((f) => f.name),
        'and the form as it stood — the version an existing entry was filed against',
      ).toEqual(['reading'])
      expect(
        schemaRow.newValue.schema.map((f) => f.name),
        'and the form as it now stands, so the added field is nameable from the trail alone',
      ).toEqual(['reading', 'witness'])
    } finally {
      // The book goes; its audit rows stay, which is the correct asymmetry and
      // the reason this teardown names only `log_books`.
      if (bookId) sql(`DELETE FROM log_books WHERE id = '${bookId}'`)
    }
  })

  test('no audit entry can be edited or deleted — by anyone, through any layer', async ({
    browser,
  }) => {
    // TC-10-09 step 4. The one step whose failure would make every other
    // assertion in this file worthless: a trail that can be edited is not a
    // trail. It is probed at BOTH layers, because they fail differently and
    // only one of them is visible from the application.
    const page = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J12I')
    const record = await submitEntry(page, {
      book: OPS,
      values: { Operator: tag, Reading: '11.1', Note: 'Immutability probe' },
      submitterId: USERS.logOperator.id,
    })
    const rows = await waitForAudit('FieldRecords', record.id, 1, 'a row to attempt to rewrite')
    const target = rows[0].id
    const before = auditValues(target).newValue

    // ── Layer 1: the table GRANT ─────────────────────────────────────────
    // Stronger than expected, and worth recording precisely. `app_user` — the
    // role PostGraphile serves every GraphQL request as — has no UPDATE or
    // DELETE privilege on `audit_logs` at all, so the statement is refused
    // before RLS is ever consulted.
    //
    // That distinction matters. An RLS refusal is SILENT (zero rows, no error,
    // which is why IL-J8's probes have to count rows), and a policy that
    // quietly stopped matching would read the same as one doing its job. A
    // missing GRANT raises, so it cannot degrade into a silent no-op — and it
    // also holds for a statement with no WHERE clause, which an RLS-only
    // defence would let run harmlessly against zero rows while a later
    // policy change turned it into a truncation.
    for (const [statement, verb] of [
      [`UPDATE audit_logs SET action = 'TAMPERED' WHERE id = '${target}';`, 'rewrite'],
      [`DELETE FROM audit_logs WHERE id = '${target}';`, 'delete'],
    ]) {
      const res = sqlAsAppUser(statement, { userId: USERS.logAdmin.id, companyId: COMPANY_ID })
      expect(res.ok, `an application-role caller cannot ${verb} an audit row`).toBeFalsy()
      expect(res.error).toMatch(/permission denied for table audit_logs/i)
    }

    // The read side is open to the same caller, which is what makes the write
    // refusals meaningful rather than an artefact of the row being invisible.
    const visible = sqlAsAppUser(
      `SELECT count(*) FROM audit_logs WHERE id = '${target}';`,
      { userId: USERS.logAdmin.id, companyId: COMPANY_ID },
    )
    expect(
      (visible.output || '').trim().split('\n').pop(),
      'the same caller CAN read the row — it is append-only, not hidden',
    ).toBe('1')

    // ── Layer 2: the trigger ─────────────────────────────────────────────
    // The layer that matters, and the only one this suite can prove from the
    // owner's side of the connection: `audit_logs_immutable` is a BEFORE
    // UPDATE OR DELETE trigger that raises unconditionally. It has no trusted
    // path and no superuser exemption, so it holds against the SAME role that
    // Sequelize, the worker and every migration connect as — which is the role
    // that could otherwise rewrite the trail without RLS ever being consulted.
    //
    // This is also why e2e/fixtures/inspectionsLogs.setup.js purges signatures
    // and records but never audit rows: there is no way to, and there should
    // not be.
    let rewriteError = ''
    try {
      sql(`UPDATE audit_logs SET action = 'TAMPERED' WHERE id = '${target}'`)
    } catch (err) {
      rewriteError = `${err.stderr ?? err.message ?? ''}`
    }
    expect(rewriteError, 'the superuser cannot rewrite an audit row either').toMatch(
      /audit_logs rows are immutable/i,
    )

    let deleteError = ''
    try {
      sql(`DELETE FROM audit_logs WHERE id = '${target}'`)
    } catch (err) {
      deleteError = `${err.stderr ?? err.message ?? ''}`
    }
    expect(deleteError, 'nor delete one').toMatch(/audit_logs rows are immutable/i)

    // And the row reads exactly as written.
    expect(auditRows('FieldRecords', record.id).map((r) => r.action), 'still CREATE').toContain(
      'CREATE',
    )
    expect(auditValues(target).newValue, 'byte for byte unchanged').toEqual(before)
  })
})
