// ANL-A15 · The file that leaves carries the number the requester was shown.
//
// ── WHAT ANL-A6 PROVES, AND WHAT IT DOES NOT ────────────────────────────────
// A6 pins the IDENTITY OF THE REQUEST: `request_report_export()` derives the
// requester from the session, the enqueued payload names that person, one report
// read by two people produces two jobs. Every one of those assertions is about a
// row in the queue. Not one of them opens the file.
//
// That leaves the whole second half of the path unpinned. A job correctly
// stamped `userId: author` is still only an instruction; the numbers are
// gathered minutes later, in a worker process, from a pooled connection that
// belongs to the superuser until the task deliberately gives that up. Between
// the payload and the spreadsheet sit `SET LOCAL ROLE app_user`, a GUC handoff
// and eight queries — and if any of that failed to take, the job would still
// carry the right name while the file carried the whole tenant. Nothing about
// the resulting spreadsheet would look wrong: it has the requester's name on the
// cover sheet, it arrives in their inbox, and the figures are internally
// consistent. They are simply somebody else's.
//
// So this file asserts the CONTENT. It is the highest-severity check in the
// module for the reason a QMS cares about at all: a screen can be wrong and
// corrected, but an export has already gone — into a mailbox, a regulator's
// pack, an auditor's evidence folder — and it takes with it exactly as much
// access as whoever resolved it.
//
// ── THE COMPARISON IS A ROW, NOT A SPREADSHEET ──────────────────────────────
// Every rendered export writes one append-only row to `analytics_snapshot`
// (migration 20260818030000) carrying `figures` — the gathered values, section
// by section, exactly as they were handed to the XLSX and PDF renderers, before
// either one turned them into cells. That is a far better thing to assert
// against than a parsed workbook: it is the same object both renderers consume,
// so a match here holds for both formats, and it cannot be fooled by a
// formatting change that leaves the numbers alone.
//
// Then the other side of the equality. `metric_value()` and `metric_breakdown()`
// are SECURITY INVOKER, so asking them AS THE SAME USER is not a model of what
// that person sees — it is literally the call the dashboard makes. ANL-A4
// already pins the screen half (the tile renders what `metric_value()` returns
// for its reader); this file pins the export half to the same functions, which
// closes the loop: screen == metric_value == exported figures.
//
// ── WHY THE OWNER IS THE ONE WHO CANNOT SEE ─────────────────────────────────
// The fixture report is OWNED by `controller` and also EXPORTED by `author`, and
// the personas are that way round on purpose, because it makes both directions
// of the bug observable off one report:
//
//   controller  reports_dashboards read/export/manage, and NO grant on `ncr` at
//               all — so the metric this report measures resolves to a blank for
//               them. On screen and in their file. If the export ran as the
//               worker's superuser, or fell back to anything wider than the
//               requester, their spreadsheet would show a number.
//   author      ncr:read at tenant scope, does NOT own the report. If the export
//               resolved as the report's OWNER — the natural-looking mistake,
//               since the definition is the owner's — their spreadsheet would be
//               the blank one.
//
// One report, two exports, and the two failure modes push the numbers in
// opposite directions. A test with one persona cannot tell either of them from
// correct behaviour.
//
// (Worth recording: ANL-A4's closing comment says the "analytics grant, no
// measured-module grant" case has no persona in the E2E seed and is pinned only
// at the integration layer. `controller` has been exactly that persona since
// §31a — reports_dashboards without `ncr` — which is what this file leans on.)
//
// ── WHY THE EXPECTED FIGURES ARE ASKED FOR, NEVER WRITTEN DOWN ──────────────
// The report's period is `last_12_months`, which includes the current month, and
// every other suite in this repo creates nonconformances now — measured on
// 2026-08-27, `author`'s figure over that window is 348, not the seeded fact
// month's 6. A constant here would be wrong within a day. The same goes for the
// window itself: it is read out of the stored definition and resolved through
// `analytics_resolve_period_token()`, the same function the exporter calls, so
// this spec cannot quietly compare the right numbers over the wrong months.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { ANALYTICS, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, waitForSqlValue } from '../fixtures/db.js'
import { ensureRollup, clearExportJobs, requestExportAs } from '../fixtures/analytics.js'

