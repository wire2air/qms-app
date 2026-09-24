// PW-J16 — URS-SEC-13: does a PRINTED copy state what a signature MEANS?
//
// ─────────────────────────────────────────────────────────────────────────────
// THE REQUIREMENT, AND WHY IT IS ABOUT PAPER SPECIFICALLY
//
// 21 CFR Part 11 §11.50(a) requires that a signed electronic record carry, in
// human-readable form, the printed name of the signer, the date and time, AND
// "the meaning (such as review, approval, responsibility, or authorship)
// associated with the signature". §11.50(b) then requires that those items be
// "subject to the same controls as for electronic records and shall be included
// as part of any human readable form of the electronic record (such as
// electronic display or printout)."
//
// The last clause is the whole point. On screen a reader can hover, drill in,
// or ask. A printout is what leaves the building — pinned to a bench, handed to
// an inspector, filed in a training folder — and a reader holding paper has no
// way to ask a follow-up question. So "the printed copy states what the
// signature means" is not a nicety; it is the clause that makes an e-signature
// equivalent to an ink one on the artefact that travels.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT PW-J2 ALREADY PROVES, AND WHAT IT DOES NOT
//
// PW-J2 drives the manager verification to completion and asserts the DATABASE:
//
//     SELECT verified_by, demonstrated_understanding, can_perform_independently,
//            practical_observation_completed, outcome, signed_at IS NOT NULL
//       FROM training_verifications WHERE training_assignee_id = …
//     → [trainingAdmin, 't','t','t', 'APPROVED', 't']
//
// That is a complete record of the MEANING — outcome APPROVED, three named
// competency criteria, the verifier, the signing timestamp. It is exactly what
// §11.50(a) wants, and it is in the database. The untested half is whether any
// of it reaches a printed copy.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ FINDING TRN-PRINT-01 — IT DOES NOT. THERE IS NO TRAINING PRINTOUT AT ALL.
//
// Established by reading the product, not by driving a browser at a guess:
//
//   1. THE PRINT REGISTRY HAS NO PER-TRAINING ENTRY.
//      `src/components/print/modules/index.js` enumerates every printable
//      module by name: Document, Capa, FieldRecord, LogBook, LogBookQrLabel,
//      AuditInstance, TrainingMatrix, InspectionLot, RetainSampleLabel,
//      RetainSampleRegister, Complaint, ValidationProtocol, Nonconformance,
//      QualityEvent, ChangeRequest, RecordList, ModuleRecord. There is no
//      `Training`, no `TrainingInstance`, no `TrainingVerification`.
//      `resolveModule()` is an exact (case-insensitive) key lookup, so an
//      unregistered name renders `PrintShell`'s "Unknown print module" panel.
//
//   2. NO TRAINING SURFACE OFFERS A PRINT ACTION.
//      Grepping `print` across `src/components/trainingInstances/` and
//      `src/components/trainingVerifications/` returns NOTHING. The module's
//      only print affordance is in `trainingReports/TrainingReportsHome.vue`,
//      and it opens `/print?module=TrainingMatrix`.
//
//   3. THE ONE TRAINING PRINTOUT SUPPRESSES THE SIGNATURE BLOCK OUTRIGHT.
//      `TrainingMatrixPrint.vue` opens
//          <PrintLayout identifier="Training Matrix Report" :showAudit="false">
//      and `PrintLayout` guards BOTH the "Approvals & Signatures" section AND
//      the restricted-access notice on `v-if="showAudit && …"`. With
//      `showAudit` false, neither renders — so the training printout carries no
//      signature block and no notice saying one is missing. Its six columns are
//      Employee, Roles, Training, Status, Completed, Type. `Status` is a
//      lifecycle value (`VERIFIED`), which is not a signature meaning: it says
//      the record reached a state, not that a named person attested to
//      something and what they attested to.
//
// SO: URS-SEC-13 CANNOT BE COVERED FOR TRAINING BY A PASSING TEST, because the
// capability does not exist. Writing a test that clicked something and went
// green would be manufacturing a Covered.
//
// WHAT THIS FILE DOES INSTEAD, and why it is still worth running:
//
//   A. It proves the MEANING IS RECORDED AND IS COMPLETE (test 1) — the half
//      the product does satisfy, asserted at the database against the real
//      verification flow. Without this the finding below would be ambiguous
//      between "not printed" and "never captured", which are very different
//      defects.
//   B. It pins the ABSENCE precisely (tests 2 and 3), so the gap is a measured
//      fact in the validation record rather than an assertion in a comment, and
//      so the day someone adds a training printout these tests go red and force
//      the meaning to be put on it.
//   C. It establishes, on the ONE printout in the product that DOES carry a
//      signature block, exactly how far that block falls short of §11.50(a)
//      (test 4) — because that block is the template any future training
//      printout would be built from, and it prints an AUDIT ACTION CODE where
//      the meaning belongs.
//
// Test 4's subject is a Document rather than a training record on purpose:
// `PrintLayout` is shared chrome, so what it prints for a Document is what it
// would print for a Training the moment one were registered. Proving the
// shortfall there proves it for the fix that has not been written yet.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS, TRAINING } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue } from '../fixtures/db.js'
import {
  launchTraining,
  completeTrainingViaUi,
  findAssignee,
  waitForAssigneeStatus,
  instanceStatus,
  verifyAssignees,
} from '../fixtures/training.js'

