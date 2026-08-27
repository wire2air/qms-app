// ANL-A18 · Dragging a dashboard tile with the MOUSE, on a board that started empty.
//
// ── WHAT WAS ACTUALLY BROKEN ────────────────────────────────────────────────
// `useSortable`'s `watchElement` option defaults to FALSE, and in that mode it
// binds through `tryOnMounted`: once, at mount, to whatever the container ref
// holds at that instant. DashboardDetail's widgets start as `initial: []`, so a
// board mounts showing "No widgets yet" and `<ContentGrid ref="gridRef">` — the
// element Sortable needed — only enters the DOM a beat later, behind a `v-else`.
// Sortable was handed null, `initSortable` returned, and no Sortable was ever
// constructed. The fix is one line: `watchElement: true` in
// src/composables/useListReorder.js.
//
// The failure was silent AND partial, which is how it shipped past a green
// suite. The grip still rendered — it is only a button. A11's keyboard path
// still worked, because that listener attaches from a `flush: 'post'` watcher,
// the very pattern useSortable skips by default. Only mouse drag was dead, and
// mouse drag is what almost everybody actually uses.
//
// ── WHY THIS FILE BUILDS ITS OWN BOARD ──────────────────────────────────────
// It cannot borrow A11's. On the seeded dashboard the widget rows are already in
// IndexedDB by the time the route mounts, so the grid can win the very first
// flush and the drag works — with the bug fully present. A drag test written
// against that board is precisely the test that passes while the feature is
// broken, which is why this went unnoticed. So: create a dashboard, add tiles to
// it through the real dialog, drag on THAT board. The container arriving after
// mount is not incidental setup here, it IS the premise, and any rewrite that
// moves these journeys onto a pre-populated board quietly removes the coverage.
//
// ── TWO TESTS, BECAUSE A SYNTHETIC DRAG IS NOT A FACT ───────────────────────
// A11's header is right that a Playwright mouse sequence is an approximation of
// a drag tuned until it works, and that when it fails it is usually the test.
// Neither half is sufficient on its own, so both are here:
//
//   1. Is there a Sortable on the grid element at all? That has one true answer
//      no matter how the pointer behaves, and it is exactly what the bug
//      removed. It cannot flake and it cannot be faked.
//   2. Does the real gesture move a tile and keep it moved? A Sortable that is
//      bound and still does not reorder is a different defect, equally
//      shippable, and only the gesture can see it.
//
// ── WHY THE RELOAD IS STILL THE POINT ───────────────────────────────────────
// SortableJS moves the DOM node itself, so the screen reorders whether or not
// anything was written. Only the database and a fresh page separate "the screen
// changed" from "the board changed" — the same distinction A11 turns on, and the
// reason `onEnd` has its own warning in the composable.
//
// Boards this file creates are left behind on purpose: e2e-seed.sql §31c already
// deletes every analytics dashboard that is not one of its own on each run, so a
// teardown here would only add a second place for that rule to live.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ANALYTICS } from '../fixtures/cast.js'
import { waitForSqlValue } from '../fixtures/db.js'
import {
  createDashboardViaUi,
  dashboardByName,
  ensureRollup,
  gotoAnalytics,
  gotoDashboards,
  pickFromSelect,
  uniqueName,
} from '../fixtures/analytics.js'

// `author`, not A11's `controller`. A11 edits a board owned by somebody else, so
// it needs `reports_dashboards:manage`; this file OWNS everything it touches, and
// `canEditDashboard` grants the owner every widget affordance without a grant.
// Using controller here would test a stronger permission than the journey needs.
test.use({ storageState: AUTH.author })

// Three tiles, for the reason e2e-seed.sql spells out for the seeded board: with
// two, "swapped the pair" and "moved one to the end" are the same assertion, so
// an implementation that only ever moves an item to an end would pass.
//
// Plain ASCII names with no `|` or `=` in them — waitForPersistedOrder builds its
// comparison out of both characters.
const TILES = ['A18 alpha', 'A18 bravo', 'A18 charlie']

