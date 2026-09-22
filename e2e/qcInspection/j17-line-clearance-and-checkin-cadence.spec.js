// PW-J17 — The line-clearance gate, and in-process check-in / collection
// cadence (URS-QCI-11 and URS-QCI-12; OQ-09 TC-09-11 and TC-09-12).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// URS-QCI-11 was the module's only NOT AUTOMATED row: "Line-clearance gate
// ships disabled; no test enables or probes it." URS-QCI-12 was PARTIAL —
// "Not covered: takeover attribution."
//
// Both gaps have the same shape: the control exists and works, but exercising
// it needs a precondition no journey had ever set up. This file sets both up.
//
// ── LINE CLEARANCE: WHY NOTHING PROBED IT ──────────────────────────────────
//
// `inspectionBatchService.assertBatchClearance` opens with
//
//     const template = await getLineClearanceTemplate(companyId, transaction)
//     if (!template?.config?.lineClearanceRequired) return
//
// — two early exits. In a tenant created by `bootstrapCompanyDefaults` the
// template EXISTS but ships `lineClearanceRequired: false`, so the second exit
// fires and every collection sails through. OQ-09 TC-09-11's own prerequisite
// note says exactly this: "line clearance is OFF by default. Turn it on before
// you start, or every 'refused' step below will pass samples through."
//
// So this file turns it on, runs the gate, and turns it off again. The toggle
// is the real product setting — the one the Line Clearance settings screen
// writes — not a stub, and `afterAll` restores it because leaving it ON would
// break every OTHER in-process journey in the suite (PW-J2 collects samples
// and would start being refused).
//
// The template row itself is created if the tenant has none, because the E2E
// tenant is seeded by SQL rather than bootstrapped. It is then LEFT IN PLACE:
// `form_templates` is sealed against deletion once activated
// (`form_templates_protect_referenced` refuses any DELETE of a row carrying an
// `internal_name`), and `enforce_form_template_integrity` refuses to clear the
// internal name of a promoted module. Restoring the FLAG is both possible and
// sufficient — an off-by-default clearance template is precisely what a
// bootstrapped production tenant has.
//
// ── TAKEOVER: WHY IT NEEDS A DB-BORN PRECONDITION ──────────────────────────
//
// TC-09-12 step 2 wants a SECOND inspector to take over. `inspection_qc:execute`
// is held by exactly one persona in the cast (`qcInspector`) — qcApprover holds
// read+dispose, qcAuthor holds read+create. Adding a second execute-holder means
// editing the shared seed, which is off-limits while other suites run against
// it. So the prior holder is seeded directly onto the row: `assigned_to` is an
// ordinary FK, not a lifecycle column, so writing it as the superuser does not
// touch `enforce_inspection_lot_lifecycle` and the lot is BORN with another
// inspector in the slot. The takeover itself then runs through the real
// `POST /check-in` route, which is the code path under test.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, QC, USERS } from '../fixtures/cast.js'
import { createLotViaRest, findLotByNumber } from '../fixtures/qcInspection.js'
import { sql, sqlValue } from '../fixtures/db.js'

const LOT_TAG = 'J17'
const LC_INTERNAL_NAME = 'QC_LINE_CLEARANCE'

function purgeJ17Lots() {
  const lotScope = `SELECT id FROM inspection_lots
     WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%'`
  sql(`
    DELETE FROM inspection_results WHERE inspection_lot_id IN (${lotScope});
    DELETE FROM inspection_samples WHERE inspection_lot_id IN (${lotScope});
    DELETE FROM inspection_lot_events WHERE inspection_lot_id IN (${lotScope});
    UPDATE inspection_lots SET active_batch_id = NULL
     WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%';
    DELETE FROM inspection_batches WHERE inspection_lot_id IN (${lotScope});
    DELETE FROM inspection_lots
     WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%';
  `)
}