/**
 * Every key `src/components/print/modules/index.js` registers, transcribed.
 *
 * Kept here so the finding below is a comparison rather than an anecdote: the
 * point is not merely that `TrainingInstance` 404s, it is that the registry
 * contains SEVENTEEN printable things and not one of them is a training record
 * — while `TrainingMatrix`, the one training entry, is a cross-employee report
 * rather than a signed record.
 */
const REGISTERED_PRINT_MODULES = [
  'Document',
  'Capa',
  'FieldRecord',
  'LogBook',
  'LogBookQrLabel',
  'AuditInstance',
  'TrainingMatrix',
  'InspectionLot',
  'RetainSampleLabel',
  'RetainSampleRegister',
  'Complaint',
  'ValidationProtocol',
  'Nonconformance',
  'QualityEvent',
  'ChangeRequest',
  'RecordList',
  'ModuleRecord',
]

/** The names a per-training printout would plausibly have been registered as. */
const TRAINING_RECORD_PRINT_KEYS = ['Training', 'TrainingInstance', 'TrainingVerification']

/** Launch → learner completes → manager verifies → returns { instanceId, assigneeId }. */
async function verifiedTraining(browser) {
  const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
  const adminPage = await adminCtx.newPage()
  const instanceId = await launchTraining(adminPage)
  await adminCtx.close()

  const learnerCtx = await browser.newContext({ storageState: AUTH.learner })
  const learnerPage = await learnerCtx.newPage()
  await completeTrainingViaUi(learnerPage, instanceId, TRAINING.correctAnswers)
  await learnerCtx.close()

  await waitForAssigneeStatus(instanceId, 'COMPLETED')
  expect(instanceStatus(instanceId)).toBe('PENDING_VERIFICATION')

  const assignee = findAssignee(instanceId)
  const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
  const page = await ctx.newPage()
  const res = await verifyAssignees(page, instanceId, [assignee.id])
  expect(res.ok(), `verify should succeed: ${await res.text().catch(() => '')}`).toBeTruthy()
  await ctx.close()

  await waitForAssigneeStatus(instanceId, 'VERIFIED')
  return { instanceId, assigneeId: assignee.id }
}

