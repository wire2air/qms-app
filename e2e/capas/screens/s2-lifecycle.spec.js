// CAPA screenshots · S2 — the record lifecycle.
//   Create form (blank → filled), the DRAFT detail, the Start-CAPA confirm, the
//   OPEN record (Details / Workflow are anchor-nav sections, so one full-page
//   capture carries them), the close-blocked action bar, the e-signed Close
//   dialog, the CLOSED record, the Audit Log dialog, and — on a second CAPA —
//   the e-signed Cancel dialog.
// Flow mirrors PW-J1 / PW-J3 / PW-J5.
//
// ── 2026-08-28: caught up with three product moves the journeys already have ──
// The `screens` Playwright project matches `/screens/.*\.spec\.js$`, so this
// file is NOT part of the `capas` project that `cbc15d2f` took to 13/14 — it
// was left on the far side of every fix in that pass. Three of them land here:
//
//   1. ~~PENDING~~ → OPEN. `20260823100000-unified-record-statuses` remapped the
//      rows AND deleted the lookup row, so the barrier below waited 45s for a
//      status that cannot exist and then failed the whole capture run.
//   2. ~~"Open CAPA"~~ → "Start CAPA", relabelled by `b33322be` (2026-08-17)
//      when the workflow rail card was shared across NC / CAPA / Change Control
//      / Complaint. `openCapa` in fixtures/capas.js was corrected; this file
//      still typed the old label, and the confirm dialog's own button carries
//      the same new label.
//   3. Two "More actions" triggers now (see the Audit Log step).
//
// ~~"reviewers are assigned on the detail page's draft plan since 2026-08-12"~~
// — the submit-time per-step reviewer dialog came BACK in `5baf25fe`
// (2026-08-18). `createCapa` drives it via `confirmStepReviewers`, so this file
// does not have to, but the description was wrong and would send the next
// reader looking for a draft-plan surface that is not there.
// The Effectiveness section is likewise gone (2026-08-18 — it is a workflow
// DELAY step now, see PW-J4), so it is no longer one of the captured sections.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, ESIGN_PIN, USERS } from '../../fixtures/cast.js'
import {
  createCapa,
  openCapa,
  completeReviewerStep,
  completeApproverStep,
  uniqueTitle,
} from '../../fixtures/capas.js'
import { findCapaByTitle, waitForSqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('capas')

test.describe.serial('CAPA screenshots · create → open → close / cancel', () => {
  test('create form, draft, open, workflow, close with e-signature', async ({ browser }) => {
    test.setTimeout(600_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    // ── Blank create form ──────────────────────────────────────────────────
    await page.goto('/capas/create')
    await expect(page.getByPlaceholder('Describe the CAPA…')).toBeVisible({ timeout: 20_000 })
    await shot(page, 'create')

    // ── Filled form (workflow pre-selected — no reviewer dialog anymore) ───
    const title = uniqueTitle('S2-lifecycle')
    await createCapa(page, title, {
      priority: 'High',
      async beforeSubmit(p) {
        await shot(p, 'create-filled')
      },
    })
    const capa = findCapaByTitle(title)

    // ── DRAFT detail (Details + Workflow + Effectiveness sections) ─────────
    await expect(page.getByText(capa.capaNumber).first()).toBeVisible({ timeout: 20_000 })
    await shot(page, 'detail-draft')

    // ── Start CAPA confirm dialog ──────────────────────────────────────────
    // ~~'Open CAPA'~~ — relabelled 'Start CAPA' by `b33322be` (2026-08-17), on
    // the trigger AND on the dialog's own confirm button. The dialog BODY copy
    // still says "Opening this CAPA…", which is why the anchor below is
    // unchanged; only the button labels moved.
    await page.getByRole('button', { name: 'Start CAPA' }).first().click()
    await expect(page.getByText('Opening this CAPA starts the assigned workflow')).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'open-capa-confirm')
    await page.getByRole('button', { name: 'Start CAPA' }).last().click()

    // ~~status_id = 'PENDING'~~ — the post-submit status is OPEN since
    // `20260823100000-unified-record-statuses`, which did not merely stop using
    // PENDING: it remapped the rows and DELETED the lookup row, so this barrier
    // was waiting on a value the foreign key can no longer hold. It could only
    // ever time out, and it took the whole capture run down with it 45s in.
    await waitForSqlValue(`SELECT status_id FROM capas WHERE id = '${capa.id}' AND status_id = 'OPEN'`, {
      timeoutMs: 45_000,
      label: 'CAPA OPEN',
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    // Close CAPA is gated on `statusId === 'OPEN'` in capaDetailConfig.js —
    // it compared to the retired 'PENDING' until `cbc15d2f`, so this assertion
    // would have failed on the product side even with the barrier fixed.
    await expect(page.getByRole('button', { name: 'Close CAPA' })).toBeVisible({ timeout: 30_000 })
    // Filename kept as `detail-pending` deliberately: the screenshot is
    // published under that name and renaming it orphans every reference to it.
    // The STATE it captures is now called OPEN.
    await shot(page, 'detail-pending')

    // Close is gated while workflow steps are open — the button carries the
    // reason in its title attribute (PW-J3).
    await expect(page.getByRole('button', { name: 'Close CAPA' })).toHaveAttribute(
      'title',
      /workflow step.*still open/i,
      { timeout: 20_000 },
    )
    await shot(page, 'detail-close-blocked')

    // ── Audit Log dialog (overflow action) ─────────────────────────────────
    // ~~`getByRole('button', { name: /more actions/i }).click()`~~ — that now
    // matches TWO elements and throws on strict mode. `BaseMenu` hard-codes
    // `aria-label="More actions"` on every trigger, and since the takeover rule
    // (2026-08-19, stepTakeover.js `pickActionableTask`) the workflow step card
    // renders its own menu for anyone the matrix covers rather than only the
    // assignee. The author holds `capa:update` at tenant scope (e2e-seed §32),
    // so the reviewer's ACTION task shows on the owner's page as an actionable
    // takeover and mints a second trigger. Before that change this page had one.
    //
    // Anchor on the last INLINE header button and take the next More-actions
    // trigger after it in document order. On an OPEN CAPA `bucketActions` keeps
    // two inline — Close CAPA (100) and Cancel CAPA (60) — and pushes Print,
    // Create Change Request and Audit Log into the overflow, so 'Cancel CAPA' is
    // the element the header's own trigger follows. (Same idiom as PW-J2's step
    // menu, anchored at the other end of the same action bar.)
    const headerMenu = page
      .getByRole('button', { name: 'Cancel CAPA', exact: true })
      .first()
      .locator('xpath=following::button[@aria-label="More actions"][1]')
    await headerMenu.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await headerMenu.click()
    await expect(page.getByRole('menuitem', { name: /audit log/i })).toBeVisible({ timeout: 10_000 })
    await shot(page, 'detail-more-actions-menu')
    await page.getByRole('menuitem', { name: /audit log/i }).click()
    await expect(page.getByText(/audit log/i).first()).toBeVisible({ timeout: 15_000 })
    await shot(page, 'detail-audit-log')
    await page.keyboard.press('Escape')

    // ── Both workflow steps completed (reviewer, then e-signing approver) ──
    await completeReviewerStep(browser, capa.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: 'approver task created' },
    )
    await completeApproverStep(browser, capa.id)
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instances
        WHERE resource_type = 'Capa' AND resource_id = '${capa.id}' AND status_id != 'IN_PROGRESS'`,
      { timeoutMs: 45_000, label: 'workflow finished' },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Close CAPA' })).toBeEnabled({ timeout: 30_000 })
    await shot(page, 'detail-workflow-complete')

    // ── Close dialog → e-signature → CLOSED ────────────────────────────────
    await page.getByRole('button', { name: 'Close CAPA' }).click()
    await expect(page.getByRole('heading', { name: 'Close CAPA' })).toBeVisible({ timeout: 15_000 })
    await page
      .getByPlaceholder('Summary of the corrective action and verification of completion')
      .fill('Screenshot run — corrective action verified effective.')
    await shot(page, 'close-dialog')

    const signBtn = page.getByRole('button', { name: 'Sign & Close CAPA' })
    await expect(signBtn).toBeEnabled({ timeout: 15_000 })
    await signBtn.click()
    const pin = page.getByPlaceholder('Enter your e-signature PIN')
    await expect(pin).toBeVisible({ timeout: 15_000 })
    await shot(page, 'close-esign-dialog')

    const signPinBtn = page.getByRole('button', { name: 'Sign', exact: true })
    await expect(async () => {
      await pin.fill(ESIGN_PIN)
      await expect(signPinBtn).toBeEnabled({ timeout: 3_000 })
    }).toPass({ timeout: 20_000 })
    await signPinBtn.click()

    await waitForSqlValue(`SELECT status_id FROM capas WHERE id = '${capa.id}' AND status_id = 'CLOSED'`, {
      timeoutMs: 60_000,
      label: 'CAPA CLOSED',
    })
    await expect(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText(/closed/i).first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 45_000 })
    await shot(page, 'detail-closed')

    await ctx.close()
  })

  test('cancel a pending CAPA with an e-signature', async ({ browser }) => {
    test.setTimeout(420_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    const title = uniqueTitle('S2-cancel')
    await createCapa(page, title)
    const capa = findCapaByTitle(title)
    await openCapa(page, capa.id)

    await page.getByRole('button', { name: 'Cancel CAPA' }).click()
    await expect(page.getByRole('heading', { name: 'Cancel CAPA' })).toBeVisible({ timeout: 15_000 })
    await page
      .getByPlaceholder('Why is this CAPA being cancelled?')
      .fill('Screenshot run — duplicate of an existing CAPA.')
    await shot(page, 'cancel-dialog')

    await page.getByRole('button', { name: 'Sign & Cancel CAPA' }).click()
    const pin = page.getByPlaceholder('Enter your e-signature PIN')
    await expect(pin).toBeVisible({ timeout: 15_000 })
    await shot(page, 'cancel-esign-dialog')

    const signPinBtn = page.getByRole('button', { name: 'Sign', exact: true })
    await expect(async () => {
      await pin.fill(ESIGN_PIN)
      await expect(signPinBtn).toBeEnabled({ timeout: 3_000 })
    }).toPass({ timeout: 20_000 })
    await signPinBtn.click()

    await waitForSqlValue(
      `SELECT status_id FROM capas WHERE id = '${capa.id}' AND status_id = 'CANCELLED'`,
      { timeoutMs: 60_000, label: 'CAPA CANCELLED' },
    )
    await expect(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText(/cancelled/i).first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 45_000 })
    await shot(page, 'detail-cancelled')

    await ctx.close()
  })
})
