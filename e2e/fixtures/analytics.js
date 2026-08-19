// Analytics / QMS Intelligence fixture helpers.
//
// ── WHY THIS SUITE TALKS TO THE ROLLUP AT ALL ───────────────────────────────
// `metric_catalog()` ends with `AND EXISTS (SELECT 1 FROM analytics_rollup r
// WHERE r.metric_key = m.id)`, and analytics_rollup is RLS'd. Until the rollup
// holds rows the reader may see, EVERY picker in the module is empty and every
// journey fails the same way whether the cause is a missing grant, a missing
// refresh, or a broken executor. `ensureRollup()` establishes that premise once,
// through the real worker task, so a green suite means the refresh path works
// rather than that someone hand-wrote a bucket.
//
// ── WHY FIGURES ARE ASSERTED THROUGH metric_value() AND NOT ONLY THE SCREEN ──
// The number on a tile is scope-resolved server-side, and the property worth
// testing is that two readers get two DIFFERENT correct answers to one stored
// question. A screen can only ever show one reader's answer at a time, so the
// comparison has to happen below the UI. The UI tests assert that the tile
// renders the figure it was given; these helpers assert what that figure is.
import { expect } from '@playwright/test'
import { sql, sqlValue, sqlAsAppUser, waitForSqlValue } from './db.js'
import { ANALYTICS, COMPANY_ID } from './cast.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// ── the rollup ──────────────────────────────────────────────────────────────

/**
 * Make sure the rollup holds the seeded fact month, refreshing through the real
 * graphile-worker task if it does not.
 *
 * `add_job`'s payload parameter is `json`, NOT `jsonb` — the jsonb cast raises
 * "function graphile_worker.add_job(unknown, jsonb) does not exist", which reads
 * like a missing extension rather than a wrong cast.
 */
export async function ensureRollup({ timeoutMs = 90_000 } = {}) {
  const present = () =>
    Number(
      sqlValue(`SELECT count(*) FROM public.analytics_rollup
                 WHERE company_id = ${q(COMPANY_ID)}
                   AND metric_key = ${q(ANALYTICS.METRIC)}
                   AND period_start = ${q(ANALYTICS.FACT_MONTH.start)}`) || 0,
    )
  if (present() > 0) return
  sql(`SELECT graphile_worker.add_job('refresh_analytics_rollup', '{"full":true}'::json)`)
  await waitForSqlValue(
    `SELECT count(*) FROM public.analytics_rollup
      WHERE company_id = ${q(COMPANY_ID)} AND metric_key = ${q(ANALYTICS.METRIC)}
        AND period_start = ${q(ANALYTICS.FACT_MONTH.start)}`,
    { timeoutMs, label: 'analytics rollup contains the seeded fact month' },
  )
}

// ── metrics as a specific reader ────────────────────────────────────────────

const MV_TAG = 'MV='

/**
 * `metric_value()` for the seeded fact month, resolved as `userId` under RLS.
 *
 * Returns `{ value, scope, rows }`. All three matter, because there are THREE
 * distinct outcomes and the first two look identical if you only read `value`:
 *
 *   rows 1, value 6      an answer
 *   rows 1, value null   you may see this metric, but not these facts — the
 *                        reader lacks the MEASURED module's read. Absence is
 *                        deliberately not distinguished from "no data" here;
 *                        `metric_catalog()` is the authority on offerability.
 *   rows 0               the registry row itself is invisible — the reader
 *                        lacks the ANALYTICS module grant (F-11).
 */
