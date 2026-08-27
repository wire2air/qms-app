// ANL-A12 · The EDIT dialogs open populated, and saving round-trips.
//
// ── THE DEFECT CLASS THIS EXISTS FOR ────────────────────────────────────────
// On 2026-08-26 a user pressed Edit on a saved report and nothing happened. No
// toast, no dialog, no network call, no visible error — the button was simply
// inert. The cause was one line:
//
//   definition: structuredClone(props.report.definition)
//
// `props.report` is a live SyncEngine row, so `.definition` arrives wrapped in a
// Vue reactive Proxy, and structuredClone refuses a Proxy outright:
//   DataCloneError: #<Object> could not be cloned
// It threw inside a `watch` callback, where Vue swallows it, so the ONLY trace
// was a console line nobody was looking at.
//
// ── WHY THIS SPEC, AND WHY IT COVERS TWO DIALOGS ────────────────────────────
// The fix landed with no test at all. Worse, ReportScheduleDialog is built to the
// same shape — re-seed a form from a live row inside a watcher — and its Edit
// button had, at the time this was written, never been pressed by anybody: the
// Schedules tab was one of nine analytics surfaces never opened in a browser.
// A1 covers the CREATE dialog. Nothing covered EDIT, in either place.
//
// ── WHAT AN HONEST ASSERTION LOOKS LIKE HERE ───────────────────────────────
// "The dialog is visible" is not enough, and would have passed on a half-broken
// version. The bug was in POPULATING the form, so each test reads a value back
// out of the form and compares it to what was saved. A dialog that opens empty
// is the same defect wearing a different face — it would silently overwrite the
// row with blanks on the next Save.
//
// The console guard is the other half. This class of bug is invisible on screen
// by definition, so every test here fails on an uncaught error even when the
// visible assertions pass. That is what generalises the spec beyond the two
// dialogs it names.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ANALYTICS, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql } from '../fixtures/db.js'
import {
  ensureRollup,
  gotoAnalytics,
  gotoReports,
  createReportViaUi,
  reportByName,
  uniqueName,
} from '../fixtures/analytics.js'

test.use({ storageState: AUTH.author })

const AUTHOR = USERS.author.id

// Vite's dev server and the sync socket produce console noise that says nothing
// about the app's own health. Everything else is a failure.
const BENIGN =
  /favicon|\[vite\]|Download the Vue Devtools|WebSocket connection|net::ERR_ABORTED|ResizeObserver loop/i

/**
 * Fail the test on anything the page throws, not just on what it shows.
 *
 * Returns a `check()` to call at the END of the test rather than asserting via a
 * listener, so the failure message names the test's own last visible step
 * instead of surfacing at whatever random await the error happened to land on.
 */
function watchForErrors(page) {
  const uncaught = []
  const consoleErrors = []
  page.on('pageerror', (err) => uncaught.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !BENIGN.test(msg.text())) consoleErrors.push(msg.text())
  })
  return function check() {
    // Named explicitly: a DataCloneError is the exact signature of the defect
    // this file exists for, and calling it out beats making the next reader
    // recognise it.
    expect(uncaught, `uncaught page errors:\n${uncaught.join('\n')}`).toEqual([])
    expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([])
  }
}

/** The dialog's panel, waited on by its heading — see createReportViaUi. */
async function openDialog(page, headingRe) {
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: headingRe })).toBeVisible()
  return dialog
}