const REPORT_ID = 'e2ea9000-0000-4000-8000-000000000015'
const REPORT_NAME = 'ANL-A15 export matches the screen'

// Owns the report, holds `reports_dashboards:export`, holds nothing on `ncr`.
const BLIND_OWNER = USERS.controller
// Holds `ncr:read` at tenant scope, holds export, owns nothing here.
const SIGHTED_READER = USERS.author

// The same shape as the seeded shared report (§31c), and deliberately not that
// report: ANL-A6's UI test performs a real export against it, so its snapshot
// rows belong to another spec's arithmetic. A fixture of our own also means the
// teardown can name what it deletes.
const DEFINITION = JSON.stringify({
  periodToken: 'last_12_months',
  sections: [
    {
      title: 'Nonconformances',
      metricKeys: [ANALYTICS.METRIC],
      breakdown: { metricKey: ANALYTICS.METRIC, dimension: 'severity' },
    },
  ],
})

const US = '\u001f'
const MV = 'A15MV='
const BD = 'A15BD='

// ── the question, taken from the report rather than restated here ───────────
// Metric, dimension and window all come out of the stored definition, because
// the thing under test is that the exporter and the screen answer THE SAME
// question. A spec that hard-coded 'ncr.raised' and NULL/NULL would keep passing
// after an exporter started resolving a different window from the one it prints
// on the cover sheet — which is the exact defect the task's own header records
// having shipped once already.
const QUESTION = `
  WITH d AS (
    SELECT r.definition ->> 'periodToken'                                 AS token,
           r.definition -> 'sections' -> 0 -> 'metricKeys' ->> 0          AS metric_key,
           r.definition -> 'sections' -> 0 -> 'breakdown' ->> 'dimension' AS dimension
      FROM public.analytics_reports r
     WHERE r.id = '${REPORT_ID}' AND r.deleted_at IS NULL
  ),
  w AS (
    SELECT d.*, p.period_start, p.period_end
      FROM d, LATERAL public.analytics_resolve_period_token(d.token) p
  )`

/**
 * What this report resolves to for one named reader — the screen's side of the
 * equality.
 *
 * ⚠️ `p_min_cell` is 5, matching `useAnalytics.js` (`pMinCell: … ?? 5`) and the
 * exporter (`metric_breakdown($1,$2,$3,$4, 25, 5, 'contribution')`). It is NOT
 * the fixtures' `breakdownAs()`, which asks with 0 and therefore returns cells
 * the small-cell guard withholds from every real reader. Comparing an export
 * against that helper would compare it against numbers nobody is ever shown.
 *
 * Tagged rather than located by position: `sqlAsAppUser` echoes its own
 * set_config() calls first, and a bare "last line" read picks up a GUC echo
 * whenever the query itself returns nothing — which is precisely the case a
 * reader with no grant on the measured module produces.
 */
function screenAs(userId) {
  const res = sqlAsAppUser(
    `${QUESTION}
     SELECT '${MV}' || COALESCE(mv.name, '') || '${US}' || COALESCE(mv.value::text, '')
         || '${US}' || COALESCE(mv.effective_scope, '')
       FROM w, LATERAL public.metric_value(w.metric_key, w.period_start, w.period_end) mv;
     ${QUESTION}
     SELECT '${BD}' || COALESCE(b.label, b.dimension_value, '') || '${US}'
         || COALESCE(b.value::text, '') || '${US}' || b.suppressed::text
       FROM w, LATERAL public.metric_breakdown(w.metric_key, w.dimension,
              w.period_start, w.period_end, 25, 5, 'contribution') b;`,
    { userId, companyId: COMPANY_ID },
  )
  if (!res.ok) throw new Error(`ANL-A15 could not resolve the report as ${userId}: ${res.error}`)

  // No ORDER BY on the breakdown, matching the exporter: the function's own
  // RETURN QUERY already orders by (is_residual, rank) and a function scan is
  // not reordered underneath it. Adding one here would let a change in that
  // internal order pass unnoticed on one side of the comparison.
  const lines = res.output.split('\n').map((l) => l.trim())
  const num = (s) => (s === '' ? null : Number(s))

  const mvLine = lines.find((l) => l.startsWith(MV))
  let metric = null
  if (mvLine) {
    const [name, value, scope] = mvLine.slice(MV.length).split(US)
    metric = { name, value: num(value), scope }
  }

  const rows = lines
    .filter((l) => l.startsWith(BD))
    .map((l) => {
      const [label, value, suppressed] = l.slice(BD.length).split(US)
      return { label, value: num(value), suppressed: suppressed === 'true' }
    })

  return { metric, rows }
}

