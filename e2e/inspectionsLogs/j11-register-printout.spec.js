// IL-J11 — The register printout: what leaves the building.
//
// URS-LOG-08 / TC-10-08. The register is the artefact an inspector is handed
// when they ask to see the log, so this journey is as much about what the
// register OMITS as about what it carries — and the OQ protocol is unusually
// blunt about the omissions, writing two of its own test steps as expected
// failures:
//
//   step 3 — "Confirm review sign-offs appear on the register"
//            → "Only the entry's STATUS appears — the signature detail is not
//               on the register."
//   step 4 — "Confirm corrections are identifiable on the register"
//            → "NOT identifiable — the register prints the corrected value
//               with no marker."
//
// Both are asserted here as observed, not as wished for. Neither is a loss of
// the underlying record — the signature and the full correction history live
// on the entry and in its audit trail (IL-J3, IL-J4, IL-J12) — but a procedure
// that treats this printout as the inspection-facing log is relying on
// something it does not contain, and that is exactly the kind of thing a
// regression must not quietly change in either direction.
//
// HOW THE REGISTER IS REACHED. `FieldRecordsList.printList()` opens
// `/print?module=LogBook&templateId=<book>&from=&to=&cols=` in a new tab; the
// dispatcher in PrintShell.vue forwards every query param but `module` as a
// prop to LogBookPrint.vue. This file navigates that URL directly rather than
// driving the Print button, for the same reason `openEntry` deep-links rather
// than clicking through the list: the URL IS the product's contract here (the
// button does nothing but build it), while the date-range and column-picker
// controls that feed it are ordinary list chrome that would make this a test
// of two dropdowns.
//
// `window.print()` is stubbed before navigation. LogBookPrint fires it ~200ms
// after its data resolves, and a real print dialog blocks the run — the same
// stub audits/PW-J8 and documents/S2 use.
import { test, expect } from '@playwright/test'
import { AUTH, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  amendEntry,
  createPersonaPool,
  expireEditWindow,
  findRecord,
  reviewEntry,
  signaturesOf,
  submitEntry,
  uniqueTag,
} from '../fixtures/inspectionsLogs.js'

const OPS = INSPECTIONS_LOGS.operations
const CTRL = INSPECTIONS_LOGS.controlled

const pool = createPersonaPool()
test.afterAll(() => pool.close())

/** Today, as the register's `from`/`to` params want it (yyyy-MM-dd). */
function today() {
  return new Date().toISOString().slice(0, 10)
}

/** N days from now, same format. Negative goes backwards. */
function dayOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Open the register in its own context with window.print() stubbed.
 *
 * A FRESH CONTEXT, not the persona pool's, and that is not a style choice:
 * `addInitScript` only applies to pages created after it is registered, and
 * the pool hands back a page that has already navigated. Stubbing on the
 * shared page would leave `window.print` real on the very navigation that
 * fires it. The cost is one syncEngine bootstrap, which the register needs
 * anyway — it reads LogBook, FieldRecord, FieldRecordRevision and User
 * straight out of IndexedDB.
 *
 * The caller owns closing the context.
 */
async function openRegister(browser, { from, to, cols } = {}) {
  const ctx = await browser.newContext({ storageState: AUTH.logSupervisor })
  await ctx.addInitScript(() => {
    window.print = () => {}
  })
  const page = await ctx.newPage()

  const params = new URLSearchParams({ module: 'LogBook', templateId: OPS.id })
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (cols) params.set('cols', cols)

  await page.goto(`/print?${params.toString()}`)
  // The book arriving in IndexedDB is what flips `ready`; until then the view
  // renders "Loading log book…" and every content assertion would race it.
  // Same budget as openEntry's first wait — a cold context needs ~17s.
  await expect(
    page.getByRole('heading', { name: OPS.title }),
    'the register never rendered — the log book did not reach IndexedDB',
  ).toBeVisible({ timeout: 60_000 })
  return { ctx, page }
}

/** The register's entry table, as a locator. */
const entriesTable = (page) => page.locator('.lb-print-entries')