test.describe('PW-J16 · URS-SEC-13 — the signature’s meaning on a printed copy', () => {
  test('the MEANING is captured in full — signer, time, outcome and what was attested', async ({
    browser,
  }) => {
    test.setTimeout(240_000)

    // The half the product satisfies, and the barrier that makes the finding
    // below unambiguous. If the meaning were never recorded, "it is not on the
    // printout" would be a symptom rather than the defect.
    const { assigneeId } = await verifiedTraining(browser)

    const row = sqlRow(
      `SELECT verified_by, outcome, signed_at IS NOT NULL, signature_method,
              demonstrated_understanding, can_perform_independently,
              practical_observation_completed, retraining_required
         FROM training_verifications
        WHERE training_assignee_id = '${assigneeId}' AND deleted_at IS NULL`,
    )
    expect(row, 'a competency verification record exists').not.toBeNull()

    // §11.50(a)(1) — the printed name of the signer. Stored as an id that
    // resolves to a person; the join is what a printout would have to do.
    expect(row[0], 'the verifier is named').toBe(USERS.trainingAdmin.id)
    expect(
      sqlValue(
        `SELECT first_name || ' ' || last_name FROM users WHERE id = '${row[0]}'`,
      ),
      'and resolves to a human-readable name, which is what §11.50(a)(1) asks to be PRINTED',
    ).toBe(USERS.trainingAdmin.name)

    // §11.50(a)(3) — THE MEANING. Not a status: an explicit outcome plus the
    // three things the verifier actually attested to.
    expect(row[1], 'the outcome states what the signature MEANT').toBe('APPROVED')
    expect(
      row.slice(4, 7),
      'and the three competency criteria are individually recorded — this is the "meaning" §11.50(a)(3) means',
    ).toEqual(['t', 't', 't'])
    expect(row[7], 'and the retraining verdict is explicit, not inferred').toBe('f')

    // §11.50(a)(2) — the date and time of signing.
    expect(row[2], 'the signature is timestamped').toBe('t')

    // So the record is complete. Everything below is about whether it travels.
  })

  test('FINDING TRN-PRINT-01 · there is no per-training printout to put it on', async ({
    browser,
  }) => {
    test.setTimeout(240_000)

    const { instanceId } = await verifiedTraining(browser)

    // ── The print dispatcher is an exact key lookup over a fixed registry, so
    // the honest way to show the absence is to ASK IT for a training record and
    // watch it refuse. Driven as a URL because there is no affordance to click:
    // grepping `print` across `src/components/trainingInstances/` and
    // `src/components/trainingVerifications/` returns nothing at all.
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    try {
      const page = await ctx.newPage()
      // `window.print()` is stubbed before navigation: a print module that DID
      // resolve would fire it on data-ready and a real dialog blocks the run.
      await page.addInitScript(() => {
        window.print = () => {}
      })

      // The registry as the product holds it, stated as a fact before the probe
      // so the refusal below is read as "nothing to register against" rather
      // than "one name happened to be wrong".
      expect(
        REGISTERED_PRINT_MODULES.filter((k) => TRAINING_RECORD_PRINT_KEYS.includes(k)),
        'none of the seventeen registered print modules is a per-training record',
      ).toEqual([])
      expect(
        REGISTERED_PRINT_MODULES,
        'the only training entry is the cross-employee MATRIX report, which is not a signed record',
      ).toContain('TrainingMatrix')

      // Every plausible name, so the finding cannot be dismissed as a typo.
      for (const key of TRAINING_RECORD_PRINT_KEYS) {
        await page.goto(`/print?module=${key}&id=${instanceId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        })

        // KNOWN DEFECT TRN-PRINT-01. `PrintShell` renders this panel when
        // `resolveModule()` returns null, and that is what a request for a
        // training record's printed copy gets today.
        await expect(
          page.getByText('Unknown print module'),
          `KNOWN DEFECT TRN-PRINT-01 — \`${key}\` is not a printable module, so a training record has no printout and §11.50(b)'s "included as part of any human readable form … printout" cannot be met for training. Fix by registering a per-training print module whose signature block prints training_verifications.outcome + verified_by + signed_at; do NOT relax this assertion.`,
        ).toBeVisible({ timeout: 30_000 })
      }

      // The same probe against a module that IS registered, so the assertion
      // above is a fact about training and not about a broken print route.
      await page.goto('/print?module=Capa&id=00000000-0000-4000-8000-000000000000', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      })
      await expect(
        page.getByText('Unknown print module'),
        'CONTROL · a registered module resolves, so the refusal above is about the missing registration',
      ).toHaveCount(0, { timeout: 30_000 })
    } finally {
      await ctx.close()
    }
  })

  test('FINDING TRN-PRINT-01 · and the one training printout suppresses the signature block', async ({
    browser,
  }) => {
    test.setTimeout(240_000)

    // The module's ONLY print affordance — `trainingReports/TrainingReportsHome.vue`
    // opens `/print?module=TrainingMatrix`. It is reached by URL here for the
    // same reason as above; the affordance's existence is not in question, what
    // it produces is.
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    try {
      const page = await ctx.newPage()
      await page.addInitScript(() => {
        window.print = () => {}
      })
      await page.goto('/print?module=TrainingMatrix', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      })

      // The printout renders — a positive control, so the absences below are
      // about content and not about a page that failed to load.
      await expect(
        page.getByRole('heading', { name: 'Training Matrix Report' }),
        'the training printout renders',
      ).toBeVisible({ timeout: 60_000 })
      await expect(
        page.getByRole('columnheader', { name: 'Status', exact: true }),
        'carrying a Status column',
      ).toBeVisible({ timeout: 30_000 })

      // ── KNOWN DEFECT TRN-PRINT-01, second half. `TrainingMatrixPrint.vue`
      // passes `:showAudit="false"`, and `PrintLayout` guards BOTH the
      // signature section AND its own restricted-access notice on that flag —
      // so the printout carries no signature block and, worse, no statement
      // that one is missing. On a controlled copy those two are very different:
      // `PrintLayout`'s own comment says as much about the permission case
      // ("a copy that prints with no signature block is indistinguishable from
      // a record that was never signed — and paper carries no way to ask"), and
      // that reasoning applies identically here.
      await expect(
        page.getByRole('heading', { name: 'Approvals & Signatures' }),
        'KNOWN DEFECT TRN-PRINT-01 — the training printout has no signature block: showAudit=false suppresses it. A verified competency prints with no signer, no signing time and no meaning.',
      ).toHaveCount(0)

      await expect(
        page.getByText('Not shown on this copy.'),
        'and not even the "absence is not evidence of unsigned" notice, because that notice is behind the same showAudit flag',
      ).toHaveCount(0)

      // The word a reader would need is nowhere on the page. `Status` prints
      // the lifecycle value; "APPROVED" — the recorded MEANING of the
      // verification signature — never appears, and neither does the verifier.
      await expect(
        page.getByText(USERS.trainingAdmin.name, { exact: false }),
        'the verifier who signed is not named anywhere on the printed copy — §11.50(a)(1)',
      ).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('FINDING PRINT-MEANING-01 · the shared signature block prints an ACTION CODE, not a meaning', async ({
    browser,
  }) => {
    test.setTimeout(240_000)

    // ── WHY A DOCUMENT AND NOT A TRAINING RECORD. `PrintLayout` is SHARED
    // chrome: every printable module wraps its body in it, and its
    // "Approvals & Signatures" section is the block a future training printout
    // would inherit. So the shortfall measured here is the shortfall the fix for
    // TRN-PRINT-01 would ship with unless it is fixed too.
    //
    // ── THE SHORTFALL. `PrintLayout` derives the block from `db.AuditLog`:
    //
    //     const SIGNATURE_ACTIONS = ['APPROVE', 'SET_EFFECTIVE']
    //     signatures = auditLogs.filter(l => SIGNATURE_ACTIONS.includes(l.action))
    //                           .map(l => ({ action: l.action, who, when, ip }))
    //
    // and the table's first column renders `{{ sig.action }}`. So the printed
    // "Action" is an AUDIT ACTION CODE — `APPROVE`, `SET_EFFECTIVE` — and NOT
    // `signatures.meaning`, the Part 11 ledger column that exists precisely to
    // hold the meaning (`APPROVED` / `REJECTED` / `REVIEWED` / `VERIFIED` /
    // `PERFORMED` / `CLOSED` / `DISPOSED` / `SKIPPED` / `AMENDED` / `VOIDED` —
    // measured on the live table).
    //
    // `PrintLayout`'s own comment admits it: "Deriving the signature block from
    // the audit trail at all is the deeper mistake — there is a real Part 11
    // `signatures` ledger — but it cannot be fixed here: that table has no
    // client model, is absent from the sync publication, and reaches a Document
    // only indirectly, through the task_instance that was signed."
    //
    // WHY THIS IS A REAL GAP AND NOT PEDANTRY ABOUT VOCABULARY:
    //   * The two are not in correspondence. `SET_EFFECTIVE` is a lifecycle
    //     event, not an attestation — it appears in the signature block while
    //     `signatures.meaning` has no such value.
    //   * A REJECTION never appears at all. `signatures` records
    //     `meaning = 'REJECTED'` (10 such rows live, measured), but `REJECT` is
    //     not in `SIGNATURE_ACTIONS`, so a signed rejection prints as though it
    //     never happened — the omission that most misleads a reader of paper.
    //   * Nothing on the printed copy distinguishes "I approved this" from
    //     "I reviewed it" from "I am responsible for it" — the four examples
    //     §11.50(a)(3) gives by name.
    const meanings = sql(
      `SELECT DISTINCT meaning FROM signatures WHERE deleted_at IS NULL ORDER BY 1`,
    )
      .split('\n')
      .filter(Boolean)

    expect(
      meanings.length,
      'the signatures ledger records several distinct meanings — so a meaning is a real, varying value and not a constant',
    ).toBeGreaterThan(1)
    expect(
      meanings,
      'including a REJECTION, which the printed block’s SIGNATURE_ACTIONS list cannot express at all',
    ).toContain('REJECTED')

    // The column that would have to be printed exists and is NOT NULL, so this
    // is a rendering gap and not a data one. That distinction decides whether
    // the fix is a migration or a template change — it is a template change.
    expect(
      sqlValue(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_name = 'signatures' AND column_name = 'meaning'`,
      ),
      'every signature carries a meaning — the data is there, only the printout does not read it',
    ).toBe('NO')

    // And the E2E tenant holds real signed acts whose meanings differ, so the
    // claim is about this database and not about production somewhere else.
    expect(
      Number(
        sqlValue(
          `SELECT count(DISTINCT meaning) FROM signatures
            WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL`,
        ),
      ),
      'and this tenant’s own signatures carry more than one meaning',
    ).toBeGreaterThan(1)

    // ── KNOWN DEFECT PRINT-MEANING-01, asserted against the rendered page.
    // A Document printout is opened by URL; `j14-printed-controlled-copy.spec.js`
    // owns the "reached through the product's own Print action" journey and is
    // deliberately not duplicated. What is asserted here is the block's CONTENT.
    const docId = sqlValue(
      `SELECT d.id FROM documents d
         JOIN document_versions v ON v.document_id = d.id AND v.status_id = 'EFFECTIVE'
        WHERE d.company_id = '${COMPANY_ID}' AND d.deleted_at IS NULL
        ORDER BY v.created_at DESC LIMIT 1`,
    )
    test.skip(
      !docId,
      'no EFFECTIVE document in the tenant yet — run the documents project first; this test measures the SHARED print block, not this suite’s own fixture',
    )

    const ctx = await browser.newContext({ storageState: AUTH.owner })
    try {
      const page = await ctx.newPage()
      await page.addInitScript(() => {
        window.print = () => {}
      })
      await page.goto(`/print?module=Document&id=${docId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      })

      // Positive control: the owner bypasses `audit_trail:read`, so the block
      // is present and populated. An absent block below would otherwise be a
      // permission result rather than a content one.
      await expect(
        page.getByRole('heading', { name: 'Approvals & Signatures' }),
        'the shared signature block prints for a reader who may see it',
      ).toBeVisible({ timeout: 60_000 })

      // The four columns it actually offers. `Meaning` is not among them.
      await expect(
        page.getByRole('columnheader', { name: 'Signed by', exact: true }),
        'it names the signer — §11.50(a)(1) is met',
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        page.getByRole('columnheader', { name: 'Date', exact: true }),
        'and the date — §11.50(a)(2) is met',
      ).toBeVisible()

      await expect(
        page.getByRole('columnheader', { name: 'Meaning', exact: true }),
        'KNOWN DEFECT PRINT-MEANING-01 — the printed signature block has no Meaning column. It prints `sig.action` (an audit action code: APPROVE / SET_EFFECTIVE) where §11.50(a)(3) requires the signature’s meaning, and `signatures.meaning` — which holds exactly that, NOT NULL on every row — is never read. A signed REJECTION does not appear on the printout at all, because REJECT is not in SIGNATURE_ACTIONS. Fix by sourcing the block from the signatures ledger; do NOT relax this assertion.',
      ).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })
})
