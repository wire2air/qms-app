// QE-J2 — F-02 / QE-H3: the client cannot move a quality event's lifecycle.
//
// **This is the journey the whole project exists for.** F-02 was not a raw-
// GraphQL finding: the exploit was a plain dropdown on the detail header, bound
// straight to `statusId`, behind a 600 ms debounced autosave, offering every
// status to any `quality_events:update` holder:
//
//     QualityEventsPageId.vue:419
//     <QualityEventStatusSelectMenu v-if="canUpdate" v-model="event.statusId" />
//
// Picking CLOSED skipped every gate `closeQualityEvent` enforces —
// assertAssignedReviewer, the three mandatory review fields, the CLOSE audit
// row, and API-03's `quality_events:close` permission.
//
// ── 2026-08-31: the compromise ended, and so did this file's old shape ───────
// The file name is kept because the finding is still called F-02, but there is
// no dropdown left to test. Migration 20260806110000 could not simply block
// `status_id` the way the NCR and CAPA guards do, because DRAFT, UNDER_REVIEW,
// AWAITING_DECISION and CANCELLED had **no server-side writer at all** — the
// dropdown was their only path, and blocking it would have stranded four of
// seven states. So it gated only the states that already had gated REST paths
// and left the rest open, and this suite's second half existed to defend that:
//
//     ~~NO REGRESSION: the working states the dropdown solely owns still move~~
//
// That test is DELETED, not weakened, because the premise under it is now false
// in both halves. `20260831122000-lock-quality-event-lifecycle` ships the
// missing writers —
//
//     DRAFT -> OPEN        POST /qualityEvents/:id/submit   (new, unsigned)
//     * -> CANCELLED       POST /qualityEvents/:id/cancel   (new, e-signed)
//     OPEN -> CLOSED       POST /qualityEvents/:id/close    (now e-signed)
//
// — so every legal edge has a gated path, and the guard adopts the peer shape:
// **an untrusted caller may not change `status_id` at all**, errcode QMSQE. A
// test asserting that DRAFT and CANCELLED are still reachable from the client
// would now be asserting the presence of the bypass.
//
// So this file proves the NEW invariant, in the three independent layers that
// now carry it — and it is the only place all three are exercised together:
//
//   1. **There is no status control in the UI.** The header renders a read-only
//      `QualityEventStatusBadgeById` for everyone, `quality_events:update`
//      holders included. `QualityEventStatusSelectMenu.vue` is deleted.
//   2. **The client model cannot express the write.** `statusId` carries
//      `excludeFromGraphQL: ['update']`, so it is not in the generated
//      `updateQualityEvent` mutation and the inline autosave cannot carry it.
//   3. **The database refuses it anyway.** The trigger is what stops a
//      hand-rolled mutation, which is the layer neither of the first two can
//      reach — and the layer this suite can actually issue, as `app_user`.
//
// Layer 3 is asserted on the SQLSTATE, not on the message: see
// `attemptStatusWriteAs` for why psql's default verbosity makes the prose the
// only other observable, and why prose is a bad thing to pin a test to.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, QUALITY_EVENTS } from '../fixtures/cast.js'
import {
  openEvent,
  statusOf,
  statusLabel,
  hasInteractiveAncestor,
  comboboxTexts,
  attemptStatusWriteAs,
  writeAs,
  resetStandingEvent,
} from '../fixtures/qualityEvents.js'
import { sql, sqlValue } from '../fixtures/db.js'

const EV = QUALITY_EVENTS.standing