/** The tile titles in the order the board is currently showing them. */
async function tileOrder(page) {
  const grips = page.locator('[data-drag-handle]')
  await expect(grips.first()).toBeAttached({ timeout: 15_000 })
  const labels = await grips.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  // "Reorder A18 alpha. Use arrow keys…" → "A18 alpha". Reading the order off the
  // grips rather than the tile bodies keeps it independent of what the tiles
  // render, which is a server-resolved figure that arrives late. Deliberately a
  // copy of A11's: that file keeps its helpers local, and promoting this one to
  // the fixture would make an unrelated edit there able to break this file.
  return labels.map((l) => l.replace(/^Reorder /, '').replace(/\. Use arrow keys.*$/, ''))
}

/**
 * Is a live SortableJS instance attached to the widget grid?
 *
 * SortableJS stores itself on the container as `el['Sortable' + Date.now()]`
 * (sortablejs 1.15.7, `el[expando] = this`) and nulls that same key on destroy —
 * so the check has to look at the VALUE, not merely the key. There is no public
 * way to ask this from outside the module: `Sortable.get()` needs the library's
 * own module instance, and this page's copy lives inside the bundle.
 *
 * White-box on purpose. It is the one question about this defect that has a
 * single true answer regardless of how a synthetic pointer behaves, and a
 * regression to `watchElement: false` makes it false immediately.
 */
async function sortableIsBound(page) {
  // ContentGrid's root div — the parent of the tiles, which is where `gridRef`
  // resolves to. `[data-id]` is unique to DashboardDetail's tile wrappers on this
  // screen (the editor extensions that also use it never render here).
  const grid = page.locator('[data-id]').first().locator('xpath=..')
  return grid.evaluate((el) =>
    Object.entries(el).some(([key, value]) => key.startsWith('Sortable') && !!value),
  )
}

/**
 * Block until the NEW order is actually IN THE DATABASE.
 *
 * The same barrier A11 documents at length, parameterised by dashboard because
 * this file's board did not exist when the run started. Reloading before the
 * write lands shows the OLD order, which is indistinguishable from the defect and
 * reads as "the drag did not persist" when the truth is "not yet".
 *
 * Polling the database rather than the screen matters even more here than it does
 * for the keyboard: SortableJS has already moved the DOM node by this point, so
 * the screen shows the new order whether or not a single byte was written.
 */
async function waitForPersistedOrder(dashboardId, titles) {
  const expected = titles.map((t, i) => `${i}=${t}`).join('|')
  await waitForSqlValue(
    `SELECT CASE WHEN string_agg(position || '=' || COALESCE(title,''), '|' ORDER BY position)
                 = '${expected.replace(/'/g, "''")}' THEN '1' ELSE '' END
       FROM analytics_widgets
      WHERE dashboard_id = '${dashboardId}' AND deleted_at IS NULL`,
    {
      timeoutMs: 30_000,
      // 2s, not the 500ms this started with. Every poll spawns a `docker exec`
      // process, so a 500ms interval over a 30s window is up to sixty process
      // spawns for one assertion — enough to produce `spawnSync docker ETIMEDOUT`
      // on a loaded machine, which fails the test for a reason that has nothing
      // to do with dragging. The write lands in a second or two; polling four
      // times a second only buys noise.
      intervalMs: 2_000,
      label: `widget order persisted as ${titles.join(' > ')}`,
    },
  )
}

/** Create an empty dashboard through the list page's inline form, and open it. */
async function createEmptyBoard(page) {
  const name = uniqueName('ANL-A18 board')
  await gotoDashboards(page)
  await createDashboardViaUi(page, name)

  const board = await expect
    .poll(() => dashboardByName(name), { timeout: 20_000, message: 'dashboard row appears' })
    .not.toBeNull()
    .then(() => dashboardByName(name))

  await gotoAnalytics(page, `/dashboards/${board.id}`)
  // The state the whole file depends on. If a future board ever arrived
  // pre-populated, this assertion is what would say so.
  await expect(page.getByText(/no widgets yet/i)).toBeVisible()
  return { ...board, name }
}

