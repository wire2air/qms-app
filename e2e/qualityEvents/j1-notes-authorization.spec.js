// QE-J1 — F-01: authorization on event notes and attachments.
//
// THE FINDING (docs/modules/quality-events/11-security-review.md §1).
// `event_notes` and `event_attachments` carried a single `FOR ALL` policy whose
// USING *and* WITH CHECK were the bare `company_id` predicate — no permission
// expression of any kind — with DELETE/INSERT/SELECT/UPDATE granted to
// `app_user`. And unlike every other instance of this defect class in the
// program, there is **no application layer above them**: no REST route, no
// controller, no Zod schema. PostGraphile generates full CRUD and RLS was the
// only gate.
//
// So this suite issues raw SQL as `app_user` rather than driving a page. That is
// not a shortcut around the UI — there IS no UI path to these tables, and
// `app_user` is exactly the role every GraphQL request runs under. The
// syncEngine's mutations land here.
//
// Fixed by migration 20260806100000 + the same policies in database/rls.sql.
//
// Every denial assertion is paired with a positive control. A zero-grant caller
// getting `rowCount 0` is indistinguishable from a no-op statement, so without
// the control these tests would pass against a table that did not exist.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, QUALITY_EVENTS, SUPPLIER_PORTAL_USER_ID } from '../fixtures/cast.js'
import {
  readNotesAs,
  readAttachmentsAs,
  canSeeParentEventAs,
  writeAs,
  noteCount,
  resetStandingNotes,
} from '../fixtures/qualityEvents.js'

const STANDING = QUALITY_EVENTS.standing
const REPORTER = USERS.deptAdmin // reported_by_user_id on the standing event
const SUPPLIER = { id: SUPPLIER_PORTAL_USER_ID }

