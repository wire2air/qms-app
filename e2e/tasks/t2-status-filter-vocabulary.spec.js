// TASK-T2 — the status filter offers the vocabulary the database actually has.
//
// F-12. `TaskInstanceStatusSelectMenu.vue` held a hardcoded array of FOUR ids
// while `task_instance_statuses` seeds TEN, so a task in any of the other six —
// CANCELLED, FORM_SUBMITTED, IN_PROGRESS, REASSIGNED, SENT_BACK, SUPERSEDED —
// was visible in the inbox and impossible to filter for. The menu now reads the
// lookup table through a live query.
//
// ── THE FINDING'S OWN NUMBER WAS WRONG, AND THAT IS WHY THIS TEST READS THE DB ─
//
// F-12 is written as "4 of 12". The denominator is 10. Somebody counted keys in
// `TaskInstanceStatusBadge.vue`'s SCHEME_MAP, which held twelve — the ten real
// ones plus RESOLVED and PENDING, neither of which has ever had a row. That 12
// then propagated into five other documents in the pack.
//
// So this spec asserts against `task_instance_statuses` itself rather than
// against a literal. A copied list is what drifted in the first place, and a
// test that hardcoded 10 would be the third copy of the same list waiting to
// drift the same way. The phantom pair is asserted ABSENT by name, because their
// presence in the badge map is what made `statusId: 'RESOLVED'` look plausible
// to the two backend authors who wrote it and FK-failed (F-05b / IL-D1).
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'
import {
  createPersonaPool,
  gotoInbox,
  inboxRow,
  mintCapaTask,
  pickStatus,
  seededStatuses,
  statusFilter,
  statusFilterOptions,
  uniqueTag,
} from '../fixtures/tasks.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

// The menu relabels APPROVED because "Approved" is the task vocabulary for
// "done" on every step type, not just approvals, and a filter has no step to
// disambiguate against. Everything else renders its seeded `name` verbatim.
const RELABELLED = { APPROVED: 'Approved / Completed' }

test.describe('TASK-T2 — the status filter’s vocabulary (F-12)', () => {
  let capa

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000)
    const authorPage = await pool.page(browser, AUTH.author)
    capa = await mintCapaTask(authorPage, uniqueTag('T2'))
  })

  test('every seeded status is offered, and the two phantoms are not', async ({ browser }) => {
    test.setTimeout(180_000)
    const page = await pool.page(browser, AUTH.reviewer)
    await gotoInbox(page)

    // Guard: this page is expected to render exactly one BaseSelect. DataTable's
    // own column filters live inside a closed popover and use menuitemcheckbox,
    // and the layout renders no combobox at all — so if this ever counts more
    // than one, `statusFilterOptions` is driving the wrong control and every
    // assertion below would be about something else.
    await expect(statusFilter(page), 'the status select is the page’s only combobox').toHaveCount(1)

    const seeded = seededStatuses()
    expect(seeded.length, 'the lookup table is the denominator, not a literal').toBeGreaterThan(0)

    const offered = await statusFilterOptions(page)

    for (const s of seeded) {
      const label = RELABELLED[s.id] || s.name
      expect(offered, `"${label}" (${s.id}) must be offerable`).toContain(label)
    }

    // …and nothing beyond them, apart from the "all" entry BaseSelect adds for a
    // clearable filter. An exact count is what catches a hardcoded array being
    // reintroduced alongside the live query rather than replacing it.
    expect(offered, 'the seeded vocabulary plus BaseSelect’s null option').toHaveLength(
      seeded.length + 1,
    )

    // The phantoms. Neither has a row in `task_instance_statuses`, so neither can
    // reach this menu through the live query — but both were styled by the badge
    // map for months, which is how they came to look real.
    expect(offered.join('|')).not.toMatch(/resolved/i)
    expect(offered.join('|')).not.toMatch(/\bpending\b/i)
  })

  test('a newly-offered status actually filters — two-sided, on one row', async ({ browser }) => {
    test.setTimeout(180_000)
    const page = await pool.page(browser, AUTH.reviewer)
    await gotoInbox(page)

    const row = inboxRow(page, capa.title)

    // The inbox opens on ASSIGNED, which is where the minted task lives.
    await expect(row.first(), 'the fixture is present under the default filter').toBeVisible({
      timeout: 60_000,
    })

    // SUPERSEDED is one of the six the hardcoded array omitted. Picking it must
    // narrow the list — and the ASSIGNED task must fall out of it.
    //
    // The negative alone would prove nothing: an empty list is also what a
    // broken filter, an unsynced IndexedDB and a mistyped title produce. It is
    // only evidence because the SAME locator, on the SAME page, was visible one
    // line above and comes back one line below.
    await pickStatus(page, 'Superseded')
    await expect(row, 'an ASSIGNED task is not SUPERSEDED').toHaveCount(0, { timeout: 30_000 })

    await pickStatus(page, 'Assigned')
    await expect(row.first(), 'and it comes back').toBeVisible({ timeout: 30_000 })
  })
})
