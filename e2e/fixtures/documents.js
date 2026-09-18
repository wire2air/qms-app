// Shared UI flows for the documents journeys. Selector strategy: BaseSelect
// renders role="combobox" → role="listbox"/"option", so selects are driven by
// (field label text) → first following combobox in document order.
import { expect } from '@playwright/test'
import { FIXTURES, USERS, AUTH, ESIGN_PIN } from './cast.js'
import { sqlValue, waitForSqlValue } from './db.js'
import { signWithPin } from './esign.js'

const FILL_MARKER = 'E2E-FILLED'

/** Unique, greppable document title for one test run. */
export function uniqueTitle(tag) {
  return `E2E ${tag} ${Date.now()}`
}

/** The first combobox that follows the field label in document order. */
function comboboxAfterLabel(page, fieldLabel) {
  return page
    .getByText(fieldLabel, { exact: true })
    .first()
    .locator('xpath=following::*[@role="combobox"][1]')
}

/**
 * Select the first option of a BaseSelect via keyboard — stable against the
 * listbox open/candidate-load animation (clicking an animating option flakes).
 *
 * Keys must go to the page (not `combo.press`, which refocuses the trigger
 * div — desktop's trigger has no keydown handler, so that's a silent no-op,
 * and refocusing away from the popover's autofocused search input can even
 * dismiss it). Wait for the listbox to actually have an option before
 * navigating, since options load async from IDB.
 */