test.describe('IL-J11 — the log book register', () => {
  test('the register prints every entry in the range with its number, time, operator and status', async ({
    browser,
  }) => {
    // TC-10-08 steps 1 and 2.
    const opPage = await pool.page(browser, AUTH.logOperator)
    const tagA = uniqueTag('J11A')
    const tagB = uniqueTag('J11B')
    const first = await submitEntry(opPage, {
      book: OPS,
      values: { Operator: tagA, Reading: '18.5', Note: 'Start of shift' },
      submitterId: USERS.logOperator.id,
    })
    const second = await submitEntry(opPage, {
      book: OPS,
      values: { Operator: tagB, Reading: '19.5', Note: 'End of shift' },
      submitterId: USERS.logOperator.id,
    })

    const { ctx, page } = await openRegister(browser, { from: today(), to: today() })
    try {
      const table = entriesTable(page)
      await expect(table, 'a table, not a list — the register is paginated tabular output').toBeVisible(
        { timeout: 45_000 },
      )

      // Step 2, entry by entry. Each row carries the four fixed columns plus
      // the selected fields, and all of it is asserted against Postgres rather
      // than against what the previous assertion happened to find.
      for (const record of [first, second]) {
        const row = table.locator('tr', { hasText: record.recordNumber })
        await expect(row, `${record.recordNumber} is on the register`).toHaveCount(1, {
          timeout: 30_000,
        })
        await expect(
          row.getByText(USERS.logOperator.name),
          'with the operator who filed it, resolved to a name and not a UUID',
        ).toBeVisible()
        await expect(
          row.getByText('Submitted', { exact: true }),
          'and its status',
        ).toBeVisible()
      }

      // The values themselves — the whole reason the register exists.
      await expect(table.getByText(tagA)).toBeVisible()
      await expect(table.getByText('18.5')).toBeVisible()
      await expect(table.getByText('Start of shift')).toBeVisible()
      await expect(table.getByText(tagB)).toBeVisible()
      await expect(table.getByText('End of shift')).toBeVisible()

      // The header block is the register's own provenance: which book, which
      // range, and how many entries it claims to contain. A printed page whose
      // entry count disagreed with its rows is the classic quiet truncation,
      // so the count is read off the page and checked against the table.
      const printedCount = Number(
        (await page.locator('.lb-print-meta').getByText(/^\d+$/).first().textContent()).trim(),
      )
      expect(
        await table.locator('tbody tr').count(),
        'the entry count in the header matches the rows actually printed',
      ).toBe(printedCount)
      await expect(
        page.locator('.lb-print-meta'),
        'and the range it was printed for is on the page',
      ).toContainText(`${today()} → ${today()}`)
      await expect(page.locator('.lb-print-code')).toHaveText(OPS.code)
    } finally {
      await ctx.close()
    }
  })

  test('the date range is a real filter — an entry outside it is not printed', async ({
    browser,
  }) => {
    // Nothing else in TC-10-08 tests the range, and a register that silently
    // ignored `from`/`to` would print MORE than asked rather than less, which
    // is the harmless-looking direction and therefore the one that survives.
    // The entry is real and today; the window is a fortnight ago.
    const opPage = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J11R')
    const record = await submitEntry(opPage, {
      book: OPS,
      values: { Operator: tag, Reading: '20.1', Note: 'Filed today' },
      submitterId: USERS.logOperator.id,
    })

    const { ctx, page } = await openRegister(browser, {
      from: dayOffset(-14),
      to: dayOffset(-7),
    })
    try {
      // The empty state is the product's own words, and asserting it (rather
      // than just "the row is absent") proves the view RAN and found nothing —
      // an unrendered table would satisfy a bare absence check for the wrong
      // reason.
      await expect(
        page.getByText('No entries in this range.'),
        'a window before the entry prints nothing',
      ).toBeVisible({ timeout: 45_000 })
      await expect(page.getByText(record.recordNumber)).toHaveCount(0)
    } finally {
      await ctx.close()
    }

    // And the same entry against a window that DOES contain it — the two-sided
    // half, without which "the filter excluded it" is indistinguishable from
    // "the register never loaded the entry at all".
    const inRange = await openRegister(browser, { from: dayOffset(-1), to: dayOffset(1) })
    try {
      await expect(
        inRange.page.getByText(record.recordNumber),
        'and a window that contains it prints it',
      ).toBeVisible({ timeout: 45_000 })
    } finally {
      await inRange.ctx.close()
    }
  })

  test('a review sign-off reaches the register as a STATUS and nothing more', async ({
    browser,
  }) => {
    // TC-10-08 step 3, recorded as the protocol says to record it.
    //
    // The entry is a CONTROLLED_RECORD approved by the book supervisor under
    // e-signature, so there is genuinely a signature to omit — asserting the
    // absence of signature detail on an entry that was never signed would prove
    // nothing at all. IL-J3 owns the sign-off itself; this asks only what the
    // printout does with it.
    //
    // It prints the CONTROLLED book's register, not the operations one, because
    // that is where the signed entry lives.
    const opPage = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J11S')
    const record = await submitEntry(opPage, {
      book: CTRL,
      values: { Area: tag, Temperature: '4.1' },
      submitterId: USERS.logOperator.id,
    })
    const supPage = await pool.page(browser, AUTH.logSupervisor)
    await reviewEntry(supPage, record.id, 'APPROVED', { comment: 'Within the 2–8 °C band.' })

    // The ground truth the register is being measured against: two signatures
    // exist on this entry, by two named people, with two meanings.
    const signatures = signaturesOf(record.id)
    expect(signatures, 'the probe needs an entry that really is signed twice').toEqual([
      { meaning: 'SUBMITTED', userId: USERS.logOperator.id },
      { meaning: 'APPROVED', userId: USERS.logSupervisor.id },
    ])

    const ctx = await browser.newContext({ storageState: AUTH.logSupervisor })
    await ctx.addInitScript(() => {
      window.print = () => {}
    })
    const page = await ctx.newPage()
    try {
      await page.goto(
        `/print?module=LogBook&templateId=${CTRL.id}&from=${today()}&to=${today()}`,
      )
      await expect(page.getByRole('heading', { name: CTRL.title })).toBeVisible({
        timeout: 60_000,
      })

      const row = entriesTable(page).locator('tr', { hasText: record.recordNumber })
      await expect(row).toHaveCount(1, { timeout: 45_000 })

      // What IS there: the outcome, as a status word.
      await expect(
        row.getByText('Approved', { exact: true }),
        'the register does say the entry was approved',
      ).toBeVisible()

      // What is NOT there, asserted against the printed BODY rather than the
      // whole page: the print route renders inside the app shell, whose sidebar
      // and header carry user names, so a page-wide search for the supervisor's
      // name would find the logged-in session and report a signature that is
      // not on the printout.
      const body = page.locator('.lb-print-body')
      await expect(
        body.getByText(USERS.logSupervisor.name),
        'TC-10-08 step 3 as documented — the SIGNER is not named on the register',
      ).toHaveCount(0)
      await expect(
        body.getByText(/Within the 2–8/),
        'nor is the reviewer’s comment',
      ).toHaveCount(0)
      await expect(
        body.getByText(/e-?signature|signed by/i),
        'and there is no signature block of any kind',
      ).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('an amended entry prints its corrected value with no marker that it was corrected', async ({
    browser,
  }) => {
    // TC-10-08 step 4 — the most consequential of the register's omissions, and
    // the reason the protocol tells the executor to evidence corrections from
    // the entry records instead if this printout is their inspection-facing log.
    //
    // The whole point of TC-10-07 (and IL-J4) is that an amendment never erases
    // the original: revision 1 keeps '33.0' forever. The register, however,
    // renders `payloadFor(record)` — the CURRENT revision — so the printed page
    // shows only '34.2', with nothing to tell a reader the number ever moved.
    const opPage = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J11C')
    const record = await submitEntry(opPage, {
      book: OPS,
      values: { Operator: tag, Reading: '33.0', Note: 'As read at 06:00' },
      submitterId: USERS.logOperator.id,
    })
    expireEditWindow(record.id)

    const adminPage = await pool.page(browser, AUTH.logAdmin)
    await amendEntry(adminPage, record.id, {
      values: { Reading: '34.2' },
      comment: 'Transcription error — instrument log reads 34.2.',
    })

    // Ground truth: the original survives in the ledger, which is what makes
    // its absence from the register an omission rather than a data loss.
    expect(
      sqlValue(
        `SELECT payload ->> '${OPS.fields.reading.name}' FROM field_record_revisions
          WHERE field_record_id = '${record.id}' AND revision_number = 1`,
      ),
      'the original reading is still on file in revision 1',
    ).toBe('33.0')
    expect(findRecord(record.id).statusId, 'and the entry is a sealed, amended one').toBe('LOCKED')

    const { ctx, page } = await openRegister(browser, { from: today(), to: today() })
    try {
      const row = entriesTable(page).locator('tr', { hasText: record.recordNumber })
      await expect(row).toHaveCount(1, { timeout: 45_000 })

      await expect(row.getByText('34.2'), 'the corrected value is what prints').toBeVisible()

      // The two omissions, in order of how much they matter.
      await expect(
        row.getByText('33.0'),
        'the superseded value is not on the register',
      ).toHaveCount(0)
      await expect(
        row.getByText(/amend|correct|revis/i),
        'TC-10-08 step 4 as documented — nothing marks the row as having been corrected',
      ).toHaveCount(0)
      await expect(
        entriesTable(page).getByText(/Transcription error/),
        'and the reason for the correction is not printed either',
      ).toHaveCount(0)

      // The status column is the only trace, and it is not a correction marker:
      // an amended entry prints "Completed" — the label for LOCKED — exactly as
      // an untouched sealed entry does. That is the finding, stated positively.
      await expect(
        row.getByText('Completed', { exact: true }),
        'an amended entry is indistinguishable from an unamended sealed one',
      ).toBeVisible()
    } finally {
      await ctx.close()
    }
  })

  test('the register prints the columns it was asked for, and drops the rest', async ({
    browser,
  }) => {
    // TC-10-08 step 5's substance. "Nothing is truncated" cannot be asserted
    // against a PDF from Playwright, but the failure mode it guards against is
    // real and is testable: a register that silently printed fewer columns than
    // the operator selected would look complete and be incomplete.
    //
    // So both directions are checked — a chosen column appears, an unchosen one
    // does not, and the page states the ratio itself.
    const opPage = await pool.page(browser, AUTH.logOperator)
    const tag = uniqueTag('J11K')
    const record = await submitEntry(opPage, {
      book: OPS,
      values: { Operator: tag, Reading: '27.7', Note: 'Column-selection probe' },
      submitterId: USERS.logOperator.id,
    })

    const { ctx, page } = await openRegister(browser, {
      from: today(),
      to: today(),
      cols: `${OPS.fields.operator.name},${OPS.fields.reading.name}`,
    })
    try {
      const table = entriesTable(page)
      await expect(table.getByText(record.recordNumber)).toBeVisible({ timeout: 45_000 })

      await expect(
        table.getByRole('columnheader', { name: OPS.fields.operator.label, exact: true }),
      ).toBeVisible()
      await expect(
        table.getByRole('columnheader', { name: OPS.fields.reading.label, exact: true }),
      ).toBeVisible()
      await expect(
        table.getByRole('columnheader', { name: OPS.fields.note.label, exact: true }),
        'the column that was not selected is absent',
      ).toHaveCount(0)

      await expect(table.getByText('27.7')).toBeVisible()
      await expect(
        table.getByText('Column-selection probe'),
        'and so is its data — not merely its header',
      ).toHaveCount(0)

      // The register says what it left out, which is what makes a partial
      // printout honest rather than misleading.
      await expect(
        page.locator('.lb-print-meta'),
        'the page states how many of the form’s fields it is showing',
      ).toContainText('2 of 3 scalar fields')
    } finally {
      await ctx.close()
    }
  })
})
