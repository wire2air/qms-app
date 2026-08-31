// Shared setup for the `qualityEvents` project.
//
// Quality Events had NO E2E surface of any kind before 2026-08-06 — no project,
// no fixture, and zero rows in `database/e2e-seed.sql`. That absence is not
// incidental to the module's findings: its headline defect (F-01, RLS with no
// permission expression at all) was reachable by one GraphQL query, and its
// lifecycle defect (F-02) was reachable by one dropdown. Neither had a test that
// touched the layer it lived at.
//
// ── 2026-08-31: the lifecycle went server-side ───────────────────────────────
// Everything this file used to say about "the dropdown is the only writer DRAFT
// and CANCELLED have" is now history, and the helpers that expressed it
// (`statusCombobox`, `statusMenuOptions`, `pickStatus`) are deleted rather than
// kept as no-ops — a helper that still opens a control which no longer exists
// only ever produces a timeout pointing at the wrong thing.
//
// Three REST endpoints now own every legal edge, and they are the ONLY writers:
//
//   DRAFT -> OPEN        POST /v1/services/qualityEvents/:id/submit   (unsigned)
//   OPEN  -> CLOSED      POST /v1/services/qualityEvents/:id/close    (e-signed)
//   *     -> CANCELLED   POST /v1/services/qualityEvents/:id/cancel   (e-signed)
//
// which is what let migration 20260831122000 (QE-H3) reshape the guard to the
// peer form used by NCR and CAPA: **an untrusted caller may not change
// `status_id` at all**, errcode QMSQE. The client model carries
// `excludeFromGraphQL: ['update']` on `statusId` and the detail header renders a
// read-only `QualityEventStatusBadgeById`, so the guard is now defence in depth
// rather than the only barrier — three independent layers, and this project is
// the only place all three are exercised together against a running stack.
//
// What that means for the helpers below:
//   • UI helpers drive the three header actions (`submitViaUi`, `closeViaUi`,
//     `cancelViaUi`) and the e-sign prompt they open.
//   • `attemptStatusWriteAs` is the raw `app_user` half — the write path a
//     hand-rolled GraphQL mutation would take, and the one the trigger exists
//     for. It reports the SQLSTATE, so "refused with QMSQE" can be asserted
//     literally instead of by matching an error string.
//   • `resetLifecycleEvents` puts the four dedicated fixtures back. Close and
//     cancel are TERMINAL and the guard now refuses the way back even on the
//     trusted path, so the reset has to disable the trigger — see its comment.
import { expect } from '@playwright/test'
import { sql, sqlValue, sqlAsAppUser, waitForSqlValue } from './db.js'
import { COMPANY_ID, QUALITY_EVENTS } from './cast.js'
import { signWithPin } from './esign.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// ── DB lookups ───────────────────────────────────────────────────────────────

export function statusOf(eventId) {
  return sqlValue(`SELECT status_id FROM quality_events WHERE id = ${q(eventId)}`)
}

export function noteCount(eventId) {
  return Number(sqlValue(`SELECT count(*) FROM event_notes WHERE quality_event_id = ${q(eventId)}`))
}

/**
 * Restore the standing event's notes and attachment to their seeded state.
 *
 * Not optional hygiene — a crashed or failing test leaves residue that makes the
 * NEXT run fail somewhere else entirely. That happened while building this
 * suite: a broken assertion aborted before its own cleanup, leaving a third
 * note behind, and the next run's CONTROL test failed reading
 * ['INTERNAL','INTERNAL','PUBLIC']. The misleading part is that the failure
 * points at the control, not at the test that actually leaked. Reset in
 * beforeEach so no run can inherit another's mess.
 */
export function resetStandingNotes() {
  const ev = QUALITY_EVENTS.standing
  sql(`
    DELETE FROM event_notes
      WHERE quality_event_id = ${q(ev.id)}
        AND id NOT IN (${q(ev.internalNoteId)}, ${q(ev.publicNoteId)});
    UPDATE event_notes SET
        body = 'INTERNAL: supplier suspected of falsifying the CoA on lot 42.',
        visibility = 'INTERNAL', deleted_at = NULL
      WHERE id = ${q(ev.internalNoteId)};
    UPDATE event_notes SET
        body = 'PUBLIC: acknowledged, investigation underway.',
        visibility = 'PUBLIC', deleted_at = NULL
      WHERE id = ${q(ev.publicNoteId)};
    UPDATE event_attachments SET
        asset_id = 'e2eea100-0000-4000-8000-000000000001', deleted_at = NULL
      WHERE id = ${q(ev.attachmentId)};
  `)
}