async function selectFirstByKeyboard(combo) {
  const page = combo.page()
  // Scope to THIS select's own panel via aria-controls. A page-wide
  // getByRole('listbox') also matches the panel of the select filled a moment
  // ago while it is still animating shut — that reads as "already open", so the
  // click below gets skipped and the keystrokes land on nothing, silently
  // leaving the field unset (which then fails validation at submit).
  // Re-click only when the panel isn't open — a click while it IS open would
  // toggle it shut. Under load the popover can miss the first click entirely,
  // and separately its options arrive async from IDB, so the two conditions
  // need distinct handling rather than one blind wait.
  //
  // aria-controls is re-read INSIDE the loop. Read once outside, the id goes
  // stale the moment the component re-renders (headlessui mints a new v-NN),
  // and then it never recovers: `listbox.isVisible()` answers false against a
  // dead id, so every retry clicks the combobox again — toggling the panel
  // shut, open, shut — while `firstOption` is pinned to an element that no
  // longer exists. The whole 30s budget burns and the failure reads
  // "[id=v-22-listbox] option not found", which looks like an empty lookup
  // table rather than a stale locator. Cost CAPA J5 and J7 a run each.
  await expect(async () => {
    const listboxId = await combo.getAttribute('aria-controls')
    const listbox = listboxId ? page.locator(`[id="${listboxId}"]`) : page.getByRole('listbox')
    if (!(await listbox.isVisible().catch(() => false))) {
      await combo.click()
    }
    await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
}

/** Open a labelled select and choose an option by its visible text. */
export async function selectOption(page, fieldLabel, optionText) {
  const combo = comboboxAfterLabel(page, fieldLabel)
  await combo.click()
  await page.getByRole('listbox').getByRole('option', { name: optionText }).first().click()
}

/** Open a labelled select and pick the first option (keyboard, stable). */
export async function selectFirstOption(page, fieldLabel) {
  await selectFirstByKeyboard(comboboxAfterLabel(page, fieldLabel))
}

/**
 * Wait for "Create Document" to land on the new document's detail page — and
 * say WHY when it doesn't.
 *
 * The bare `expect(page).toHaveURL(...)` this replaces reported the failure as
 * "42 × unexpected value http://…/documents/create", which reads like a stuck
 * validation and is not: `createDocument` is a `useLiveMutation`, and that
 * wrapper CATCHES every error, raises a toast and returns `undefined`. Its
 * caller (`persist()` in DocumentsCreate.vue) then guards on `if (doc)`, so a
 * mid-flight failure skips the success toast AND `router.push` while the
 * document — and whatever sections got pushed before the throw — are already
 * committed. Three of the eight documents failures on 2026-08-28 (PW-J1's
 * completeness-gate case, PW-J5, PW-J7) were this, all with a half-written
 * document sitting in app-db. Surfacing the toast turns that into one line.
 */
async function expectCreateNavigated(page) {
  try {
    await expect(page).toHaveURL(/\/documents\/(?!create)[0-9a-f-]{36}/, { timeout: 20_000 })
  } catch {
    // BaseToast renders role="alert" only for type=error (everything else is
    // role="status", which also matches every skeleton loader on the page).
    const said = (await page.getByRole('alert').allTextContents().catch(() => []))
      .map((t) => t.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    throw new Error(
      `Create Document did not navigate — still on ${page.url()}. ` +
        (said.length
          ? `The app reported: ${said.join(' | ')}`
          : 'The app reported nothing at all — useLiveMutation swallowed the error and persist() skipped the redirect, leaving a half-written document behind.'),
    )
  }
}

/**
 * Create a document from the seeded SOP template with the seeded approval
 * workflow. Ends on the new document's detail page. Returns the title.
 *
 * @param {object} [opts]
 * @param {(page) => Promise<void>} [opts.beforeSubmit] runs on the completed
 *   create form, just before "Create Document" is clicked. Inert by default —
 *   only the screenshot specs pass it (to capture the filled form / its tabs).
 */
export async function createSopDocument(page, title, opts = {}) {
  await page.goto('/documents')
  await page.getByRole('button', { name: 'Create Document' }).click()
  await expect(page).toHaveURL(/\/documents\/create/)

  // Template first — it prefills prefix, review cadence and sections.
  await selectOption(page, 'Document Template', FIXTURES.sopTemplateName)
  await page.getByPlaceholder('e.g. Clean Room Sterilization Protocol').fill(title)

  // Applicability. This was a single "Site" combobox until the applicability
  // rework (5fa9164 "Applies to (site / sites / company-wide)" + 756fdd1 "single
  // Sites multi-select") relabelled it "Sites" and turned it into a checkbox +
  // multi-select. comboboxAfterLabel matches labels with `exact: true`, so the
  // stale "Site" stopped matching anything and every Documents journey died
  // right here on a 25s locator timeout — 13 specs, one root cause.
  //
  // Tick "All sites (company-wide)" rather than driving the multi-select: it
  // satisfies the field's required rule with one deterministic click, and a
  // multi-select panel does not auto-close, so picking an option leaves it open
  // over the Department field below. No Documents spec asserts on the resulting
  // site, so company-wide is a safe choice here.
  // BaseCheckbox renders the real <input> as `sr-only` behind a styled <span>,
  // so a normal check() is intercepted by that span.
  //
  // force:true on the input is NOT the answer, though it held for a while.
  // Tailwind's `sr-only` is a 1x1 box with `margin: -1px`, so the input sits one
  // pixel up-and-left of its <label> — its centre is OUTSIDE the label's box.
  // A forced click there lands on whatever is behind it, the input never
  // toggles, and Playwright reports "Clicking the checkbox did not change its
  // state". It only ever passed on sub-pixel rounding, and a layout change in
  // this window tipped it over — taking 13 of the 14 documents specs with it,
  // since every journey routes through this helper.
  //
  // Click the visible label instead: that is what a person clicks, the browser
  // forwards it to the associated control, and it does not depend on the
  // geometry of a deliberately-invisible element. e2e/sites/j6 already does this.
  // Guarded on isChecked() because a label click TOGGLES — it is not check().
  const allSites = page.getByLabel('All sites (company-wide)')
  if (!(await allSites.isChecked())) {
    await page.getByText('All sites (company-wide)', { exact: true }).click()
  }
  await expect(allSites).toBeChecked()
  await selectFirstOption(page, 'Department')

  // There is no workflow picker any more. The approval flow is INHERITED from
  // the template and rendered read-only (DocumentsCreateProperties.vue: "the
  // template is the single source of truth for how its documents get
  // approved", 2026-08-15); WorkflowVersionSelect is no longer mounted by any
  // documents component, so `Select workflow <name>` can never resolve.
  //
  // Wait for the inherited steps instead. That is the correct readiness gate,
  // not just a substitute for the click: `form.workflowVersionId` is only
  // populated once the template resolves, the field is `required` whenever a
  // template is chosen, and Create Document is refused without it. It also pins
  // the new behaviour — if the flow ever stops being inherited, this fails here
  // rather than surfacing as a confusing validation error on submit.
  await expect(page.getByText(FIXTURES.sopTemplateApprovalStep1, { exact: true })).toBeVisible({
    timeout: 15_000,
  })

  // The form must have inherited THIS template — not merely *a* template.
  //
  // Observed 2026-08-28 (PW-J1, trace + DB): the form model held the seeded
  // template's id (the CreateDocument mutation carries
  // documentTemplateId=e2e50000-…-001) while everything DERIVED from that id
  // came from an unrelated leftover, "E2E J8-tmpl 1785132235104" — its prefix
  // (J835104), its single section, its approval workflow, and even the chip
  // label rendered in the picker. The document was written with one template's
  // id and another template's content and flow. See documents/23 §1.
  //
  // The prefix is the cheapest fingerprint of that mix-up, and asserting it
  // here makes the defect fail at its origin instead of surfacing three
  // assertions downstream as "expected >= 3 sections, received 1".
  await expect(page.getByLabel('Document Prefix')).toHaveValue(FIXTURES.sopTemplatePrefix, {
    timeout: 15_000,
  })

  if (opts.beforeSubmit) await opts.beforeSubmit(page)

  await page.getByRole('button', { name: 'Create Document' }).click()
  await expect(page).toHaveURL(/\/documents\/(?!create)[0-9a-f-]{36}/, { timeout: 20_000 })
  await expect(page.getByText(title).first()).toBeVisible()

  // The approval flow is the half of the inheritance the UI cannot show us.
  // `inheritedVersionId` is "two live queries deep" and lands a beat after the
  // prefix, so a document can be written with the right template and ANOTHER
  // template's workflow — and the picker's own read-only step list cannot tell
  // them apart, because every minted flow carries the same two step names.
  // Seven such documents were found in the E2E tenant on 2026-08-28
  // (documents/23 §1); nothing in the suite noticed. This does.
  const wf = sqlValue(
    `SELECT w.name FROM documents d
       JOIN workflow_versions wv ON wv.id = d.workflow_version_id
       JOIN workflows w ON w.id = wv.workflow_id
      WHERE d.title = '${title}'`,
  )
  expect(wf, 'the document runs ITS OWN template approval flow').toBe(
    FIXTURES.sopTemplateApprovalWorkflow,
  )

  // …and the other half is the section clone. Sections are written one row at a
  // time through the SyncEngine push queue (`DocumentsCreate.createDocument`
  // loops `docSection.save()`), and nothing downstream waits for them, so a
  // single-shot count right after create — which is exactly what PW-J1 did —
  // races the queue and passes or fails by timing. Worse, the loop is inside the
  // swallowed mutation: when one save throws, the earlier sections stay
  // committed and the rest are simply never written. app-db on 2026-08-28 holds
  // documents created from the 3-section SOP template carrying 2, 1 and 0
  // sections (`E2E J1-gate 1787931517726` has Purpose + Scope and no Procedure).
  //
  // Barrier on the TEMPLATE's own section count rather than a literal 3, so this
  // tracks the seed instead of drifting from it. HAVING (no GROUP BY) yields no
  // row until the clone is complete, which is what waitForSqlValue treats as
  // "not ready" — a plain count(*) would read "1" as ready and wave it through.
  await waitForSqlValue(
    `SELECT count(*) FROM document_sections ds
       JOIN documents d ON d.id = ds.document_id
      WHERE d.title = '${title}' AND ds.deleted_at IS NULL
      HAVING count(*) >= (SELECT jsonb_array_length(sections) FROM document_templates
                           WHERE name = '${FIXTURES.sopTemplateName}' AND deleted_at IS NULL
                           ORDER BY created_at LIMIT 1)`,
    { timeoutMs: 20_000, label: `every ${FIXTURES.sopTemplateName} section cloned onto "${title}"` },
  )
  return title
}

/**
 * Fill every empty section of the current DRAFT version so the
 * submit-for-review completeness gate clears.
 */
export async function fillAllSections(page, documentId) {
  // Each body section is a <section :id=uuid> containing one .section-content
  // rich-text editor. Scope to those so we never type into an unrelated
  // contenteditable, and re-resolve per pass (TipTap re-renders on autosave).
  const selector = 'section .section-content [contenteditable="true"]'
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 15_000 })
  const count = await page.locator(selector).count()
  expect(count, 'editable body sections').toBeGreaterThan(0)

  const filledCount = () =>
    Number(
      sqlValue(
        `SELECT count(*) FROM document_sections
          WHERE document_id = '${documentId}' AND deleted_at IS NULL
            AND content LIKE '%${FILL_MARKER}%'`,
      ),
    )

  // Fill one section, then wait for THAT save to land before touching the next
  // — filling a sibling mid-save can revert the previous section, so confirm
  // each persist before advancing. Requires documentId for the DB barrier.
  for (let i = 0; i < count; i++) {
    const target = i + 1
    for (let attempt = 0; attempt < 3 && filledCount() < target; attempt++) {
      const editor = page.locator(selector).nth(i)
      await editor.scrollIntoViewIfNeeded()
      await editor.click()
      await page.keyboard.insertText(`${FILL_MARKER} section ${i + 1} content.`)
      await page.locator('body').click({ position: { x: 5, y: 5 } })
      const deadline = Date.now() + 8_000
      while (Date.now() < deadline && filledCount() < target) {
        await page.waitForTimeout(500)
      }
    }
    expect(filledCount(), `section ${i + 1} persisted`).toBeGreaterThanOrEqual(target)
  }
}

/**
 * Submit the current draft through the workflow preview dialog.
 * Expects a complete draft on the document detail page.
 */
/**
 * @param {import('@playwright/test').Page} page
 * @param {{ reviewersByStep?: string[], onTrainingGate?: Function, onWorkflowDialog?: Function }} [opts]
 *   `reviewersByStep`: reviewer display name to pick per step (index 0 = step 1);
 *   falls back to the first candidate. `onTrainingGate(page)` runs while the
 *   training reminder is open (before it is dismissed) and
 *   `onWorkflowDialog(page, dialog)` runs on the filled workflow preview dialog
 *   (before Submit). Both inert by default — only the screenshot specs pass them.
 */
export async function submitForReview(page, opts = {}) {
  const { reviewersByStep = [], onTrainingGate, onWorkflowDialog } = opts
  await page.getByRole('button', { name: /submit for review/i }).click()

  // Pre-workflow gates may interpose. The seeded SOP template enables training,
  // so a "Finish training setup" reminder appears — disable training and submit.
  const trainingGate = page.getByRole('button', { name: /disable training.*submit/i })
  if (await trainingGate.isVisible({ timeout: 3_000 }).catch(() => false)) {
    if (onTrainingGate) await onTrainingGate(page)
    await trainingGate.click()
  }
  // A collaborator reminder may also interpose — "Has the collaborator
  // finished?", raised whenever `openCollaboratorTasks.length` is non-zero
  // (DocumentsPageId.handleSubmitForReview). Its confirm button is labelled
  // "Submit for review", NOT any of "submit anyway / proceed / continue", so the
  // old regex could never match it and the dialog would sit there until the
  // workflow-preview assertion below timed out. The copy the gate DOES own is
  // its heading, so anchor on that and take the primary button inside the same
  // headlessui panel.
  //
  // Deliberately NOT `getByRole('button', { name: /submit for review/i })`: that
  // also matches the action-bar trigger this helper just clicked, which is still
  // on the page, so a "gate present?" probe would answer yes on every document
  // and the click would re-fire the whole submit.
  // The portal is also the right scope for the click: the action-bar trigger
  // lives in the page, never inside #headlessui-portal-root.
  const portal = page.locator('#headlessui-portal-root')
  const collabGate = portal.getByText(/still (has|have) an open task on this document/i).first()
  if (await collabGate.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await portal.getByRole('button', { name: /^submit for review$/i }).last().click()
  }

  // Workflow preview dialog — identified by its per-step reviewer helper text.
  await expect(page.getByText(/pick the reviewer\(s\) for each step/i)).toBeVisible({
    timeout: 20_000,
  })
  const dialog = page.getByRole('dialog').filter({ hasText: /pick the reviewer/i })

  // Submit is disabled until at least one reviewer is picked per step. Each
  // step exposes a reviewer combobox — open each and select its first candidate.
  const pickers = dialog.getByRole('combobox')
  const pickerCount = await pickers.count()
  for (let i = 0; i < pickerCount; i++) {
    const combo = pickers.nth(i)
    // Best-effort scroll. `locator.click()` scrolls the target into view on its
    // own, so this only ever bought a nicer trace — but it threw hard on
    // 2026-08-28 (PW-J2): "Protocol error (DOM.scrollIntoViewIfNeeded): Cannot
    // find context with specified id", i.e. the execution context went away
    // mid-action because the dialog re-rendered under it while the reviewer
    // candidates streamed in from IndexedDB. Failing the run on a cosmetic
    // scroll is the wrong trade; the click that follows re-resolves the element
    // and does the scrolling anyway.
    await combo.scrollIntoViewIfNeeded().catch(() => {})
    const wanted = reviewersByStep[i]
    // Scope to THIS combobox's own panel — a page-wide getByRole('listbox')
    // also matches the previous step's panel while it is still open (see below).
    const listboxId = await combo.getAttribute('aria-controls')
    const listbox = listboxId ? page.locator(`[id="${listboxId}"]`) : page.getByRole('listbox')

    // Open it, tolerating both a missed click and async candidate loading.
    await expect(async () => {
      if (!(await listbox.isVisible().catch(() => false))) await combo.click()
      await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 30_000 })

    // CLICK the option — do not use selectFirstByKeyboard here. This picker is a
    // MULTI-select ("Select reviewer(s)…"); ArrowDown highlights a candidate but
    // Enter does not commit it, so both steps silently stayed empty and Submit
    // stayed disabled with "Pick at least one reviewer for <steps>". The
    // single-selects on the create form (Department) do commit on Enter, which is
    // why selectFirstByKeyboard is still correct for them.
    const option = wanted
      ? listbox.getByRole('option', { name: wanted }).first()
      : listbox.getByRole('option').first()
    await option.click()

    // A multi-select panel does NOT auto-close after a pick, and an open panel
    // sits over the next step's combobox. Close it before moving on.
    await page.keyboard.press('Escape')
    await expect(listbox).toBeHidden({ timeout: 5_000 })
  }

  const submitBtn = dialog.getByRole('button', { name: 'Submit for Review' })
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 })
  if (onWorkflowDialog) await onWorkflowDialog(page, dialog)
  await submitBtn.click()
  // The status chip flips via sync-back (REST action → audit → sync socket →
  // syncEngine → IDB), and that socket push can be missed in a churning headless
  // context. Reload to re-pull the authoritative version via delta-sync, then
  // assert — retry until the chip shows.
  await expectStatusEventually(page, /in review/i)
}

