// IL-J4 — Amend and Void: the two ways a sealed entry can still change.
//
// Both are Part-11 events and the service treats them as such — each demands a
// free-text reason AND an e-signature before it will write anything, and each
// appends rather than overwrites. What separates them is what survives:
//
//   AMEND — a new ADMIN_AMENDMENT revision becomes current. The original
//     content revision stays in the history with its original values, so the
//     entry reads as "this was corrected, here is what it said before".
//   VOID  — the status moves to VOIDED and a VOID revision records the reason,
//     but `current_revision_id` deliberately does NOT move to it. A void
//     revision carries no payload; advancing to it would blank the record on
//     screen, so a voided entry still shows the data it is retracting.
//
// The second is the subtler guarantee and the easier one to regress, which is
// why it is asserted directly rather than inferred from the status.
import { test, expect } from '@playwright/test'
import { AUTH, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import {
  amendEntry,
  createPersonaPool,
  currentPayload,
  errorMessage,
  expireEditWindow,
  findRecord,
  openEntry,
  restPost,
  revisionsOf,
  signaturesOf,
  submitEntry,
  uniqueTag,
  voidEntry,
} from '../fixtures/inspectionsLogs.js'

const OPS = INSPECTIONS_LOGS.operations

const pool = createPersonaPool()
test.afterAll(() => pool.close())

/** File an operational entry as the operator and close its edit window. */
async function fileSealedEntry(browser, tag, reading = '30.0') {
  const page = await pool.page(browser, AUTH.logOperator)
  const record = await submitEntry(page, {
    book: OPS,
    values: { Operator: tag, Reading: reading, Note: 'Original entry' },
    submitterId: USERS.logOperator.id,
  })
  expireEditWindow(record.id)
  return record
}

test.describe('IL-J4 — amend and void', () => {
  test('an amend-holder corrects a sealed entry under signature, and the original survives', async ({
    browser,
  }) => {
    const tag = uniqueTag('J4A')
    const record = await fileSealedEntry(browser, tag, '30.0')

    const page = await pool.page(browser, AUTH.logAdmin)
    await amendEntry(page, record.id, {
      values: { Reading: '30.8' },
      comment: 'Instrument re-read after calibration; original transcription was low.',
    })

    const revisions = revisionsOf(record.id)
    expect(revisions).toHaveLength(2)
    expect(revisions[1].revisionType).toBe('ADMIN_AMENDMENT')
    expect(revisions[1].authorUserId, 'attributed to the amender, not the submitter').toBe(
      USERS.logAdmin.id,
    )
    expect(revisions[1].comment, 'the reason is mandatory and is what an auditor reads').toMatch(
      /re-read after calibration/,
    )
    expect(revisions[1].signed).toBe(true)
    expect(signaturesOf(record.id)).toEqual([{ meaning: 'AMENDED', userId: USERS.logAdmin.id }])

    // Append-only in practice, not just in policy.
    expect(revisions[0].payload[OPS.fields.reading.name], 'the original value is still on file').toBe(
      '30.0',
    )
    expect(currentPayload(record.id)[OPS.fields.reading.name], 'the corrected value is current').toBe(
      '30.8',
    )

    const after = findRecord(record.id)
    expect(after.currentRevisionId).not.toBe(record.currentRevisionId)
    // An amend on a LOCKED entry is a tracked post-lock correction — it is NOT a
    // resubmission, so it neither reopens the review cycle nor unseals the
    // record. (Only an amend on a REJECTED entry moves the status, back to
    // UNDER_REVIEW, and that is the fix-and-resubmit path.)
    expect(after.statusId, 'an amendment leaves a sealed entry sealed').toBe('LOCKED')
  })

  test('a void retracts the entry, under signature, without erasing what it said', async ({
    browser,
  }) => {
    const tag = uniqueTag('J4V')
    const record = await fileSealedEntry(browser, tag, '41.0')

    const page = await pool.page(browser, AUTH.logAdmin)
    await voidEntry(page, record.id, 'Filed against the wrong line — re-entered under E2E Line 2.')

    const after = findRecord(record.id)
    expect(after.statusId).toBe('VOIDED')
    expect(after.voidedAt).toBeTruthy()
    expect(after.voidReason).toMatch(/wrong line/)

    const revisions = revisionsOf(record.id)
    expect(revisions).toHaveLength(2)
    expect(revisions[1].revisionType).toBe('VOID')
    expect(revisions[1].signed).toBe(true)
    expect(signaturesOf(record.id)).toEqual([{ meaning: 'VOIDED', userId: USERS.logAdmin.id }])

    // The guarantee that is easy to lose: the pointer stays on the last CONTENT
    // revision, so the retracted entry still renders its data behind the
    // VOIDED badge instead of a set of blank fields.
    expect(after.currentRevisionId, 'current_revision_id stays on the content revision').toBe(
      record.currentRevisionId,
    )
    expect(currentPayload(record.id)[OPS.fields.reading.name]).toBe('41.0')
  })

  test('a voided entry is final — no second void, and every action is withdrawn', async ({
    browser,
  }) => {
    const tag = uniqueTag('J4F')
    const record = await fileSealedEntry(browser, tag, '12.0')

    const page = await pool.page(browser, AUTH.logAdmin)
    await voidEntry(page, record.id, 'Duplicate of the previous shift entry.')

    // `voidEntry` goes through the REST route, which calls `refetchSyncRecord`
    // afterwards — so this context's IndexedDB already holds the voided row and
    // the panel re-evaluates its gates against it. The generous timeout covers
    // the round trip, not a stale cache.
    await openEntry(page, record.id)
    for (const label of ['Flag', 'Amend', 'Void', 'Edit']) {
      await expect(
        page.getByRole('button', { name: label, exact: true }),
        `${label} is withdrawn once the entry is voided`,
      ).toHaveCount(0, { timeout: 30_000 })
    }

    const res = await restPost(page, `/fieldRecords/${record.id}/void`, {
      reason: 'Trying again',
      esign: { strategy: 'pin', token: '12345678' },
    })
    const status = res.status()
    const message = await errorMessage(res)
    expect(status, 'and the server refuses a second void').toBe(400)
    expect(message).toMatch(/already voided/i)
    expect(revisionsOf(record.id), 'nothing further was appended').toHaveLength(2)
  })
})