/**
 * Restore the standing event to OPEN and clear the ledger rows filed against it.
 *
 * The status half is unchanged from 2026-08-06, and the two ALTERs are still
 * wrapped in a DO block that swallows their errors on purpose: if the guard is
 * absent — which is exactly the state a "does this suite fail without the fix?"
 * run creates — an ALTER on a missing trigger aborts the script and every test
 * then fails with a fixture error instead of the assertion failure that is the
 * actual evidence. A revert check that reds out for the wrong reason proves
 * nothing. They also cannot be skipped: QE-H3 made CLOSED and CANCELLED terminal
 * on the TRUSTED path too, so even this superuser UPDATE is refused without them.
 *
 * The signature half is new, and it is not tidiness. QE-J3 uses the standing
 * event as its EMPTY-REVIEW-FIELDS fixture and asserts that a refused close
 * filed NO signature — an assertion a single leftover row turns red, while
 * pointing at the endpoint rather than at the residue. One such row was found on
 * this event while the suite was being written (meaning CANCELLED, signed by
 * `owner`, from a hand-run of the new dialogs), which is precisely the scenario.
 *
 * Audit rows are deliberately NOT cleared here: `prevent_audit_log_mutation()`
 * refuses DELETE on `audit_logs` for the superuser too, so specs assert on a
 * delta against a baseline instead. See `auditRowsFor`.
 */
export function resetStandingEvent() {
  const id = q(QUALITY_EVENTS.standing.id)
  sql(`
    DELETE FROM signatures WHERE quality_event_id = ${id};
    DO $$ BEGIN
      ALTER TABLE quality_events DISABLE TRIGGER quality_events_status_transition_guard;
    EXCEPTION WHEN undefined_object THEN NULL; END $$;
    UPDATE quality_events SET status_id = 'OPEN' WHERE id = ${id};
    DO $$ BEGIN
      ALTER TABLE quality_events ENABLE TRIGGER quality_events_status_transition_guard;
    EXCEPTION WHEN undefined_object THEN NULL; END $$;
  `)
}

// ── RLS probes (the F-01 half) ───────────────────────────────────────────────
//
// These run raw SQL as the `app_user` DB role — the role PostGraphile uses for
// every GraphQL request, and the ONLY way to exercise these policies from a
// test, because REST/Sequelize connects as the superuser and bypasses RLS
// entirely. There is no REST route above `event_notes`/`event_attachments` at
// all, so this is not a shortcut around the UI: it *is* the interface.

/**
 * `sqlAsAppUser` runs a SCRIPT — the site-GUC `DO` block, `SET ROLE`, three
 * `set_config` selects, then the caller's query — and returns the output of ALL
 * of them. So the payload is always the tail, never the whole string. Reading
 * `res.output` directly yields e.g. "DO\nSET\n<uuid>\n<uuid>\nfalse\n1", which
 * `Number()` turns into NaN and every count assertion then fails identically
 * regardless of what the policy did. Same `.split('\n').pop()` convention the
 * audits suite uses.
 */
const lastLine = (out) => out.trim().split('\n').pop().trim()

