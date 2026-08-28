// QE-J2 — F-02: the status dropdown can no longer reach the gated state.
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
// 26 integration tests cover the trigger (migration 20260806110000, rewritten
// by 20260823100000). What only this file can prove is that the refusal
// survives the round trip through the SPA, the syncEngine and PostGraphile —
// and, just as importantly, that the states the dropdown is the ONLY writer for
// still work.
//
// ── 2026-08-27: rewritten for the unified status vocabulary ──────────────────
// `20260823100000-unified-record-statuses.js` collapsed quality events from
// seven statuses to four (DRAFT / OPEN / CLOSED / CANCELLED) and DELETED the
// retired lookup rows, so UNDER_REVIEW and AWAITING_DECISION are no longer
// merely unreachable — they violate `quality_events_status_id_fkey`. ESCALATED
// went the same way for a different reason (`qualityEventStatuses.js`):
// escalation spawns a downstream record but does not resolve the event, so it
// is a `record_links` row, not a status.
//
// The old CONTROL test predicted exactly this: "if this test starts failing
// with five options, the follow-up has landed and QE-J2's blocked cases should
// be re-expressed as 'the option is absent' rather than 'the write is refused'."
// That follow-up has landed. The Escalated case is now an absence assertion;
// the Closed case stays a refusal, because CLOSED is still offered and still
// gated.
//
// The guard's current shape, read from the trigger body rather than inferred:
//   v_gated    = ['CLOSED']              — refused from the dropdown, always
//   v_terminal = ['CLOSED','CANCELLED']  — once here, no further change
//   everything else is a move among the working states and is DELIBERATELY
//   allowed, because the dropdown is their only writer.
//
// THE SECOND HALF IS NOT OPTIONAL. DRAFT and CANCELLED still have no
// server-side writer. If the guard were ever reshaped like its six peers
// ("app_user may never change status_id"), two of the module's four states
// would become unreachable — a functional regression dressed as a security fix.
// These tests are what stop that happening in a future refactor.
import { test, expect } from '@playwright/test'
import { AUTH, QUALITY_EVENTS } from '../fixtures/cast.js'
import {
  openEvent,
  pickStatus,
  statusOf,
  statusMenuOptions,
  resetStandingEvent,
} from '../fixtures/qualityEvents.js'

const EV = QUALITY_EVENTS.standing

test.describe('QE-J2 — status dropdown lifecycle guard (F-02)', () => {
  // qeManager holds quality_events:update, so `canUpdate` is true and the
  // dropdown renders. This is precisely the persona the finding was about.
  test.use({ storageState: AUTH.qeManager })

  test.beforeEach(() => resetStandingEvent())
  test.afterAll(() => resetStandingEvent())

  test('CONTROL: the dropdown renders and offers exactly the four live statuses', async ({
    page,
  }) => {
    // Deliberately an exact match, not arrayContaining. The retired statuses are
    // gone from `quality_event_statuses`, so an extra option here is not a
    // cosmetic rough edge any more — it is a control that writes a value the
    // foreign key will reject.
    await openEvent(page, EV.id)
    const options = await statusMenuOptions(page)
    expect(options).toEqual(['Draft', 'Open', 'Closed', 'Cancelled'])

    // …and that literal is only half the control, because the menu is NOT
    // DB-driven. `QualityEventStatusSelectMenu` feeds BaseSelect from
    // `src/utils/qualityEventStatuses.js` — a hardcoded array, unlike the NC and
    // CAPA filter menus, which read their lookup through the syncEngine. So the
    // assertion above proves the frontend const and says NOTHING about the table
    // the foreign key points at, even though the sentence it is written under is
    // entirely about that table. The two are free to drift in either direction,
    // and both directions are live bugs the assertion above cannot see: a status
    // in the const but not the lookup is an option that writes an FK violation;
    // one in the lookup but not the const is a state no user can reach.
    //
    // Cross-check them here, ordered by display_order — the migration's `UNIFIED`
    // const sets 100/200/300/400 precisely so the two orderings coincide, which
    // is what makes toEqual (not a set comparison) the right assertion.
    const { sql } = await import('../fixtures/db.js')
    const lookupNames = sql(
      `SELECT name FROM quality_event_statuses ORDER BY display_order`,
    )
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    expect(
      options,
      'the hardcoded QUALITY_EVENT_STATUSES array and quality_event_statuses must name the same four states in the same order',
    ).toEqual(lookupNames)
  })

  test('picking Closed from the dropdown does NOT close the event', async ({ page }) => {
    await openEvent(page, EV.id)
    expect(statusOf(EV.id)).toBe('OPEN')

    await pickStatus(page, 'Closed')

    // The write is refused by the trigger (CLOSED is the one gated state). The
    // event is still OPEN — it did not skip the reviewer check, the three
    // mandatory review fields, or the close permission.
    expect(statusOf(EV.id)).toBe('OPEN')
  })

  test('Escalated is not a status the dropdown can offer, and none is fabricated', async ({
    page,
  }) => {
    await openEvent(page, EV.id)

    // Escalation is a link, not a status. The option must be absent rather than
    // present-and-refused: a present option is a control that promises a state
    // transition the schema can no longer store.
    const options = await statusMenuOptions(page)
    expect(options).not.toContain('Escalated')

    // And no lineage exists without the Escalate action. `record_links` is the
    // ONLY place the QE→NC edge is stored, so a phantom row would be
    // undetectable from the Nonconformance side too.
    const { sqlValue } = await import('../fixtures/db.js')
    const links = sqlValue(
      `SELECT count(*) FROM record_links WHERE from_type = 'QualityEvent' AND from_id = '${EV.id}'`,
    )
    expect(Number(links)).toBe(0)
  })

  test('the gated state is still refused from a different source state', async ({ page }) => {
    // Not just from OPEN — the guard keys on the TARGET state, not the source,
    // so a user who moves the event first must not find a back door. With the
    // intermediate states retired, DRAFT is the only other source the dropdown
    // can reach.
    await openEvent(page, EV.id)

    await pickStatus(page, 'Draft')
    expect(statusOf(EV.id)).toBe('DRAFT')

    await pickStatus(page, 'Closed')
    expect(statusOf(EV.id)).toBe('DRAFT')
  })

  test('NO REGRESSION: the working states the dropdown solely owns still move', async ({
    page,
  }) => {
    // DRAFT and CANCELLED have NO server-side writer. The dropdown is their only
    // path — blocking it would strand half of the module's four states.
    await openEvent(page, EV.id)

    await pickStatus(page, 'Draft')
    expect(statusOf(EV.id)).toBe('DRAFT')

    await pickStatus(page, 'Open')
    expect(statusOf(EV.id)).toBe('OPEN')

    await pickStatus(page, 'Cancelled')
    expect(statusOf(EV.id)).toBe('CANCELLED')
  })

  test('a cancelled event cannot be reopened from the dropdown', async ({ page }) => {
    await openEvent(page, EV.id)
    await pickStatus(page, 'Cancelled')
    expect(statusOf(EV.id)).toBe('CANCELLED')

    // Terminal is terminal, whoever is asking.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await pickStatus(page, 'Open')
    expect(statusOf(EV.id)).toBe('CANCELLED')
  })
})