test.describe('QE-J1 — event notes / attachments authorization (F-01)', () => {
  test.use({ storageState: AUTH.owner })

  // Every test starts from the seeded note set. Without this a test that fails
  // before its own cleanup poisons the NEXT run — and the failure surfaces on
  // the CONTROL test, which points at the wrong thing entirely.
  test.beforeEach(() => resetStandingNotes())
  test.afterAll(() => resetStandingNotes())

  test('CONTROL: the reporter reads both notes and the attachment', async () => {
    // The positive control for everything below. The reporter holds
    // quality_events create+read but is NOT the assignee — they reach the event
    // through the SELECT policy's reachability OR (reported_by_user_id). If this
    // ever fails, the denials below are measuring a broken fixture, not a fix.
    expect(canSeeParentEventAs(REPORTER)).toBe(1)

    const notes = readNotesAs(REPORTER)
    expect(notes.ok).toBe(true)
    expect(notes.visibilities).toEqual(['INTERNAL', 'PUBLIC'])
    expect(readAttachmentsAs(REPORTER)).toBe(1)
  })

  test('a zero-grant member cannot reach the event, its notes, or its attachments', async () => {
    // THE FINDING. `noAccess` holds nothing on this module. Before the fix the
    // notes policy was company-wide while the parent's was scope-enforced, so
    // this persona could read every note in the tenant — including on events
    // they could not SELECT.
    expect(canSeeParentEventAs(USERS.noAccess)).toBe(0)

    const notes = readNotesAs(USERS.noAccess)
    expect(notes.visibilities).toEqual([])
    expect(readAttachmentsAs(USERS.noAccess)).toBe(0)
  })

  test('a zero-grant member cannot rewrite, reclassify, repoint or delete', async () => {
    const before = noteCount(STANDING.id)

    const rewrite = writeAs(
      USERS.noAccess,
      `UPDATE event_notes SET body = 'TAMPERED' WHERE id = '${STANDING.internalNoteId}'`,
    )
    expect(rewrite.rows).toBe(0)

    // The confidentiality-widening write: flipping INTERNAL→PUBLIC is what
    // exposes an internal note to the supplier portal.
    const reclassify = writeAs(
      USERS.noAccess,
      `UPDATE event_notes SET visibility = 'PUBLIC' WHERE id = '${STANDING.internalNoteId}'`,
    )
    expect(reclassify.rows).toBe(0)

    // asset_id is a bare UUID with no FK, so a repoint is otherwise invisible.
    const repoint = writeAs(
      USERS.noAccess,
      `UPDATE event_attachments SET asset_id = gen_random_uuid() WHERE id = '${STANDING.attachmentId}'`,
    )
    expect(repoint.rows).toBe(0)

    const del = writeAs(
      USERS.noAccess,
      `DELETE FROM event_notes WHERE id = '${STANDING.publicNoteId}'`,
    )
    expect(del.rows).toBe(0)

    // Nothing was actually destroyed by the attempt.
    expect(noteCount(STANDING.id)).toBe(before)
  })

  test('an EXTERNAL_SUPPLIER shared on the event reads PUBLIC notes but never INTERNAL ones', async () => {
    // `visibility` is NOT NULL, CHECKed to INTERNAL|PUBLIC and defaults to
    // INTERNAL — but it was enforced NOWHERE in the database, while
    // `qualityEvents` is supplier-exempt in the SPA router guard. This is the
    // finding's external-confidentiality dimension.
    //
    // The supplier is deliberately SHARED on the event, so the parent IS
    // reachable. Without that, seeing no notes would prove only that they could
    // not reach the event.
    expect(canSeeParentEventAs(SUPPLIER)).toBe(1)

    const notes = readNotesAs(SUPPLIER)
    expect(notes.ok).toBe(true)
    expect(notes.visibilities).toEqual(['PUBLIC'])
  })

  test('a note cannot be forged in another user’s name', async () => {
    // The reporter CAN post on this event — but only as themselves. The INSERT
    // policy requires created_by = the acting user, which is what closes the
    // write-a-note-as-somebody-else vector.
    const attempt = writeAs(
      REPORTER,
      `INSERT INTO event_notes (company_id, quality_event_id, body, visibility, created_by, created_at, updated_at)
       SELECT company_id, id, 'forged', 'INTERNAL', '${USERS.qeManager.id}', now(), now()
         FROM quality_events WHERE id = '${STANDING.id}'`,
    )
    // RLS WITH CHECK rejects this outright (42501) rather than affecting 0 rows.
    expect(attempt.rejected || attempt.rows === 0).toBe(true)
  })

  test('the reporter can post a note as themselves, holding no module update grant', async () => {
    // This is why INSERT is deliberately NOT gated on `quality_events:update`.
    // Commenting is the module's collaboration surface, and the parent's
    // reachability OR admits assignees, reporters and shared users who hold no
    // module grant. Gating it would stop an assigned reviewer commenting on the
    // event they were assigned — worse than the finding.
    const before = noteCount(STANDING.id)

    const posted = writeAs(
      REPORTER,
      `INSERT INTO event_notes (company_id, quality_event_id, body, visibility, created_by, created_at, updated_at)
       SELECT company_id, id, 'E2E reporter note', 'INTERNAL', '${REPORTER.id}', now(), now()
         FROM quality_events WHERE id = '${STANDING.id}'`,
    )
    expect(posted.rows).toBe(1)
    expect(noteCount(STANDING.id)).toBe(before + 1)

    // Clean up so the visibility assertions above stay deterministic on re-run.
    writeAs(REPORTER, `DELETE FROM event_notes WHERE body = 'E2E reporter note'`)
    expect(noteCount(STANDING.id)).toBe(before)
  })

  test('a quality_events:update holder can moderate a note they did not write', async () => {
    // The moderation case, and the second positive control: it proves the
    // UPDATE policy's permission branch is reachable, not merely that the
    // ownership branch denies everyone else.
    const moderated = writeAs(
      USERS.qeManager,
      `UPDATE event_notes SET body = 'redacted by moderator' WHERE id = '${STANDING.publicNoteId}'`,
    )
    expect(moderated.rows).toBe(1)

    // Restore the seeded body.
    writeAs(
      USERS.qeManager,
      `UPDATE event_notes SET body = 'PUBLIC: acknowledged, investigation underway.' WHERE id = '${STANDING.publicNoteId}'`,
    )
  })
})
