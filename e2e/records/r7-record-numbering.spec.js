// REC-J7 — record numbering under concurrency: unique, gapless, server-minted.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS PINS — F-11 and F-32
//
// F-11: `AddRecordDialog.vue` minted `<CODE>-NNNN` IN THE BROWSER. It read every
// `RecordCounter` out of IndexedDB, found this template's, did
// `currentValue += 1`, formatted, then saved the record and the counter as two
// separate round trips. Two people submitting at once both read the same value
// and wrote the same number — and the number is what an auditor traces. It did
// not even need true concurrency to lose: it read from IndexedDB, whose counter
// row is only as fresh as the last sync push.
//
// F-32 was found while writing the test for F-11, and is the more interesting
// half. The documentation pack recorded the SERVER path as the correct one —
// `SELECT … FOR UPDATE` — and moving the client onto it made that claim
// load-bearing. It was only half true. `FOR UPDATE` locks the rows it FINDS,
// and on a template's FIRST record it finds none, so it takes no lock at all:
// every concurrent transaction takes the create branch and races to INSERT the
// same primary key (`record_counters_pkey` is `(company_id, template_id)`).
// Measured before the fix — five simultaneous creates against a fresh template:
// one succeeded, four died with a unique-constraint violation surfaced to the
// user as `400 Validation error`.
//
// And "a module going live" is precisely when several people submit at once,
// which is the ONLY moment that branch is ever taken.
//
// The same read-modify-write existed TWICE, character for character, in
// `insertRecord` and in `moduleRecordService.mintRecordNumber`. Both now call
// one implementation — `services/recordCounterService.js`, a single
// `INSERT … ON CONFLICT DO UPDATE … RETURNING`.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE COUNTER IS RESET BEFORE THE FIRST WAVE
//
// F-32 lives ONLY on the branch that runs when the counter row does not yet
// exist. A concurrency probe against a template that already has a counter
// exercises the UPDATE arm, which was never broken — it would pass against the
// defect. So wave 1 runs against a genuinely fresh template (`resetTemplateNumbering`
// deletes the counter row and the template's records), and wave 2 then runs
// against the now-existing counter, so BOTH arms are covered and the second
// cannot be mistaken for the first.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY GAPLESS AND NOT JUST UNIQUE
//
// A Postgres sequence would give uniqueness and is the obvious "fix". It is the
// wrong one: sequences leak numbers on rollback, and a record register with
// holes in it is itself a finding in an audit. That is why this is a counter
// table. So the assertion is the stronger one — the N numbers minted by N
// concurrent creates are exactly 0001..000N, with nothing missing and nothing
// repeated.
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'
import {
  RECORDS,
  counterValue,
  createPersonaPool,
  errorMessage,
  findRecord,
  provisionRecordsFixtures,
  purgeProbeRecords,
  recordsForTemplate,
  resetTemplateNumbering,
  restPost,
} from '../fixtures/records.js'

// Five, matching the wave size the defect was measured at (one winner, four
// 400s). Enough to lose the race reliably, small enough not to be a load test.
const WAVE = 5

const pool = createPersonaPool()
test.beforeAll(() => provisionRecordsFixtures())
test.afterAll(async () => {
  await pool.close()
  purgeProbeRecords([RECORDS.race.templateId])
})

/** Fire `n` creates against one template with no await between them. */
async function concurrentCreates(ctx, templateId, n, label) {
  return Promise.all(
    Array.from({ length: n }, (_, i) =>
      restPost(ctx, '/records', {
        templateId,
        payload: { probeSubject: `${label}-${i}`, probeNote: 'concurrency probe' },
      }),
    ),
  )
}