/** Rows the caller's query produced, with the script preamble stripped. */
function payloadLines(out, expectedPreamble = 5) {
  return out
    .trim()
    .split('\n')
    .slice(expectedPreamble)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function readNotesAs(user, eventId = QUALITY_EVENTS.standing.id) {
  const res = sqlAsAppUser(
    `SELECT visibility FROM event_notes WHERE quality_event_id = ${q(eventId)} ORDER BY visibility;`,
    { userId: user.id, companyId: COMPANY_ID },
  )
  if (!res.ok) return { ok: false, visibilities: [], error: res.error }
  return { ok: true, visibilities: payloadLines(res.output), error: '' }
}

export function readAttachmentsAs(user, eventId = QUALITY_EVENTS.standing.id) {
  const res = sqlAsAppUser(
    `SELECT count(*) FROM event_attachments WHERE quality_event_id = ${q(eventId)};`,
    { userId: user.id, companyId: COMPANY_ID },
  )
  return res.ok ? Number(lastLine(res.output)) : -1
}

export function canSeeParentEventAs(user, eventId = QUALITY_EVENTS.standing.id) {
  const res = sqlAsAppUser(`SELECT count(*) FROM quality_events WHERE id = ${q(eventId)};`, {
    userId: user.id,
    companyId: COMPANY_ID,
  })
  return res.ok ? Number(lastLine(res.output)) : -1
}

/**
 * Attempt a write as `user` and report whether any row changed.
 *
 * A denied RLS write is NOT an error — it silently affects zero rows, which is
 * why every assertion here is on the row count rather than on a thrown message.
 * A zero-grant caller getting `rowCount 0` looks identical to a no-op, so the
 * suites always pair these with a positive control.
 */
export function writeAs(user, statement) {
  const res = sqlAsAppUser(`WITH x AS (${statement} RETURNING 1) SELECT count(*) FROM x;`, {
    userId: user.id,
    companyId: COMPANY_ID,
  })
  if (!res.ok) return { rows: 0, rejected: true, error: res.error }
  return { rows: Number(lastLine(res.output)), rejected: false, error: '' }
}

// ── The signature / audit ledger (the QE-H1 half) ────────────────────────────
//
// Both read as the superuser, deliberately. `signatures` and `audit_logs` are
// the regulator-facing record and a journey's claim is "the act was written
// down", not "the signer can read it back" — reading through RLS would let a
// policy change quietly turn a missing ledger row into a passing test.

/**
 * Part-11 signature rows filed against a quality event.
 *
 * `signatures.quality_event_id` DID NOT EXIST before migration 20260831120000:
 * the subject CHECK admitted nine subjects and a quality event was not among
 * them, so a QE signature was not merely absent but unrepresentable. Every
 * caller of this helper therefore fails with a `column does not exist` error —
 * not a soft assertion failure — if that migration is reverted, which is the
 * loudest possible signal and the reason the column is queried by name.
 */
export function signatureRowsFor(eventId) {
  const out = sql(`
    SELECT id, meaning, user_id, coalesce(payload_hash, ''), coalesce(comments, '')
      FROM signatures
     WHERE quality_event_id = ${q(eventId)}
     ORDER BY signed_at
  `)
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, meaning, userId, payloadHash, comments] = line.split('|')
    return { id, meaning, userId, payloadHash: payloadHash || null, comments: comments || '' }
  })
}

/**
 * Audit rows for an event, optionally narrowed to one action, oldest first.
 *
 * **These rows can never be deleted.** `prevent_audit_log_mutation()` refuses
 * UPDATE and DELETE on `audit_logs` outright — for the superuser too, which is
 * the whole point of an append-only trail. So unlike `signatures`, the reset
 * helpers cannot clear them, and no spec may assert `toHaveLength(1)` on an
 * action: the second run of the suite would see two. Every caller therefore
 * snapshots `.length` BEFORE the action and asserts on the delta, reading the
 * new row as `rows.at(-1)`. Discovered the hard way — the first version of these
 * fixtures tried to DELETE and every test failed inside `beforeEach`.
 *
 * `new_value_json` is parsed here rather than handed back as text: the close and
 * cancel payloads carry the signer's comment, the cancel reason and the
 * signature id, and a spec asserting "the reason reached the audit trail" wants
 * the value, not a shape.
 */
export function auditRowsFor(eventId, action = null) {
  const out = sql(`
    SELECT action, coalesce(performed_by::text, ''), coalesce(new_value_json::text, '{}')
      FROM audit_logs
     WHERE entity_type = 'QualityEvent' AND entity_id = ${q(eventId)}
       ${action ? `AND action = ${q(action)}` : ''}
     ORDER BY created_at
  `)
  if (!out) return []
  return out.split('\n').map((line) => {
    // Split on the FIRST two pipes only — new_value_json is JSON and may itself
    // contain a pipe inside a comment or a cancel reason, which a plain
    // `split('|')` would shred into columns that no longer line up.
    const first = line.indexOf('|')
    const second = line.indexOf('|', first + 1)
    const action = line.slice(0, first)
    const performedBy = line.slice(first + 1, second)
    const rawJson = line.slice(second + 1)
    let newValue = {}
    try {
      newValue = JSON.parse(rawJson)
    } catch {
      newValue = {}
    }
    return { action, performedBy: performedBy || null, newValue }
  })
}

// ── Resetting the lifecycle fixtures ─────────────────────────────────────────

/**
 * The four dedicated lifecycle events (seed §28f), keyed by their seeded status.
 *
 * Kept as one list so `resetLifecycleEvents` cannot drift from the seed by
 * restoring three of four — the failure mode that leaves the fourth carrying
 * yesterday's terminal status into today's run.
 */