export function metricValueAs(userId, { metricKey = ANALYTICS.METRIC, from, to, defaultWindow = false } = {}) {
  // `defaultWindow` passes NULL/NULL so the function snaps its OWN window — the
  // same whole-month range a `last_12_months` widget resolves to. A UI assertion
  // has to use this rather than the fact month: the seeded month is only part of
  // what the tile is showing, because other suites keep creating records in the
  // current one.
  const window = defaultWindow
    ? 'NULL, NULL'
    : `${q(from ?? ANALYTICS.FACT_MONTH.start)}, ${q(to ?? ANALYTICS.FACT_MONTH.end)}`
  // The payload is TAGGED rather than located by position. sqlAsAppUser echoes
  // its own set_config() calls first, and those echoes are indistinguishable
  // from a result by shape alone — one of them prints `false`, two print uuids.
  // Taking "the last line" therefore reads a GUC echo whenever the query returns
  // nothing, which is precisely the case this helper has to be able to report.
  const res = sqlAsAppUser(
    `SELECT '${MV_TAG}' || COALESCE(value::text,'') || '\u001f' || COALESCE(effective_scope,'')
       FROM public.metric_value(${q(metricKey)}, ${window});`,
    { userId, companyId: COMPANY_ID },
  )
  if (!res.ok) return { value: null, scope: null, rows: 0, error: res.error }
  const payload = res.output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith(MV_TAG))

  // `rows` separates the two ways of having no answer, which the values alone
  // cannot: ONE row with a NULL value means "you may see this metric, but not
  // these facts", while ZERO rows means the registry row itself is invisible —
  // you do not hold the analytics module grant (F-11). Both used to collapse to
  // `{ value: null }`, and the two specs that assert on them drifted into
  // stating opposite things about the same persona as a result.
  if (!payload.length) return { value: null, scope: null, rows: 0 }
  const [value, scope] = payload[0].slice(MV_TAG.length).split('\u001f')
  return {
    value: value === '' ? null : Number(value),
    scope: scope || null,
    rows: payload.length,
  }
}

/** The rows `metric_breakdown()` returns for the fact month, as `{ label: value }`. */
export function breakdownAs(userId, dimension = 'severity') {
  const res = sqlAsAppUser(
    `SELECT dimension_value || '=' || value::text
       FROM public.metric_breakdown(${q(ANALYTICS.METRIC)}, ${q(dimension)},
            ${q(ANALYTICS.FACT_MONTH.start)}, ${q(ANALYTICS.FACT_MONTH.end)}, 25, 0, 'contribution')
      WHERE dimension_value IS NOT NULL AND is_residual IS NOT TRUE;`,
    { userId, companyId: COMPANY_ID },
  )
  const out = {}
  if (!res.ok) return out
  for (const line of res.output.split('\n')) {
    const m = /^([A-Z_]+)=(\d+(?:\.\d+)?)$/.exec(line.trim())
    if (m) out[m[1]] = Number(m[2])
  }
  return out
}

// ── navigation ──────────────────────────────────────────────────────────────
/**
 * ⚠️ NOT `waitForLoadState('networkidle')`.
 *
 * The app holds an open socket.io connection for sync, so the network NEVER goes
 * idle and the wait burns its full 30s before failing. That single wrong barrier
 * failed 20 of this suite's first 22 red tests — every one of them looking like a
 * broken screen rather than a broken helper. Every other fixture in this repo
 * navigates with a plain `goto` and then waits on a real element, which is also
 * the honest barrier: what a test needs is not silence on the wire, it is the
 * thing it is about to assert on.
 *
 * Analytics pages resolve their figures server-side after the shell paints, so
 * callers still wait on their own content; the tile assertions carry generous
 * timeouts for exactly that reason.
 */
export async function gotoAnalytics(page, path = '') {
  await page.goto(`/analytics${path}`, { waitUntil: 'domcontentloaded' })
}

export const gotoReports = (page) => gotoAnalytics(page, '/reports')
export const gotoDashboards = (page) => gotoAnalytics(page, '/dashboards')
export const gotoAlerts = (page) => gotoAnalytics(page, '/alerts')
export const gotoExplore = (page) => gotoAnalytics(page, '/explore')

// ── the report builder ──────────────────────────────────────────────────────

export function uniqueName(prefix) {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
}

/**
 * Drive the real New-report dialog to completion.
 *
 * ⚠️ The submit control is `BaseDialogFooter`'s OWN button, reached by its
 * `submitLabel` — not a button this dialog renders. That component has no default
 * slot, so children handed to it are discarded silently; a footer written as
 * `<BaseDialogFooter><BaseButton>…` renders the component's default "Save" and
 * wires nothing to it. Locating the button by the label the dialog DECLARES is
 * what makes that regression fail here instead of shipping: on 2026-08-18 the
 * live dialog showed "Save" while its source said "Create report", and pressing
 * it did nothing at all.
 */
