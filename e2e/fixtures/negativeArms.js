// Required-field refusal arms — the missing half of nearly every create-form
// protocol test case.
//
// WHY THIS FILE EXISTS. A protocol-vs-e2e survey (2026-09-15, 146 OQ test cases
// against 310 specs) found 97 of 146 test cases PARTIAL, and roughly four in
// five of those were PARTIAL for one reason: the shared create fixtures
// (`createSopDocument`, `createCapa`, `raiseNc`, `launchTraining`) always fill
// every field correctly, so the "attempt to submit with X empty → refused" half
// of each test case had no coverage anywhere. One helper closes that half for
// every module instead of five near-identical suites.
//
// TWO LAYERS, AND WHY THE SERVER ONE IS THE POINT.
//
// The create forms declare `:rules="[required()]"` per field and BaseForm runs
// every registered rule on submit, then renders ValidationSummary — "please fix
// N issues before continuing". That is a CLIENT-side gate. It is worth
// asserting (a user must be told what is missing) but it is not evidence that a
// regulated field is enforced: a raw REST call skips it entirely.
//
// The real gate is the zod schema on the create route (`createCapaSchema`,
// `createAndSubmitNcSchema`). So each module gets:
//
//   · ONE ui arm  — submit an empty form, assert the summary appears and names
//                   the fields. Proves the user is told.
//   · N rest arms — POST a body with exactly one required field omitted, assert
//                   400 and that nothing was written. Proves the SERVER refuses.
//
// Per-field UI submits were considered and rejected: BaseForm validates the
// whole form at once, so a per-field UI arm costs one full page load and submit
// each, and this suite runs `workers: 1`. The REST arms cover the same ground in
// a fraction of the wall-clock, and cover it at the layer that actually holds.
//
// WHAT A FAILURE HERE MEANS. A rest arm going green-to-red means a required
// field stopped being required on the server — i.e. a record can now be created
// without it. That is a data-integrity regression, not a test nit.
import { expect } from '@playwright/test'

/** BaseForm's post-submit validation summary. See BaseForm.vue's submit pipeline. */
export const VALIDATION_SUMMARY = /please fix \d+ issues? before continuing/i

/**
 * Submit a create form with nothing filled in and assert the user is told what
 * is missing, rather than the submit silently doing nothing.
 *
 * Asserts the summary, and that no record was created as a side effect — the
 * second half matters because a form that both complains AND writes a partial
 * row is the worst outcome and looks identical from the summary alone.
 *
 * Not every module has a create *route*. Three shapes exist in this codebase and
 * all three go through here:
 *
 *   · a page      — '/capas/create', submit on screen 2 behind a workflow card
 *   · a dialog    — Products opens one from the register; there is no URL
 *   · a nested dialog — an audit finding's dialog lives inside an existing
 *                   audit's detail page, so `reach` has to navigate, switch tab
 *                   and open it
 *
 * `createPath` is therefore the page you land on, not necessarily "the create
 * form", and `reach` is what gets you from there to a visible submit control.
 *
 * `submitLabel` accepts an array because Audit Instance's dialog renders TWO
 * submit buttons ('Create' and 'Create & open'), both wired to the same
 * validation. A single hardcoded name is what broke this helper's first outing
 * on CAPA, so it is worth being explicit rather than clever.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {string} opts.createPath page to navigate to first, e.g. '/capas/create'
 * @param {string|string[]} opts.submitLabel accessible name of the submit
 *   control; an array means "any of these" (first match wins)
 * @param {() => number} opts.countRows reads the current row count for this
 *   module (SQL), so the arm can prove nothing was written
 * @param {(page) => Promise<void>} [opts.reach] runs after navigation — advance
 *   a wizard, or open the dialog that holds the form
 */
export async function expectEmptyFormRefused(
  page,
  { createPath, submitLabel, countRows, reach },
) {
  const before = countRows()

  await page.goto(createPath)
  if (reach) await reach(page)

  const labels = Array.isArray(submitLabel) ? submitLabel : [submitLabel]
  const submit = labels
    .map((name) => page.getByRole('button', { name }))
    .reduce((a, b) => a.or(b))
    .first()
  await expect(
    submit,
    `${createPath}: submit control must be reachable (tried: ${labels.join(', ')})`,
  ).toBeVisible({ timeout: 30_000 })
  await submit.click()

  await expect(
    page.getByText(VALIDATION_SUMMARY),
    `${createPath}: an empty submit must tell the user what is missing`,
  ).toBeVisible({ timeout: 15_000 })

  expect(countRows(), `${createPath}: a refused submit must not write a row`).toBe(before)
}

/**
 * POST a create body with exactly one required field omitted and assert the
 * server refuses it.
 *
 * `omit` is deleted rather than set to null or '' on purpose: the three are
 * different inputs and a schema can accept one while rejecting another. Omission
 * is what a client that never learned about the field actually sends.
 *
 * @param {import('@playwright/test').Page|import('@playwright/test').APIRequestContext} caller
 *   a Page (speaks as its persona via cookies) or an APIRequestContext
 * @param {object} opts
 * @param {string} opts.path REST path under /api/v1/services, e.g. '/capas'
 * @param {object} opts.validBody a body that WOULD succeed — proven by
 *   `expectValidBodyAccepted` below, so a false green cannot hide here
 * @param {string} opts.omit the single required key to delete
 * @param {() => number} opts.countRows current row count for this module
 * @param {RegExp} [opts.messageMatches] optional assertion on the error text
 */
export async function expectMissingFieldRefused(
  caller,
  { path, validBody, omit, countRows, messageMatches },
) {
  const request = caller.request ?? caller
  const before = countRows()

  const body = { ...validBody }
  expect(
    Object.prototype.hasOwnProperty.call(body, omit),
    `${path}: '${omit}' is not in the valid body — the arm would prove nothing`,
  ).toBe(true)
  delete body[omit]

  const res = await request.post(`/api/v1/services${path}`, { data: body })

  expect(
    res.status(),
    `${path}: creating without '${omit}' must be refused (got ${res.status()})`,
  ).toBe(400)

  if (messageMatches) {
    const text = await res.text()
    expect(text, `${path}: the refusal should name the problem`).toMatch(messageMatches)
  }

  expect(
    countRows(),
    `${path}: a refused create must not write a row (omitted '${omit}')`,
  ).toBe(before)
}

/**
 * Prove the valid body the negative arms are derived from actually succeeds.
 *
 * Without this every `expectMissingFieldRefused` above is a potential false
 * green: a body that is malformed for some unrelated reason 400s no matter which
 * key you remove, and the arms all pass while testing nothing. Run this once per
 * module, first.
 *
 * Returns the created row's id so the caller can clean up.
 */
export async function expectValidBodyAccepted(caller, { path, validBody }) {
  const request = caller.request ?? caller
  const res = await request.post(`/api/v1/services${path}`, { data: validBody })
  expect(
    res.ok(),
    `${path}: the control body must be accepted, or every negative arm here is a false green (got ${res.status()}: ${await res.text()})`,
  ).toBe(true)
  return res.json().catch(() => null)
}
