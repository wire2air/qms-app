// IL-J7 — Permission gates, asserted at the server rather than at the button.
//
// Every probe here deliberately BYPASSES the interface. The module hides a
// control the moment the session cannot use it, which is good UX and no
// evidence at all — the question each of these asks is whether the API or the
// database refuses the request the hidden button would have sent.
//
// The three write verbs are gated in two different places and it matters which:
//   amend / void  — inside the CONTROLLER (`ensurePermission`), so the refusal
//     names the missing permission string.
//   flag resolve / assignment authoring — at the ROUTE
//     (`enforcePermission(...)`), so the refusal never reaches the controller.
//   review        — at neither; it asks `is_log_book_reviewer` instead, which is
//     why IL-J3 owns that one.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser } from '../fixtures/db.js'
import {
  createPersonaPool,
  errorMessage,
  findRecord,
  openEntry,
  restPost,
  revisionsOf,
  submitEntry,
  uniqueTag,
} from '../fixtures/inspectionsLogs.js'

const OPS = INSPECTIONS_LOGS.operations
const lastLine = (out) => out.trim().split('\n').pop().trim()

const pool = createPersonaPool()
test.afterAll(() => pool.close())

test.describe('IL-J7 — who may do what', () => {
  test('the operator is offered no amend or void, and the endpoints refuse them by name', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J7')
    const record = await submitEntry(page, {
      book: OPS,
      values: { Operator: tag, Reading: '15.0', Note: 'Mine to file, not to rewrite' },
      submitterId: USERS.logOperator.id,
    })

    await openEntry(page, record.id)
    await expect(page.getByRole('button', { name: 'Amend', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Void', exact: true })).toHaveCount(0)
    // Flag, by contrast, IS offered — raising an exception is open to everyone
    // in the tenant by design. The contrast is the assertion.
    await expect(
      page.getByRole('button', { name: 'Flag', exact: true }),
      'raising a flag is deliberately ungated',
    ).toBeVisible()

    const amend = await restPost(page, `/fieldRecords/${record.id}/amend`, {
      payload: { [OPS.fields.reading.name]: '0' },
      comment: 'Should not land',
      esign: { strategy: 'pin', token: '12345678' },
    })
    expect(amend.status()).toBe(403)
    expect(await errorMessage(amend)).toMatch(/missing permission: field_records:amend/i)

    const voided = await restPost(page, `/fieldRecords/${record.id}/void`, {
      reason: 'Should not land',
      esign: { strategy: 'pin', token: '12345678' },
    })
    expect(voided.status()).toBe(403)
    expect(await errorMessage(voided)).toMatch(/missing permission: field_records:void/i)

    // Scheduling is an admin act — `inspections:assign` gates the route, so the
    // refusal happens before the controller ever sees the body.
    const plan = await restPost(page, '/formAssignments', {
      logBookId: OPS.id,
      assignedUserIds: [USERS.logOperator.id],
      schedule: { type: 'AD_HOC' },
    })
    expect(plan.status()).toBe(403)
    expect(await errorMessage(plan)).toMatch(/not permitted to assign on inspections/i)

    expect(revisionsOf(record.id), 'not one of the refusals wrote anything').toHaveLength(1)
    expect(findRecord(record.id).statusId).toBe('SUBMITTED')
  })

  test('a member with no field_records grant cannot read another user’s entry at all', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J7R')
    const record = await submitEntry(page, {
      book: OPS,
      values: { Operator: tag, Reading: '16.0', Note: 'Private to its author' },
      submitterId: USERS.logOperator.id,
    })

    // `field_records_select_rls` admits the owner, a read_all holder, the
    // submitter, or a reviewer of the book. noAccess is none of those.
    const denied = sqlAsAppUser(
      `SELECT count(*) FROM field_records WHERE id = '${record.id}';`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )
    expect(lastLine(denied.output), 'a zero-permission member sees nothing').toBe('0')

    // The submitter's own arm of the same policy — proof the probe is asking a
    // real question and not just failing to find the row.
    const own = sqlAsAppUser(`SELECT count(*) FROM field_records WHERE id = '${record.id}';`, {
      userId: USERS.logOperator.id,
      companyId: COMPANY_ID,
    })
    expect(lastLine(own.output), 'its author does see it').toBe('1')

    // And the supervisor, through the reviewer arm — the same SECURITY DEFINER
    // function that gates the review action gates the visibility.
    const supervisor = sqlAsAppUser(
      `SELECT count(*) FROM field_records WHERE id = '${record.id}';`,
      { userId: USERS.logSupervisor.id, companyId: COMPANY_ID },
    )
    expect(lastLine(supervisor.output), 'the book supervisor sees what they must review').toBe('1')
  })

  test('log entries do not leak across tenants', async ({ browser }) => {
    const page = await pool.page(browser, AUTH.logOperator)
    const record = await submitEntry(page, {
      book: OPS,
      values: { Operator: uniqueTag('J7T'), Reading: '17.0', Note: 'E2ELAB only' },
      submitterId: USERS.logOperator.id,
    })

    const other = sqlAsAppUser(`SELECT count(*) FROM field_records WHERE id = '${record.id}';`, {
      userId: USERS.logOperator.id,
      companyId: '00000000-0000-4000-8000-00000000dead',
    })
    expect(lastLine(other.output), 'the same user under another company sees nothing').toBe('0')

    const books = sqlAsAppUser(`SELECT count(*) FROM log_books WHERE id = '${OPS.id}';`, {
      userId: USERS.logOperator.id,
      companyId: '00000000-0000-4000-8000-00000000dead',
    })
    expect(lastLine(books.output), 'log books are tenant-scoped the same way').toBe('0')
  })
})
