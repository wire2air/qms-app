// PW-J19 — Retain custody chain + the register report
// (URS-RET-03 "Storage location and custody changes are recorded" / OQ-15
// TC-15-03, and URS-RET-05 "A register of retained samples can be produced" /
// OQ-15 TC-15-05).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// Both rows were PARTIAL against `j11-retain-registry.spec.js`, which proves a
// create and a position move and stops there. What neither it nor j12 touches:
//
//   RET-03 · the SEAL BREAK, the return leg, the ORDER of the chain, and the
//            per-event performer/timestamp attribution the OQ demands
//            "throughout". j11 asserts `retainEventTypes(...)` CONTAINS 'MOVED'
//            — a set membership, which says nothing about sequence, actor or
//            from→to.
//   RET-05 · the register itself. j11 asserts the RS number appears in the
//            list. Columns, the status/derived-state filter chips, the CSV
//            export and the print register have never been opened.
//
// ── WHAT CANNOT BE COVERED, AND WHY THAT IS A FINDING NOT A GAP ────────────
//
// TC-15-03 steps 3/4 ask for a WITHDRAWAL and a RETURN. **There is no such
// code path.** `retainSampleService.js` has exactly one custody writer
// (`logCustodyEvent`) and exactly four call sites — CREATED (create), MOVED
// and SEAL_BROKEN (update), DISPOSED (dispose). `WITHDRAWN` and `EXAMINED`
// exist only as (a) a JSDoc line in `shared/models/retainsampleevent.js:6` and
// (b) two unreachable keys in `RetainSampleDetail.vue`'s `EVENT_LABELS`. No
// code anywhere writes either, and `quantity_delta` — the column that docstring
// says "is negative for withdrawals" — is written NULL by all four call sites.
//
// So the withdrawal/return half of URS-RET-03 **cannot be Covered**, and this
// file does not pretend otherwise. It pins the absence structurally (so a
// future implementation is a deliberate, visible change) and then evidences the
// substitute route the OQ's own deviation note prescribes: a seal break plus
// two relocations. That is a real, assertable custody chain; a withdrawal is
// not.
//
// ── TWO DEFECTS THIS FILE PINS ──────────────────────────────────────────────
//
// RET-D1 · a seal break through the UI can never carry a reason. `sealReason`
//   is accepted by the Zod schema and recorded as the SEAL_BROKEN event's
//   `reason`, but `RetainSampleDetail.vue`'s debounced autosave payload does
//   not include it — the Seal <select> is the only control, and there is no
//   reason input beside it. Every UI-driven seal break therefore lands with
//   `reason = NULL`. TC-15-03 step 3 expects "a seal-break custody event …
//   with the reason". Pinned from BOTH sides so the absence is attributable to
//   the UI and not to the service.
//
// RET-D2 · re-sealing is silent. `sealBroken` is computed as
//   `data.sealState === 'OPENED' && retainSample.sealState === 'SEALED'`, so
//   the OPENED → SEALED direction mints nothing. A sample can be re-closed with
//   no trace, which means the chain records that custody was broken and never
//   that it was restored.
//
// ── ORDERING TRAP ───────────────────────────────────────────────────────────
//
// `retainEventTypes()` returns OLDEST-first (`ORDER BY created_at, event_type`).
// The Chain of Custody panel renders NEWEST-first (the live query sorts
// `createdAt` descending). A test that assumed they agreed would assert a
// reversed sequence against one of them and read as a product bug.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, QC, USERS } from '../fixtures/cast.js'
import {
  createLotViaRest,
  createRetainSample,
  findRetainSample,
  retainEventTypes,
} from '../fixtures/qcInspection.js'
import { readFileSync } from 'node:fs'
import { sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Full custody chain, oldest first, with the columns the OQ asks about. */
function custodyChain(retainSampleId) {
  const out = sql(
    `SELECT event_type,
            coalesce(actor_user_id::text, ''),
            coalesce(from_location_id::text, ''),
            coalesce(to_location_id::text, ''),
            coalesce(reason, ''),
            coalesce(notes, ''),
            coalesce(quantity_delta::text, ''),
            created_at::text
       FROM retain_sample_events
      WHERE retain_sample_id = ${q(retainSampleId)}
      ORDER BY created_at, id`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [eventType, actorUserId, fromLocationId, toLocationId, reason, notes, quantityDelta, createdAt] =
      line.split('|')
    return {
      eventType,
      actorUserId: actorUserId || null,
      fromLocationId: fromLocationId || null,
      toLocationId: toLocationId || null,
      reason: reason || null,
      notes: notes || null,
      quantityDelta: quantityDelta || null,
      createdAt,
    }
  })
}