/**
 * Add one tile through the real dialog.
 *
 * @param expectedCount the number of tiles the board must hold afterwards. Not
 *   decoration: `nextPosition` is `widgets.length`, so opening the next dialog
 *   before the live query has caught up hands the new widget a position that is
 *   already taken, and the board sorts unstably from then on.
 */
async function addTileViaUi(page, title, expectedCount) {
  // An empty board renders TWO "Add widget" buttons — the header's and the empty
  // state's — and after the first tile only the header's. Both are bound to the
  // same `addWidget`, so `.first()` is not a choice between them, it is what keeps
  // one locator working across both states.
  await page
    .getByRole('button', { name: /add widget/i })
    .first()
    .click()

  const dialog = page.getByRole('dialog')
  // The panel, not the dialog root — Headless UI's root is a zero-box wrapper
  // that Playwright reports as hidden while the dialog is plainly open.
  await expect(dialog.getByRole('heading', { name: /add widget/i })).toBeVisible()

  // ⚠️ Scoped to the DIALOG. An unanchored getByLabel('Metric') also matches the
  // page's "Help: Metric Definitions" HelpButton, whose aria-label contains the
  // word, and strict mode then fails on a locator that looks perfectly specific.
  await pickFromSelect(dialog, 'Metric', ANALYTICS.METRIC_LABEL)
  // The Title field is behind `v-if="metric"`, so it does not exist until the
  // metric is chosen. An explicit title is what makes the grip announce a name
  // this test can order the board by — a blank one falls back to the metric's own
  // name and all three tiles would be called "NCs Raised".
  await dialog.getByLabel('Title', { exact: true }).fill(title)

  // BaseDialogFooter's OWN button, reached by the `submitLabel` the dialog
  // declares — the regression A1 exists for. In create mode that is "Add widget".
  await dialog.getByRole('button', { name: 'Add widget', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: /add widget/i })).toBeHidden()

  await expect(page.locator('[data-drag-handle]')).toHaveCount(expectedCount, { timeout: 20_000 })
}

/**
 * Drag the tile at `fromIndex` onto the one at `toIndex`, by its grip.
 *
 * ── WHY THIS IS NOT `dragTo()` ──────────────────────────────────────────────
 * SortableJS drives itself off real pointer traffic, and Playwright's one-shot
 * `dragTo` collapses the journey into a single jump that SortableJS's dragover
 * bookkeeping ignores — the tile is picked up and put back where it started, so
 * the test reads as "reorder does nothing", i.e. as the very bug. The sequence
 * below is the shape the library needs: press, a small move to cross the drag
 * threshold and start the drag, a run of intermediate moves so `dragover` fires
 * repeatedly over the target, then release.
 *
 * ── WHY IT AIMS PAST THE TARGET'S MIDDLE ────────────────────────────────────
 * SortableJS decides "before or after" by which side of the target's midpoint the
 * pointer is on. Dropping dead centre is the coin-flip case. Both axes are biased
 * toward the direction of travel so the same helper works whether ContentGrid has
 * laid the tiles out in a row or stacked them in one column — the viewport
 * decides that, and this test should not care which it chose.
 */