/** The requester's own visibility tuple, as the exporter records it. */
function fingerprintOf(userId) {
  const res = sqlAsAppUser(
    `SELECT 'A15FP=' || COALESCE(public.analytics_scope_fingerprint(), '');`,
    { userId, companyId: COMPANY_ID },
  )
  const line = res.output
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('A15FP='))
  return line ? line.slice('A15FP='.length) : null
}

/** The most recent rendered-export record for one requester on this report. */
function snapshotFor(userId) {
  // `sql()` with a unit separator, not `sqlRow()`: the projection ends in
  // `figures::text`, whose labels contain commas and parentheses and whose
  // pipe-splitting would shred the JSON.
  const row = sql(
    `SELECT report_name || '${US}' || requested_by || '${US}' || format || '${US}' || period_token
         || '${US}' || COALESCE(scope_fingerprint, '') || '${US}' || definition_hash
         || '${US}' || figures_hash || '${US}' || COALESCE(row_count::text, '')
         || '${US}' || figures::text
       FROM public.analytics_snapshot
      WHERE report_id = '${REPORT_ID}' AND requested_by = '${userId}'
      ORDER BY generated_at DESC
      LIMIT 1`,
  )
  if (!row) return null
  const [
    reportName,
    requestedBy,
    format,
    periodToken,
    scopeFingerprint,
    definitionHash,
    figuresHash,
    rowCount,
    figures,
  ] = row.split(US)
  return {
    reportName,
    requestedBy,
    format,
    periodToken,
    scopeFingerprint,
    definitionHash,
    figuresHash,
    rowCount: rowCount === '' ? null : Number(rowCount),
    figures: JSON.parse(figures),
  }
}

/**
 * Request a real export and wait for the worker to record what it rendered.
 *
 * Through `request_report_export()` rather than `graphile_worker.add_job()`
 * directly: the gate and the render are one path in production, and enqueueing
 * by hand would let this file assert a rendered file that the product would have
 * refused to produce.
 *
 * ⚠️ 2s polling, not sub-second. Every `waitForSqlValue` tick spawns a
 * `docker exec`, and a 500ms interval over 30s has already produced
 * `spawnSync docker ETIMEDOUT` in this suite.
 */
async function exportAs(user) {
  const res = requestExportAs(user.id, REPORT_ID, 'xlsx')
  expect(res.ok, `${user.name} may request this export: ${res.error}`).toBe(true)
  await waitForSqlValue(
    `SELECT count(*) FROM public.analytics_snapshot
      WHERE report_id = '${REPORT_ID}' AND requested_by = '${user.id}'`,
    {
      timeoutMs: 90_000,
      intervalMs: 2_000,
      label: `the worker recorded the export it rendered for ${user.name}`,
    },
  )
  const snapshot = snapshotFor(user.id)
  expect(snapshot, `${user.name}'s export left a record of what it contained`).not.toBeNull()
  return snapshot
}