const LIFECYCLE_FIXTURES = [
  { id: QUALITY_EVENTS.close.id, statusId: 'OPEN' },
  { id: QUALITY_EVENTS.cancel.id, statusId: 'OPEN' },
  { id: QUALITY_EVENTS.draft.id, statusId: 'DRAFT' },
  { id: QUALITY_EVENTS.foreignReviewer.id, statusId: 'OPEN' },
]

/**
 * Put the four lifecycle fixtures back to their seeded status and clear the
 * signature rows a previous run filed against them.
 *
 * Three things make this harder than `resetStandingEvent` was, and all three are
 * consequences of the fix this suite exists to prove:
 *
 *  1. **The trigger has to come down.** QE-H3 (20260831122000) made CLOSED and
 *     CANCELLED terminal on the TRUSTED path too — a superuser `UPDATE` back to
 *     OPEN is refused with QMSQE exactly as an `app_user` one is. That is correct
 *     behaviour and it is also why the reset cannot simply be an UPDATE. Same
 *     `EXCEPTION WHEN undefined_object` swallow as `resetStandingEvent`, for the
 *     same reason: a "does this suite fail without the fix?" run has no trigger,
 *     and a fixture that aborts there reds out every test for the wrong reason.
 *  2. **The signatures have to go, and go FIRST.** `signatures_quality_event_id_fkey`
 *     is ON DELETE RESTRICT, so the rows are deleted explicitly rather than left
 *     to cascade — and a stale row from a crashed run would otherwise turn the
 *     `exactly one CLOSED signature` assertion into `2` on the next pass, which
 *     reads as "the endpoint double-signed" rather than "the last run died".
 *  3. **The audit rows CANNOT go, and the specs are shaped around that.**
 *     `prevent_audit_log_mutation()` refuses UPDATE and DELETE on `audit_logs`
 *     for every role including the superuser, which is exactly the guarantee an
 *     append-only trail is supposed to give. A fixture must not be the thing
 *     that breaks it, so CLOSE / CANCEL / SUBMIT_FOR_REVIEW rows accumulate
 *     across runs and every assertion over them is a DELTA against a baseline
 *     taken in the test — see `auditRowsFor`.
 *
 * Called from `beforeEach`, never only from `afterAll`: a test that crashes
 * mid-journey never reaches its own cleanup, and the residue then fails a
 * DIFFERENT test on the next run.
 */
export function resetLifecycleEvents() {
  const ids = LIFECYCLE_FIXTURES.map((f) => q(f.id)).join(', ')
  const restores = LIFECYCLE_FIXTURES.map(
    (f) => `UPDATE quality_events SET status_id = ${q(f.statusId)} WHERE id = ${q(f.id)};`,
  ).join('\n    ')
  sql(`
    DELETE FROM signatures WHERE quality_event_id IN (${ids});
    DO $$ BEGIN
      ALTER TABLE quality_events DISABLE TRIGGER quality_events_status_transition_guard;
    EXCEPTION WHEN undefined_object THEN NULL; END $$;
    ${restores}
    DO $$ BEGIN
      ALTER TABLE quality_events ENABLE TRIGGER quality_events_status_transition_guard;
    EXCEPTION WHEN undefined_object THEN NULL; END $$;
    -- cancelQualityEvent retires the reviewer's open task; hand it back so a
    -- re-run starts from the same queue state the seed describes.
    UPDATE task_instances SET status_id = 'ASSIGNED'
      WHERE entity_type = 'QualityEvent' AND entity_id IN (${ids}) AND status_id = 'CANCELLED';
  `)
}

// ── The raw write path the trigger exists for ────────────────────────────────