test.describe('QE-J2 — the lifecycle is server-owned (F-02 / QE-H3)', () => {
  // qeManager holds quality_events:update, so `canUpdate` is true and every
  // editable control on the page renders. This is precisely the persona the
  // finding was about: before the fix, holding :update was the whole exploit.
  test.use({ storageState: AUTH.qeManager })

  test.beforeEach(() => resetStandingEvent())
  test.afterAll(() => resetStandingEvent())

  test('CONTROL: the status renders as a read-only badge, and no control writes it', async ({
    page,
  }) => {
    await openEvent(page, EV.id)

    // The badge reads the row, so this doubles as proof the page is showing THIS
    // event and not a stale render — 'Open' is the seeded status and
    // `resetStandingEvent` has just restored it.
    expect(statusOf(EV.id)).toBe('OPEN')
    const badge = statusLabel(page, 'Open')
    await expect(badge).toBeVisible({ timeout: 20_000 })

    // The invariant, stated structurally. A returning dropdown would render the
    // SAME badge with the SAME text inside its `#selected` slot, so nothing
    // about the text can tell the two apart — what changes is that the text
    // acquires an operable ancestor.
    expect(
      await hasInteractiveAncestor(badge),
      'the status label must not sit inside a button, combobox, select or link',
    ).toBe(false)

    // And the same claim from the other direction, so a status picker moved
    // somewhere other than the header is caught too: no combobox on the page
    // currently READS a lifecycle status.
    const combos = await comboboxTexts(page)
    for (const label of ['Draft', 'Open', 'Closed', 'Cancelled']) {
      expect(combos, `no picker on this page displays "${label}"`).not.toContain(label)
    }

    // The positive control, and it is not optional. "No status control" is the
    // same observation as "the page never rendered" and as "this persona sees a
    // read-only page", and either of those would make everything above pass
    // while the bypass was wide open. The rail's OTHER pickers — category,
    // severity, site, assignee, all gated on the very same `canUpdate` the
    // status dropdown used to be gated on — prove this is a fully-rendered page
    // being viewed by an update holder.
    expect(combos.length, 'the rail still renders its editable pickers').toBeGreaterThan(0)
  })

  test('the gated state is refused on the raw app_user write path (QMSQE)', async () => {
    // THE FINDING, at the only layer still able to attempt it. The UI control is
    // gone and the field is out of the update mutation, so this is what a
    // hand-rolled GraphQL mutation — or anything else speaking to PostGraphile
    // as `app_user` — would run into.
    expect(statusOf(EV.id)).toBe('OPEN')

    const attempt = attemptStatusWriteAs(USERS.qeManager, EV.id, 'CLOSED')
    expect(attempt.sqlstate, 'refused by enforce_quality_event_status_transition').toBe('QMSQE')

    // The event never moved: it did not skip the reviewer check, the three
    // mandatory review fields, the Part-11 signature or the CLOSE audit row.
    expect(statusOf(EV.id)).toBe('OPEN')
  })

  test('EVERY status change is refused, not just the terminal ones', async () => {
    // This is the QE-H3 delta in one assertion. Under the old guard, OPEN→DRAFT
    // and OPEN→CANCELLED were DELIBERATELY allowed — the dropdown was their only
    // writer, and the suite this file replaces asserted that they still worked.
    // Both now have server-side paths (`submit` re-opens a draft, `cancel` ends
    // it, e-signed with a mandatory reason), so both are refused here and a
    // future refactor that re-admits either one fails this test.
    for (const target of ['DRAFT', 'CANCELLED']) {
      const attempt = attemptStatusWriteAs(USERS.qeManager, EV.id, target)
      expect(attempt.sqlstate, `OPEN -> ${target} must be refused`).toBe('QMSQE')
      expect(statusOf(EV.id)).toBe('OPEN')
    }

    // …but a write that does not CHANGE the status is deliberately let through:
    // the guard's first act on UPDATE is `IF NEW.status_id IS NOT DISTINCT FROM
    // OLD.status_id THEN RETURN NEW`. That branch is not a loophole — nothing
    // moves — and it is what keeps an ordinary record save from being refused
    // for carrying the field it already had. Asserted so a future "just block
    // every write that mentions status_id" tightening has to notice it.
    const noop = attemptStatusWriteAs(USERS.qeManager, EV.id, 'OPEN')
    expect(noop.sqlstate, 'OPEN -> OPEN is not a transition').toBe('NO_ERROR')
    expect(noop.rows, 'and the row is reachable, so this is not a silent RLS denial').toBe(1)
    expect(statusOf(EV.id)).toBe('OPEN')
  })

  test('POSITIVE CONTROL: the same caller can still edit a non-lifecycle field', async () => {
    // Without this, the three refusals above are unfalsifiable. A caller whose
    // RLS policy denied every UPDATE, or a fixture pointing at a row that does
    // not exist, produces exactly the same "the status did not move" evidence.
    // This proves the guard refuses `status_id` SPECIFICALLY, and that the
    // module is still editable by the persona it is meant to be editable by.
    const original = sqlValue(`SELECT title FROM quality_events WHERE id = '${EV.id}'`)
    const probe = `${original} [J2 probe]`

    const edit = writeAs(
      USERS.qeManager,
      `UPDATE quality_events SET title = '${probe}' WHERE id = '${EV.id}'`,
    )
    expect(edit.rejected, `title edit must not be refused: ${edit.error}`).toBe(false)
    expect(edit.rows, 'the update policy admits this caller').toBe(1)
    expect(sqlValue(`SELECT title FROM quality_events WHERE id = '${EV.id}'`)).toBe(probe)

    sql(`UPDATE quality_events SET title = '${original}' WHERE id = '${EV.id}'`)
  })

  test('a terminal event stays terminal, and the UI stops offering the actions', async ({
    page,
  }) => {
    // Force the event terminal with the trigger down, exactly as
    // `resetLifecycleEvents` has to: QE-H3 applies the terminal rule to TRUSTED
    // callers too, so not even the superuser seed path can flip a cancelled
    // event back. That is the behaviour, not a workaround — it is why the reset
    // helpers disable the trigger rather than just running an UPDATE.
    sql(`
      ALTER TABLE quality_events DISABLE TRIGGER quality_events_status_transition_guard;
      UPDATE quality_events SET status_id = 'CANCELLED' WHERE id = '${EV.id}';
      ALTER TABLE quality_events ENABLE TRIGGER quality_events_status_transition_guard;
    `)
    expect(statusOf(EV.id)).toBe('CANCELLED')

    const reopen = attemptStatusWriteAs(USERS.qeManager, EV.id, 'OPEN')
    expect(reopen.sqlstate, 'a cancelled event cannot be reopened').toBe('QMSQE')
    expect(statusOf(EV.id)).toBe('CANCELLED')

    // And the UI agrees rather than offering a button the server would refuse:
    // every lifecycle descriptor in qualityEventDetailConfig.js is gated on
    // `isOpen`, so a terminal event's action bar keeps only Print and Audit Log.
    await openEvent(page, EV.id)
    await expect(statusLabel(page, 'Cancelled')).toBeVisible({ timeout: 20_000 })
    for (const label of ['Close', 'Cancel', 'Submit', 'Escalate']) {
      await expect(
        page.getByRole('button', { name: label, exact: true }),
        `${label} is not offered on a terminal event`,
      ).toHaveCount(0)
    }
  })

  test('escalation is a link, not a status, and none is fabricated', async ({ page }) => {
    await openEvent(page, EV.id)

    // ESCALATED was retired as a status in 2026-08-18: escalating spawns a
    // downstream record but does not resolve the event, so it lives in
    // `record_links`. With the status control gone there is no longer any
    // control that could even name it — the assertion that matters now is that
    // no lineage row appears without the Escalate action, since `record_links`
    // is the ONLY place the QE→NC edge is stored and a phantom row would be
    // invisible from the Nonconformance side too.
    const links = sqlValue(
      `SELECT count(*) FROM record_links WHERE from_type = 'QualityEvent' AND from_id = '${EV.id}'`,
    )
    expect(Number(links)).toBe(0)
  })
})