test.describe('ANL-A12 · edit dialogs', () => {
  test.beforeAll(async () => {
    await ensureRollup()
    sql(`DELETE FROM public.analytics_report_schedules WHERE name LIKE 'ANL-A12%'`)
    sql(`DELETE FROM public.analytics_reports WHERE name LIKE 'ANL-A12%'`)
  })

  test('the report editor opens with the SAVED definition already in it', async ({ page }) => {
    const check = watchForErrors(page)
    const name = uniqueName('ANL-A12 report')

    await gotoReports(page)
    await createReportViaUi(page, name, { metricKeys: [ANALYTICS.METRIC_LABEL] })
    await expect
      .poll(() => reportByName(name), { timeout: 20_000, message: 'report row appears' })
      .not.toBeNull()

    // Reload first, deliberately. Straight after creating, the dialog's props
    // may still hold the object the create path built; after a reload they are
    // unambiguously a live SyncEngine row, which is the shape that broke.
    await gotoReports(page)
    await page.getByRole('button', { name: `Edit report ${name}` }).click()

    const dialog = await openDialog(page, /edit report/i)
    // THE ASSERTION. Not that the dialog appeared — that it appeared CARRYING
    // the saved values. An empty form here would overwrite the report with
    // blanks the moment anyone pressed Save.
    await expect(dialog.getByLabel('Report name')).toHaveValue(name)
    await expect(dialog.getByLabel('Section title').first()).toHaveValue('Section one')

    check()
  })

  test('an edit round-trips — change it, save it, reopen it', async ({ page }) => {
    const check = watchForErrors(page)
    const name = uniqueName('ANL-A12 roundtrip')
    const renamed = `${name} revised`

    await gotoReports(page)
    await createReportViaUi(page, name, { metricKeys: [ANALYTICS.METRIC_LABEL] })
    await expect
      .poll(() => reportByName(name), { timeout: 20_000, message: 'report row appears' })
      .not.toBeNull()

    await gotoReports(page)
    await page.getByRole('button', { name: `Edit report ${name}` }).click()
    let dialog = await openDialog(page, /edit report/i)
    await dialog.getByLabel('Report name').fill(renamed)
    // The submit control is BaseDialogFooter's own, reached by the label the
    // dialog DECLARES — the same reasoning as A1. In edit mode that is
    // "Save changes", not "Create report".
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()

    await expect
      .poll(() => reportByName(renamed), { timeout: 20_000, message: 'renamed row appears' })
      .not.toBeNull()

    // Reopen. A save that updates the list but not the row would pass the poll
    // above and fail here.
    await gotoReports(page)
    await page.getByRole('button', { name: `Edit report ${renamed}` }).click()
    dialog = await openDialog(page, /edit report/i)
    await expect(dialog.getByLabel('Report name')).toHaveValue(renamed)

    check()
  })

  test('the schedule editor opens with its saved values in it', async ({ page }) => {
    const check = watchForErrors(page)
    const name = `ANL-A12 sched ${Date.now().toString(36)}`

    // Seeded through SQL rather than the UI on purpose: creating a schedule is
    // A7's subject and it has its own permission gate. What has never been
    // exercised anywhere is opening an EXISTING one for edit, so that is all
    // this sets up for.
    sql(
      `INSERT INTO public.analytics_report_schedules
         (company_id, owner_id, report_id, name, cron_expression, timezone,
          recipients, format, is_active)
       VALUES ('${COMPANY_ID}', '${AUTHOR}', '${ANALYTICS.sharedReport.id}',
               '${name}', '0 7 * * 1', 'America/New_York',
               '[{"type":"user","id":"${AUTHOR}"}]'::jsonb, 'xlsx', false)`,
    )

    await gotoAnalytics(page, `/reports/${ANALYTICS.sharedReport.id}?tab=schedules`)
    await page.getByRole('button', { name: `Edit schedule ${name}` }).click()

    const dialog = await openDialog(page, /edit schedule/i)
    await expect(dialog.getByLabel('Schedule name')).toHaveValue(name)

    check()
  })

  test('a schedule that has never run says so, rather than showing nothing', async ({ page }) => {
    const check = watchForErrors(page)
    const name = `ANL-A12 runs ${Date.now().toString(36)}`

    sql(
      `INSERT INTO public.analytics_report_schedules
         (company_id, owner_id, report_id, name, cron_expression, timezone,
          recipients, format, is_active)
       VALUES ('${COMPANY_ID}', '${AUTHOR}', '${ANALYTICS.sharedReport.id}',
               '${name}', '0 7 * * 1', 'America/New_York',
               '[{"type":"user","id":"${AUTHOR}"}]'::jsonb, 'xlsx', false)`,
    )

    await gotoAnalytics(page, `/reports/${ANALYTICS.sharedReport.id}?tab=schedules`)
    // Both conditions, deliberately. Filtering on the name alone matches every
    // ancestor div up to <body> AND the text node's own wrapper, and `.last()`
    // picks whichever the DOM happens to end on — which was the wrapper, with no
    // button inside it. Naming the button too pins the one div that is the card.
    const card = page
      .locator('div')
      .filter({ has: page.getByText(name, { exact: true }) })
      .filter({ has: page.getByRole('button', { name: /run history/i }) })
      .last()
    await card.getByRole('button', { name: /run history/i }).click()

    // A schedule that has not fired and a schedule that fired and delivered
    // nothing are different facts, and the person waiting on a report needs to
    // tell them apart before it is late. Anything is acceptable here except a
    // blank panel.
    const panel = page.getByText(/no runs|has not run|never run|nothing yet/i)
    await expect(panel.first()).toBeVisible({ timeout: 15_000 })

    check()
  })
})
