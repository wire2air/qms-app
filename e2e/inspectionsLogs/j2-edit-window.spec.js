// IL-J2 — The edit window: the module's central promise.
//
// A log entry is immutable evidence, but a floor user typing on a tablet needs
// a moment to fix a transposed digit. The compromise is a window: the
// submitter, and only the submitter, may rewrite their own entry until it
// closes — after which the only route is a signed amendment (IL-J4).
//
// Both halves are tested against the SERVER, not the button. The Edit control
// disappearing is a UX courtesy; the claim that matters is that the same edit
// is refused when replayed straight at the endpoint the button calls.
//
// The clock is moved rather than waited out. `expireEditWindow` performs the
// same write the worker's `finalize_field_record_locks` cron performs a minute
// after any window lapses — back-date `lock_at`, reason TIMER, status LOCKED —
// and the refusal then comes from the product's own `isLockedForEdit` check.
// Nothing about the guard is stubbed; only the two hours are skipped.
import { test, expect } from '@playwright/test'
import { AUTH, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import {
  createPersonaPool,
  currentPayload,
  editEntry,
  errorMessage,
  expireEditWindow,
  findRecord,
  openEntry,
  restPatchRecord,
  revisionsOf,
  signaturesOf,
  submitEntry,
  uniqueTag,
} from '../fixtures/inspectionsLogs.js'

const OPS = INSPECTIONS_LOGS.operations

const pool = createPersonaPool()
test.afterAll(() => pool.close())

test.describe('IL-J2 — the edit window opens, then closes', () => {
  test('the submitter corrects their own entry inside the window — a new revision, no signature', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.logOperator)

    const tag = uniqueTag('J2')
    const record = await submitEntry(page, {
      book: OPS,
      values: { Operator: tag, Reading: '19.0', Note: 'First pass' },
      submitterId: USERS.logOperator.id,
    })

    await editEntry(page, record.id, { Reading: '19.4', Note: 'Corrected the transposed digit' })

    const revisions = revisionsOf(record.id)
    expect(revisions, 'the correction appends, it does not overwrite').toHaveLength(2)
    expect(revisions[0].revisionType).toBe('INITIAL_SUBMIT')
    expect(revisions[1].revisionType).toBe('USER_EDIT')
    expect(revisions[1].authorUserId).toBe(USERS.logOperator.id)

    // The point of the cheap path: no ceremony. An in-window correction is not
    // a Part-11 event, so no signature is minted for it.
    expect(revisions[1].signed, 'an in-window edit is not signed').toBe(false)
    expect(signaturesOf(record.id), 'and mints no signature row').toHaveLength(0)

    // The ORIGINAL value survives in revision 1 — that is what makes the edit
    // auditable rather than a silent rewrite.
    expect(revisions[0].payload[OPS.fields.reading.name]).toBe('19.0')
    expect(currentPayload(record.id), 'the current view shows the correction').toMatchObject({
      [OPS.fields.reading.name]: '19.4',
      [OPS.fields.note.name]: 'Corrected the transposed digit',
    })

    const after = findRecord(record.id)
    expect(after.currentRevisionId, 'current_revision_id advanced to the edit').not.toBe(
      record.currentRevisionId,
    )
    expect(after.statusId, 'an edit does not move the entry out of SUBMITTED').toBe('SUBMITTED')
  })

  test('once the window closes the edit is gone from the UI and refused by the server', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J2L')
    const record = await submitEntry(page, {
      book: OPS,
      values: { Operator: tag, Reading: '20.0', Note: 'Sealed by the timer' },
      submitterId: USERS.logOperator.id,
    })

    expireEditWindow(record.id)

    // The browser is NOT told about that write directly — but `field_records`
    // carries the audit trigger, so the row change enqueues an audit event, the
    // sync service broadcasts it, and the syncEngine refetches the record into
    // this context's IndexedDB. Waiting for the button to go is waiting for that
    // whole path, which is the one a real user's open tab depends on.
    await openEntry(page, record.id)
    await expect(
      page.getByRole('button', { name: 'Edit', exact: true }),
      'the edit affordance is withdrawn once the window has passed',
    ).toHaveCount(0, { timeout: 45_000 })

    // The real assertion: replay the request the button would have sent.
    const res = await restPatchRecord(page, record.id, {
      payload: { [OPS.fields.operator.name]: tag, [OPS.fields.reading.name]: '999' },
    })
    // Read the body BEFORE closing the context — closing disposes the response
    // and `res.text()` then throws "Response has been disposed", which surfaces
    // as a failure that has nothing to do with the assertion.
    const status = res.status()
    const message = await errorMessage(res)
    expect(status, 'the server refuses the edit on its own').toBe(400)
    expect(message).toMatch(/no longer editable/i)

    expect(revisionsOf(record.id), 'and no revision was written').toHaveLength(1)
    expect(currentPayload(record.id)[OPS.fields.reading.name], 'the value is untouched').toBe('20.0')
    expect(findRecord(record.id).statusId, 'the entry has sealed itself').toBe('LOCKED')
  })

  test('the in-window edit belongs to the submitter alone — even an amend-holder is refused', async ({
    browser,
  }) => {
    const opPage = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J2O')
    const record = await submitEntry(opPage, {
      book: OPS,
      values: { Operator: tag, Reading: '18.2', Note: 'Someone else’s entry' },
      submitterId: USERS.logOperator.id,
    })

    // logAdmin holds field_records:amend, void and read_all — strictly more
    // than the operator — and still cannot use the cheap path. The separation
    // is deliberate: an administrator's change to someone else's record must
    // carry a reason and a signature, which is exactly what amend is.
    const adminPage = await pool.page(browser, AUTH.logAdmin)
    const res = await restPatchRecord(adminPage, record.id, {
      payload: { [OPS.fields.reading.name]: '0.1' },
    })
    const status = res.status()
    const message = await errorMessage(res)

    expect(status).toBe(403)
    expect(message).toMatch(/only the original submitter/i)
    expect(revisionsOf(record.id), 'nothing was appended').toHaveLength(1)
  })
})