export async function createReportViaUi(
  page,
  name,
  { metricKeys = [], dimension = null, description = 'Created by the analytics suite.' } = {},
) {
  await page.getByRole('button', { name: /new report/i }).click()
  const dialog = page.getByRole('dialog')
  // NOT `expect(dialog).toBeVisible()`. Headless UI's dialog root is a
  // zero-box positioning wrapper — the panel inside it is what has layout — so
  // Playwright reports a perfectly open dialog as `hidden`. Wait on its heading.
  await expect(dialog.getByRole('heading', { name: /new report|edit report/i })).toBeVisible()

  await dialog.getByLabel('Report name').fill(name)
  await dialog.getByLabel('Description').fill(description)
  await dialog.getByLabel('Section title').first().fill('Section one')

  for (const key of metricKeys) await pickFromSelect(dialog, 'Metrics', key)
  if (dimension) {
    // `getByLabel(...).check()` resolves the real <input type="checkbox">, which
    // BaseCheckbox renders `sr-only` behind a styled <span> that intercepts the
    // pointer — so the click retries until it times out. Clicking the LABEL is
    // both what a user does and what actually toggles it.
    await dialog.getByText(/add a breakdown table/i).click()
    await expect(dialog.getByLabel(/add a breakdown table/i)).toBeChecked()
    await pickFromSelect(dialog, 'Break down which metric', metricKeys[0])
    await pickFromSelect(dialog, 'By', dimension)
  }

  await dialog.getByRole('button', { name: 'Create report', exact: true }).click()
  // ⚠️ NOT `expect(dialog).toBeHidden()`. The same zero-box dialog root that makes
  // `toBeVisible()` fail makes `toBeHidden()` pass INSTANTLY — while the dialog is
  // still open and the mutation still in flight. The helper then returned before
  // the row was written and the caller's "the report row exists" failed on a
  // report that was, a second later, perfectly present. Wait on the panel's
  // heading, which has a real box in both directions.
  await expect(dialog.getByRole('heading', { name: /new report|edit report/i })).toBeHidden()
}

/**
 * Choose an option in a `BaseSelect` by its visible label.
 *
 * BaseSelect is a custom popover, not a native `<select>`, so `selectOption()`
 * does not apply — it renders a trigger that opens a listbox. Matching the option
 * on its LABEL (what a user sees) rather than its metric key is deliberate: the
 * key is an implementation detail the screen never shows.
 */
export async function pickFromSelect(scope, label, optionText) {
  await scope.getByLabel(label, { exact: false }).first().click()
  const option = scope.page().getByRole('option', { name: optionText, exact: false }).first()
  await option.waitFor({ state: 'visible' })
  await option.click()
  // Multi-selects stay open for the next pick; single ones close themselves.
  await scope.page().keyboard.press('Escape')
}

// ── direct-database reads ───────────────────────────────────────────────────

export function reportByName(name) {
  // `sql()`, not `sqlValue()`: sqlValue splits psql's pipe-separated output and
  // hands back the FIRST column only, which silently truncates a row assembled
  // with `||` and leaves the jsonb unparseable.
  const row = sql(
    `SELECT id || '\u001f' || visibility || '\u001f' || owner_id || '\u001f' || definition::text
       FROM public.analytics_reports
      WHERE company_id = ${q(COMPANY_ID)} AND name = ${q(name)} AND deleted_at IS NULL`,
  )
  if (!row) return null
  const [id, visibility, ownerId, definition] = row.split('\u001f')
  return { id, visibility, ownerId, definition: JSON.parse(definition) }
}

export function dashboardByName(name) {
  const row = sql(
    `SELECT id || '\u001f' || visibility || '\u001f' || owner_id
       FROM public.analytics_dashboards
      WHERE company_id = ${q(COMPANY_ID)} AND name = ${q(name)} AND deleted_at IS NULL`,
  )
  if (!row) return null
  const [id, visibility, ownerId] = row.split('\u001f')
  return { id, visibility, ownerId }
}

// ── exports ─────────────────────────────────────────────────────────────────

/**
 * Call `request_report_export()` as `userId`, the way the UI does.
 *
 * The function is SECURITY INVOKER and derives the requester from the session
 * GUCs rather than from an argument, so there is no parameter that would make it
 * export as somebody else. Returning `{ ok }` rather than throwing keeps the
 * interesting case — a refusal — assertable.
 */