/** The tenant's line-clearance checklist id, creating an off-by-default one if absent. */
function ensureLineClearanceTemplate() {
  const existing = sqlValue(
    `SELECT id FROM form_templates
      WHERE company_id = '${COMPANY_ID}' AND internal_name = '${LC_INTERNAL_NAME}'
        AND deleted_at IS NULL LIMIT 1`,
  )
  if (existing) return existing
  // Mirrors what bootstrapCompanyDefaults creates for a real tenant: an ACTIVE
  // checklist with the requirement switched OFF. The schema is deliberately
  // empty — `validateClearanceAnswers` has nothing to demand, which keeps this
  // file about the GATE rather than about form validation.
  return sqlValue(
    `INSERT INTO form_templates
       (title, code, schema, config, company_id, internal_name, status_id, created_at, updated_at)
     VALUES ('E2E Line Clearance', 'E2E-LINE-CLEARANCE', '[]'::jsonb,
             '{"lineClearanceRequired": false}'::jsonb, '${COMPANY_ID}',
             '${LC_INTERNAL_NAME}', 'ACTIVE', now(), now())
     RETURNING id`,
  )
}

/** Flip the tenant-wide requirement. Restored to `false` in afterAll. */
function setLineClearanceRequired(required) {
  sql(
    `UPDATE form_templates
        SET config = jsonb_set(coalesce(config, '{}'::jsonb), '{lineClearanceRequired}', '${required}'::jsonb)
      WHERE company_id = '${COMPANY_ID}' AND internal_name = '${LC_INTERNAL_NAME}'`,
  )
}

/** Lot event types in order — the History panel's own vocabulary. */
function lotEventTypes(lotId) {
  const out = sql(
    `SELECT event_type FROM inspection_lot_events
      WHERE inspection_lot_id = '${lotId}' ORDER BY created_at, id`,
  )
  return out ? out.split('\n') : []
}

