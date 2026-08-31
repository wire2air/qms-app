// IL-J3 — Supervisor review of a controlled entry.
//
// The gate under test is NOT `field_records:review`. Since 2026-08-09 that
// permission alone grants nothing: `reviewFieldRecord` calls `ensureCanReview`,
// which asks the SECURITY DEFINER function `public.is_log_book_reviewer(book,
// user)` — supervisor of the book, or a named additional reviewer with access
// to the book's site(s). The same function backs the RLS visibility arm, so
// "who sees it in the queue" and "who may sign it off" cannot drift apart.
//
// That is why the third test matters as much as the first two: logAdmin holds
// amend, void AND read_all across the whole module and is still refused,
// because they are not a reviewer of THIS book.
import { test, expect } from '@playwright/test'
import { AUTH, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import {
  createPersonaPool,
  currentPayload,
  errorMessage,
  findRecord,
  openEntry,
  restPost,
  reviewEntry,
  revisionsOf,
  signaturesOf,
  submitEntry,
  uniqueTag,
} from '../fixtures/inspectionsLogs.js'

const CTRL = INSPECTIONS_LOGS.controlled

const pool = createPersonaPool()
test.afterAll(() => pool.close())

/** File a controlled entry as the operator and hand back the row. */
async function fileControlledEntry(browser, tag) {
  const page = await pool.page(browser, AUTH.logOperator)
  const record = await submitEntry(page, {
    book: CTRL,
    values: { Area: tag, Temperature: '4.4' },
    submitterId: USERS.logOperator.id,
  })
  expect(record.statusId, 'a controlled entry opens UNDER_REVIEW').toBe('UNDER_REVIEW')
  return record
}

test.describe('IL-J3 — the supervisor decides', () => {
  test('the book supervisor approves under e-signature and the entry seals', async ({ browser }) => {
    const tag = uniqueTag('J3A')
    const record = await fileControlledEntry(browser, tag)

    const page = await pool.page(browser, AUTH.logSupervisor)
    await reviewEntry(page, record.id, 'APPROVED', { comment: 'Within range, checked against SOP.' })

    const after = findRecord(record.id)
    expect(after.statusId).toBe('APPROVED')
    // UNTIL_REVIEW + APPROVED is the one combination that seals the record:
    // the reviewer's decision is what closes the window, not a timer.
    expect(after.lockReason, 'approval is what sealed it').toBe('REVIEW_COMPLETE')
    expect(new Date(after.lockAt).getTime()).toBeLessThanOrEqual(Date.now())

    const revisions = revisionsOf(record.id)
    expect(revisions).toHaveLength(2)
    expect(revisions[1].revisionType).toBe('REVIEW_OUTCOME')
    expect(revisions[1].reviewOutcome).toBe('APPROVED')
    expect(revisions[1].authorUserId, 'the decision is attributed to the supervisor').toBe(
      USERS.logSupervisor.id,
    )
    expect(revisions[1].comment).toBe('Within range, checked against SOP.')
    expect(revisions[1].signed).toBe(true)

    // Two signatures, two people, two meanings — the separation of duties the
    // controlled classification exists to record.
    expect(signaturesOf(record.id)).toEqual([
      { meaning: 'SUBMITTED', userId: USERS.logOperator.id },
      { meaning: 'APPROVED', userId: USERS.logSupervisor.id },
    ])

    // REVIEW_OUTCOME carries no payload, and `current_revision_id` deliberately
    // does NOT advance to it — otherwise an approved entry would render blank.
    expect(currentPayload(record.id), 'the approved entry still shows its data').toMatchObject({
      [CTRL.fields.area.name]: tag,
    })
    expect(after.currentRevisionId).toBe(record.currentRevisionId)
  })

  test('a rejection is signed too, and sends the entry back to its author', async ({ browser }) => {
    const tag = uniqueTag('J3R')
    const record = await fileControlledEntry(browser, tag)

    const page = await pool.page(browser, AUTH.logSupervisor)
    await reviewEntry(page, record.id, 'REJECTED', { comment: 'Reading is outside the 2–8 °C band.' })

    const after = findRecord(record.id)
    expect(after.statusId).toBe('REJECTED')
    // Rejection does NOT re-open the cheap edit window — the fix-and-resubmit
    // route is a signed amendment, which is where the window restarts.
    expect(after.lockReason, 'a rejection does not restart the typo window').toBeNull()

    const revisions = revisionsOf(record.id)
    expect(revisions[1].reviewOutcome).toBe('REJECTED')
    expect(revisions[1].signed, 'REJECTED requires a signature exactly as APPROVED does').toBe(true)
    expect(signaturesOf(record.id)).toEqual([
      { meaning: 'SUBMITTED', userId: USERS.logOperator.id },
      { meaning: 'REJECTED', userId: USERS.logSupervisor.id },
    ])
  })

  test('holding field_records verbs is not the same as being a reviewer of the book', async ({
    browser,
  }) => {
    const tag = uniqueTag('J3G')
    const record = await fileControlledEntry(browser, tag)

    // The submitter first: their own entry is UNDER_REVIEW in front of them and
    // the decision controls are simply not there.
    const opPage = await pool.page(browser, AUTH.logOperator)
    await openEntry(opPage, record.id)
    await expect(
      opPage.getByRole('button', { name: 'Approve', exact: true }),
      'the author is offered no way to approve their own entry',
    ).toHaveCount(0)
    await expect(opPage.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0)
    const opRes = await restPost(opPage, `/fieldRecords/${record.id}/review`, {
      outcome: 'APPROVED',
      esign: { strategy: 'pin', token: '12345678' },
    })
    const opStatus = opRes.status()
    const opMessage = await errorMessage(opRes)
    expect(opStatus).toBe(403)
    expect(opMessage).toMatch(/not an authorized reviewer/i)

    // And the admin, who holds strictly more of the module than the supervisor
    // does apart from `review` itself. Same refusal, same reason.
    const adminPage = await pool.page(browser, AUTH.logAdmin)
    const adminRes = await restPost(adminPage, `/fieldRecords/${record.id}/review`, {
      outcome: 'APPROVED',
      esign: { strategy: 'pin', token: '12345678' },
    })
    const adminStatus = adminRes.status()
    const adminMessage = await errorMessage(adminRes)
    expect(adminStatus, 'amend + void + read_all still buys no review').toBe(403)
    expect(adminMessage).toMatch(/not an authorized reviewer/i)

    expect(findRecord(record.id).statusId, 'the entry is still awaiting a real reviewer').toBe(
      'UNDER_REVIEW',
    )
    expect(revisionsOf(record.id), 'and nothing was appended by the refusals').toHaveLength(1)
  })
})
