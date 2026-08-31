// PW-J8 — THE headline gate: an inspection lot's lifecycle is server-owned.
//
// `14-playwright-journeys.md` rates this "the highest-priority single test to
// get green across the entire documentation program to date", and
// `19-production-readiness.md` asks for finding #1 to be triaged "with the same
// urgency as a live production incident". This file is that gate.
//
// ── THE FINDING ─────────────────────────────────────────────────────────────
//
// `11-security-review.md` finding #1: `inspection_lots` was the one reviewed
// module whose lifecycle column had no client lock AND no DB trigger, while its
// RLS UPDATE policy resolves to `inspection_qc:create OR execute OR dispose`.
// So any ordinary inspector could set a lot's outcome with one raw mutation,
// skipping the transition map in `inspectionLotService.js`, the checked-in
// inspector guard, the results-completeness gate and the e-signed disposition
// workflow. Every sibling module (NCR, CAPA, CR, Audits, Complaints, Quality
// Events) had had its equivalent guard for weeks.
//
// ── WHAT "THE LIFECYCLE" MEANS SINCE 2026-08-28 ─────────────────────────────
//
// The finding's own wording is now too narrow, and this matters for what the
// journey probes. `20260828190000-unify-inspection-lot-statuses` split one
// overloaded column into separate facts (22-change-addendum §1):
//
//     status_id            DRAFT / OPEN / CLOSED / CANCELLED
//     inspection_phase     PENDING … UNDER_REVIEW / DISPOSED, or HOLD
//     disposition_type_id  THE OUTCOME — where RELEASED/REJECTED/REWORK went
//     quality_state        derived from it
//
// "A rejected lot flipped straight to RELEASED" no longer describes a
// `status_id` write at all — today it describes a `disposition_type_id` write.
// A journey that probed only `status_id` would report the finding closed while
// the dangerous column stayed open, so all four are probed here.
//
// ── THE THREE LAYERS, AND WHY ONLY ONE IS TESTABLE FROM HERE ────────────────
//
//   1. No UI control writes either column. Asserted below (`CONTROL`), and
//      statically by `src/__tests__/inspectionLotLifecycleLock.spec.js`, which
//      scans every QC component for a `v-model` or an assignment.
//   2. The client model cannot express the write: `models/inspectionLot.js`
//      marks `statusId` and `inspectionPhase` `excludeFromGraphQL: ['update']`,
//      so `computeUpdatePatch` drops them from every generated patch. Also
//      asserted in that unit spec, against the real syncEngine.
//   3. The database refuses it regardless — `enforce_inspection_lot_lifecycle`
//      (migration `20260901100000`), errcode **QMSQC**.
//
// Layers 1 and 2 are structural: with them in place the syncEngine cannot be
// *made* to issue this mutation, so a test cannot attempt it through the app.
// Layer 3 is the only one an attacker can still reach and the only one a test
// can still exercise — a hand-rolled GraphQL mutation arrives at PostGraphile
// as `app_user`, which is exactly what `sqlAsAppUser` reproduces. REST is not a
// substitute: Sequelize connects as the superuser and bypasses both RLS and the
// guard's untrusted branch, so a REST-level probe would pass no matter what.
//
// Asserted on the SQLSTATE, never on the message — psql hides the error code at
// its default verbosity, which leaves prose as the only other observable, and
// prose is free to be reworded. See `attemptLotWriteAs`.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  attemptLotWriteAs,
  createLotViaRest,
  lotLifecycle,
  openLot,
} from '../fixtures/qcInspection.js'
// Generic despite its home — `hasInteractiveAncestor` asks a question about a
// DOM node, not about a quality event. Imported rather than copied, the same way
// fixtures/qcInspection.js already borrows clickWhenReady/selectOption from
// fixtures/documents.js: these helpers are not module-specific, that file is
// just the project's only home for them so far.
import { hasInteractiveAncestor } from '../fixtures/qualityEvents.js'

// The four lot statuses and six phases, as the badges render them. Used to
// prove no picker on the detail page is displaying a lifecycle value.
const STATUS_LABELS = ['Draft', 'Open', 'Closed', 'Cancelled']
const PHASE_LABELS = ['Pending', 'In Progress', 'Completed', 'Under Review', 'Disposed', 'On Hold']