/** Line for line, the record of the file against the screen it came from. */
function expectFiguresMatchScreen(snapshot, screen, who) {
  const [section, ...extra] = snapshot.figures
  expect(section, `${who}'s export gathered the report's section`).toBeTruthy()
  expect(extra, 'the definition declares one section and the export rendered one').toHaveLength(0)

  const metric = section.metrics[0]
  expect(metric.name, 'named as the catalog names it, not by key').toBe(screen.metric.name)
  // THE assertion. Everything else in this file is scaffolding around it.
  expect(metric.value, `the exported figure is the one ${who} is shown`).toBe(screen.metric.value)
  expect(metric.scope, 'and it was resolved at the scope they actually hold').toBe(
    screen.metric.scope,
  )

  const rows = section.breakdown.rows
  expect(rows, 'one exported line per line on the screen').toHaveLength(screen.rows.length)
  // `empty` is not decoration: a breakdown that returns nothing because the
  // reader may not look must not render as a table with no rows, which reads as
  // "there were none".
  expect(section.breakdown.empty, 'an empty breakdown announces itself as empty').toBe(
    screen.rows.length === 0,
  )

  for (const [i, row] of rows.entries()) {
    expect(row.value, `breakdown line ${i} carries the reader's own value`).toBe(
      screen.rows[i].value,
    )
    expect(row.suppressed, `breakdown line ${i} is suppressed exactly as on screen`).toBe(
      screen.rows[i].suppressed,
    )
    // `toContain`, not `toBe`: the exporter decorates a withheld cell's label
    // with a reason. Asserting equality would force this file to keep its own
    // copy of that decoration rule and drift from it.
    expect(row.label, `breakdown line ${i} names the same segment`).toContain(screen.rows[i].label)
    if (row.suppressed) {
      expect(row.label, 'a withheld cell has to SAY so — blank reads as zero').toMatch(/withheld/i)
    }
  }

  expect(snapshot.rowCount, 'row_count counts the lines a reader would actually see').toBe(
    section.metrics.length + rows.length,
  )
}

const state = { readerSnapshot: null, ownerSnapshot: null }

// Each test is the premise of the next: the two snapshots are rendered once and
// then compared with each other. A failure part-way through must stop the file
// rather than let the later tests report on exports nobody produced.
test.describe.configure({ mode: 'serial' })

