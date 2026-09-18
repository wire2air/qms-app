// IL-J1 — Filing a log entry: the flow every other journey depends on.
//
// Two books, because the module's whole design is that CLASSIFICATION decides
// the ceremony, not a per-book toggle:
//
//   E2E Operations Log (OPERATIONAL_LOG) — no signature, no review. The entry
//     lands SUBMITTED with a 120-minute edit window on it, which is the state
//     IL-J2 then edits and then fails to edit.
//   E2E Controlled Log (CONTROLLED_RECORD) — a signature at submit is
//     mandatory *because of the classification* (fieldRecordService's
//     `requiresSignatureAtSubmission` returns true for CONTROLLED_RECORD
//     regardless of `signature_required`), and review_required sends it
//     straight to UNDER_REVIEW rather than SUBMITTED.
//
// What is asserted in both cases is not "a row appeared" but the four
// point-in-time facts that make a log entry evidence: its number, the frozen
// schema snapshot, the frozen book generation, and an INITIAL_SUBMIT revision
// carrying the payload keyed by schema NAME.
import { test, expect } from '@playwright/test'
import { AUTH, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import {
  createPersonaPool,
  currentPayload,
  revisionsOf,
  signaturesOf,
  snapshotFieldCount,
  submitEntry,
  uniqueTag,
} from '../fixtures/inspectionsLogs.js'

const OPS = INSPECTIONS_LOGS.operations
const CTRL = INSPECTIONS_LOGS.controlled

const pool = createPersonaPool()
test.afterAll(() => pool.close())

test.describe('IL-J1 — file a log entry', () => {
  test('an operator files an operational entry and it lands SUBMITTED, inside its edit window', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.logOperator)

    const tag = uniqueTag('J1')
    const record = await submitEntry(page, {
      book: OPS,
      values: { Operator: tag, Reading: '21.5', Note: 'Routine shift entry' },
      submitterId: USERS.logOperator.id,
    })

    expect(record, 'the entry reached Postgres').toBeTruthy()
    expect(record.statusId, 'no review required → the entry is SUBMITTED, not UNDER_REVIEW').toBe(
      'SUBMITTED',
    )
    expect(record.submittedByUserId, 'attributed to the operator').toBe(USERS.logOperator.id)
    expect(record.recordClassification, 'classification is copied from the book').toBe(
      'OPERATIONAL_LOG',
    )

    // The visible entry id is allocated from the book's own counter, uppercased
    // and zero-padded: `<BOOK CODE>-NNNN`. The setup project resets the counter,
    // so a fresh run starts at 0001.
    expect(record.recordNumber, 'numbered from the book code + its counter').toMatch(
      new RegExp(`^${OPS.code}-\\d{4}$`),
    )

    // Point-in-time capture. Both of these are what let an auditor read a
    // three-year-old entry against the form as it stood the day it was filed.
    expect(record.logBookVersion, "stamped with the book's generation").toBe(1)
    expect(
      snapshotFieldCount(record.id),
      'the form schema is frozen onto the record itself',
    ).toBe(3)

    // TIME_WINDOW 120m: lock_at is set at submit, in the future, by the server.
    expect(record.lockReason, 'the window is a timer, set server-side').toBe('TIMER')
    expect(new Date(record.lockAt).getTime(), 'the edit window has not closed yet').toBeGreaterThan(
      Date.now(),
    )

    const revisions = revisionsOf(record.id)
    expect(revisions, 'exactly one revision: the initial submit').toHaveLength(1)
    expect(revisions[0].revisionType).toBe('INITIAL_SUBMIT')
    expect(revisions[0].authorUserId).toBe(USERS.logOperator.id)
    expect(revisions[0].signed, 'an operational log without signature_required is not signed').toBe(
      false,
    )

    // Filled by LABEL through DynamicForm; stored by schema NAME.
    //
    // `reading` is a `number` field and it lands as the STRING "21.5", not 21.5.
    // That is the product's actual behaviour, asserted as-is rather than
    // normalised away: DynamicForm binds a native <input type="number"> whose
    // value is a string, and fieldRecordService stores `payload` verbatim (the
    // `// validate-payload-here` comment marks the seam where a schema
    // validator would coerce it, and none exists yet). Anything reading a
    // numeric log field back out — a trend chart, a limit check — has to cope
    // with that, so a test that quietly expected a number would be hiding it.
    expect(currentPayload(record.id), 'the payload is keyed by schema name').toMatchObject({
      [OPS.fields.operator.name]: tag,
      [OPS.fields.reading.name]: '21.5',
      [OPS.fields.note.name]: 'Routine shift entry',
    })
    expect(signaturesOf(record.id), 'nothing to sign, so nothing signed').toHaveLength(0)
  })

  test('a controlled record cannot be filed without an e-signature, and goes straight to review', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.logOperator)

    const tag = uniqueTag('J1C')
    // submitEntry drives "Sign & Submit" + the PIN dialog for CONTROLLED_RECORD
    // books. The button label itself is the product stating the requirement —
    // a book that did not require a signature would render "Save Record".
    const record = await submitEntry(page, {
      book: CTRL,
      values: { Area: tag, Temperature: '4.2' },
      submitterId: USERS.logOperator.id,
    })

    expect(record.recordClassification).toBe('CONTROLLED_RECORD')
    expect(record.statusId, 'review_required → the entry opens UNDER_REVIEW').toBe('UNDER_REVIEW')
    // UNTIL_REVIEW mode: the lock is written by the review outcome, not a timer.
    expect(record.lockAt, 'UNTIL_REVIEW leaves lock_at unset until a reviewer decides').toBeNull()

    const revisions = revisionsOf(record.id)
    expect(revisions).toHaveLength(1)
    expect(revisions[0].revisionType).toBe('INITIAL_SUBMIT')
    expect(revisions[0].signed, 'the initial revision carries the signature').toBe(true)

    const signatures = signaturesOf(record.id)
    expect(signatures, 'one Part-11 signature row, meaning SUBMITTED').toHaveLength(1)
    expect(signatures[0]).toEqual({ meaning: 'SUBMITTED', userId: USERS.logOperator.id })
  })
})
