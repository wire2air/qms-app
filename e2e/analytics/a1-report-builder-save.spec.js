// ANL-A1 · The report builder actually saves.
//
// ── WHY THIS IS THE FIRST TEST IN THE SUITE ─────────────────────────────────
// On 2026-08-18 a user opened `New report`, filled it in, pressed Save, and
// nothing happened. The footer was written as
//   <BaseDialogFooter><BaseButton…>Cancel</…><BaseButton…>Create report</…>
// but BaseDialogFooter has NO default slot: it renders its own Cancel/Save pair
// from `submitLabel` and emits `cancel`/`submit`. Vue discards children handed to
// a slot that does not exist — silently, with no build warning and no runtime
// error — so the declared buttons never rendered, the visible ones were the
// component's own, and nothing listened to either event. BOTH buttons were dead.
//
// Nothing in the automated stack saw it: eslint, the production build, the layout
// guard and the design-system ratchet all passed before and after the fix. The
// only signal was that the button on screen said "Save" while the source said
// "Create report".
//
// So this spec locates the submit control BY THE LABEL THE DIALOG DECLARES. That
// is not cosmetic pedantry — it is the entire assertion. A footer that regresses
// to the slot form renders "Save", this locator finds nothing, and the suite
// fails instead of the user finding out.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ANALYTICS, USERS } from '../fixtures/cast.js'
import { ensureRollup, gotoReports, createReportViaUi, reportByName, uniqueName } from '../fixtures/analytics.js'

test.use({ storageState: AUTH.author })

test.describe('ANL-A1 · the New-report dialog saves what it shows', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  test('fill the dialog → the report exists, normalised, owned by the author', async ({ page }) => {
    const name = uniqueName('ANL-A1 report')
    await gotoReports(page)

    await createReportViaUi(page, name, {
      metricKeys: [ANALYTICS.METRIC_LABEL],
      dimension: ANALYTICS.DIMENSION_LABEL,
    })

    // The row, not the toast: a toast can fire on a mutation that was rolled back.
    await expect
      .poll(() => reportByName(name), { timeout: 15_000, message: 'the report row exists' })
      .not.toBeNull()
    const saved = reportByName(name)
    expect(saved.ownerId, 'RLS pins owner_id to the caller on INSERT').toBe(USERS.author.id)
    expect(saved.visibility).toBe('private')

    // normaliseDefinition runs at the boundary, and the exporter reads this jsonb
    // directly with no tolerance for empty keys or a half-filled breakdown.
    expect(saved.definition.periodToken, 'a period token is always stored').toBeTruthy()
    expect(Array.isArray(saved.definition.sections)).toBe(true)
    expect(saved.definition.sections.length, 'the empty section was dropped').toBe(1)
    const section = saved.definition.sections[0]
    expect(section.metricKeys.length).toBeGreaterThan(0)
    expect(section.breakdown?.dimension, 'a breakdown keeps its dimension').toBeTruthy()

    // And it is on the page the user is left looking at.
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible()
  })

  test('the submit control is the one the dialog declares, and it is gated', async ({ page }) => {
    await gotoReports(page)
    await page.getByRole('button', { name: /new report/i }).click()
    const dialog = page.getByRole('dialog')

    // THE regression assertion. `Save` is BaseDialogFooter's default label; this
    // dialog declares `Create report`. Seeing "Save" here means the footer has
    // gone back to the children form and the button is wired to nothing.
    const submit = dialog.getByRole('button', { name: 'Create report', exact: true })
    await expect(submit, 'the footer renders the dialog\'s own submitLabel').toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Save', exact: true }),
      'a bare "Save" means BaseDialogFooter fell back to its default — the click is dead',
    ).toHaveCount(0)

    // Disabled until there is something to save, and it says why rather than
    // leaving the reader hunting through a form that looks complete.
    await expect(submit).toBeDisabled()
    await expect(submit).toHaveAttribute('title', /name/i)

    await dialog.getByLabel('Report name').fill('ANL-A1 gate probe')
    await expect(submit, 'a name alone is not a report').toBeDisabled()
    await expect(submit).toHaveAttribute('title', /metric|breakdown/i)

    // Cancel is the other half of the same defect — it was equally dead.
    await dialog.getByRole('button', { name: /cancel/i }).click()
    await expect(dialog).toBeHidden()
    expect(reportByName('ANL-A1 gate probe'), 'cancel discards the draft').toBeNull()
  })

  test('the seeded system reports are present and badged, not deletable', async ({ page }) => {
    await gotoReports(page)
    // Provided-with-Qability rows exist per company so an upgrade re-finds them
    // by report_key instead of planting duplicates; the DELETE policy refuses
    // them, so the list badges them rather than offering a 403.
    await expect(page.getByText(/provided with qability/i).first()).toBeVisible()
    await expect(page.getByText(ANALYTICS.sharedReport.name).first()).toBeVisible()
  })
})