test.describe('PW-J8 — the inspection lot lifecycle is server-owned (finding #1)', () => {
  // qcInspector holds inspection_qc read/create/execute and deliberately NOT
  // dispose (cast.js). That is precisely the persona the finding is about: an
  // ordinary execute-holder, with no claim whatsoever on the outcome of the
  // lot, who could nonetheless write it.
  test.use({ storageState: AUTH.qcInspector })

  /** @type {{id: string, lotNumber: string}} */
  let lot

  test.beforeAll(async ({ browser }) => {
    // One lot for the whole file. Every probe below runs inside a DO block that
    // raises unconditionally and therefore rolls itself back, so no test can
    // leave the lot in a state another test would inherit — including a probe
    // that unexpectedly SUCCEEDS, which is the case that would otherwise
    // silently corrupt the run.
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()
    lot = await createLotViaRest(page, {})
    await ctx.close()
  })

  test.beforeEach(() => {
    // The premise every assertion in this file rests on. If a previous run left
    // the lot elsewhere, the refusals below would still "pass" while proving
    // nothing, so state the starting point rather than assuming it.
    expect(lotLifecycle(lot.id)).toEqual({
      statusId: 'OPEN',
      phase: 'PENDING',
      dispositionTypeId: null,
      qualityState: null,
    })
  })

  test('THE FINDING — an execute-only inspector cannot jump a lot straight to CLOSED', async () => {
    const attempt = attemptLotWriteAs(USERS.qcInspector, lot.id, `status_id = 'CLOSED'`)

    expect(attempt.sqlstate, 'refused by enforce_inspection_lot_lifecycle').toBe('QMSQC')

    // CLOSED is a legal value in the four-row vocabulary, so the foreign key
    // cannot help here — this is the residual hole the 2026-08-28 unification
    // narrowed but could not close, and the reason a trigger was needed at all.
    // The lot never skipped the completeness gate, the QA submit, or the
    // e-signed disposition.
    expect(lotLifecycle(lot.id).statusId).toBe('OPEN')
  })

  test('the execution phase is locked too — including its own LEGAL next step', async () => {
    // PENDING -> IN_PROGRESS is a legal edge; POST /lots/:id/start performs it
    // several times a day. It is still refused here, and that is the whole
    // point of the strict shape: legality is not the question, PROVENANCE is.
    // The endpoint checks the inspector is checked in and files an
    // inspection_lot_events row; a direct mutation does neither, so it is
    // refused even though it names a transition the state machine allows.
    const legal = attemptLotWriteAs(USERS.qcInspector, lot.id, `inspection_phase = 'IN_PROGRESS'`)
    expect(legal.sqlstate, 'a legal edge from an illegitimate path is still refused').toBe('QMSQC')

    // And the one that actually matters: skipping every phase at once.
    const terminal = attemptLotWriteAs(USERS.qcInspector, lot.id, `inspection_phase = 'DISPOSED'`)
    expect(terminal.sqlstate).toBe('QMSQC')

    expect(lotLifecycle(lot.id).phase).toBe('PENDING')
  })

  test('the DISPOSITION — what finding #1 now actually means — is locked', async () => {
    // Since the unification, forging a release is a `disposition_type_id`
    // write, not a `status_id` write: the outcome badge, the adverse-disposition
    // banner, the reopen gate and `InspectionLotsList`'s disposition column all
    // read this column, not the status. A guard on `status_id` alone would have
    // closed the finding as worded and left the exploit working.
    const dispositionTypeId = sqlValue(
      `SELECT id FROM nc_disposition_types
        WHERE company_id = '${COMPANY_ID}' AND code = 'USE_AS_IS' AND deleted_at IS NULL LIMIT 1`,
    )
    expect(dispositionTypeId, 'the E2E tenant seeds a USE_AS_IS disposition type').toBeTruthy()

    const forged = attemptLotWriteAs(
      USERS.qcInspector,
      lot.id,
      `disposition_type_id = '${dispositionTypeId}', quality_state = 'RELEASED'`,
    )
    expect(forged.sqlstate, 'an inspector cannot write the outcome of their own inspection').toBe(
      'QMSQC',
    )

    // quality_state on its own, in case a future edit narrows the guard to the
    // FK-bearing column and leaves the free-text one behind.
    const stateOnly = attemptLotWriteAs(USERS.qcInspector, lot.id, `quality_state = 'RELEASED'`)
    expect(stateOnly.sqlstate).toBe('QMSQC')

    const after = lotLifecycle(lot.id)
    expect(after.dispositionTypeId).toBeNull()
    expect(after.qualityState).toBeNull()
  })

  test('a write that does not MOVE the lifecycle is deliberately let through', async () => {
    // The guard's fast path: `IF NEW.status_id IS NOT DISTINCT FROM OLD.status_id
    // AND … THEN RETURN NEW`. Not a loophole — nothing moves — and it is what
    // keeps an ordinary record save from being refused merely for carrying
    // columns it already had. Pinned so a future "just refuse every statement
    // that mentions status_id" tightening has to notice it.
    const noop = attemptLotWriteAs(USERS.qcInspector, lot.id, `status_id = 'OPEN'`)
    expect(noop.sqlstate, 'OPEN -> OPEN is not a transition').toBe('NO_ERROR')

    // And the row was genuinely reachable, so this is not a silent RLS denial
    // wearing a green tick.
    expect(noop.rows, 'the update policy admits this caller').toBe(1)
  })

  test('POSITIVE CONTROL: the same caller can still edit a non-lifecycle field', async () => {
    // Without this the four refusals above are unfalsifiable. A caller whose RLS
    // policy denied every UPDATE, a fixture pointing at a nonexistent row, or a
    // lot in another tenant would all produce exactly the same "nothing moved"
    // evidence. This proves the guard refuses the LIFECYCLE specifically, and
    // that the lot is still editable by the persona meant to edit it.
    const edit = attemptLotWriteAs(USERS.qcInspector, lot.id, `notes = 'J8 probe'`)
    expect(edit.sqlstate, `an ordinary field edit must not be refused`).toBe('NO_ERROR')
    expect(edit.rows, 'and it reached the row').toBe(1)

    // The probe rolled itself back, so nothing persisted either.
    expect(sqlValue(`SELECT coalesce(notes, '') FROM inspection_lots WHERE id = '${lot.id}'`)).not.toBe(
      'J8 probe',
    )
  })

  test('CONTROL: the detail page reads the lifecycle and offers no control that writes it', async ({ page }) => {
    await openLot(page, lot.id)

    // The positive control comes first: "there is no status control" is the same
    // observation as "the page never rendered" and as "this persona sees a
    // read-only page". Check in only renders for an `inspection_qc:execute`
    // holder on an inspectable lot (inspectionLotDetailConfig.js), so its
    // presence proves a fully-rendered page being viewed by exactly the persona
    // the finding was about.
    await expect(
      page.getByRole('button', { name: /^(Check in|Take over \(check in\))$/ }),
      'the page rendered for an execute-holder',
    ).toBeVisible({ timeout: 30_000 })

    // The status renders — so the assertions below are about a page that is
    // actually displaying this lot's state, not an empty one — and it renders as
    // plain text, not inside anything operable. That second half is the F-02
    // shape stated structurally: the Quality Events bypass was a BaseSelect whose
    // `#selected` slot rendered the very same badge, identical by text, and
    // distinguishable only by the fact that the text had acquired an operable
    // ancestor. Asserting on ancestry survives any amount of markup churn.
    const statusBadge = page.getByText('Open', { exact: true }).last()
    await expect(statusBadge).toBeVisible({ timeout: 20_000 })
    expect(
      await hasInteractiveAncestor(statusBadge),
      'the status label must not sit inside a button, combobox, select or link',
    ).toBe(false)

    // ⚠️ The PHASE is not rendered on this page — or anywhere else in the app.
    // `InspectionLotPhaseBadge.vue` and `InspectionLotPhaseBadgeById.vue` exist
    // and have ZERO consumers (grep -rn PhaseBadge src/ — the Audits pair is
    // wired up, this one never was), so since the 2026-08-28 unification a lot
    // reads "Open" to the user throughout PENDING, IN_PROGRESS, COMPLETED and
    // UNDER_REVIEW alike. That is a display gap, not a lock defect, and fixing it
    // is not this journey's job — but this loop is written so that the day a
    // phase badge IS wired up, it is gated as read-only from its first render
    // instead of arriving unchecked.
    for (const label of PHASE_LABELS) {
      const node = page.getByText(label, { exact: true })
      if ((await node.count()) === 0) continue
      expect(
        await hasInteractiveAncestor(node.last()),
        `the "${label}" phase label must not sit inside an operable control`,
      ).toBe(false)
    }

    // The same claim from the other direction, so a control moved somewhere
    // other than the header is caught too: no picker on this page currently
    // READS a lifecycle value. If one does, it is a lifecycle picker whatever it
    // is called and wherever it lives.
    const combos = await page.getByRole('combobox').allInnerTexts()
    const normalised = combos.map((t) => t.replace(/\s+/g, ' ').trim())
    for (const label of [...STATUS_LABELS, ...PHASE_LABELS]) {
      expect(normalised, `no picker on this page displays "${label}"`).not.toContain(label)
    }
    // Native <select>s too — the disposal-method control proves this page type
    // uses them, so they are not a theoretical surface.
    const selects = await page.locator('main select').allInnerTexts()
    for (const label of STATUS_LABELS) {
      expect(
        selects.map((t) => t.replace(/\s+/g, ' ').trim()),
        `no <select> on this page offers "${label}"`,
      ).not.toContain(label)
    }
  })
})