/**
 * Assert a status chip/text appears, tolerating sync-back lag: reloads the page
 * (delta-sync re-pulls the changed record) and retries until it shows. Use after
 * any REST lifecycle action whose result the UI reflects only via sync-back.
 */
export async function expectStatusEventually(page, pattern, { timeout = 40_000 } = {}) {
  await expect(async () => {
    await expect(page.getByText(pattern).first()).toBeVisible({ timeout: 3_000 }).catch(async () => {
      await page.reload()
      await expect(page.getByText(pattern).first()).toBeVisible({ timeout: 4_000 })
    })
  }).toPass({ timeout })
}

/** Navigate to a document, bounded and without waiting on the live sync socket. */
export async function gotoDoc(page, documentId) {
  await page.goto(`/documents/${documentId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
}

/**
 * Navigate to a document detail page and wait for it to actually RENDER.
 *
 * `page.goto` returns as soon as the shell is up; the record body stays a wall
 * of `role="status"` skeletons until the SyncEngine has the Document row in this
 * context's IndexedDB. A fresh `browser.newContext()` bootstraps every model
 * from scratch, so on the slower personas that is comfortably longer than the
 * 25s default action timeout — which is how C6 failed on 2026-08-28: 25s of
 * "waiting for getByRole('button', { name: /more actions/i })" against a page
 * that was still all skeletons.
 *
 * The overflow menu is the right readiness anchor: DetailActionBar always
 * buckets at least Print/Reports/Revision History/Audit Log/Export, so >3 are
 * always visible and the ⋯ trigger always exists once the record renders — for
 * every persona, at every status. If it never appears, the record did not
 * render at all, and the usual reason is that this persona has no RLS read path
 * to it (see documents_sel), not a slow page.
 */
export async function openDocumentDetail(page, documentId, { timeout = 60_000 } = {}) {
  await page.goto(`/documents/${documentId}`)
  await expect(
    page.getByRole('button', { name: 'More actions' }),
    'the document detail rendered for this persona (no RLS read path ⇒ skeletons for ever)',
  ).toBeVisible({ timeout })
}

/**
 * Click a control that appears a few seconds after a fresh load once the SPA
 * hydrates and the task syncs from IDB (e.g. a reviewer/approver Approve button).
 * Gives each load a *patient* window (the control reliably renders within it —
 * reloading sooner just resets the hydration clock and starves it), and only
 * reloads as a fallback if it never shows. Bounded, so it fails fast rather than
 * consuming the whole test budget.
 */
export async function clickWhenReady(
  page,
  locator,
  { perLoad = 20_000, reloads = 2, until = null, untilTimeout = 10_000 } = {},
) {
  const target = locator.first()
  for (let attempt = 0; attempt <= reloads; attempt++) {
    try {
      await expect(target).toBeVisible({ timeout: perLoad })
      await target.click()
      if (!until) return
      // Visible is not the same as WIRED. On a freshly loaded detail page the
      // Approve button renders before the step-action handler can do anything
      // with it (the task itself is still arriving from IDB), and the click is
      // then a silent no-op: no dialog, no error, no state change. PW-J5 died
      // exactly there — the trace shows the click landing 4.5s after `goto`,
      // then nothing at all, and the run failed 30s later inside signWithPin
      // on a PIN dialog that was never opened. Proving the click had an EFFECT
      // (and re-clicking on a fresh load if it did not) is the only reliable
      // gate; waiting longer before the first click is not, because the button
      // is already visible.
      const opened = await until
        .first()
        .waitFor({ state: 'visible', timeout: untilTimeout })
        .then(() => true)
        .catch(() => false)
      if (opened) return
      throw new Error('clickWhenReady: the click landed but `until` never appeared')
    } catch (err) {
      if (attempt === reloads) throw err
      await page.reload({ waitUntil: 'domcontentloaded' })
    }
  }
}

/**
 * What a workflow step-action click (Approve / Reject) must produce: the
 * headlessui dialog portal showing either the e-signature PIN field or the
 * step's comment box.
 *
 * Anchored on the CONTENT, never on `getByRole('dialog')` — the headlessui
 * wrapper reports zero-size/hidden to Playwright, so a dialog-role gate reads
 * as "nothing opened" even when the dialog is on screen (see fixtures/esign.js
 * and documents/22 §2.1). Scoped to the portal so it cannot match the
 * page-level section-feedback textarea sitting behind the overlay.
 */
export function stepActionDialog(page) {
  return page
    .locator('#headlessui-portal-root')
    .locator('input[placeholder="Enter your e-signature PIN"], textarea, [contenteditable="true"]')
}

/**
 * Reject the current DocumentVersion task (Reject button → "Reject Step" dialog →
 * required comment → confirm). Leaves the version REJECTED with the comment as
 * reject_comment.
 *
 * ~~The ACTION step (reviewer, step 1) is not e-signed, so no PIN.~~ No longer
 * true: once the approval flow moved onto the document template (documents/21
 * §1), a document created from a template runs THAT template's workflow, and
 * "E2E SOP Template — Approval" makes BOTH steps APPROVAL with
 * require_esignature=true. The PIN prompt below is therefore reached on the
 * reviewer's rejection as well — guarded, so this helper still works against a
 * workflow whose step 1 really is a plain ACTION.
 */
export async function rejectCurrentTask(page, documentId, comment = 'E2E reject — please correct section 1.') {
  await page.goto(`/documents/${documentId}`)
  const rejectBtn = page.getByRole('button', { name: /^reject$/i }).first()
  await expect(rejectBtn).toBeVisible({ timeout: 20_000 })
  await rejectBtn.click()
  // Feedback dialog — the "Comment (required)" textarea identifies it.
  const commentBox = page.getByLabel('Comment (required)')
  await expect(commentBox).toBeVisible({ timeout: 10_000 })
  await commentBox.fill(comment)
  // Footer confirm is the second "Reject" (the first is the action-bar trigger).
  await page.getByRole('button', { name: /^reject$/i }).last().click()
  // waitFor, NOT isVisible: `locator.isVisible()` is an immediate check and its
  // `timeout` option does not make it wait, so it answers "false" while the
  // dialog is still opening and the PIN is silently never entered — the reject
  // then fails 30s later as "version REJECTED — last value: null", with the
  // dialog sitting open in the screenshot.
  const pin = page.getByPlaceholder('Enter your e-signature PIN')
  const needsPin = await pin
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (needsPin) await signWithPin(page)
}

/**
 * Cancel an in-review version (author only, ACTION step active) → back to DRAFT.
 * Handles the action living either inline or under the "More actions" overflow,
 * plus an optional confirm dialog.
 */
export async function cancelReview(page, documentId) {
  await page.goto(`/documents/${documentId}`)
  const inline = page.getByRole('button', { name: /cancel review/i })
  if (!(await inline.first().isVisible({ timeout: 3_000 }).catch(() => false))) {
    await page.getByRole('button', { name: /more actions/i }).click()
  }
  await page.getByRole('menuitem', { name: /cancel review/i })
    .or(page.getByRole('button', { name: /cancel review/i }))
    .first()
    .click()
  // Optional confirm dialog.
  const confirm = page.getByRole('button', { name: /^(cancel review|confirm|yes|proceed)$/i }).last()
  if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) await confirm.click()
}

/**
 * Drive an IN_REVIEW version through the seeded 2-step workflow to EFFECTIVE:
 * reviewer completes the ACTION step (comment), approver approves the APPROVAL
 * step with an e-signature PIN. Uses fresh role contexts; asserts EFFECTIVE in DB.
 */
export async function driveToEffective(browser, docId, versionId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances WHERE entity_id = '${versionId}'
       AND assigned_to = '${USERS.reviewer.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: 'reviewer task assigned' },
  )
  const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
  const reviewerPage = await reviewerCtx.newPage()
  await gotoDoc(reviewerPage, docId)
  // The reviewer's Approve action renders once the step-1 task syncs into this
  // context; reload-tolerant so a missed socket push doesn't stall the run.
  await clickWhenReady(reviewerPage, reviewerPage.getByRole('button', { name: /^approve$/i }), {
    until: stepActionDialog(reviewerPage),
  })
  // Step 1 is an e-signed APPROVAL step now (the approval flow lives on the
  // template — documents/21 §1), so the reviewer gets the PIN prompt too.
  //
  // The block this replaces gated on `getByRole('dialog').last().isVisible()`,
  // which the headlessui wrapper answers "hidden" to (see fixtures/esign.js). It
  // therefore skipped the whole confirm silently, left the PIN dialog open, and
  // surfaced 45s later as "approver task created: 0" — pointing at the approver
  // when the reviewer was the one who never finished.
  //
  // fill(), NOT click()+keyboard.type(). The dialog is still animating in when
  // the box first resolves, so a pointer click at its centre can land on the
  // headlessui OVERLAY instead — which dismisses the dialog. The comment then
  // goes nowhere, the PIN prompt never opens, and the run fails 30s later in
  // signWithPin with the dialog already gone from the DOM (exactly what PW-J5's
  // failure snapshot shows: no dialog, Approve still there, still IN_REVIEW).
  // fill() focuses and sets the value without a mouse event at all.
  const dialogRoot = reviewerPage.locator('#headlessui-portal-root')
  const box = dialogRoot.locator('textarea, [contenteditable="true"]').first()
  if (await box.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false)) {
    await box.fill('Reviewed by E2E — accurate.')
  }
  await signWithPin(reviewerPage)
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances ti WHERE ti.entity_id = '${versionId}'
       AND ti.assigned_to = '${USERS.approver.id}' AND ti.deleted_at IS NULL AND ti.status_id NOT IN ('CANCELLED')`,
    { timeoutMs: 45_000, label: 'approver task created' },
  )
  await reviewerCtx.close()

  const approverCtx = await browser.newContext({ storageState: AUTH.approver })
  const approverPage = await approverCtx.newPage()
  await gotoDoc(approverPage, docId)
  // The approver's Approve action renders only after the step-2 assignment syncs
  // into this context (the exact spot J5 stalled on before). Reload-tolerant.
  await clickWhenReady(approverPage, approverPage.getByRole('button', { name: /^approve$/i }), {
    until: stepActionDialog(approverPage),
  })
  const pin = approverPage.getByPlaceholder('Enter your e-signature PIN')
  await expect(pin).toBeVisible({ timeout: 10_000 })
  await pin.fill(ESIGN_PIN)
  await approverPage.getByRole('button', { name: 'Sign' }).click()
  await waitForSqlValue(
    `SELECT status_id FROM document_versions WHERE id = '${versionId}' AND status_id = 'EFFECTIVE'`,
    // The APPROVED→EFFECTIVE transition is worker-driven (JOB-02 auto-effective);
    // under full-suite load the job queue (snapshots, notifications) backs up, so
    // allow generous headroom (well within the test budget).
    { timeoutMs: 150_000, label: 'version EFFECTIVE' },
  )
  await approverCtx.close()
}

