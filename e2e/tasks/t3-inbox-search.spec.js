// TASK-T3 — the inbox search box exists and narrows the list both ways, and the
// fall-through that silently EATS rows is caught in the act.
//
// ── F-20: THE CONTROL DID NOT EXIST ─────────────────────────────────────────
//
// `taskInstancesFilterToolbar.vue` teleports its search box into the app header
// (`#main-header-search`). The finding called that teleport "dead" and priced
// removing it at 0.1 d. The diagnosis was wrong twice over: the target exists
// (`MainHeader.vue:86`, and three other toolbars use it successfully), and the
// search behind it was plumbed end-to-end through three files —
// `taskInstancesHome.vue` owns `filters.search`, the toolbar holds it as a
// defineModel, and `taskInstancesTable.vue`'s `filteredInstances` runs a
// twenty-branch entity-aware match against it. Every part of a working feature
// was present except the input element; the teleport's body was empty. Removing
// it would have ripped out a working filter and orphaned the plumbing.
//
// (Note the id. The pack attributes this to F-20. F-19 — the 1 362-line
// component with five parallel entity-type switches — is untouched and fully
// open.)
//
// ── AND THE BUG THE MISSING BOX WAS HIDING ──────────────────────────────────
//
// `filteredInstances` is a chain of `if (entityType === …)` returns whose
// FALL-THROUGH is `getDocument(instance)` followed by `if (!doc) return false`.
// A task whose host record does not resolve is therefore not merely unmatched —
// it DISAPPEARS the moment anything is typed. `Complaint` and
// `CustomerComplaint` had no branch, so every complaint task vanished from the
// inbox under search. The bug was unobservable precisely because there was no
// search box.
//
// The complaint case itself is not reproducible here — the E2E tenant seeds zero
// `complaints` and zero `customer_complaints` rows and there is no complaints
// fixture in `e2e/` — and it no longer needs to be: BOTH branches were added on
// 2026-09-01. What this spec does instead is better than a re-enactment. The
// second test catches the identical mechanism firing on a row the product mints
// today, for a different reason, and proves the cause rather than guessing it.
//
// ── TEST 1 IS TWO CAPA TASKS, NOT A CAPA AND A DOCUMENT ─────────────────────
//
// The first draft paired a CAPA task with a collaboration task, on the theory
// that one row would exercise a named branch and the other the fall-through.
// That draft could not pass, and the reason is test 2: the collaborator cannot
// read the document, so the fall-through drops the row under EVERY search term
// including the document's own title. Two CAPAs on one run tag give the "A in /
// B out, then B in / A out, then both" shape an honest filter test needs, with
// no row whose disappearance is over-determined.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import {
  canReadDocument,
  createPersonaPool,
  gotoInbox,
  inboxRow,
  inboxRowAnywhere,
  inboxSearch,
  mintCapaTask,
  mintCollaboratorTask,
  taskRow,
  uniqueTag,
} from '../fixtures/tasks.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