test.describe('REC-J7 — record numbering (F-11 / F-32)', () => {
  test('the first record of a template: five simultaneous creates, five numbers', async ({
    browser,
  }) => {
    const ctx = await pool.context(browser, AUTH.author)
    const T = RECORDS.race

    // ── The premise. F-32 is reachable ONLY from here. ─────────────────────
    resetTemplateNumbering(T.templateId)
    expect(
      counterValue(T.templateId),
      'the template has never been used — this is the branch F-32 lived on',
    ).toBeNull()

    const responses = await concurrentCreates(ctx, T.templateId, WAVE, 'REC-J7-first')

    // ── Nobody lost. Before the fix, four of these were `400 Validation error`
    // from `record_counters_pkey`. The messages are collected before any
    // assertion so a failure names the actual error rather than just a count.
    const failures = []
    for (const res of responses) {
      if (res.status() !== 201) failures.push(`${res.status()} ${await errorMessage(res)}`)
    }
    expect(failures, 'every concurrent create succeeded — no counter collision').toEqual([])

    // ── Unique. This is F-11: the number is what an auditor traces. ─────────
    const numbers = (await Promise.all(responses.map(async (r) => (await r.json())?.record?.recordNumber)))
    expect(numbers.filter(Boolean), 'each create returned a record number').toHaveLength(WAVE)
    expect(new Set(numbers).size, 'and every one of them is distinct').toBe(WAVE)

    // ── Gapless, and in this template's own sequence. A Postgres sequence
    // would pass "unique" and fail this.
    expect(
      [...numbers].sort(),
      `the five numbers are exactly ${T.code}-0001 … -000${WAVE}`,
    ).toEqual(Array.from({ length: WAVE }, (_, i) => `${T.code}-${String(i + 1).padStart(4, '0')}`))

    // ── The counter agrees with what was handed out. A number returned to a
    // caller but not reflected in the counter is the next collision.
    expect(counterValue(T.templateId), 'the counter is exactly the number of records').toBe(
      String(WAVE),
    )

    // ── And the database holds five rows carrying those numbers — not five
    // responses over four rows.
    const rows = recordsForTemplate(T.templateId)
    expect(rows, 'five records exist').toHaveLength(WAVE)
    expect(
      rows.map((r) => r.recordNumber).sort(),
      'and the persisted numbers are the ones that were returned',
    ).toEqual([...numbers].sort())
  })

  test('the UPDATE arm is safe too — a second wave continues the same sequence', async ({
    browser,
  }) => {
    // The counter row now exists, so this wave takes the `ON CONFLICT DO UPDATE`
    // branch — the one the pack always believed was correct. Asserted anyway,
    // because the refactor that fixed F-32 replaced BOTH branches with one
    // statement and a regression could plausibly break either.
    const ctx = await pool.context(browser, AUTH.author)
    const T = RECORDS.race

    const before = Number(counterValue(T.templateId))
    expect(before, 'the previous test left a counter behind').toBeGreaterThan(0)

    const responses = await concurrentCreates(ctx, T.templateId, WAVE, 'REC-J7-second')
    for (const res of responses) expect(res.status()).toBe(201)

    const numbers = await Promise.all(
      responses.map(async (r) => (await r.json())?.record?.recordNumber),
    )
    expect(new Set(numbers).size, 'still all distinct').toBe(WAVE)
    expect(
      [...numbers].sort(),
      'and the sequence continued rather than restarting',
    ).toEqual(
      Array.from({ length: WAVE }, (_, i) =>
        `${T.code}-${String(before + i + 1).padStart(4, '0')}`,
      ),
    )
    expect(counterValue(T.templateId)).toBe(String(before + WAVE))

    // The whole register, across both waves: still gapless.
    const all = recordsForTemplate(T.templateId).map((r) => r.recordNumber).sort()
    expect(all, 'the register has no holes across both waves').toEqual(
      Array.from({ length: before + WAVE }, (_, i) =>
        `${T.code}-${String(i + 1).padStart(4, '0')}`,
      ),
    )
  })

  test('the number is minted by the SERVER, and the create seals the submission', async ({
    browser,
  }) => {
    // F-11's other half. The browser used to invent the number and then save it;
    // `AddRecordDialog.vue` now POSTs to /v1/services/records, which additionally
    // freezes `form_schema` / `template_version`, projects reportable answers and
    // enforces the create permission — four things the client path did none of.
    //
    // Asserting the returned number EQUALS the stored one is what makes
    // "server-minted" observable from outside: a client-minted number would
    // still be returned by the API (it was sent up in the body), so only the
    // agreement of response, database row and counter distinguishes them.
    const ctx = await pool.context(browser, AUTH.author)
    const res = await restPost(ctx, '/records', {
      templateId: RECORDS.race.templateId,
      // A number is deliberately NOT sent. The endpoint takes templateId and
      // payload only — there is no field through which a caller could supply one.
      payload: { probeSubject: 'REC-J7 seal', probeNote: 'server-minted' },
    })
    expect(res.status()).toBe(201)
    const returned = (await res.json())?.record

    const stored = findRecord(returned.id)
    expect(stored.recordNumber, 'the response and the row agree').toBe(returned.recordNumber)
    expect(stored.recordNumber, '…and it follows the template’s own code').toMatch(
      new RegExp(`^${RECORDS.race.code}-\\d{4}$`),
    )
    expect(
      Number(stored.recordNumber.split('-')[1]),
      '…and it is the counter’s current value',
    ).toBe(Number(counterValue(RECORDS.race.templateId)))

    // The seal the client path never applied.
    expect(stored.formSchemaLength, 'form_schema is frozen onto the submission').toBeGreaterThan(0)
    expect(stored.templateVersion, 'and so is the template version').not.toBeNull()
    expect(stored.statusId, 'the record is created DRAFT, per the guard’s INSERT arm').toBe('DRAFT')
  })
})