export function requestExportAs(userId, reportId, format = 'xlsx') {
  const res = sqlAsAppUser(
    `SELECT public.request_report_export(${q(reportId)}::uuid, ${q(format)});`,
    { userId, companyId: COMPANY_ID },
  )
  return { ok: res.ok, output: res.output, error: res.error }
}

/**
 * Queued `export_analytics_report` jobs, newest first, with their payloads.
 *
 * ⚠️ Read from `graphile_worker._private_jobs`, not the `graphile_worker.jobs`
 * view: the view exposes `task_identifier` but NOT `payload`, and the payload is
 * the whole point here — `payload.userId` is the identity the export renders
 * under, so "who will this file belong to" is only answerable from the private
 * table. `key` is the dedupe column (upstream names it `key`, not `job_key`).
 */
export function exportJobs() {
  const out = sql(
    `SELECT j.id::text || '\u001f' || j.payload::text || '\u001f' || COALESCE(j.key,'')
       FROM graphile_worker._private_jobs j
       JOIN graphile_worker._private_tasks t ON t.id = j.task_id
      WHERE t.identifier = 'export_analytics_report'
      ORDER BY j.id DESC`,
  )
  if (!out) return []
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, payload, key] = line.split('\u001f')
      return { id, payload: JSON.parse(payload), key: key || null }
    })
}

/**
 * Enqueue an export AND read back what was queued, inside ONE transaction that is
 * then rolled back.
 *
 * ── WHY THIS CANNOT BE TWO STEPS ────────────────────────────────────────────
 * The dev stack's worker is running. It claims an `export_analytics_report` job
 * within about a second, so "call the function, then count the queue" is a race
 * the test loses about as often as it wins — and when it loses, the assertion
 * reads as "no job was enqueued". Rolling back also means the worker never sees
 * the job at all, so a suite run does not send real spreadsheets to real inboxes.
 *
 * ── WHY THE ROLE IS SWITCHED MID-TRANSACTION ────────────────────────────────
 * `app_user` has no USAGE on the graphile_worker schema — that is precisely why
 * the enqueue needed a SECURITY DEFINER half — so the caller cannot read back its
 * own job. Superuser can, but only in this same session can it see the row before
 * COMMIT. Hence: set the GUCs, SET LOCAL ROLE app_user, call, RESET ROLE, inspect.
 *
 * `calls` may hold several {userId, format} entries, which is how the
 * one-job-per-requester and job_key-dedupe cases are asserted without three
 * separate races.
 */
export function enqueueExportsInTransaction(reportId, calls) {
  const steps = calls
    .map(
      ({ userId, format = 'xlsx' }) => `
    PERFORM set_config('app.current_user_id', ${q(userId)}, true);
    PERFORM set_config('app.current_company_id', ${q(COMPANY_ID)}, true);
    PERFORM set_config('app.current_user_is_owner', 'false', true);
    SET LOCAL ROLE app_user;
    BEGIN
      PERFORM public.request_report_export(${q(reportId)}::uuid, ${q(format)});
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      RAISE NOTICE 'REFUSED %', SQLERRM;
    END;
    RESET ROLE;`,
    )
    .join('\n')

  const out = sql(`BEGIN;
    DO $probe$ BEGIN ${steps} END $probe$;
    SELECT j.payload::text || '\u001f' || COALESCE(j.key, '')
      FROM graphile_worker._private_jobs j
      JOIN graphile_worker._private_tasks t ON t.id = j.task_id
     WHERE t.identifier = 'export_analytics_report'
     ORDER BY j.id;
    ROLLBACK;`)

  return out
    .split('\n')
    .filter((line) => line.includes('\u001f'))
    .map((line) => {
      const [payload, key] = line.split('\u001f')
      return { payload: JSON.parse(payload), key: key || null }
    })
}

/** Remove queued export jobs so a later assertion counts only its own. */
export function clearExportJobs() {
  sql(`DELETE FROM graphile_worker._private_jobs WHERE task_id IN (
         SELECT id FROM graphile_worker._private_tasks
          WHERE identifier IN ('export_analytics_report','run_report_schedules'))`)
}
