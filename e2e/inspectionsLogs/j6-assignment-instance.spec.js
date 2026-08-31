// IL-J6 — Scheduled work: filling an assignment instance.
//
// A form assignment is the plan ("this book, these people, this cadence"); an
// assignment instance is one occurrence of it that a named person owes. Filling
// the linked entry is what discharges it, and the whole point is that the two
// move together IN ONE TRANSACTION — the record is written, the instance flips
// to COMPLETED pointing back at it, and the unified-inbox task closes. A
// half-applied version of that is a compliance record that says an inspection
// was never done when it was, or the reverse.
//
// The instance is minted in SQL (see `createDueInstance` for why: instances come
// from a 5-minute worker cron, no endpoint creates one, and an instance is
// consumed the first time it is filled so it cannot be a static seed row). The
// row is written exactly as the worker writes it, so every precondition the
// service checks sees its real shape.
import { test, expect } from '@playwright/test'
import { AUTH, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import {
  createDueInstance,
  createPersonaPool,
  errorMessage,
  findInstance,
  findRecord,
  restPost,
  submitEntry,
  uniqueTag,
} from '../fixtures/inspectionsLogs.js'

const OPS = INSPECTIONS_LOGS.operations

const pool = createPersonaPool()
test.afterAll(() => pool.close())

test.describe('IL-J6 — scheduled assignment instances', () => {
  test('filling the entry discharges the instance and links the two both ways', async ({
    browser,
  }) => {
    const instance = createDueInstance({ book: OPS, userId: USERS.logOperator.id })
    expect(instance.statusId).toBe('DUE')

    const page = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J6')
    const record = await submitEntry(page, {
      book: OPS,
      values: { Operator: tag, Reading: '25.0', Note: 'Scheduled round' },
      submitterId: USERS.logOperator.id,
      assignmentInstanceId: instance.id,
    })

    expect(record.assignmentInstanceId, 'the entry knows which occurrence it discharged').toBe(
      instance.id,
    )

    const after = findInstance(instance.id)
    expect(after.statusId, 'and the occurrence closes').toBe('COMPLETED')
    expect(after.completedRecordId, 'pointing back at the entry that closed it').toBe(record.id)
    expect(after.completedAt).toBeTruthy()
  })

  test('an instance belongs to its assignee — nobody else can discharge it', async ({ browser }) => {
    // Assigned to the SUPERVISOR; the operator tries to close it with an entry
    // of their own. Both are targets of the same plan, so this is not a
    // question of who may file into the book — it is a question of whose
    // scheduled obligation this occurrence is.
    const instance = createDueInstance({ book: OPS, userId: USERS.logSupervisor.id })

    const page = await pool.page(browser, AUTH.logOperator)
    const res = await restPost(page, '/fieldRecords', {
      logBookId: OPS.id,
      payload: { [OPS.fields.operator.name]: uniqueTag('J6X'), [OPS.fields.reading.name]: '1' },
      assignmentInstanceId: instance.id,
    })
    const status = res.status()
    const message = await errorMessage(res)

    expect(status).toBe(403)
    expect(message).toMatch(/not the assignee/i)
    expect(findInstance(instance.id).statusId, 'the obligation is still outstanding').toBe('DUE')
  })

  test('an occurrence can only be discharged once', async ({ browser }) => {
    const instance = createDueInstance({ book: OPS, userId: USERS.logOperator.id })

    const page = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J6D')
    const first = await submitEntry(page, {
      book: OPS,
      values: { Operator: tag, Reading: '26.0', Note: 'First and only' },
      submitterId: USERS.logOperator.id,
      assignmentInstanceId: instance.id,
    })
    expect(findInstance(instance.id).statusId).toBe('COMPLETED')

    // The same assignee, the same book, the same closed occurrence. The service
    // gates on DUE/OVERDUE, so a second entry cannot re-point it — which is what
    // stops one round of work from being credited against two scheduled slots.
    const res = await restPost(page, '/fieldRecords', {
      logBookId: OPS.id,
      payload: { [OPS.fields.operator.name]: `${tag}-again`, [OPS.fields.reading.name]: '27.0' },
      assignmentInstanceId: instance.id,
    })
    const status = res.status()
    const message = await errorMessage(res)

    expect(status).toBe(400)
    expect(message).toMatch(/COMPLETED and cannot accept a submission/i)
    expect(
      findInstance(instance.id).completedRecordId,
      'still credited to the first entry',
    ).toBe(first.id)
    expect(findRecord(first.id).statusId).toBe('SUBMITTED')
  })

  test('an entry cannot be filed against an instance from a different log book', async ({
    browser,
  }) => {
    // The instance belongs to the CONTROLLED book's plan; the submission names
    // the OPERATIONS book. Without this check a scheduled controlled-record
    // inspection could be discharged by an unrelated operational log entry —
    // the paperwork would balance and the work would not have been done.
    const instance = createDueInstance({
      book: INSPECTIONS_LOGS.controlled,
      userId: USERS.logOperator.id,
    })

    const page = await pool.page(browser, AUTH.logOperator)
    const res = await restPost(page, '/fieldRecords', {
      logBookId: OPS.id,
      payload: { [OPS.fields.operator.name]: uniqueTag('J6M'), [OPS.fields.reading.name]: '2' },
      assignmentInstanceId: instance.id,
    })
    const status = res.status()
    const message = await errorMessage(res)

    expect(status).toBe(400)
    expect(message).toMatch(/does not match the assignment instance/i)
    expect(findInstance(instance.id).statusId).toBe('DUE')
  })
})
