// ANL-A11 · Reordering a dashboard's tiles works, and STICKS.
//
// ── TWO DEFECTS, ONE CONTROL ────────────────────────────────────────────────
// The grip on a widget was a real focusable `<button aria-label="Reorder
// widget">` that, for anyone not using a mouse, did nothing at all —
// `useListReorder` had no keydown handler and no live region (F-12, WCAG 2.1.1).
//
// Worse, and found while fixing that: the composable destructured only
// `{ handle, filter, draggable }` when building its SortableJS options, so
// DashboardDetail's `onEnd` — the callback that PERSISTS the new order — was
// dropped on the floor. Dragging a tile reordered the DOM, mutated the
// in-memory array, wrote nothing, and the board reverted on the next load.
// Every layer looked right in isolation; the two never met.
//
// ── WHY THIS DRIVES THE KEYBOARD AND NOT A DRAG ─────────────────────────────
// Not for coverage of the cheaper path — because it is the HONEST one. A
// synthetic SortableJS drag in Playwright is a sequence of mouse events tuned
// until it happens to work, and when it fails it is usually the test. The
// keyboard path is a real user-facing feature here, it is deterministic, and it
// exercises the same `moveItem` + `onEnd` the drag does. A green run therefore
// proves persistence for both.
//
// ── WHY THE RELOAD IS THE POINT ─────────────────────────────────────────────
// The in-memory list reorders whether or not anything is saved. Only a reload
// distinguishes "the screen changed" from "the board changed" — which is
// exactly the distinction the defect turned on.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ANALYTICS } from '../fixtures/cast.js'
import { waitForSqlValue } from '../fixtures/db.js'
import { ensureRollup, gotoAnalytics } from '../fixtures/analytics.js'

// `controller`, not `author`. The grips live behind `v-if="canEdit"`, and the
// shared board belongs to `owner` — so editing it needs
// `reports_dashboards:manage`, which only controller holds (seed §31a). Running
// this as author finds no grip at all and reads like a rendering bug.
test.use({ storageState: AUTH.controller })

const SEEDED = ANALYTICS.sharedWidgetOrder

/** The tile titles in the order the board is currently showing them. */
async function tileOrder(page) {
  const grips = page.locator('[data-drag-handle]')
  await expect(grips.first()).toBeAttached({ timeout: 15_000 })
  const labels = await grips.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  // "Reorder NC trend. Use arrow keys…" → "NC trend". The grip names its own
  // tile, which is what makes the order readable without depending on tile
  // internals.
  return labels.map((l) => l.replace(/^Reorder /, '').replace(/\. Use arrow keys.*$/, ''))
}

/**
 * Block until the NEW order is actually IN THE DATABASE.
 *
 * ⚠️ Without this the test has a race, and it is the exact race the feature is
 * about. Pressing a key mutates the list immediately and fires `onEnd`, which
 * persists ASYNCHRONOUSLY. Reloading before that write lands shows the OLD order
 * — which is indistinguishable from the defect this file exists to catch, and
 * reads as "reorder does not persist" when in fact it had not persisted YET.
 *
 * Caught by running this suite while the backend integration suite was hammering
 * the same Postgres: green in isolation, red under load. A barrier that only
 * holds on an idle machine is not a barrier.
 *
 * Polling the database rather than the screen on purpose — the screen already
 * shows the new order either way, so it cannot report whether anything was
 * written.
 */
async function waitForPersistedOrder(titles) {
  const expected = titles.map((t, i) => `${i}=${t}`).join('|')
  await waitForSqlValue(
    `SELECT CASE WHEN string_agg(position || '=' || COALESCE(title,''), '|' ORDER BY position)
                 = '${expected.replace(/'/g, "''")}' THEN '1' ELSE '' END
       FROM analytics_widgets
      WHERE dashboard_id = '${ANALYTICS.sharedDashboard.id}' AND deleted_at IS NULL`,
    { timeoutMs: 30_000, intervalMs: 500, label: `widget order persisted as ${titles.join(' > ')}` },
  )
}

async function openSharedBoard(page) {
  // Straight to the id, as ANL-A4 does. `dashboardByName` is a DB helper that
  // returns a row, not a locator — it reads like a UI query and is not one.
  await gotoAnalytics(page, `/dashboards/${ANALYTICS.sharedDashboard.id}`)
  await expect(page.getByText(ANALYTICS.sharedDashboard.name).first()).toBeVisible()
}

test.describe('ANL-A11 · dashboard tile reorder', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  test('the board starts in its seeded order', async ({ page }) => {
    // Stated separately so that if the fixture drifts, THIS fails rather than
    // the reorder assertions failing in a way that reads like a product bug.
    await openSharedBoard(page)
    expect(await tileOrder(page)).toEqual(SEEDED)
  })

  test('the grip is keyboard-operable, announces the move, and the order SURVIVES A RELOAD', async ({
    page,
  }) => {
    await openSharedBoard(page)
    expect(await tileOrder(page)).toEqual(SEEDED)

    // Focus the first tile's grip and move it down one. Hovering first because
    // the action row only becomes visible on hover/focus-within.
    const firstGrip = page.locator('[data-drag-handle]').first()
    await firstGrip.focus()
    await expect(firstGrip).toBeFocused()

    await page.keyboard.press('ArrowDown')

    // The announcement is the a11y half of F-12: a move nobody can see must be
    // a move somebody can hear.
    await expect(page.locator('[aria-live="polite"]')).toHaveText(
      `${SEEDED[0]} moved to position 2 of ${SEEDED.length}.`,
      { timeout: 10_000 },
    )

    const moved = [SEEDED[1], SEEDED[0], SEEDED[2]]
    await expect
      .poll(() => tileOrder(page), { timeout: 10_000 })
      .toEqual(moved)

    // THE ASSERTION THIS FILE EXISTS FOR, in two halves. First that the new
    // order reached the DATABASE — before the fix `onEnd` never reached
    // SortableJS, so nothing was ever written and this barrier times out.
    await waitForPersistedOrder(moved)

    // Then that a fresh page agrees, which is what a user actually experiences.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect
      .poll(() => tileOrder(page), { timeout: 20_000 })
      .toEqual(moved)

    // Put it back, so this journey does not depend on run order — the seed also
    // resets positions, but a suite that only works because of its fixture's
    // cleanup is one seed edit away from being order-dependent.
    const secondGrip = page.locator('[data-drag-handle]').nth(1)
    await secondGrip.focus()
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => tileOrder(page), { timeout: 10_000 }).toEqual(SEEDED)
    await waitForPersistedOrder(SEEDED)
  })

  test('Home and End send a tile to either end, and that sticks too', async ({ page }) => {
    await openSharedBoard(page)
    expect(await tileOrder(page)).toEqual(SEEDED)

    await page.locator('[data-drag-handle]').first().focus()
    await page.keyboard.press('End')

    const atEnd = [SEEDED[1], SEEDED[2], SEEDED[0]]
    await expect.poll(() => tileOrder(page), { timeout: 10_000 }).toEqual(atEnd)
    await waitForPersistedOrder(atEnd)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect.poll(() => tileOrder(page), { timeout: 20_000 }).toEqual(atEnd)

    await page.locator('[data-drag-handle]').nth(2).focus()
    await page.keyboard.press('Home')
    await expect.poll(() => tileOrder(page), { timeout: 10_000 }).toEqual(SEEDED)
    await waitForPersistedOrder(SEEDED)
  })
})
