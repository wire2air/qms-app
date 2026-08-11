// Shared setup for the `qualityEvents` project.
//
// Quality Events had NO E2E surface of any kind before 2026-08-06 — no project,
// no fixture, and zero rows in `database/e2e-seed.sql`. That absence is not
// incidental to the module's findings: its headline defect (F-01, RLS with no
// permission expression at all) was reachable by one GraphQL query, and its
// lifecycle defect (F-02) was reachable by one dropdown. Neither had a test that
// touched the layer it lived at.
//
// The DB-level fixes are covered by 39 integration/worker tests. What this
// project adds is the half those cannot reach: **the UI control itself.** F-02's
// bypass was `<QualityEventStatusSelectMenu v-model="event.statusId">` behind a
// 600 ms debounced autosave, offering all seven statuses. The guard now refuses
// two of them at the database — these journeys prove that refusal actually
// reaches the user, and, just as importantly, that the other five still work.
import { expect } from '@playwright/test'
import { sql, sqlValue, sqlAsAppUser } from './db.js'
import { COMPANY_ID, QUALITY_EVENTS } from './cast.js'

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

/** Restore the standing event to OPEN, bypassing the guard (a test may have moved it). */
export function resetStandingEvent() {
  // The two ALTERs are wrapped in a DO block that swallows their errors on
  // purpose. If the guard is absent — which is exactly the state a "does this
  // suite fail without the fix?" run creates — an ALTER on a missing trigger
  // aborts the script, and all six tests then fail with a fixture error instead
  // of the assertion failure that is the actual evidence. A revert check that
  // reds out for the wrong reason proves nothing.
  sql(`
    DO $$ BEGIN
      ALTER TABLE quality_events DISABLE TRIGGER quality_events_status_transition_guard;
    EXCEPTION WHEN undefined_object THEN NULL; END $$;
    UPDATE quality_events SET status_id = 'OPEN'
      WHERE id = ${q(QUALITY_EVENTS.standing.id)};
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

// ── UI helpers ───────────────────────────────────────────────────────────────

export async function openEvent(page, eventId) {
  await page.goto(`/qualityEvents/${eventId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText(QUALITY_EVENTS.standing.number).first()).toBeVisible({
    timeout: 20_000,
  })
}

/**
 * The status combobox in the detail header (rendered only when canUpdate).
 *
 * Exported so a spec can assert what the control currently reads without
 * re-deriving the selector — the header select is the module's central control
 * and every spec that touches it must agree on where it is.
 */
export function statusCombobox(page) {
  return page.locator('[role="combobox"]').first()
}

/**
 * Every status the header dropdown offers, leaving the menu closed again.
 *
 * @param {object} [opts]
 * @param {(page) => Promise<void>} [opts.onOpen] runs while the listbox is
 *   OPEN, just before it is dismissed. Inert by default — only the screenshot
 *   spec passes it, to capture the open menu without duplicating this flow.
 */
export async function statusMenuOptions(page, { onOpen } = {}) {
  await statusCombobox(page).click()
  const options = await page.getByRole('listbox').getByRole('option').allTextContents()
  if (onOpen) await onOpen(page)
  await page.keyboard.press('Escape')
  return options.map((s) => s.trim()).filter(Boolean)
}

/**
 * Pick a status from the detail-header dropdown.
 *
 * The write is a 600 ms debounced autosave, so nothing is asserted here — the
 * caller waits on the DB. Returns after the debounce window plus slack, because
 * asserting "the status did NOT change" immediately would pass even if the write
 * were still in flight, which is the failure mode that makes a guard test
 * worthless.
 */
export async function pickStatus(page, statusLabel) {
  await statusCombobox(page).click()
  await page.getByRole('listbox').getByRole('option', { name: statusLabel }).first().click()
  await page.waitForTimeout(2_500)
}