test.describe('ANL-A15 · an export contains what the requester can see', () => {
  test.beforeAll(async () => {
    await ensureRollup()

    // Snapshots FIRST. `analytics_snapshot.report_id` is ON DELETE SET NULL — by
    // design, so a record outlives the definition it describes — which means
    // deleting the report would orphan last run's rows rather than remove them,
    // and `report_name` is then the only handle left on them.
    sql(`DELETE FROM public.analytics_snapshot WHERE report_name LIKE 'ANL-A15%'`)
    sql(`DELETE FROM public.analytics_reports WHERE name LIKE 'ANL-A15%'`)
    // A crashed run can leave a queued export naming this report id. The worker
    // would render it the moment the fixture is recreated and write a snapshot
    // this file did not ask for, so it goes before the report does. Targeted by
    // payload rather than clearing the queue, which is another spec's state.
    sql(`DELETE FROM graphile_worker._private_jobs WHERE payload ->> 'reportId' = '${REPORT_ID}'`)

    // Created through the real INSERT policy as its owner, not planted as the
    // superuser: `analytics_reports_insert_rls` pins `owner_id` to the caller, so
    // a report seeded past it would be a row the product would never have
    // accepted — and ownership is half of what this file is about.
    const created = sqlAsAppUser(
      `INSERT INTO public.analytics_reports
         (id, company_id, owner_id, name, description, visibility, definition, created_by, updated_by)
       VALUES ('${REPORT_ID}', '${COMPANY_ID}', '${BLIND_OWNER.id}', '${REPORT_NAME}',
               'Owned by someone who cannot see the metric it measures.', 'shared',
               '${DEFINITION}'::jsonb, '${BLIND_OWNER.id}', '${BLIND_OWNER.id}')
       RETURNING id;`,
      { userId: BLIND_OWNER.id, companyId: COMPANY_ID },
    )
    if (!created.ok) throw new Error(`ANL-A15 could not seed its report: ${created.error}`)
  })

  test('the two people who may export this report see two different things on it', async () => {
    // The premise, stated before anything is rendered, so a surprising snapshot
    // later has somewhere to be traced back to. Every assertion in this file is
    // vacuous if these two ever agree.
    const reader = screenAs(SIGHTED_READER.id)
    const owner = screenAs(BLIND_OWNER.id)

    expect(reader.metric, 'the metric registry row is visible to both').not.toBeNull()
    expect(owner.metric, 'the metric registry row is visible to both').not.toBeNull()

    expect(
      reader.metric.value,
      `${SIGHTED_READER.name} holds ncr:read, so the figure resolves`,
    ).not.toBeNull()
    expect(reader.metric.scope, 'at tenant scope').toBe('tenant')
    expect(reader.rows.length, 'and the breakdown has lines to show').toBeGreaterThan(0)

    // Absent, not zero. `controller` holds the analytics module and nothing on
    // `ncr`, so the row exists and its value does not — the shape ANL-A4's
    // closing comment describes and says the E2E seed has no persona for.
    expect(
      owner.metric.value,
      `${BLIND_OWNER.name} owns this report and may not see what it measures`,
    ).toBeNull()
    expect(owner.metric.scope, 'no scope, because no grant resolved one').toBe('')
    expect(owner.rows, 'and no breakdown line is visible to them either').toHaveLength(0)

    // The identities the exporter records. Different tuples, so a snapshot
    // carrying the wrong one is detectable even before its figures are read.
    const readerFp = fingerprintOf(SIGHTED_READER.id)
    const ownerFp = fingerprintOf(BLIND_OWNER.id)
    expect(readerFp, 'a scope fingerprint resolves for the reader').toBeTruthy()
    expect(ownerFp, 'and for the owner').toBeTruthy()
    expect(readerFp, 'and the two are not the same person').not.toBe(ownerFp)
  })

  test("a non-owner's export carries the non-owner's figures, not the owner's", async () => {
    const snapshot = await exportAs(SIGHTED_READER)
    // Read AFTER the render, deliberately. `refresh_analytics_rollup` runs on a
    // */15 crontab and the figures move when it lands, so the two reads have to
    // be as close together as the test can make them — and the render happens at
    // the END of the queue latency, not at the start of it.
    const screen = screenAs(SIGHTED_READER.id)
    state.readerSnapshot = snapshot

    expect(snapshot.reportName, 'the record names the report it rendered').toBe(REPORT_NAME)
    expect(snapshot.requestedBy, 'and the person it was rendered for').toBe(SIGHTED_READER.id)
    expect(snapshot.requestedBy, 'who is not the person who owns it').not.toBe(BLIND_OWNER.id)
    expect(snapshot.format).toBe('xlsx')

    // The window the figures cover is the window the definition declares. The
    // defect this closes shipped once: the token was printed on the cover sheet
    // while every figure below it was gathered over the metric's default window
    // instead — a right number under a wrong label, which nobody can spot.
    expect(snapshot.periodToken, 'the period recorded is the period declared').toBe(
      JSON.parse(DEFINITION).periodToken,
    )

    expectFiguresMatchScreen(snapshot, screen, SIGHTED_READER.name)

    // Whose view this is, recorded on the row rather than inferred from
    // `requested_by`. "Exported by X" cannot reproduce a scope-resolved file a
    // year later, because X's grants move; the fingerprint pins the tuple.
    expect(snapshot.scopeFingerprint, "the requester's own visibility, not the owner's").toBe(
      fingerprintOf(SIGHTED_READER.id),
    )

    // The definition was COPIED as rendered, and the hash is GENERATED ALWAYS
    // over it — the writer cannot supply one — so this compares the stored
    // evidence against the live report through the one implementation there is.
    expect(snapshot.definitionHash, 'the definition recorded is the definition that exists').toBe(
      sql(
        `SELECT public.analytics_definition_hash(definition) FROM public.analytics_reports WHERE id = '${REPORT_ID}'`,
      ),
    )
  })

  test("the owner's own export of the same report is blank, because that is what they see", async () => {
    // THE TEST THIS FILE EXISTS FOR. Same report, same definition, same format,
    // a different requester — and this requester may not see the facts the
    // report measures. An export that resolved with more access than the person
    // who asked for it would put a number here, in a file already on its way to
    // an inbox, and there would be nothing on the artefact to show for it.
    const snapshot = await exportAs(BLIND_OWNER)
    const screen = screenAs(BLIND_OWNER.id)
    state.ownerSnapshot = snapshot

    expect(snapshot.requestedBy).toBe(BLIND_OWNER.id)
    expectFiguresMatchScreen(snapshot, screen, BLIND_OWNER.name)

    const metric = snapshot.figures[0].metrics[0]
    expect(metric.value, 'blank, because the requester may not look').toBeNull()
    // Stated against the other person's number as well as against null, because
    // "null" alone would also be satisfied by an export that is broken for
    // everybody — and the failure mode worth catching is the one where the
    // owner's file quietly contains the reader's tenant-wide count.
    expect(
      metric.value,
      'and specifically NOT the figure the other exporter is entitled to',
    ).not.toBe(state.readerSnapshot.figures[0].metrics[0].value)

    expect(snapshot.scopeFingerprint, 'resolved under the owner, who asked').toBe(
      fingerprintOf(BLIND_OWNER.id),
    )
    expect(snapshot.scopeFingerprint, 'and not under the reader, who did not').not.toBe(
      state.readerSnapshot.scopeFingerprint,
    )
  })

  test('one stored question, two different documents', async () => {
    // The module's central claim (ANL-A4) restated where it is hardest to
    // observe and most expensive to get wrong. Both hashes are GENERATED ALWAYS
    // columns over the stored jsonb, so neither the worker nor this spec can
    // assert a checksum it computed itself.
    const reader = state.readerSnapshot
    const owner = state.ownerSnapshot

    expect(reader.definitionHash, 'the same question was asked twice').toBe(owner.definitionHash)
    expect(
      reader.figuresHash,
      'and answered differently, because it was asked by two people',
    ).not.toBe(owner.figuresHash)
    expect(reader.rowCount, 'the reader received more lines than the owner').toBeGreaterThan(
      owner.rowCount,
    )
  })

  test('a record of an export is readable only by the person it was resolved for', async () => {
    // The table-level half of the same rule. These rows hold figures that are
    // already scope-resolved, so they are true for exactly one reader — anyone
    // else's read of them would be the scope escalation the export itself
    // refuses. Two snapshots exist on this report; each person may see one.
    function visible(userId) {
      const res = sqlAsAppUser(
        `SELECT 'A15SNAP=' || requested_by FROM public.analytics_snapshot
          WHERE report_id = '${REPORT_ID}';`,
        { userId, companyId: COMPANY_ID },
      )
      return res.output
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('A15SNAP='))
        .map((l) => l.slice('A15SNAP='.length))
    }

    expect(visible(SIGHTED_READER.id), 'the reader sees their own export and no other').toEqual([
      SIGHTED_READER.id,
    ])
    expect(visible(BLIND_OWNER.id), "and the owner sees theirs — not the reader's").toEqual([
      BLIND_OWNER.id,
    ])
  })

  test.afterAll(() => {
    // Snapshots before the report, for the ON DELETE SET NULL reason in
    // `beforeAll`: the other order leaves rows with no report to find them by.
    sql(`DELETE FROM public.analytics_snapshot WHERE report_name LIKE 'ANL-A15%'`)
    sql(`DELETE FROM public.analytics_reports WHERE name LIKE 'ANL-A15%'`)
    // Both exports above are REAL — rendered and mailed to Mailhog. Anything
    // still queued would be rendered after this suite has moved on and would
    // dirty the "exactly one job" counts ANL-A6 starts from.
    clearExportJobs()
  })
})
