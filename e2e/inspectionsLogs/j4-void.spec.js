// IL-J4 — Void.
//
// Void is a Part-11 event and the service treats it as such — it demands a
// free-text reason AND an e-signature before it will write anything, and it
// appends rather than overwrites. The rule of 2026-10-14 (amend no longer
// exists):
//
//   EDIT  — the submitter alone, only while the entry's edit window is open
//     (IL-J2). Once the window closes the content is SEALED: it is never
//     rewritten, and a correction is a NEW entry.
//   VOID  — allowed while open AND once sealed. The status moves to VOIDED and
//     a VOID revision records the reason, but `current_revision_id`
//     deliberately does NOT move to it. A void revision carries no payload;
//     advancing to it would blank the record on screen, so a voided entry
//     still shows the data it is retracting.
//   Once an entry has gone to review (UNDER_REVIEW / APPROVED / REJECTED) or is
//     VOIDED it is final — nothing touches it (IL-J3, IL-J8).
//
// The pointer rule is the subtler guarantee and the easier one to regress,
// which is why it is asserted directly rather than inferred from the status.
import { test, expect } from '@playwright/test'
import { AUTH, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import {
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

/** File an operational entry as the operator; its edit window is open. */
async function fileOpenEntry(browser, tag, reading = '30.0') {
  const page = await pool.page(browser, AUTH.logOperator)
  return submitEntry(page, {
    book: OPS,
    values: { Operator: tag, Reading: reading, Note: 'Original entry' },
    submitterId: USERS.logOperator.id,
  })
}

/** File an operational entry as the operator and close its edit window. */
async function fileSealedEntry(browser, tag, reading = '30.0') {
  const record = await fileOpenEntry(browser, tag, reading)
  expireEditWindow(record.id)
  return record
}

test.describe('IL-J4 — void', () => {
  test('a void retracts the entry, under signature, without erasing what it said', { tag: ['@validation', '@URS-LOG-07'] }, async ({
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
    for (const label of ['Flag', 'Void', 'Edit']) {
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