async function dragTileOnto(page, fromIndex, toIndex) {
  const tiles = page.locator('[data-id]')
  const source = tiles.nth(fromIndex)
  const target = tiles.nth(toIndex)

  // The action row is `opacity-0` until the tile is hovered. Opacity does not
  // stop hit-testing, so the press would land either way — but hovering first is
  // what a person does, and it makes the recorded video legible.
  await source.hover()

  // Measured LAST, immediately before the press: the tiles resolve their figures
  // server-side and can still be growing as the numbers land, and a box read
  // before that settles points at where a tile used to be.
  const gripBox = await source.locator('[data-drag-handle]').boundingBox()
  const targetBox = await target.boundingBox()
  if (!gripBox || !targetBox) throw new Error('the tile or its grip has no layout box')

  const startX = gripBox.x + gripBox.width / 2
  const startY = gripBox.y + gripBox.height / 2
  const bias = toIndex > fromIndex ? 0.75 : 0.25
  const endX = targetBox.x + targetBox.width * bias
  const endY = targetBox.y + targetBox.height * bias

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // A few pixels first. A press followed straight away by a jump to the
  // destination never becomes a drag at all.
  await page.mouse.move(startX + 6, startY + 6)

  const STEPS = 12
  for (let i = 1; i <= STEPS; i += 1) {
    await page.mouse.move(
      startX + ((endX - startX) * i) / STEPS,
      startY + ((endY - startY) * i) / STEPS,
    )
    // Deliberate, not a smell. SortableJS does its swap bookkeeping across
    // animation frames; moves dispatched back to back in one task are coalesced
    // and the library sees a teleport rather than a drag.
    await page.waitForTimeout(20)
  }
  // Two settled moves at the destination — the second is what guarantees a final
  // `dragover` at the resting position rather than mid-flight.
  await page.mouse.move(endX, endY)
  await page.mouse.move(endX + 1, endY)
  // `animation: 150` in useListReorder; release before it finishes and the drop
  // lands against a tile that is still sliding.
  await page.waitForTimeout(200)
  await page.mouse.up()
}

test.describe('ANL-A18 · dashboard tile reorder by mouse', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  test('the grid gets a live Sortable even though the board mounted on its empty state', async ({
    page,
  }) => {
    await createEmptyBoard(page)
    // One tile is enough. What is under test is whether the container that
    // appeared AFTER mount got bound at all, not what can be done with it.
    await addTileViaUi(page, TILES[0], 1)

    // THE ASSERTION THE DEFECT IS MADE OF. The grid element did not exist when
    // DashboardDetail mounted — the empty state above proves that — so with
    // `watchElement` at its default this is `false` and stays false forever, no
    // matter how many tiles arrive afterwards. Nothing else on the page changes:
    // the grip renders, the keyboard still moves tiles, and the board looks
    // entirely healthy.
    expect(
      await sortableIsBound(page),
      'no SortableJS instance on the widget grid — useListReorder bound before the container existed',
    ).toBe(true)
  })

  test('a mouse drag reorders a board built in this run, and the new order SURVIVES A RELOAD', async ({
    page,
  }) => {
    const board = await createEmptyBoard(page)
    for (const [i, title] of TILES.entries()) await addTileViaUi(page, title, i + 1)

    expect(await tileOrder(page)).toEqual(TILES)
    // Stated before the drag so that a binding regression fails HERE, naming its
    // own cause, instead of surfacing as an inscrutable "the tiles did not move".
    expect(
      await sortableIsBound(page),
      'no SortableJS instance on the widget grid — the drag below could not possibly work',
    ).toBe(true)

    // Let the tiles finish resolving their figures before anything is measured:
    // a KPI tile changes height when its number arrives, and a drag aimed at a
    // stale box lands on whatever moved into that space.
    await expect(page.getByText(TILES[TILES.length - 1], { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    })
    await page.waitForTimeout(1_000)

    await dragTileOnto(page, 0, 1)

    // Adjacent, and on purpose. Crossing a grid ROW boundary is where synthetic
    // drags get unreliable, and it would test the pointer harness rather than the
    // product. A neighbour swap is the smallest gesture that proves the binding.
    const moved = [TILES[1], TILES[0], TILES[2]]
    await expect.poll(() => tileOrder(page), { timeout: 15_000 }).toEqual(moved)

    // Half one: the order reached the DATABASE. `onEnd` fires only from a real
    // Sortable drop, so before the fix nothing was ever written and this times
    // out — as it also would if `onEnd` were dropped from the options again,
    // which is the OTHER regression this composable has already had once.
    await waitForPersistedOrder(board.id, moved)

    // Half two: a fresh page agrees, which is the part a user experiences. The
    // board mounts on its empty state again on the way in, so this doubles as a
    // second look at the state the whole defect lives in.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect.poll(() => tileOrder(page), { timeout: 20_000 }).toEqual(moved)
    expect(
      await sortableIsBound(page),
      'the grid lost its Sortable on reload — the container is rebuilt behind the empty state every time',
    ).toBe(true)
  })
})
