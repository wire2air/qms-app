// PW-J15 · URS-CAP-05 / OQ-04 TC-04-05 — what the closure signature RECORDS
// (step 5) and what closure SEALS (step 6).
//
// ⚠️  THE SECOND TEST PINS A PRODUCT NON-CONFORMANCE (CAPA-D3). Read the
//     finding section before deciding what a green run here means.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS, AND WHAT WAS ALREADY COVERED.
//
// §7 scored URS-CAP-05 *Partial* against `j3-close-gates-esign.spec.js`, with
// the note that "the requirement's second clause is STALE — effectiveness is now
// a workflow step, not a field."
//
// THE SECOND CLAUSE IS INDEED STALE, AND IT IS ALREADY COVERED. Verified
// against the product rather than taken from the note:
//
//   · `closeCapaSchema` no longer requires an effectiveness date —
//     `controllers/capas.js:336-346` treats `effectivenessCheckAt` as optional
//     and only checks that it PARSES ("must be a valid date"). A PAST date now
//     closes the CAPA with a 200.
//   · closing mints NO `capa_effectiveness_checks` row. `j3` asserts exactly
//     that (`expect(Number(ecCount)).toBe(0)`), and asserts the surviving
//     validation (an unparseable date → 400) so the endpoint keeps a negative
//     test rather than losing one.
//   · the check is a workflow DELAY step with `captures_effectiveness`, and
//     `j4-effectiveness-check.spec.js` drives the whole of it: the step parks
//     SCHEDULED, SURVIVES the close (TC-04-05 step 7 — `finalizeWorkflowForClose`
//     keeps the instance alive for a pending deferred delay step), wakes via the
//     worker, and records `effectiveness_outcome` first-class on the step.
//
// So this file does NOT re-cover the effectiveness clause. It covers the two
// clauses of TC-04-05 that nothing asserts today: what the signature CONTAINS,
// and whether a closed CAPA is actually uneditable.
//
// ─────────────────────────────────────────────────────────────────────────────
// TC-04-05 STEP 5 — "Inspect the signature | Name, date/time and meaning
// present."
//
// `j3` counts the signature (`count(*) … WHERE capa_id = … AND meaning =
// 'CLOSED'` is 1). It never reads it. A count proves a row was written; step 5
// asks whether the row IDENTIFIES anything. Those are different claims, and the
// difference is the whole of Part 11 §11.50 — a signature manifestation must
// carry the signer's name, the date/time, and the meaning of the signing.
//
// The subject binding is worth stating because it is easy to get wrong:
// `signatures` has no generic entity column. Its subject CHECK permits exactly
// one of several FKs, and for a CAPA closure the one used is `capa_id` — set
// directly by `verifyAndSign({ capaId, meaning: 'CLOSED' })`
// (controllers/capas.js:352-366), with `task_instance_id` NULL because no task
// is being acted on. A workflow-step signature is the other shape and binds
// through `task_instance_id` instead.
//
// ─────────────────────────────────────────────────────────────────────────────
// TC-04-05 STEP 6 — "Attempt to edit the closed CAPA | Editing prevented."
// THE FINDING (CAPA-D3): THIS IS AN INTERFACE-ONLY CONTROL.
//
//   UI        `CapasPageId.vue:51-54` computes
//                 isEditable = … && capa.value.statusId !== 'CLOSED' && …
//             and threads it through every inline editor on the page: the title
//             (line 431/445), the description card, custom fields (532), the
//             category / owner / site / department selects (582-613). So a
//             person driving the application really is prevented, and step 6
//             executed through the screens PASSES.
//
//   DATABASE  `capas_upd` — the RLS policy the SyncEngine / GraphQL path writes
//             through — reads, in full:
//                 company_id = authz.current_company_id()
//                 AND (authz.current_is_owner()
//                      OR (authz.has_permission('capa','update')
//                          AND authz.scope_allowed('capa','update', owner_id,
//                                                  department_id, site_id)))
//             There is NO status condition in it. Measured from pg_policy, not
//             read off a migration.
//
//   TRIGGERS  `capas` carries four, and not one of them seals a closed record:
//                 capas_status_transition_guard  BEFORE UPDATE **OF status_id**
//                 capa_immutable_supplier_facing BEFORE UPDATE (is_supplier_facing
//                                                / supplier_id only)
//                 enforce_soft_delete_permission BEFORE UPDATE **OF deleted_at**
//                 capas_audit_trigger            AFTER (records, does not refuse)
//             The status guard is column-scoped, so an UPDATE that never touches
//             `status_id` never fires it. That is the same shape as the
//             complaints defect `complaints/j15` pins, and it is why the status
//             IS sealed while everything around it is not.
//
// CONSEQUENCE: a CLOSED, e-signed CAPA's title, description, owner, due date and
// root-cause category are all freely rewritable through the data interface by
// anyone holding `capa:update`. The signature stays attached and still says
// CLOSED, so a later reader sees a signed closure over content that changed
// after the signing.
//
// HOW THIS IS WRITTEN, AND WHY. The honest arrangement is the one
// `complaints/j15` settled on: assert the ACCEPTANCE, label it KNOWN DEFECT, and
// pair it so the gap cannot be misread. Writing `expect(ok).toBeFalsy()` against
// a policy that permits the write, and then "fixing" it by relaxing the
// assertion, is how a suite comes to certify the opposite of the requirement.
//
// TWO PAIRS make the finding precise rather than alarming:
//   1. A ZERO-GRANT persona is refused the SAME statement. Without that, "the
//      write landed" is equally consistent with "RLS on this table is simply
//      open", which is a different and much worse claim. What is missing is a
//      TERMINAL-STATE condition, not the policy.
//   2. The codebase KNOWS the technique. `enforce_field_record_revision_immutable`
//      (ERRCODE QMSFR) compares the WHOLE ROW and refuses any change but the two
//      columns it names — and its own comment explains that an enumerated column
//      list is what went wrong last time. So this is an omission on `capas`, not
//      an unavailable technique, and that distinction drives the corrective
//      action.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import {
  createCapa,
  openCapa,
  completeReviewerStep,
  completeApproverStep,
  closeCapa,
  uniqueTitle,
} from '../fixtures/capas.js'
import { findCapaByTitle, sqlRow, sqlValue, sqlAsAppUser, waitForSqlValue } from '../fixtures/db.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * Drive a fresh CAPA all the way to CLOSED through product routes only.
 *
 * Nothing is seeded straight into CLOSED, and that is not fastidiousness: the
 * superuser connection is NOT a trigger bypass. It clears the "cannot change
 * status directly" arm of `enforce_capa_status_transition`, but the EDGE rules
 * still apply, so a hand-written jump would either be refused or would produce a
 * record whose closure was never signed — and the signature is half of what this
 * file is asserting.
 *
 * Each test arranges its own CAPA. Playwright discards and restarts the worker
 * after a failed test and re-runs `beforeAll` for the rest of the file, so
 * shared arrange silently rewinds mid-file in a suite where a failure is
 * expected — which this one is.
 */