test.describe('TASK-T3 — the inbox search box (F-20)', () => {
  let capaA
  let capaB
  let doc
  let run

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600_000)
    run = uniqueTag('T3')
    const authorPage = await pool.page(browser, AUTH.author)
    // Two CAPA tasks for one assignee, sharing a run tag and differing in their
    // CAPA numbers — so "both visible" and "one narrowed away" are the same list.
    capaA = await mintCapaTask(authorPage, `${run} A`)
    capaB = await mintCapaTask(authorPage, `${run} B`)
    // …and one collaboration task, for the fall-through probe below.
    doc = await mintCollaboratorTask(authorPage, { tag: run, collaborators: [USERS.reviewer] })
  })

  test('the control is in the header, and it narrows the list both ways', async ({ browser }) => {
    test.setTimeout(180_000)
    const page = await pool.page(browser, AUTH.reviewer)
    await gotoInbox(page)

    // The assertion F-20 is really about: the input renders at all. It is
    // located by its own placeholder rather than by position, because the header
    // also hosts GlobalSearch and both live in `#main-header-search`.
    const search = inboxSearch(page)
    await expect(search, 'the teleport shipped with an empty body until 2026-09-01').toBeVisible({
      timeout: 45_000,
    })
    await expect(search, 'and there is exactly one of it').toHaveCount(1)

    const rowA = inboxRow(page, capaA.title)
    const rowB = inboxRow(page, capaB.title)

    // The narrowing below searches on one CAPA number and asserts the other is
    // absent, and `filteredInstances` matches with `includes` — so two numbers
    // where one is a prefix of the other (CAPA-11 / CAPA-110) would make the
    // "absent" half fail for a reason that has nothing to do with the filter.
    // Sequential three-digit numbers never collide; assert it rather than assume
    // the numbering scheme never changes.
    expect(
      capaA.capaNumber.includes(capaB.capaNumber) || capaB.capaNumber.includes(capaA.capaNumber),
      `${capaA.capaNumber} / ${capaB.capaNumber} must not contain one another`,
    ).toBe(false)

    // Baseline — both tasks are in the inbox with search empty.
    await expect(rowA.first()).toBeVisible({ timeout: 60_000 })
    await expect(rowB.first()).toBeVisible({ timeout: 60_000 })

    // A CAPA task survives a search that matches it through the `Capa` branch's
    // capaNumber arm, and its sibling — same entity type, same assignee, same
    // status, differing only in the record — drops out.
    await search.fill(capaA.capaNumber)
    await expect(rowA.first(), 'matched on capaNumber').toBeVisible({ timeout: 30_000 })
    await expect(rowB, 'and the sibling CAPA does not match A’s number').toHaveCount(0)

    // The mirror image, so neither disappearance can be a row that simply left
    // the inbox: the same two locators, the same page, the opposite answer.
    await search.fill(capaB.capaNumber)
    await expect(rowB.first(), 'matched on the other capaNumber').toBeVisible({ timeout: 30_000 })
    await expect(rowA, 'and A drops out in its turn').toHaveCount(0)

    // Both titles carry the run tag, so the broader term brings both back — which
    // is what proves the two disappearances above were the filter working.
    await search.fill(run)
    await expect(rowA.first(), 'the run tag matches both titles').toBeVisible({ timeout: 30_000 })
    await expect(rowB.first()).toBeVisible({ timeout: 30_000 })

    // Clearing restores the unfiltered list.
    await search.fill('')
    await expect(rowA.first()).toBeVisible({ timeout: 30_000 })
    await expect(rowB.first()).toBeVisible({ timeout: 30_000 })
  })

  test('🟠 DOC-COLLAB-RLS — a collaboration task whose document the assignee cannot read', async ({
    browser,
  }) => {
    // ── WHAT THIS PINS, AND WHY IT IS WRITTEN AS A PASS ──────────────────────
    //
    // Adding a collaborator raises a REVIEW task and mails them "You've been
    // added as a collaborator on <DOC>. Please review and contribute your changes
    // before it's submitted for review." They cannot. `documents_sel` has no
    // `users_on_documents` arm anywhere — grepped across every policy on the
    // table — so a collaborator reaches the document only through one of the
    // arms they do not satisfy: author/owner, a DocumentVersion task, an explicit
    // share, or `document_control:read` AND an EFFECTIVE version. A document is
    // collaborated on while it is a DRAFT, which is precisely when no version is
    // EFFECTIVE. Measured on the E2E tenant 2026-09-01: 100 collaboration tasks,
    // 0 whose host document has an EFFECTIVE version.
    //
    // The user-visible result is three things, all asserted below: the inbox row
    // renders with no title, its deep link opens a page that never finishes
    // loading, and the row VANISHES from the inbox the moment anything is typed
    // into the search box — including the document's own title.
    //
    // This is asserted as current behaviour rather than left as a failing test,
    // on the standing rule for a defect found outside the lane that fixed the
    // module: the repair is a documents-RLS change in `qms/database/rls.sql`, not
    // a task change, and a red spec here would be a permanent alarm on somebody
    // else's file. When the collaborator arm lands, THIS TEST FAILS — which is
    // the notification, and the point. Delete it then and fold the document back
    // into test 1 as the fall-through's positive case.
    test.setTimeout(180_000)

    // The two sides, at the database, in this run. Without the author half, "the
    // reviewer cannot read it" is equally consistent with the fixture never
    // having written a document at all.
    expect(canReadDocument(USERS.author, doc.documentId), 'its author can read it').toBe(true)
    expect(
      canReadDocument(USERS.reviewer, doc.documentId),
      'the collaborator it was raised for cannot',
    ).toBe(false)

    // The task itself is real, and assigned to her.
    const task = taskRow(doc.tasks[USERS.reviewer.id])
    expect(task.entityType).toBe('Document')
    expect(task.sourceType).toBe('DocumentCollaborator')
    expect(task.assignedTo).toBe(USERS.reviewer.id)
    expect(task.comment, 'and it asks her to review the document by name').toContain(doc.title)

    const page = await pool.page(browser, AUTH.reviewer)
    await gotoInbox(page)

    // The row IS in her inbox — located on the producer's comment, which is the
    // only place the document's title appears on it.
    const looseRow = inboxRowAnywhere(page, doc.title)
    await expect(looseRow.first(), 'the task reaches her inbox').toBeVisible({ timeout: 60_000 })

    // …and the title cell beside it is empty. Same page, same moment: the strict
    // locator wants an exact title text node and finds none.
    await expect(
      inboxRow(page, doc.title),
      'but the title cell cannot resolve the document (renders "—")',
    ).toHaveCount(0)

    // The fall-through, caught in the act. `getDocument()` returns null, so
    // `if (!doc) return false` drops the row under ANY search term — this is the
    // exact mechanism that ate every complaint task before the two branches were
    // added, observed on a row the product mints today.
    const search = inboxSearch(page)
    await search.fill('TASKDOC')
    await expect(
      looseRow,
      'a task whose host record does not resolve vanishes under search',
    ).toHaveCount(0, { timeout: 30_000 })

    // Two-sided: the same keystroke on a row that DOES resolve keeps it. Without
    // this the disappearance above is indistinguishable from a broken search box.
    await search.fill(capaA.capaNumber)
    await expect(
      inboxRow(page, capaA.title).first(),
      'while a task whose record does resolve survives the same search',
    ).toBeVisible({ timeout: 30_000 })

    // And clearing brings the unresolved row back — so it was the FILTER that
    // dropped it, not the row leaving her inbox.
    await search.fill('')
    await expect(looseRow.first(), 'it is only ever hidden by the filter').toBeVisible({
      timeout: 30_000,
    })
  })
})
