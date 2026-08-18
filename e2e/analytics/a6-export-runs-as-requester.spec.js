// ANL-A6 · An export carries the REQUESTER's numbers, never the author's.
//
// ── WHY THIS IS THE MOST IMPORTANT TEST IN THE SUITE ────────────────────────
// A dashboard's numbers stay on a screen; an export leaves the system, into a
// file, an inbox, an auditor's hands. If a shared report exported its AUTHOR's
// scope-resolved figures, every recipient would receive numbers they are not
// entitled to see and NOTHING about the resulting spreadsheet would look wrong.
// There is no way to detect it downstream — which is exactly why it has to be
// pinned here.
//
// ── WHY THE IDENTITY IS UNREPRESENTABLE RATHER THAN MERELY CHECKED ──────────
// `request_report_export()` is SECURITY INVOKER and takes (report_id, format) —
// no user argument. It derives the requester from the session GUCs and hands that
// to a SECURITY DEFINER one-liner that enqueues the job. So "export as somebody
// else" is not refused, it is not expressible: there is no parameter for it. The
// privilege split exists because `app_user` has no USAGE on the graphile_worker
// schema (measured: "permission denied for schema graphile_worker"), so the
// enqueue had to be elevated — and the seam was cut as narrowly as possible.
//
// The seeded report is owned by `owner` and exported by `author` on purpose. When
// requester and author are the same person the property is unobservable.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ANALYTICS, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql } from '../fixtures/db.js'
import { mailIdsTo } from '../fixtures/authPages.js'
import { ensureRollup, exportJobs, clearExportJobs, enqueueExportsInTransaction, requestExportAs, gotoAnalytics } from '../fixtures/analytics.js'

// Both exporters must actually HOLD `reports_dashboards:export`. The first draft
// of this file used siteRoamer as the second requester and the probe refused it
// with "You do not have permission to export reports" — correctly: §31 grants
// them read only. A denial persona in a dedupe test proves nothing about dedupe.

test.describe('ANL-A6 · export identity', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  // These four inspect the queue INSIDE the enqueuing transaction and roll it
  // back. The dev worker claims an export job within about a second, so
  // "call, then count" is a race the test loses roughly half the time — and when
  // it loses it reads as "no job was enqueued". Rolling back also keeps a suite
  // run from mailing real spreadsheets to real inboxes.
  test('the enqueued job names the requester, not the report owner', async () => {
    const jobs = enqueueExportsInTransaction(ANALYTICS.sharedReport.id, [
      { userId: USERS.author.id, format: 'xlsx' },
    ])
    expect(jobs.length, 'exactly one job was enqueued').toBe(1)
    const { payload } = jobs[0]

    expect(payload.reportId).toBe(ANALYTICS.sharedReport.id)
    // The assertion. The report belongs to `owner`; the file belongs to `author`.
    expect(payload.userId, 'the export renders under the requester').toBe(USERS.author.id)
    expect(payload.userId).not.toBe(USERS.owner.id)
    expect(payload.companyId, 'the tenant comes from the session, not the request').toBe(COMPANY_ID)
    expect(payload.format).toBe('xlsx')
  })

  test('two different people exporting one report produce two jobs', async () => {
    const jobs = enqueueExportsInTransaction(ANALYTICS.sharedReport.id, [
      { userId: USERS.author.id },
      { userId: USERS.controller.id },
    ])
    // Deliberately NOT collapsed. Two readers of one shared report legitimately
    // produce two different files, so a job_key keyed on the report alone would
    // hand one of them the other's numbers.
    expect(jobs.length, 'one job per requester').toBe(2)
    expect(jobs.map((j) => j.payload.userId).sort()).toEqual(
      [USERS.author.id, USERS.controller.id].sort(),
    )
  })

  test('a double-click collapses to one job', async () => {
    const jobs = enqueueExportsInTransaction(ANALYTICS.sharedReport.id, [
      { userId: USERS.author.id, format: 'xlsx' },
      { userId: USERS.author.id, format: 'xlsx' },
    ])
    // job_key is (task, user, report, format) — an impatient second click must not
    // put a second identical spreadsheet in one inbox.
    expect(jobs.length, 'the job_key dedupes an identical request').toBe(1)
    expect(jobs[0].key).toContain(USERS.author.id)
    expect(jobs[0].key).toContain(ANALYTICS.sharedReport.id)
  })

  test('a different format is a different job', async () => {
    const jobs = enqueueExportsInTransaction(ANALYTICS.sharedReport.id, [
      { userId: USERS.author.id, format: 'xlsx' },
      { userId: USERS.author.id, format: 'pdf' },
    ])
    expect(jobs.length, 'format is part of the identity of a request').toBe(2)
  })

  test('a report the requester cannot read cannot be exported', async () => {
    clearExportJobs()
    // The private report belongs to `owner`. The function re-checks readability
    // under the caller's own RLS, so this must be refused rather than enqueued and
    // failed later — a queued job for an unreadable report is a retry loop.
    const res = requestExportAs(USERS.author.id, ANALYTICS.privateReport.id)
    const enqueued = exportJobs()
    expect(
      !res.ok || enqueued.length === 0,
      'an unreadable report is refused at request time, not at render time',
    ).toBe(true)
  })

  test.describe('through the UI', () => {
    test.use({ storageState: AUTH.author })

    test('the export control on a report enqueues a job for the signed-in user', async ({ page }) => {
      clearExportJobs()
      const beforeIds = (await mailIdsTo(USERS.author.email)) ?? []
      await gotoAnalytics(page, `/reports/${ANALYTICS.sharedReport.id}`)
      await expect(page.getByText(ANALYTICS.sharedReport.name).first()).toBeVisible()

      // The controls are labelled "Email as Excel" / "Email as PDF", not
      // "Export" — deliberately, because delivery IS email: the worker renders
      // under the requester and mails it, and there is no download to click. A
      // locator matching /export/i finds some other control and clicks nothing
      // that enqueues.
      const emailAsExcel = page.getByRole('button', { name: /email as excel/i }).first()
      await expect(emailAsExcel, 'author holds reports_dashboards:export').toBeVisible()
      await emailAsExcel.click()

      // ⚠️ NOT an assertion about the queue. The worker claims the job within
      // about a second, so polling `exportJobs()` sees a count and then reads an
      // empty array a moment later — `Cannot read properties of undefined`. The
      // three tests above already pin the payload exhaustively, inside a
      // transaction, where nothing can drain it.
      //
      // What this test uniquely proves is the END of the path: the button
      // delivers. Delivery here IS email — the controls say "Email as Excel",
      // there is no download — so the mailbox is the honest place to look, and it
      // also proves the export actually rendered rather than failing after
      // enqueue.
      await expect
        .poll(
          async () => {
            const ids = await mailIdsTo(USERS.author.email)
            return (ids?.length ?? 0) - beforeIds.length
          },
          { timeout: 90_000, intervals: [2_000], message: 'the export is emailed to the requester' },
        )
        .toBeGreaterThan(0)
    })
  })

  test.afterAll(() => {
    // Leave no queued exports behind: the worker would render and mail them, and
    // the next run's "exactly one job" assertions would start dirty.
    clearExportJobs()
    sql(`DELETE FROM public.analytics_report_runs WHERE report_id = '${ANALYTICS.sharedReport.id}'`)
  })
})