async function closedCapa(page, browser, tag) {
  const title = uniqueTitle(tag)
  await createCapa(page, title)
  const capa = findCapaByTitle(title)
  expect(capa?.id, 'arrange: the CAPA was created').toBeTruthy()
  await openCapa(page, capa.id)

  await completeReviewerStep(browser, capa.id)
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = ${q(capa.id)}
        AND assigned_to = ${q(USERS.approver.id)} AND status_id = 'ASSIGNED'`,
    { timeoutMs: 45_000, label: 'approver task created' },
  )
  await completeApproverStep(browser, capa.id)
  await waitForSqlValue(
    `SELECT count(*) FROM workflow_instances
      WHERE resource_type = 'Capa' AND resource_id = ${q(capa.id)} AND status_id != 'IN_PROGRESS'`,
    { timeoutMs: 45_000, label: 'workflow finished' },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })

  await closeCapa(page, { comments: 'PW-J15 — closed to probe the post-closure seal.' })
  await waitForSqlValue(
    `SELECT count(*) FROM capas WHERE id = ${q(capa.id)} AND status_id = 'CLOSED'`,
    { timeoutMs: 45_000, label: 'CAPA CLOSED' },
  )
  return capa
}

test.use({ storageState: AUTH.author })

test.describe('PW-J15 · URS-CAP-05 — the closure signature, and the closed-record seal', () => {
  test('TC-04-05 step 5 · the closure signature carries a signer, a timestamp and a meaning — and is bound to THIS CAPA', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)
    const capa = await closedCapa(page, browser, 'J15-signature')

    // Read the row, do not merely count it. `j3` already proves one exists; step
    // 5 asks what is IN it.
    const sig = sqlRow(
      `SELECT user_id,
              (signed_at IS NOT NULL)::text,
              meaning,
              coalesce(comments,'NULL'),
              coalesce(task_instance_id::text,'NULL'),
              is_revoked::text,
              (payload_hash IS NOT NULL)::text
         FROM signatures
        WHERE capa_id = ${q(capa.id)} AND deleted_at IS NULL`,
    )
    expect(sig, 'exactly the closure signature is present').not.toBeNull()

    // NAME — the signer is a real, resolvable user, not a string. Asserted as
    // the FK resolving rather than as "not null": an id pointing at nothing
    // would satisfy a null check and manifest no name at all.
    expect(sig[0], 'the signature names the closer').toBe(USERS.author.id)
    expect(
      sqlValue(
        `SELECT count(*) FROM users u JOIN signatures s ON s.user_id = u.id
          WHERE s.capa_id = ${q(capa.id)} AND u.deleted_at IS NULL`,
      ),
      'and that id resolves to a live user row — the manifestation has a name to print',
    ).toBe('1')

    // DATE/TIME.
    expect(sig[1], 'the signature carries a signing timestamp').toBe('true')

    // MEANING — the Part 11 §11.50 element that a bare "user X signed" would
    // omit. CLOSED, not APPROVED: a workflow-step approval is a different
    // signature with a different meaning, and conflating them is how a ledger
    // stops being able to answer "what did this person attest to".
    expect(sig[2], 'and the MEANING of the signing').toBe('CLOSED')

    // The closure comments ride on the signature too, so the attestation and its
    // justification are one record rather than two that could drift.
    expect(sig[3], 'the closure comment is carried on the signature itself').toContain(
      'probe the post-closure seal',
    )

    // SUBJECT BINDING. `signatures` has no generic entity column — its CHECK
    // permits exactly one of several FKs. A CAPA CLOSURE binds through
    // `capa_id`; `task_instance_id` is NULL because no task was acted on. If a
    // future refactor routed the closure through a task instead, this is the
    // assertion that would say so rather than the count silently still being 1.
    expect(sig[4], 'bound to the CAPA directly, not through a task').toBe('NULL')
    expect(sig[5], 'and it is live, not revoked').toBe('false')
    expect(sig[6], 'with a payload hash — the manifestation is tamper-evident').toBe('true')

    // Exactly ONE. A duplicate would mean the close path signed twice, which
    // reads in the ledger as two separate attestations to the same act.
    expect(
      sqlValue(`SELECT count(*) FROM signatures WHERE capa_id = ${q(capa.id)}`),
      'one closure signature, not zero and not a duplicate',
    ).toBe('1')
  })

  test('KNOWN DEFECT CAPA-D3 · TC-04-05 step 6 — closure seals the STATUS only; the regulated content of a CLOSED, signed CAPA stays writable', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)
    const capa = await closedCapa(page, browser, 'J15-seal')
    const before = sqlRow(
      `SELECT title, coalesce(description,'NULL'), owner_id FROM capas WHERE id = ${q(capa.id)}`,
    )

    // ── THE HALF THAT IS SEALED, and it is sealed at the DATABASE — which is
    // what makes the closure gate unbypassable. The untrusted (SyncEngine /
    // app_user) path may not write `status_id` at all, so no permitted holder
    // can reopen or re-close around the workflow and the e-signature.
    const statusWrite = sqlAsAppUser(
      `UPDATE capas SET status_id = 'OPEN' WHERE id = ${q(capa.id)};`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(statusWrite.ok, 'the data interface can never change a CAPA status').toBeFalsy()
    expect(statusWrite.error, 'and the guard says so by name').toMatch(
      /status cannot be changed directly|Illegal CAPA status transition/i,
    )
    expect(
      sqlValue(`SELECT status_id FROM capas WHERE id = ${q(capa.id)}`),
      'so the record stayed CLOSED',
    ).toBe('CLOSED')

    // ── THE HALF THAT IS NOT. `capas_upd` carries no status condition and the
    // status guard is BEFORE UPDATE **OF status_id**, so an update that never
    // names that column never fires it. Every field below is regulated content
    // of a closed, signed corrective action.
    //
    // The values written are REAL changes, not the values already held: writing
    // back what is there would be indistinguishable from a refusal, which is the
    // trap `auditLogs/a5` documents for the audit-row forgery.
    const fieldWrite = sqlAsAppUser(
      `UPDATE capas
          SET title = 'PW-J15 — REWRITTEN AFTER CLOSURE',
              description = 'PW-J15 — the problem statement was changed after the CAPA was closed and signed.',
              owner_id = ${q(USERS.reviewer.id)}
        WHERE id = ${q(capa.id)} RETURNING id;`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(
      fieldWrite.ok,
      'KNOWN DEFECT CAPA-D3: the data interface accepts edits to a CLOSED CAPA — TC-04-05 step 6 requires editing to be prevented',
    ).toBeTruthy()
    expect(fieldWrite.output, 'and the write really landed on the row').toContain(capa.id)

    const after = sqlRow(
      `SELECT title, coalesce(description,'NULL'), owner_id FROM capas WHERE id = ${q(capa.id)}`,
    )
    expect(
      after[0],
      'KNOWN DEFECT CAPA-D3: the title of a closed, e-signed CAPA changed',
    ).toBe('PW-J15 — REWRITTEN AFTER CLOSURE')
    expect(after[0], 'and it is genuinely different from what was signed').not.toBe(before[0])
    expect(
      after[1],
      'KNOWN DEFECT CAPA-D3: so did the problem statement the closure attested to',
    ).toContain('changed after the CAPA was closed and signed')
    expect(
      after[2],
      'KNOWN DEFECT CAPA-D3: and the responsible party was reassigned on a terminal record',
    ).toBe(USERS.reviewer.id)

    // THE SIGNATURE IS STILL ATTACHED AND STILL SAYS CLOSED. This is the part
    // that matters for a Part 11 reading: nothing marks the record as having
    // changed after signing, so a later reviewer sees a signed closure over
    // content that is no longer the content that was signed.
    expect(
      sqlValue(
        `SELECT meaning FROM signatures WHERE capa_id = ${q(capa.id)} AND deleted_at IS NULL`,
      ),
      'KNOWN DEFECT CAPA-D3: the closure signature is unchanged and still reads CLOSED over rewritten content',
    ).toBe('CLOSED')

    // ── PAIR 1. A zero-grant persona is refused the very same statement, so
    // what is missing is a TERMINAL-STATE condition and not the policy itself.
    // Without this the finding above would read as "RLS on capas is open", which
    // is a different and much worse claim — and a false one.
    const strangerWrite = sqlAsAppUser(
      `UPDATE capas SET title = 'PW-J15 — by a stranger' WHERE id = ${q(capa.id)} RETURNING id;`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )
    expect(
      strangerWrite.output,
      'a zero-grant persona is still shut out — the policy works, it simply has no terminal-state clause',
    ).not.toContain(capa.id)
    expect(
      sqlValue(`SELECT title FROM capas WHERE id = ${q(capa.id)}`),
      'and the stranger changed nothing',
    ).toBe('PW-J15 — REWRITTEN AFTER CLOSURE')

    // ── PAIR 2. The codebase knows this technique. `field_record_revisions` is
    // sealed by a WHOLE-ROW comparison — and its own source comment records that
    // an enumerated column list is exactly what failed there before. So the gap
    // on `capas` is an omission, not an unavailable mechanism, and the two call
    // for different corrective actions.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_proc WHERE proname = 'enforce_field_record_revision_immutable'`,
      ),
      'the sibling module DOES seal a terminal record at the database',
    ).toBe('1')

    // And the precise reason, stated as measured state rather than as a claim in
    // a comment — so the day someone adds the clause, THIS is what goes red and
    // points at the fix.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_policy
          WHERE polrelid = 'capas'::regclass AND polcmd = 'w'
            AND pg_get_expr(polqual, polrelid) ILIKE '%status_id%'`,
      ),
      'KNOWN DEFECT CAPA-D3: no UPDATE policy on `capas` mentions status_id at all',
    ).toBe('0')
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_trigger
          WHERE tgrelid = 'capas'::regclass AND NOT tgisinternal
            AND tgname = 'capas_status_transition_guard'
            AND pg_get_triggerdef(oid) ILIKE '%UPDATE OF status_id%'`,
      ),
      'and the one guard that could have caught it is column-scoped to status_id, so a content-only UPDATE never fires it',
    ).toBe('1')
  })

  test('CONTROL · the effectiveness clause of URS-CAP-05 is stale, and the CURRENT contract is what ships', async ({
    page,
    browser,
  }) => {
    // Not a re-test of `j4` — this is the one-line premise check that says the
    // note's claim ("effectiveness is now a workflow step, not a field") is TRUE
    // of the running product, so a reader of the executed protocol can see why
    // TC-04-05's second clause was read the way it was.
    //
    // A CAPA closed on the STANDARD workflow (no delay step) is used
    // deliberately: it is the configuration where the legacy field would have
    // been the only place a check could live, so a surviving legacy row here
    // would be the strongest possible evidence that the retirement was partial.
    test.setTimeout(300_000)
    const capa = await closedCapa(page, browser, 'J15-stale-clause')

    expect(
      sqlValue(`SELECT count(*) FROM capa_effectiveness_checks WHERE capa_id = ${q(capa.id)}`),
      'closing schedules NO record-based effectiveness check — the close-time scheduler is retired',
    ).toBe('0')

    // The successor exists as a first-class column on the STEP, which is where
    // `j4` records the verdict. Asserted from information_schema so this stays
    // true of the running database rather than of a migration file.
    expect(
      sqlValue(
        `SELECT count(*) FROM information_schema.columns
          WHERE table_name = 'workflow_instance_steps' AND column_name = 'effectiveness_outcome'`,
      ),
      'and the verdict now lives on the workflow step instead (the surface j4 drives end to end)',
    ).toBe('1')
  })
})