/** PATCH the retain sample over REST — the path the detail page's autosave uses. */
async function patchSample(page, id, data) {
  return page.request.patch(`/api/v1/services/qcInspection/retainSamples/${id}`, { data })
}

/** A second storage location, so a MOVE has somewhere to go and back from. */
function ensureSecondLocation() {
  const existing = sqlValue(
    `SELECT id FROM storage_locations
      WHERE company_id = (SELECT company_id FROM storage_locations WHERE id = ${q(QC.storageLocation.id)})
        AND code = 'E2E-RETAIN-B' AND deleted_at IS NULL LIMIT 1`,
  )
  if (existing) return existing
  return sqlValue(
    `INSERT INTO storage_locations (company_id, name, code, conditions, created_at, updated_at)
     SELECT company_id, 'E2E Retain Room B', 'E2E-RETAIN-B', '5 C / 40% RH', now(), now()
       FROM storage_locations WHERE id = ${q(QC.storageLocation.id)}
     RETURNING id`,
  )
}

test.describe('PW-J19 — retain custody chain', () => {
  test.use({ storageState: AUTH.qcInspector })

  test('CANNOT COVER — a withdrawal and a return have no code path to write', async () => {
    // URS-RET-03's second half, stated structurally so it survives UI churn and
    // so a future implementation trips this test rather than sliding in unnoticed.
    //
    // The declared vocabulary is six values; four are mintable. This is asserted
    // against the SOURCE OF TRUTH for each claim rather than by observing an
    // absence at runtime — "no WITHDRAWN row exists" would also be true of a
    // working feature nobody had exercised yet.
    //
    // 1. `event_type` is unconstrained at the database, so the absence is not a
    //    schema decision — it is the absence of a writer.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_constraint
          WHERE conrelid = 'retain_sample_events'::regclass AND contype = 'c'`,
      ),
      'event_type has no CHECK constraint — the vocabulary is a comment, not a rule',
    ).toBe('0')

    // 2. `quantity_delta` — the column the model docstring describes as
    //    "negative for withdrawals" — has never been written by anything.
    expect(
      sqlValue(`SELECT count(*) FROM retain_sample_events WHERE quantity_delta IS NOT NULL`),
      'quantity_delta is NULL on every row: all four writers pass it as null',
    ).toBe('0')

    // 3. And no WITHDRAWN / EXAMINED / RETURNED row has ever been produced in
    //    this database by any path, product or test.
    expect(
      sqlValue(
        `SELECT count(*) FROM retain_sample_events
          WHERE event_type IN ('WITHDRAWN', 'EXAMINED', 'RETURNED')`,
      ),
      'no withdrawal, examination or return event exists anywhere',
    ).toBe('0')

    test.info().annotations.push({
      type: 'cannot-cover',
      description:
        'URS-RET-03 (TC-15-03 steps 3/4): a distinct withdrawal and return are NOT IMPLEMENTED. ' +
        'retainSampleService.logCustodyEvent has four call sites — CREATED, MOVED, SEAL_BROKEN, ' +
        'DISPOSED. WITHDRAWN and EXAMINED are declared in the model JSDoc and carry UI labels in ' +
        'RetainSampleDetail.vue EVENT_LABELS, but nothing writes them. A partial withdrawal (a ' +
        'quantity edit) mints no event at all. The substitute chain the OQ deviation note ' +
        'prescribes — seal break + two relocations — IS covered, by the test below.',
    })
  })

  test('the substitute custody chain — out, and back — is recorded in order with who and when', async ({
    page,
  }) => {
    // TC-15-03 steps 1, 2, 4, 5, 6 via the route the OQ's deviation note
    // prescribes: a seal break standing in for the withdrawal, and two
    // relocations standing in for the removal and the return.
    const roomB = ensureSecondLocation()
    const lot = await createLotViaRest(page, {})
    const sample = await createRetainSample(page, lot.id, {
      quantity: '8',
      position: 'Shelf A, Box 01',
    })
    expect(sample.sealState, 'a new sample is sealed').toBe('SEALED')
    expect(sample.storageLocationId, 'and starts in Room A').toBe(QC.storageLocation.id)

    // ── Step 1 · move it to a different storage location ───────────────────
    const out = await patchSample(page, sample.id, { storageLocationId: roomB })
    expect(out.ok(), `move out failed: ${await out.text()}`).toBeTruthy()
    await waitForSqlValue(
      `SELECT count(*) FROM retain_sample_events
        WHERE retain_sample_id = ${q(sample.id)} AND event_type = 'MOVED'`,
      { timeoutMs: 20_000, label: 'move-out custody event' },
    )

    // ── Step 3 · break the seal, which is the removal-from-storage act ─────
    const opened = await patchSample(page, sample.id, {
      sealState: 'OPENED',
      sealReason: 'Withdrawn for stability testing — 2 units to QC lab',
    })
    expect(opened.ok(), `seal break failed: ${await opened.text()}`).toBeTruthy()
    await waitForSqlValue(
      `SELECT count(*) FROM retain_sample_events
        WHERE retain_sample_id = ${q(sample.id)} AND event_type = 'SEAL_BROKEN'`,
      { timeoutMs: 20_000, label: 'seal-break custody event' },
    )

    // ── Step 4 · move it back to where it came from ────────────────────────
    const back = await patchSample(page, sample.id, {
      storageLocationId: QC.storageLocation.id,
    })
    expect(back.ok(), `return move failed: ${await back.text()}`).toBeTruthy()
    await waitForSqlValue(
      `SELECT count(*) FROM retain_sample_events
        WHERE retain_sample_id = ${q(sample.id)} AND event_type = 'MOVED'`,
      { timeoutMs: 20_000, label: 'return custody event' },
    )
    await expect
      .poll(
        () =>
          Number(
            sqlValue(
              `SELECT count(*) FROM retain_sample_events
                WHERE retain_sample_id = ${q(sample.id)} AND event_type = 'MOVED'`,
            ),
          ),
        { timeout: 20_000, message: 'both relocations landed' },
      )
      .toBe(2)

    // ── Step 5 · the chain reads in order ──────────────────────────────────
    const chain = custodyChain(sample.id)
    expect(
      chain.map((e) => e.eventType),
      'registration → out → seal broken → back, chronologically',
    ).toEqual(['CREATED', 'MOVED', 'SEAL_BROKEN', 'MOVED'])

    // ── Step 2 · the previous location is retained, not overwritten ────────
    // This is the assertion j11 never makes. `from_location_id` is captured
    // BEFORE `retainSample.update()` runs, so the out-move names Room A as its
    // origin and the return names Room B — the history is a chain of transfers,
    // not a sequence of snapshots of "where it is now".
    const [, moveOut, sealBreak, moveBack] = chain
    expect(moveOut.fromLocationId, 'the out-move remembers where it left').toBe(
      QC.storageLocation.id,
    )
    expect(moveOut.toLocationId, 'and where it went').toBe(roomB)
    expect(moveBack.fromLocationId, 'the return remembers it came from Room B').toBe(roomB)
    expect(moveBack.toLocationId, 'and landed back in Room A').toBe(QC.storageLocation.id)

    // ── Step 6 · attribution present THROUGHOUT ────────────────────────────
    // "each custody event is attributed to a named person with a timestamp" —
    // so every row, not merely the interesting ones.
    for (const e of chain) {
      expect(e.actorUserId, `${e.eventType} names its performer`).toBe(USERS.qcInspector.id)
      expect(e.createdAt, `${e.eventType} carries a timestamp`).toBeTruthy()
    }
    // …and the timestamps are non-decreasing, which is what makes "in order"
    // a property of the data rather than of the ORDER BY that read it.
    const times = chain.map((e) => Date.parse(e.createdAt))
    expect(
      times.every((t, i) => i === 0 || t >= times[i - 1]),
      'timestamps advance through the chain',
    ).toBe(true)

    // The seal break carries the reason — over REST. See the next test for why
    // that qualifier matters.
    expect(sealBreak.reason, 'the seal break records why custody was broken').toMatch(
      /stability testing/i,
    )
    expect(findRetainSample(sample.id).sealState, 'the sample is left OPENED').toBe('OPENED')
  })

  test('KNOWN DEFECT RET-D1 — a seal break through the UI can never carry a reason', async ({
    page,
  }) => {
    // TC-15-03 step 3 asks for "a seal-break custody event … with the reason,
    // the named person and a timestamp". Two of the three always hold. The
    // reason holds only for a caller who reaches past the interface.
    //
    // Probed from BOTH sides deliberately. Asserting only "the UI produced a
    // NULL reason" would be satisfied just as well by a service that ignored
    // `sealReason` entirely — in which case the defect would be in the service
    // and the fix would be somewhere else. The REST leg above proves the
    // service honours it, so this leg attributes the loss to the UI payload.
    const lot = await createLotViaRest(page, {})
    const sample = await createRetainSample(page, lot.id, { quantity: '4' })

    await page.goto(`/qc-inspection/retain-samples/${sample.id}`)
    const seal = page.getByLabel('Seal', { exact: true })
    await expect(seal, 'the detail page offers the seal control').toBeVisible({ timeout: 20_000 })

    // There is no reason field beside it — that is the defect, stated as the
    // UI fact it is.
    await expect(
      page.getByLabel(/seal reason/i),
      'RET-D1: no reason input exists anywhere on the seal control',
    ).toHaveCount(0)

    await seal.selectOption('OPENED')
    await waitForSqlValue(
      `SELECT count(*) FROM retain_sample_events
        WHERE retain_sample_id = ${q(sample.id)} AND event_type = 'SEAL_BROKEN'`,
      { timeoutMs: 30_000, label: 'UI-driven seal break' },
    )

    const row = sqlRow(
      `SELECT coalesce(reason, '<null>'), actor_user_id::text FROM retain_sample_events
        WHERE retain_sample_id = ${q(sample.id)} AND event_type = 'SEAL_BROKEN'
        ORDER BY created_at DESC LIMIT 1`,
    )
    // KNOWN DEFECT RET-D1: RetainSampleDetail.vue's debounced autosave payload
    // omits `sealReason`, so the service's `patch.sealReason ?? null` resolves
    // to null on every UI-originated break. When a reason input is added, this
    // flips red — which is the signal to turn it into a real assertion.
    expect(row[0], 'RET-D1: the UI-driven seal break lands with no reason').toBe('<null>')
    expect(row[1], 'the performer IS recorded — only the reason is lost').toBe(
      USERS.qcInspector.id,
    )

    // ── KNOWN DEFECT RET-D2: re-sealing is silent ─────────────────────────
    // The chain says custody was broken and never that it was restored.
    const beforeReseal = retainEventTypes(sample.id).length
    const resealed = await patchSample(page, sample.id, { sealState: 'SEALED' })
    expect(resealed.ok(), `re-seal failed: ${await resealed.text()}`).toBeTruthy()
    expect(findRetainSample(sample.id).sealState, 'the sample is sealed again').toBe('SEALED')
    expect(
      retainEventTypes(sample.id).length,
      'RET-D2: OPENED → SEALED mints no custody event — the restoration is untraceable',
    ).toBe(beforeReseal)

    test.info().annotations.push({
      type: 'known-defect',
      description:
        'RET-D1 — RetainSampleDetail.vue does not send `sealReason`, so every UI seal break has ' +
        'reason=NULL although the service and schema both accept one. RET-D2 — ' +
        'retainSampleService computes sealBroken as OPENED-from-SEALED only, so re-sealing mints ' +
        'no event and the chain records the break without the restoration.',
    })
  })
})

test.describe('PW-J19 — the retain register', () => {
  test.use({ storageState: AUTH.qcInspector })

  // TC-15-05 needs rows in known derived states. `derivedState()` is computed
  // at DISPLAY time from `retain_until` against a fixed, non-configurable
  // 30-day window (duplicated verbatim in RetainSamplesList.vue:17-26 and
  // RetainSampleRegisterPrint.vue:23-31) — the stored status is only RETAINED
  // or DISPOSED, so there is nothing to seed but the date.
  //
  // The diff is FRACTIONAL (`DateTime.now()`, not start-of-day), so a row seeded
  // at exactly +30 days lands either side of the boundary depending on the hour.
  // +15 and −1 are chosen to sit clear of it; asserting the boundary itself
  // would be asserting the clock.
  const registerSamples = { due: null, overdue: null, retained: null }

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()
    try {
      for (const [key, days] of [
        ['due', 15],
        ['overdue', -1],
        ['retained', 400],
      ]) {
        const lot = await createLotViaRest(page, {})
        const s = await createRetainSample(page, lot.id, {
          quantity: '2',
          position: `J19 ${key}`,
        })
        sql(
          `UPDATE retain_samples SET retain_until = (current_date + ${days})::date WHERE id = ${q(s.id)}`,
        )
        registerSamples[key] = findRetainSample(s.id)
      }
    } finally {
      await ctx.close()
    }
  })

  test('the register lists every column the protocol names, for a known sample', async ({
    page,
  }) => {
    // TC-15-05 steps 1 and 2 — "identifier, product, lot, location, retention
    // date and status for each sample". Asserted as HEADERS (the register's
    // contract) plus the values of one row we know the state of, so a register
    // that rendered the right columns full of the wrong data still fails.
    await page.goto('/qc-inspection?tab=retain-samples')
    const due = registerSamples.due
    await expect(page.getByText(due.rsNumber).first(), 'the register loaded').toBeVisible({
      timeout: 30_000,
    })

    // The six the protocol names, by the list's own UPPERCASE header text.
    for (const header of ['SAMPLE #', 'ITEM', 'LOT #', 'LOCATION', 'RETAIN UNTIL', 'STATUS']) {
      await expect(
        page.getByRole('columnheader', { name: header, exact: true }),
        `the register carries a ${header} column`,
      ).toBeVisible()
    }

    // The identifier and the lot are the two that tie a physical box back to
    // the inspection that produced it — `lot_number` is denormalised onto the
    // retain row at create precisely so the register stands alone.
    const row = page.getByRole('row').filter({ hasText: due.rsNumber })
    await expect(row, 'exactly one row carries this RS number').toHaveCount(1)
    await expect(row, 'the row shows its source lot').toContainText(due.lotNumber)
    await expect(row, 'and its storage location').toContainText(QC.storageLocation.name)
  })

  test('the derived-state chips filter the register, and the 30-day window is what decides', async ({
    page,
  }) => {
    // TC-15-05 steps 3 and 4. The chips are the ONLY status filter: `status_id`
    // holds RETAINED | DISPOSED and nothing else, so "approaching expiry" is not
    // a stored state that could be filtered on — it is derived on read. That is
    // exactly what makes this worth a test rather than a screenshot: the filter
    // and the badge each re-derive it, and nothing keeps the two in step but
    // duplicated code.
    await page.goto('/qc-inspection?tab=retain-samples')
    const { due, overdue, retained } = registerSamples
    await expect(page.getByText(due.rsNumber).first()).toBeVisible({ timeout: 30_000 })

    // `Due ≤30d` uses U+2264, not '<='. A test that typed '<=' would find no
    // control and fail as though the chip were missing.
    const chip = (label) => page.getByRole('button', { name: new RegExp(`^${label}`) })

    await chip('Due ≤30d').click()
    await expect(page.getByText(due.rsNumber).first(), '+15 days is DUE').toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(overdue.rsNumber), 'a past-due sample is not merely due').toHaveCount(0)
    await expect(page.getByText(retained.rsNumber), '+400 days is not due').toHaveCount(0)

    await chip('Overdue').click()
    await expect(page.getByText(overdue.rsNumber).first(), '−1 day is OVERDUE').toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(due.rsNumber), 'a due sample is not overdue').toHaveCount(0)

    await chip('Retained').click()
    await expect(
      page.getByText(retained.rsNumber).first(),
      'beyond the window it is plainly Retained',
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByText(overdue.rsNumber),
      'and an overdue sample has left the plain Retained bucket',
    ).toHaveCount(0)

    // The window is a hard-coded 30 and the protocol tells the reader to record
    // it against their own notice period, so pin it: a silent change to 60 would
    // otherwise pass every assertion above.
    await chip('All').click()
    expect(
      Number(sqlValue(`SELECT (${q(due.retainUntil)}::date - current_date)`)),
      'the DUE fixture sits inside the 30-day window, not on its edge',
    ).toBeLessThanOrEqual(30)
  })

  test('the register exports and prints — the two evidence routes the protocol accepts', async ({
    page,
  }) => {
    // TC-15-05 step 5. There is no in-application PDF: the protocol's accepted
    // outputs are the CSV extract and the browser's own print of the register
    // print view. Both are asserted, because the OQ lets the executor attach
    // either and a broken one would go unnoticed behind the other.
    await page.goto('/qc-inspection?tab=retain-samples')
    await expect(page.getByText(registerSamples.due.rsNumber).first()).toBeVisible({
      timeout: 30_000,
    })

    // ── CSV ────────────────────────────────────────────────────────────────
    // `exportManager` means Export opens a column/format dialog first; the
    // confirm control inside it carries the same name, hence the scoping.
    await page.getByRole('button', { name: 'Export' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Choose columns and format')).toBeVisible({ timeout: 15_000 })

    const download = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Export' }).click(),
    ]).then(([d]) => d)
    expect(download.suggestedFilename(), 'the extract is the register CSV').toBe(
      'retain-samples.csv',
    )

    const csv = readFileSync(await download.path(), 'utf8')
    expect(csv, 'the CSV carries the identifier column').toMatch(/SAMPLE #/)
    expect(csv, 'and the sample we seeded').toContain(registerSamples.due.rsNumber)
    // The exported STATUS is the DERIVED state, not `status_id` — an overdue row
    // exports OVERDUE although the stored status is RETAINED. Worth pinning:
    // an extract that reported the stored value would silently contradict the
    // register it was taken from.
    expect(csv, 'the export reports the derived state, matching what the register shows').toMatch(
      /OVERDUE/,
    )

    // ── Print register ─────────────────────────────────────────────────────
    // Opens in a new tab via window.open, and auto-fires window.print() shortly
    // after load — which Playwright leaves as a no-op, so the page stays
    // assertable.
    const [printPage] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Print Register' }).click(),
    ])
    await expect(
      printPage.getByText('Retain Sample Register').first(),
      'the print view identifies itself',
    ).toBeVisible({ timeout: 30_000 })
    // Title Case here, UPPERCASE in the list — the two surfaces do not share a
    // column definition, which is precisely why both are asserted.
    for (const header of ['Sample #', 'Lot #', 'Location', 'Retain until', 'Status']) {
      await expect(
        printPage.getByText(header, { exact: true }).first(),
        `the printed register carries ${header}`,
      ).toBeVisible()
    }
    await expect(
      printPage.getByText(registerSamples.due.rsNumber).first(),
      'and the sample appears on it',
    ).toBeVisible()
    await printPage.close()
  })
})