/**
 * Create a new revision from the current (APPROVED/EFFECTIVE) version via the
 * "Create New Draft" → "Create New Revision" dialog. Fills the required change
 * reason + change type. Returns after the dialog closes.
 */
export async function createNewRevision(page, docId, { reason = 'E2E revision — updated per SOP-014 rev 4.', changeType = 'Minor' } = {}) {
  await gotoDoc(page, docId)
  // "Create New Draft" only appears once the latest version is APPROVED/EFFECTIVE.
  // After driveToEffective ran in other contexts, this page's IndexedDB can lag,
  // so wait (reload-tolerant) for the effective state before looking for it.
  await expectStatusEventually(page, /effective|approved/i)
  const inline = page.getByRole('button', { name: /create new draft/i })
  if (!(await inline.first().isVisible({ timeout: 3_000 }).catch(() => false))) {
    await page.getByRole('button', { name: /more actions/i }).click()
  }
  await page.getByRole('menuitem', { name: /create new draft/i })
    .or(page.getByRole('button', { name: /create new draft/i }))
    .first()
    .click()
  await expect(page.getByText('Create New Revision')).toBeVisible({ timeout: 10_000 })
  await page.getByPlaceholder(/New calibration interval/i).fill(reason)
  // The change-type control is a <button> whose accessible name is the label span
  // ("Minor") followed by its description span, so anchor at the start of the name
  // (a `^Minor$` match never resolves and the click would auto-wait to the cap).
  await page.getByRole('button', { name: new RegExp(`^${changeType}\\b`, 'i') }).click()
  await page.getByRole('button', { name: 'Create Revision' }).click()
  await expect(page.getByText('Create New Revision')).toBeHidden({ timeout: 15_000 })
}