/**
 * Try to move an event's `status_id` as the untrusted `app_user` role and report
 * what the database did about it.
 *
 * This is the exact path a hand-rolled GraphQL mutation takes. `writeAs` above
 * cannot express the assertion this suite needs, for two separate reasons:
 *
 *   • **A refusal and a no-op look identical through it.** `writeAs` reports a
 *     row count, and RLS denies by affecting zero rows. "0 rows" is equally
 *     consistent with "the guard refused", "the policy hid the row" and "the
 *     WHERE clause matched nothing" — three very different states, only one of
 *     which is the fix working.
 *   • **psql hides the SQLSTATE.** At the default VERBOSITY the client prints
 *     `ERROR:  <message>` and no error code, so a test that wants to assert
 *     QMSQE can only match on prose that a future edit is free to reword.
 *
 * So the statement runs inside a DO block that CATCHES its own failure, records
 * `SQLSTATE` and `ROW_COUNT`, and then raises unconditionally. The final raise is
 * load-bearing twice over: it is how the two values escape to stdout, and it
 * rolls the DO block back, so a probe that unexpectedly SUCCEEDS still leaves the
 * fixture untouched for the assertions that follow.
 *
 * @returns {{ sqlstate: string, rows: number }} `sqlstate` is `'NO_ERROR'` when
 *   the write was not refused — pair it with `rows` to tell a silent RLS denial
 *   (`NO_ERROR` / 0) apart from an accepted write (`NO_ERROR` / 1), which is the
 *   regression this whole file guards against.
 */
export function attemptStatusWriteAs(user, eventId, targetStatus) {
  const res = sqlAsAppUser(
    `DO $probe$
       DECLARE v_state text := 'NO_ERROR'; v_rows int := 0;
       BEGIN
         BEGIN
           UPDATE quality_events SET status_id = ${q(targetStatus)} WHERE id = ${q(eventId)};
           GET DIAGNOSTICS v_rows = ROW_COUNT;
         EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
         END;
         RAISE EXCEPTION 'QE_PROBE state=% rows=%', v_state, v_rows;
       END $probe$;`,
    { userId: user.id, companyId: COMPANY_ID },
  )
  const marker = /QE_PROBE state=(\S+) rows=(\d+)/.exec(`${res.error}${res.output}`)
  if (!marker) {
    throw new Error(
      `attemptStatusWriteAs could not read its own probe marker. ` +
        `stdout=${JSON.stringify(res.output)} stderr=${JSON.stringify(res.error)}`,
    )
  }
  return { sqlstate: marker[1], rows: Number(marker[2]) }
}

// ── UI helpers ───────────────────────────────────────────────────────────────

/**
 * Open an event's detail page and wait for it to be the RIGHT event.
 *
 * The readiness anchor is the event NUMBER read from the database, not a
 * constant: four of the five seeded events are lifecycle fixtures with their own
 * numbers, and anchoring every one of them on the standing event's `EV-E2E-0001`
 * would have every journey wait on a string that never appears and then time out
 * on the wrong page.
 */
export async function openEvent(page, eventId) {
  const number = sqlValue(`SELECT event_number FROM quality_events WHERE id = ${q(eventId)}`)
  expect(number, `event ${eventId} is seeded`).toBeTruthy()
  await page.goto(`/qualityEvents/${eventId}`, { waitUntil: 'domcontentloaded' })
  // 45 s, not the 20 s this used to allow. Every test gets a fresh browser
  // context, so every navigation lands on an EMPTY IndexedDB and the syncEngine
  // bootstraps the whole tenant before any live query can resolve — measured at
  // ~286 GraphQL requests for one detail page on the E2E tenant. Until that
  // finishes the page renders "Loading…", and a 20 s budget makes the whole
  // suite a race against how busy the dev stack happens to be.
  await expect(page.getByText(number).first()).toBeVisible({ timeout: 45_000 })
}

/**
 * A header action-bar button.
 *
 * `.first()` and `exact` are both deliberate. `DetailActionBar` keeps only the
 * top three actions inline and pushes the rest into an overflow menu, and the
 * dialogs this page opens carry their own buttons — "Cancel" is a header action
 * AND the e-sign dialog's dismiss control. Anchoring on the first exact match
 * takes the action bar, which precedes every dialog in DOM order.
 */
export function actionBarButton(page, name) {
  return page.getByRole('button', { name, exact: true }).first()
}

/**
 * The innermost element rendering the status label in the detail header.
 *
 * Located by TEXT rather than by DOM position, deliberately. `DetailHeader`
 * gives the `#status` slot no test id and the page overrides `#title` with a
 * plain `<span>`, so there is no stable structural anchor to walk from — and an
 * anchor that silently resolves to the wrong node is worse than none, because
 * "the status control is absent" is exactly the assertion a wrong node makes
 * pass. `.last()` is the load-bearing half: `getByText` matches every ancestor
 * whose text is also exactly the label, and it is the INNERMOST one whose
 * ancestry answers the question below.
 */
export function statusLabel(page, label) {
  return page.getByText(label, { exact: true }).last()
}