/** Create an IN_PROCESS lot, check in and start it. Returns the lot row. */
async function startedInProcessLot(page, suffix) {
  const lot = await createLotViaRest(page, {
    lotNumber: `E2E-LOT-${LOT_TAG}-${suffix}-${Date.now()}`,
    inspectionPoint: 'IN_PROCESS',
  })
  const checkIn = await page.request.post(
    `/api/v1/services/qcInspection/lots/${lot.id}/check-in`,
    { data: {} },
  )
  expect(checkIn.ok(), `check-in failed: ${await checkIn.text()}`).toBeTruthy()
  // Collection is only legal while IN_PROGRESS, and check-in alone does not
  // start the run.
  const start = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/start`, {
    data: {},
  })
  expect(start.ok(), `start failed: ${await start.text()}`).toBeTruthy()
  return lot
}

test.describe('PW-J17 — line clearance gates collection; check-in owns attribution', () => {
  test.use({ storageState: AUTH.qcInspector })

  test.beforeAll(() => {
    purgeJ17Lots()
    ensureLineClearanceTemplate()
  })

  test.afterAll(() => {
    // Restore FIRST, purge second. Leaving the requirement ON would make every
    // other in-process journey in the suite (PW-J2) start failing its
    // collections — a cross-file break that would be miserable to trace back
    // here. The restore must therefore survive a purge that throws.
    setLineClearanceRequired(false)
    purgeJ17Lots()
  })

  test('the default is OFF, and with it off collection is permitted with no clearance at all', async ({
    page,
  }) => {
    // The OQ prerequisite note, executable. This is the reason URS-QCI-11 could
    // not simply be tested: the shipped default makes every "refused" step pass
    // samples through, so a test written without this precondition would record
    // a false PASS against a control that never ran.
    setLineClearanceRequired(false)
    expect(
      sqlValue(
        `SELECT (config->>'lineClearanceRequired') FROM form_templates
          WHERE company_id = '${COMPANY_ID}' AND internal_name = '${LC_INTERNAL_NAME}'`,
      ),
      'the checklist ships NOT required',
    ).toBe('false')

    const lot = await startedInProcessLot(page, 'OFF')
    const batchId = sqlValue(`SELECT active_batch_id FROM inspection_lots WHERE id = '${lot.id}'`)
    // The batch minted alongside the lot carries no clearance at all (NULL);
    // one added later through `addBatch` gets the column default NOT_STARTED.
    // Both are "uncleared" and both must be refused, so the assertion accepts
    // either rather than pinning which constructor made this batch.
    expect(
      ['', 'NOT_STARTED'],
      'the production lot has no clearance recorded',
    ).toContain(sqlValue(`SELECT coalesce(line_clearance_status, '') FROM inspection_batches WHERE id = '${batchId}'`))

    const collected = await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/samples`,
      { data: { count: 1 } },
    )
    expect(
      collected.ok(),
      'with the requirement off, an uncleared line still yields samples — this is the shipped default',
    ).toBeTruthy()
  })

  test('with clearance REQUIRED the gate blocks, a Hold does not lift it, and a Release does', async ({
    page,
  }) => {
    // OQ-09 TC-09-11 steps 1–5 and 7, in order.
    setLineClearanceRequired(true)
    const lot = await startedInProcessLot(page, 'GATE')
    const batchId = sqlValue(`SELECT active_batch_id FROM inspection_lots WHERE id = '${lot.id}'`)
    expect(batchId, 'the lot opened with a production lot').toBeTruthy()

    // Step 1 — uncleared line, collection refused. This is the whole point:
    // line clearance is a PREVENTIVE control. A warning would not do.
    const blocked = await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/samples`,
      { data: { count: 1 } },
    )
    expect(blocked.ok(), 'collection is refused until the line is cleared').toBeFalsy()
    expect((await blocked.json())?.error?.message ?? '', 'and the refusal says why').toMatch(
      /Line clearance must be completed and passed for this production lot before collecting samples/,
    )
    expect(
      Number(sqlValue(`SELECT count(*) FROM inspection_samples WHERE inspection_lot_id = '${lot.id}'`)),
      'nothing was pulled off the line',
    ).toBe(0)

    // Step 2 — record a HOLD. Attributed and timestamped.
    const hold = await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/batches/${batchId}/line-clearance`,
      { data: { decision: 'FAILED', payload: {} } },
    )
    expect(hold.ok(), `recording a hold failed: ${await hold.text()}`).toBeTruthy()
    expect(
      sqlValue(`SELECT line_clearance_status FROM inspection_batches WHERE id = '${batchId}'`),
      'the hold is on the production lot',
    ).toBe('FAILED')
    expect(
      sqlValue(`SELECT line_clearance_by FROM inspection_batches WHERE id = '${batchId}'`),
      'attributed to the inspector who made the call',
    ).toBe(USERS.qcInspector.id)
    expect(
      sqlValue(`SELECT line_clearance_at IS NOT NULL FROM inspection_batches WHERE id = '${batchId}'`),
      'and timestamped',
    ).toBe('t')

    // Step 3 — STILL refused. A recorded decision is not a passed decision, and
    // this is the step most likely to regress if someone ever narrows the guard
    // to "has a clearance been recorded?".
    const stillBlocked = await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/samples`,
      { data: { count: 1 } },
    )
    expect(
      stillBlocked.ok(),
      'a HELD line is still a blocked line — recording the decision is not passing it',
    ).toBeFalsy()

    // Step 4 — record a RELEASE.
    const release = await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/batches/${batchId}/line-clearance`,
      { data: { decision: 'PASSED', payload: {} } },
    )
    expect(release.ok(), `recording a release failed: ${await release.text()}`).toBeTruthy()
    expect(
      sqlValue(`SELECT line_clearance_status FROM inspection_batches WHERE id = '${batchId}'`),
      'the line is cleared',
    ).toBe('PASSED')

    // Step 5 — now permitted.
    const permitted = await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/samples`,
      { data: { count: 1 } },
    )
    expect(permitted.ok(), `collection after release failed: ${await permitted.text()}`).toBeTruthy()
    expect(
      Number(sqlValue(`SELECT count(*) FROM inspection_samples WHERE inspection_lot_id = '${lot.id}'`)),
      'one unit pulled',
    ).toBe(1)

    // Step 7 — BOTH decisions remain on the record. The hold is not overwritten
    // out of history by the release; the timeline carries the sequence, which
    // is what makes a re-clearance auditable.
    expect(
      lotEventTypes(lot.id),
      'the hold and the release both survive on the lot timeline, in order',
    ).toEqual([
      'LOT_CREATED',
      'BATCH_ADDED',
      'CHECKED_IN',
      'STARTED',
      'LINE_CLEARANCE_FAILED',
      'LINE_CLEARANCE_PASSED',
      'SAMPLES_COLLECTED',
    ])
    expect(
      sqlValue(
        `SELECT count(*) FROM inspection_lot_events
          WHERE inspection_lot_id = '${lot.id}' AND event_type LIKE 'LINE_CLEARANCE_%'
            AND actor_user_id IS NULL`,
      ),
      'each clearance decision names who made it',
    ).toBe('0')

    // Hand the tenant back in its shipped state — see the note in the
    // changeover test: this flag is tenant-wide, so leaving it on leaks into
    // the next test's preconditions.
    setLineClearanceRequired(false)
  })

  test('a NEW production lot on a cleared inspection needs its own clearance', async ({ page }) => {
    // OQ-09 TC-09-11 step 6. This is the step that distinguishes a per-BATCH
    // control from a per-INSPECTION one — and it is the one a naive
    // implementation gets wrong, by remembering that "this inspection was
    // cleared" and waving the changeover through.
    setLineClearanceRequired(true)
    const lot = await startedInProcessLot(page, 'CHANGEOVER')
    const firstBatch = sqlValue(`SELECT active_batch_id FROM inspection_lots WHERE id = '${lot.id}'`)

    await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/batches/${firstBatch}/line-clearance`,
      { data: { decision: 'PASSED', payload: {} } },
    )
    const first = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/samples`, {
      data: { count: 1 },
    })
    expect(first.ok(), 'the first production lot is cleared and collecting').toBeTruthy()

    // Line changeover: a second production lot, made active.
    const added = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/batches`, {
      data: { lotNumber: 'PL-J17-SECOND', setActive: true },
    })
    expect(added.ok(), `adding a production lot failed: ${await added.text()}`).toBeTruthy()
    const secondBatch = sqlValue(`SELECT active_batch_id FROM inspection_lots WHERE id = '${lot.id}'`)
    expect(secondBatch, 'the new production lot is now active').not.toBe(firstBatch)
    // NOT_STARTED is the column default a newly added production lot carries —
    // NOT the PASSED of the lot it replaced, which is the whole point.
    expect(
      sqlValue(
        `SELECT coalesce(line_clearance_status, '') FROM inspection_batches WHERE id = '${secondBatch}'`,
      ),
      'and it arrives uncleared, not inheriting the previous lot\'s release',
    ).toBe('NOT_STARTED')

    const refused = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/samples`, {
      data: { count: 1 },
    })
    expect(
      refused.ok(),
      'the earlier lot\'s clearance does not carry over — the new line must be cleared on its own',
    ).toBeFalsy()
    expect((await refused.json())?.error?.message ?? '').toMatch(/Line clearance must be completed/)

    // And clearing THAT lot lifts the gate again, so this is a real per-batch
    // gate rather than a one-shot that jammed.
    await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/batches/${secondBatch}/line-clearance`,
      { data: { decision: 'PASSED', payload: {} } },
    )
    const afterSecond = await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/samples`,
      { data: { count: 1 } },
    )
    expect(afterSecond.ok(), 'clearing the new line resumes collection').toBeTruthy()

    // Hand the tenant back in its shipped state. `afterAll` does this too, but
    // that only runs once at the end of the file — and the requirement is
    // tenant-wide, so leaving it on here would gate the next test's very first
    // collection before that test's own `setLineClearanceRequired(false)` has
    // any chance to matter for a batch already created.
    setLineClearanceRequired(false)
  })

  test('takeover is explicit and names the inspector it took over from', async ({ page }) => {
    // OQ-09 TC-09-12 steps 1 and 2 — "Takeover is explicit; the record shows
    // who was responsible for each period."
    setLineClearanceRequired(false)
    const lot = await createLotViaRest(page, {
      lotNumber: `E2E-LOT-${LOT_TAG}-TAKEOVER-${Date.now()}`,
      inspectionPoint: 'IN_PROCESS',
    })

    // Step 1 — check in, recording the shift. Shift is part of the claim: the
    // record is meant to say who held the inspection during WHICH period.
    const checkIn = await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/check-in`,
      { data: { shiftId: QC.shift.id } },
    )
    expect(checkIn.ok(), `check-in failed: ${await checkIn.text()}`).toBeTruthy()
    expect(
      sqlValue(`SELECT assigned_to FROM inspection_lots WHERE id = '${lot.id}'`),
      'the inspector holds the slot',
    ).toBe(USERS.qcInspector.id)
    expect(
      sqlValue(`SELECT shift_id FROM inspection_lots WHERE id = '${lot.id}'`),
      'and the shift is on the record',
    ).toBe(QC.shift.id)

    const firstEvent = JSON.parse(
      sqlValue(
        `SELECT payload::text FROM inspection_lot_events
          WHERE inspection_lot_id = '${lot.id}' AND event_type = 'CHECKED_IN'
          ORDER BY created_at DESC LIMIT 1`,
      ),
    )
    expect(firstEvent.previousInspector, 'nobody held it before — an opening claim, not a takeover').toBeNull()
    expect(firstEvent.shiftId, 'the check-in event records the shift claimed').toBe(QC.shift.id)

    // Step 2 — the takeover. The cast holds exactly ONE inspection_qc:execute
    // persona, so the PRIOR holder is seeded onto the row rather than acted by
    // a second browser context. `assigned_to` is an ordinary FK, not one of the
    // four lifecycle columns `enforce_inspection_lot_lifecycle` guards, so this
    // does not slip past a trigger — there is no trigger on this column to slip
    // past. The takeover itself runs through the real POST /check-in.
    sql(
      `UPDATE inspection_lots SET assigned_to = '${USERS.qcAuthor.id}' WHERE id = '${lot.id}'`,
    )
    expect(
      sqlValue(`SELECT assigned_to FROM inspection_lots WHERE id = '${lot.id}'`),
      'another inspector now holds the slot',
    ).toBe(USERS.qcAuthor.id)

    const takeover = await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/check-in`,
      { data: {} },
    )
    expect(takeover.ok(), `takeover failed: ${await takeover.text()}`).toBeTruthy()

    // ATTRIBUTION — the point of the whole test. The takeover is not a silent
    // reassignment: the event names both ends, so the record answers "who was
    // responsible during which period" rather than only "who holds it now".
    const takeoverEvent = JSON.parse(
      sqlValue(
        `SELECT payload::text FROM inspection_lot_events
          WHERE inspection_lot_id = '${lot.id}' AND event_type = 'CHECKED_IN'
          ORDER BY created_at DESC LIMIT 1`,
      ),
    )
    expect(
      takeoverEvent.previousInspector,
      'the takeover names the inspector it took over FROM',
    ).toBe(USERS.qcAuthor.id)
    expect(
      sqlValue(
        `SELECT actor_user_id FROM inspection_lot_events
          WHERE inspection_lot_id = '${lot.id}' AND event_type = 'CHECKED_IN'
          ORDER BY created_at DESC LIMIT 1`,
      ),
      'and names the inspector who took it over',
    ).toBe(USERS.qcInspector.id)
    expect(
      sqlValue(`SELECT assigned_to FROM inspection_lots WHERE id = '${lot.id}'`),
      'the slot moved',
    ).toBe(USERS.qcInspector.id)

    // Both periods survive as two events, so the handover is reconstructable.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM inspection_lot_events
            WHERE inspection_lot_id = '${lot.id}' AND event_type = 'CHECKED_IN'`,
        ),
      ),
      'two check-in events: the original claim and the takeover',
    ).toBe(2)
  })

  test('check-in is execute-only, and collection timestamps are the server\'s, not the client\'s', async ({
    browser,
  }) => {
    // OQ-09 TC-09-12 step 6 ("collection timestamps are server-generated and
    // cannot be edited by the inspector") and step 7 (samples either side of a
    // production-lot change are attributed to the correct lot).
    setLineClearanceRequired(false)
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()
    const lot = await startedInProcessLot(page, 'STAMP')
    const firstBatch = sqlValue(`SELECT active_batch_id FROM inspection_lots WHERE id = '${lot.id}'`)

    // Step 6 — a forged timestamp and a forged collector are both ignored. The
    // route's Zod schema (`collectSamplesSchema`) admits only `count` and
    // `notes`, and `addSamples` stamps `collectedAt: now` and
    // `collectedBy: user.id` itself. Sending the extra keys anyway is the only
    // way to prove they are inert rather than merely absent from the UI.
    const before = new Date()
    const forged = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/samples`, {
      data: {
        count: 1,
        collectedAt: '2001-01-01T00:00:00Z',
        collectedBy: USERS.qcAuthor.id,
      },
    })
    expect(forged.ok(), `collection failed: ${await forged.text()}`).toBeTruthy()

    expect(
      sqlValue(
        `SELECT collected_at > '${before.toISOString()}'::timestamptz
           FROM inspection_samples WHERE inspection_lot_id = '${lot.id}' ORDER BY sample_no LIMIT 1`,
      ),
      'the stamp is server time, not the 2001 date the client sent',
    ).toBe('t')
    expect(
      sqlValue(
        `SELECT collected_by FROM inspection_samples
          WHERE inspection_lot_id = '${lot.id}' ORDER BY sample_no LIMIT 1`,
      ),
      'and the collector is the acting inspector, not the one the client named',
    ).toBe(USERS.qcInspector.id)

    // Step 7 — change the production lot, collect again, and check each unit
    // went to the right one. Attribution across a changeover is the thing an
    // investigator relies on when a batch is later recalled.
    const added = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/batches`, {
      data: { lotNumber: 'PL-J17-AFTER', setActive: true },
    })
    expect(added.ok(), `changeover failed: ${await added.text()}`).toBeTruthy()
    const secondBatch = sqlValue(`SELECT active_batch_id FROM inspection_lots WHERE id = '${lot.id}'`)
    expect(secondBatch).not.toBe(firstBatch)

    const after = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/samples`, {
      data: { count: 1 },
    })
    expect(after.ok(), `post-changeover collection failed: ${await after.text()}`).toBeTruthy()

    expect(
      sqlValue(
        `SELECT batch_id FROM inspection_samples
          WHERE inspection_lot_id = '${lot.id}' ORDER BY sample_no LIMIT 1`,
      ),
      'the unit pulled BEFORE the changeover stays with the first production lot',
    ).toBe(firstBatch)
    expect(
      sqlValue(
        `SELECT batch_id FROM inspection_samples
          WHERE inspection_lot_id = '${lot.id}' ORDER BY sample_no DESC LIMIT 1`,
      ),
      'and the unit pulled AFTER it belongs to the second',
    ).toBe(secondBatch)
    await ctx.close()

    // Step 1's gate, from the other side: check-in is `inspection_qc:execute`,
    // so the QA approver — who holds read + dispose — cannot claim the
    // inspection at all, and therefore can never appear in its attribution.
    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()
    const qaAttempt = await qa.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/check-in`,
      { data: {} },
    )
    expect(qaAttempt.status(), 'a dispose-holder cannot take over an inspection').toBe(403)
    expect(
      findLotByNumber(lot.lotNumber),
      'and the lot still exists to be asserted against',
    ).not.toBeNull()
    expect(
      sqlValue(`SELECT assigned_to FROM inspection_lots WHERE id = '${lot.id}'`),
      'the slot did not move',
    ).toBe(USERS.qcInspector.id)
    await qaCtx.close()
  })

  test('DOCUMENTED GAP — the sampling interval is advisory: a second collection immediately after the first is permitted', async ({
    page,
  }) => {
    // OQ-09 TC-09-12 steps 4 and 5, and the note beneath them: "The sampling
    // plan's collection interval is ADVISORY. It guides and pre-fills the
    // collect-samples action; it does not restrict when a collection may be
    // made… There is also no surface anywhere that shows a next-collection due
    // time."
    //
    // This is NOT automated as a defect probe, because the product claims no
    // such control — §12's own note calls the cadence "not implemented rather
    // than untested". It is automated as a BOUNDARY: the row can only be read
    // as "correctly unenforced" if something checks that it stays unenforced
    // and that no due-time column quietly appeared. If a cadence gate is ever
    // added, this test fails and someone has to decide deliberately whether
    // the OQ's N/A justification still stands.
    // Arrange this test's own precondition. The clearance requirement is
    // TENANT-WIDE state that the tests above flip on, so switching it off is
    // not optional housekeeping — with it left on, the very first collection
    // below is refused and the cadence claim is never reached.
    setLineClearanceRequired(false)
    const lot = await startedInProcessLot(page, 'CADENCE')

    const first = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/samples`, {
      data: { count: 1 },
    })
    expect(
      first.ok(),
      `the first collection is taken (clearance requirement is off): ${await first.text()}`,
    ).toBeTruthy()

    // Immediately again — no wait, no interval respected.
    const immediate = await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/samples`,
      { data: { count: 1 } },
    )
    expect(
      immediate.ok(),
      'a second collection taken immediately is PERMITTED — the interval is guidance, not a gate',
    ).toBeTruthy()
    expect(
      Number(sqlValue(`SELECT count(*) FROM inspection_samples WHERE inspection_lot_id = '${lot.id}'`)),
      'both units were appended',
    ).toBe(2)

    // Step 5 — nothing anywhere records when the next collection is due. Stated
    // structurally, against the schema, so it survives any amount of UI churn:
    // the sample and lot tables carry no due/next/overdue column to render.
    const dueColumns = sql(
      `SELECT table_name || '.' || column_name FROM information_schema.columns
        WHERE table_name IN ('inspection_samples', 'inspection_lots', 'inspection_batches')
          AND (column_name LIKE '%due%' OR column_name LIKE '%next_collect%'
               OR column_name LIKE '%overdue%')`,
    )
    expect(
      dueColumns,
      'no next-collection due time is stored anywhere, so none can be displayed (TC-09-12 step 5 is N/A)',
    ).toBe('')

    test.info().annotations.push({
      type: 'documented-gap',
      description:
        'QCI-12 steps 4/5: the sampling plan collection interval is advisory — it pre-fills the ' +
        'collect dialog and never restricts timing — and no due/approaching/overdue surface ' +
        'exists. Not a defect: the product claims no cadence control. OQ-09 TC-09-12 marks both ' +
        'steps N/A. Controlled procedurally. This test pins the absence so a future cadence ' +
        'feature is a deliberate, visible change.',
    })
  })
})
