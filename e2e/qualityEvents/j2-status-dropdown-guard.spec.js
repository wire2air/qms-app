// QE-J2 — F-02: the status dropdown can no longer reach the gated states.
//
// **This is the journey the whole project exists for.** F-02 was not a raw-
// GraphQL finding: the exploit was a plain dropdown on the detail header, bound
// straight to `statusId`, behind a 600 ms debounced autosave, offering ALL SEVEN
// statuses to any `quality_events:update` holder:
//
//     QualityEventsPageId.vue:419
//     <QualityEventStatusSelectMenu v-if="canUpdate" v-model="event.statusId" />
//
// Picking CLOSED skipped every gate `closeQualityEvent` enforces —
// assertAssignedReviewer, the three mandatory review fields, the CLOSE audit
// row, and API-03's `quality_events:close` permission. Picking ESCALATED
// produced an event claiming escalation with no downstream record and no
// `record_links` lineage row.
//
// 26 integration tests cover the trigger (migration 20260806110000). What only
// this file can prove is that the refusal survives the round trip through the
// SPA, the syncEngine and PostGraphile — and, just as importantly, that the
// five states the dropdown is the ONLY writer for still work.
//
// THE SECOND HALF IS NOT OPTIONAL. UNDER_REVIEW, AWAITING_DECISION and CANCELLED
// have no server-side writer anywhere in the codebase. If the guard had been
// shaped like its six peers ("app_user may never change status_id"), three of
// the module's seven states would have become unreachable — a functional
// regression dressed as a security fix. These tests are what stop that
// happening in a future refactor.
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

  test('CONTROL: the dropdown renders and still offers every status', async ({ page }) => {
    // The client model was deliberately NOT changed in this pass, so the menu
    // still lists all seven. That is a known, documented rough edge: the user is
    // offered two controls that now fail at the database. If this test starts
    // failing with five options, the follow-up (excludeFromGraphQL + trimming
    // QUALITY_EVENT_STATUSES) has landed and QE-J2's blocked cases below should
    // be re-expressed as "the option is absent" rather than "the write is
    // refused".
    await openEvent(page, EV.id)
    const options = await statusMenuOptions(page)
    expect(options).toEqual(
      expect.arrayContaining([
        'Draft',
        'Open',
        'Under Review',
        'Awaiting Decision',
        'Escalated',
        'Closed',
        'Cancelled',
      ]),
    )
  })

  test('picking Closed from the dropdown does NOT close the event', async ({ page }) => {
    await openEvent(page, EV.id)
    expect(statusOf(EV.id)).toBe('OPEN')

    await pickStatus(page, 'Closed')

    // The write is refused by the trigger. The event is still OPEN — it did not
    // skip the reviewer check, the three mandatory review fields, or the close
    // permission.
    expect(statusOf(EV.id)).toBe('OPEN')
  })

  test('picking Escalated from the dropdown does NOT escalate the event', async ({ page }) => {
    await openEvent(page, EV.id)
    await pickStatus(page, 'Escalated')

    expect(statusOf(EV.id)).toBe('OPEN')

    // And no lineage was fabricated. `record_links` is the ONLY place the QE→NC
    // edge is stored, so a phantom ESCALATED row would be undetectable from the
    // Nonconformance side too.
    const { sqlValue } = await import('../fixtures/db.js')
    const links = sqlValue(
      `SELECT count(*) FROM record_links WHERE from_type = 'QualityEvent' AND from_id = '${EV.id}'`,
    )
    expect(Number(links)).toBe(0)
  })

  test('the gated states are still refused from an intermediate state', async ({ page }) => {
    // Not just from OPEN — the guard keys on the TARGET state, not the source,
    // so a user who walks the event forward first must not find a back door.
    await openEvent(page, EV.id)
    await pickStatus(page, 'Under Review')
    expect(statusOf(EV.id)).toBe('UNDER_REVIEW')

    await pickStatus(page, 'Closed')
    expect(statusOf(EV.id)).toBe('UNDER_REVIEW')
  })

  test('NO REGRESSION: the working states the dropdown solely owns still move', async ({
    page,
  }) => {
    // UNDER_REVIEW, AWAITING_DECISION and CANCELLED have NO server-side writer.
    // The dropdown is their only path — blocking it would strand three of the
    // module's seven states.
    await openEvent(page, EV.id)

    await pickStatus(page, 'Under Review')
    expect(statusOf(EV.id)).toBe('UNDER_REVIEW')

    await pickStatus(page, 'Awaiting Decision')
    expect(statusOf(EV.id)).toBe('AWAITING_DECISION')

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
