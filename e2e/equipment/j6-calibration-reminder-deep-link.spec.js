// EQ-J6 — the calibration-due reminder's deep link.
//
// WHY A JOURNEY FOR ONE `router.push`. Because this module has NO DETAIL PAGE,
// and that absence is load-bearing in a place nobody looks. The nightly cron
// (`send_equipment_calibration_due_notification`) enqueues a notification with
// `resourceType: 'Equipment'` and the instrument's id — and there is nowhere for
// that id to go. Both deep-link resolvers therefore drop it and land on the
// LIST: `src/utils/notificationRoutes.js` (`Equipment: () => '/equipment'`) for
// the bell, and `qms/backend/shared/utils/companyAppUrl.js` (`Equipment:
// 'equipment'`) for the emailed link.
//
// That is a deliberate compromise, and it is exactly the shape of thing that
// gets "fixed" by someone adding `/equipment/${id}` to one of the two maps while
// building a detail page that does not exist yet. The result is a 404 from an
// automated reminder — the least-watched surface in the product, since the only
// person who sees it is a custodian who was already being nagged.
// `notificationRouteParity.spec.js` pins that the two maps AGREE; nothing pinned
// that where they agree is somewhere that actually resolves.
//
// The notification row is inserted directly rather than by running the cron:
// the cron only fires for specific day-offsets against real dates and escalates
// by department supervisor / company owner, so reproducing it would be a test of
// the cron's WHERE clause (which has its own worker tests) rather than of the
// link.
import { test, expect } from '@playwright/test'
import { EQUIPMENT } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { registerRow } from '../fixtures/equipment.js'

const NOTIFICATION_ID = 'e2eb2000-0000-4000-8000-000000000001'
const TITLE = 'E2E J6 calibration due — Vernier Calipers'

test.describe('EQ-J6 · the calibration reminder lands somewhere that exists', () => {
  test.beforeAll(() => {
    sql(`DELETE FROM notifications WHERE id = '${NOTIFICATION_ID}'`)
    sql(
      `INSERT INTO notifications
         (id, company_id, user_id, notification_type_id, title, message,
          resource_type, resource_id, is_read, channels, created_at, updated_at)
       VALUES ('${NOTIFICATION_ID}', 'e2e00001-0000-4000-8000-000000000001',
               '${EQUIPMENT.admin.user.id}', 'EQUIPMENT_CALIBRATION_DUE',
               '${TITLE}',
               'Seeded by EQ-J6 to exercise the reminder deep link.',
               'Equipment', '${EQUIPMENT.calDue.id}', false,
               ARRAY['in-app']::varchar[], NOW(), NOW())`,
    )
  })

  test.afterAll(() => {
    sql(`DELETE FROM notifications WHERE id = '${NOTIFICATION_ID}'`)
  })

  test('clicking the reminder lands on the register — the list, because there is no detail page', async ({
    browser,
  }) => {
    // A FRESH context, not the shared persona pool: the notification was written
    // straight to Postgres, so it reaches IndexedDB through the syncEngine's
    // bootstrap rather than a socket broadcast, and a context that bootstrapped
    // before the INSERT would never see it. (A reload would not help either —
    // the localStorage gate skips re-bootstrap while the data is under five
    // minutes old.)
    const ctx = await browser.newContext({ storageState: EQUIPMENT.admin.auth })
    const page = await ctx.newPage()
    try {
      await page.goto('/notifications')
      const item = page.getByRole('button', { name: new RegExp(TITLE.slice(0, 30)) })
      await expect(item, 'the reminder reached the bell').toBeVisible({ timeout: 90_000 })

      await item.click()

      // The whole point: `/equipment`, with no id appended. An `/equipment/:id`
      // here would 404 — there is no such route.
      await expect(page).toHaveURL(/\/equipment$/, { timeout: 30_000 })
      expect(
        new URL(page.url()).pathname,
        'no instrument id is appended — the route does not exist',
      ).toBe('/equipment')

      // And the register really renders, rather than merely accepting the URL.
      await expect(registerRow(page, EQUIPMENT.calDue.name)).toBeVisible({ timeout: 90_000 })

      // Following the reminder marks it read — a syncEngine save, so the
      // assertion is against Postgres rather than the badge.
      await expect
        .poll(() => sqlValue(`SELECT is_read FROM notifications WHERE id = '${NOTIFICATION_ID}'`), {
          timeout: 30_000,
          message: 'the reminder was marked read by following it',
        })
        .toBe('t')
    } finally {
      await ctx.close()
    }
  })

  test('the two deep-link resolvers agree, and both point at the list', async () => {
    // The in-app half is `RESOURCE_ROUTES.Equipment` (unit-tested in
    // notificationRouteParity.spec.js). The half that has NO test anywhere is
    // the emailed link, which the worker builds from `entityRouteSegment`. Both
    // are asserted here against the real notification row so that "they agree"
    // and "they resolve" are checked in the same place.
    expect(sqlValue(`SELECT resource_type FROM notifications WHERE id = '${NOTIFICATION_ID}'`)).toBe(
      'Equipment',
    )
    expect(sqlValue(`SELECT resource_id FROM notifications WHERE id = '${NOTIFICATION_ID}'`)).toBe(
      EQUIPMENT.calDue.id,
    )

    const { entityRouteSegment } = await import(
      '../../../qms/backend/shared/utils/companyAppUrl.js'
    )
    expect(
      entityRouteSegment('Equipment'),
      'the emailed link segment — appending an id to this would 404',
    ).toBe('equipment')

    const { notificationPath } = await import('../../src/utils/notificationRoutes.js')
    expect(notificationPath('Equipment', EQUIPMENT.calDue.id)).toBe('/equipment')
  })
})