/**
 * True when the located node sits inside something a user can operate.
 *
 * This is the shape of the F-02 regression, stated structurally: the bypass was
 * a `BaseSelect` whose `#selected` slot rendered the very same status badge, so
 * a returning dropdown looks IDENTICAL to the read-only badge by text — the only
 * difference is that the text is wrapped in a `role="combobox"` button. Asserting
 * on the ancestry survives any amount of markup churn in between.
 */
export function hasInteractiveAncestor(locator) {
  return locator.evaluate(
    (el) => !!el.closest('button, [role="combobox"], [role="listbox"], select, a, input'),
  )
}

/**
 * The visible text of every combobox on the page, whitespace-normalised.
 *
 * The complement of the check above, and the reason both exist: this one cannot
 * be fooled by a control rendered somewhere other than the header. If any picker
 * on the page currently READS a lifecycle status, it is a status picker whatever
 * it is called and wherever it lives.
 */
export async function comboboxTexts(page) {
  const texts = await page.getByRole('combobox').allInnerTexts()
  return texts.map((t) => t.replace(/\s+/g, ' ').trim())
}

/**
 * Close an event through the sanctioned UI path: header Close → e-sign → Sign.
 *
 * There is no confirm dialog in front of the PIN prompt (unlike the Change
 * Request page, which collects optional closure notes first) — Close opens
 * `workflowInstanceEsignAuthDialog` directly, so `comments` is always null on the
 * request. `signWithPin` handles the dialog's own reset race.
 */
export async function closeViaUi(page) {
  await actionBarButton(page, 'Close').click()
  await signWithPin(page)
}

/**
 * Cancel an event: header Cancel → reason → Sign & Cancel → e-sign → Sign.
 *
 * Two dialogs, never both open — the reason dialog closes before the e-sign one
 * opens, because two stacked BaseDialogs put two focus traps in competition and
 * the PIN field silently stops receiving keystrokes.
 */
export async function cancelViaUi(page, { reason }) {
  await openCancelDialog(page)
  await cancelReasonField(page).fill(reason)
  await page.getByRole('button', { name: 'Sign & Cancel' }).click()
  // WAIT FOR THE REASON DIALOG TO GO before typing the PIN. Not politeness — a
  // measured flake, caught on 2026-08-31: the run recorded a cancel whose audit
  // reason was
  //
  //   "E2E cancel — duplicate of EV-E2E-0002, filed twice by the same operator.12345678"
  //
  // …the PIN, appended to the reason. `fill()` focuses its target and then
  // inserts text at the focused element; while `handleCancelClick` is closing
  // one BaseDialog and opening another, TWO HeadlessUI focus traps are live and
  // one of them yanks focus back to the reason textarea between the focus and
  // the insert. The keystrokes land in whatever holds focus, not in the locator
  // Playwright resolved. `signWithPin` cannot see this — its own
  // `toHaveValue(pin)` retry passes on the second attempt once focus settles,
  // by which point the reason has already been corrupted and posted.
  //
  // Waiting for the reason field to detach closes the window entirely: there is
  // exactly one dialog on screen when the PIN is typed.
  await expect(cancelReasonField(page)).toBeHidden({ timeout: 10_000 })
  await signWithPin(page)
}

/** Open the cancel REASON dialog and wait for it, without submitting. */
export async function openCancelDialog(page) {
  await actionBarButton(page, 'Cancel').click()
  await expect(page.getByRole('heading', { name: 'Cancel Event' })).toBeVisible({ timeout: 10_000 })
}

/** The reason textarea inside the cancel dialog. */
export function cancelReasonField(page) {
  return page.getByPlaceholder('Why is this event being cancelled?')
}

/** Submit a DRAFT event (DRAFT → OPEN). No signature — see the route comment. */
export async function submitViaUi(page) {
  await actionBarButton(page, 'Submit').click()
}

/**
 * Wait for an event to reach `expected`.
 *
 * Every lifecycle action is a REST round trip followed by a sync push, so the
 * DB is the source of truth and the UI catches up afterwards. Polling the row
 * rather than sleeping is what stops a "the status did NOT move" assertion
 * passing merely because it ran before the write landed — the failure mode that
 * makes a guard test worthless.
 */
export async function waitForStatus(eventId, expected, { timeoutMs = 30_000 } = {}) {
  await waitForSqlValue(
    `SELECT count(*) FROM quality_events WHERE id = ${q(eventId)} AND status_id = ${q(expected)}`,
    { timeoutMs, label: `quality event ${eventId} reaches ${expected}` },
  )
}
