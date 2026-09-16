---
id: oq-risk-management
title: OQ-08 Risk Management
sidebar_position: 8
description: Operational Qualification protocol for risk assessment templates, scoring, risk level derivation, review and approval.
keywords: [OQ, risk management, risk assessment, risk matrix, risk level, ISO 14971, test script]
---

# OQ-08 — Risk Management

**Document ID:** VAL-OQ-08 · **Version:** 1.0 · **Module:** Risk Management

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify that risk assessments are performed against a defined and controlled scoring
method, that risk levels are derived consistently from the scores entered, and that
assessments are reviewed and approved under control.

**The calculation is the critical test.** A risk tool that derives the wrong risk class,
or that lets one assessor's score mean something different from another's, produces
decisions that cannot be defended. TC-08-03 verifies the derivation against
independently calculated expected values — do not skip it.

**How risk is assessed in this product.** Risk is scored **on a workflow step**, against a
configurable risk assessment template, on the record being assessed — a nonconformance,
CAPA, change request or complaint. The assessment is a **field on the step's form**, not a
record of its own: there is no standalone risk assessment to open from a register, and no
user-visible assessment number to quote. The stored assessment is derived by the server when
the step is approved, and the resulting risk level belongs to the assessed record.

A **hazard-category register does exist**, with categories seeded at installation, but the
control that sets a category is not currently exposed in the interface — so a category
cannot be assigned during execution. Treat hazard categorisation as present in the data
model and unavailable at the interface, not as absent from the product.

If your procedure requires a standalone hazard register or a full FMEA workbook, that
activity sits outside this system; record where it is performed, and see TC-08-04.

## 2. Requirements verified

URS-RSK-01 … URS-RSK-06. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §11.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | The organisation's risk scoring method and acceptability criteria are documented and approved |  |
| 4 | Test accounts: **Risk Author**, **Approver**, **No-Access** |  |
| 5 | A workflow template containing a **Risk Assessment** field is configured and published for the record type under test |  |
| 6 | At least one risk assessment template exists |  |

**Scoring method in use:** ______________________________________________
**Risk acceptability thresholds:** ____________________________________

> **Read this before starting.** Prerequisites 5 and 6 are not optional setup detail — they
> are the surface this protocol tests. Risk is scored by a Risk Assessment field on a
> workflow step, so without that field on a step of a published workflow there is nothing
> to execute against and every test case below is untestable rather than failing. Confirm
> both with your administrator before beginning.
>
> Where several risk assessment templates exist and the field does not name one, the widget
> deliberately resolves none and asks the assessor to choose. That is intended behaviour;
> record which template you selected.

## 4. Test cases

### TC-08-01 — Risk template configuration *(URS-RSK-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open or create the risk assessment template used by your procedure | Template opens |  |  |  |
| 2 | Confirm the scoring dimensions match your approved method (for example severity, occurrence, detectability) | Dimensions match the SOP |  |  |  |
| 3 | Confirm each dimension's scale and the meaning of each value match the SOP | Scales match |  |  |  |
| 4 | Confirm the risk-level bands match the SOP's acceptability criteria | Bands match |  |  |  |
| 5 | Confirm the template cannot be silently altered by an ordinary user | Editing is refused for a user without template update permission |  |  |  |

> Discrepancies between the configured template and the approved SOP are a finding
> against configuration, not against the software. Resolve before continuing.

> **Read this before recording step 5.** The gate is real, but it cannot be evidenced by
> inspecting configuration. The template's row-level policies are generated at runtime
> rather than written into the policy file, so there is no settings page or policy listing
> to read the answer off. **Confirm it by test:** sign in as a user who does not hold risk
> assessment template update permission, attempt to edit the template, and record the
> refusal. An inspection-only observation is not evidence for this step.
>
> Also confirm the template is **not edited while historical assessments exist**. Labels
> and scores are frozen onto each assessment when it is finalized, so a rename or rescale
> does not reach back into assessments already recorded — see the note under TC-08-03 and
> the first bullet of *Controls this protocol does not test*. Editing a live template is
> nonetheless a configuration-control matter: record any change under change control.

> **Record the template's FMEA mode.** A risk assessment template may enable a third
> dimension, detectability. With it enabled the RPN is likelihood × severity ×
> detectability; with it disabled the RPN is likelihood × severity. Record which mode the
> template under test uses and confirm it matches your SOP — the hand calculations in
> TC-08-03 depend on it.
>
> **FMEA mode (detectability):** ☐ Enabled ☐ Disabled

### TC-08-02 — Creating an assessment *(URS-RSK-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Risk Author**, open the record under assessment and open the workflow step carrying the **Risk Assessment** field | The matrix opens against the configured template |  |  |  |
| 2 | Without choosing both axes, attempt to finalize the assessment | Finalizing is unavailable — the **Finalize** control stays disabled until a likelihood and a severity are both chosen |  |  |  |
| 3 | Confirm what the assessment itself records — **N/A** | **N/A** — the assessment holds no scope, process/product or assessment-team field; see the note below |  |  |  |
| 4 | Add a hazard with its cause and potential harm — **N/A** | **N/A** — see the note below |  |  |  |
| 5 | Add a second and third hazard — **N/A** | **N/A** — see the note below |  |  |  |
| 6 | Confirm the matrix offers only the values defined in the template | Only the template's own scale values are selectable; no free-text or out-of-scale entry is possible |  |  |  |

> **Read this before recording step 1.** The assessment belongs to the **assessed record**
> and has no identifier of its own — do not look for an assessment number to record, and do
> not raise a failure for its absence. The stored assessment is written to the reporting
> register when the workflow step is **approved**, not when you enter the scores.

> **Read this before recording steps 2 and 3.** There is no title field and no scope field
> on the assessment, so there is nothing for the system to refuse and a refusal must not be
> recorded. The equivalent control is the completeness gate above: both matrix axes must be
> chosen before the assessment can be finalized. Record that observation instead.
>
> Step 3 is **N/A** for the same reason. The assessment records the template it was scored
> against, the hazard category (where exposed), the likelihood and severity selected, the
> risk band and numeric score derived from them, and the assessor's justification. It holds
> no scope, no process or product description and no assessment team. What was assessed is
> identified by the **record the assessment is attached to** — the nonconformance, CAPA,
> change request or complaint — and the team is identified by the workflow step's
> assignees. Record that as the justification rather than raising a failure for the absent
> fields, and note where your own procedure captures scope and team if it requires them.

> **Steps 4 and 5 are N/A — record the justification.** The system scores **one risk per
> Risk Assessment field**, selected against the matrix. It does not maintain a hazard list,
> and there is no cause field and no potential-harm field to populate. Where more than one
> risk must be assessed, this is done by adding **multiple Risk Assessment fields** to the
> workflow step, or by assessing on separate records — not by adding hazards to one
> assessment.
>
> Hazard categorisation exists in the data model, with categories seeded at installation,
> but its control is not currently exposed in the interface and a category therefore cannot
> be set during execution. Record that as the reason rather than recording that the product
> has no hazard categories.

> **Read this before recording step 6.** Scoring is done by **clicking a matrix cell**, so
> an out-of-scale value cannot be typed in the first place. The original form of this step —
> attempting to enter a value outside the scale and expecting a refusal — is not executable
> and is not a meaningful control here. Confirm the constraint positively: only the
> template's defined values appear, and there is no free-text entry.

### TC-08-03 — Risk level derivation *(URS-RSK-03)*

Calculate the expected value by hand from your SOP **before** entering it, and record
both. This is the evidence that the tool computes what your procedure says.

| # | Hazard | Scores entered | Expected risk level (calculated by hand) | Risk level shown by system | Match? | Init / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Low-risk case |  |  |  |  |  |
| 2 | Boundary case — just below a band threshold |  |  |  |  |  |
| 3 | Boundary case — exactly at a band threshold |  |  |  |  |  |
| 4 | Boundary case — just above a band threshold |  |  |  |  |  |
| 5 | Highest-risk case |  |  |  |  |  |

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 6 | Change one score in the widget | The band and the RPN both recalculate; the assessment returns to un-finalized and must be re-finalized |  |  |  |
| 7 | Confirm the risk level cannot be entered or altered by hand in the interface | No control offers a hand-entered risk level — it is derived from the matrix cell |  |  |  |

> **Read this before recording the hand-calculation table.** The band and the score come
> from **two independent derivations**, and a single mis-entered score can produce a wrong
> RPN sitting behind a correct-looking colour. So verify **both** on every row:
>
> - the **risk band** comes from a lookup in the template's cell map;
> - the **RPN** is likelihood score × severity score, and × detectability where the template
>   enables FMEA mode (recorded in TC-08-01).
>
> Where a scale row carries no explicit score, its **display rank** is used in the
> calculation instead. Take that into account when computing the expected value by hand.
>
> Re-verify both the band and the numeric RPN after **any** template edit.

> **Read this before recording step 6.** Changing a score after finalizing clears the
> finalize stamp, so the assessment must be **re-finalized** before the workflow step is
> submitted. Confirm that the stamp clears and that you re-finalize.
>
> **Known limitation.** Editing **only the justification text** does *not* clear the
> finalize stamp. The justification that reaches the reporting register is therefore the
> pre-edit text unless the assessor re-finalizes explicitly. Where your procedure relies on
> the recorded justification, make re-finalizing after any justification edit a procedural
> step and record that decision here.

> **Read this before recording step 7.** The risk level is derived and cannot be typed or
> overridden through the interface, so the step passes as written. Note the boundary of that
> control: the stored assessment row carries an audit trigger but **no database-level
> immutability seal** — unlike the sibling root-cause table, which has one. A change made
> outside the interface would therefore be **captured by the audit trail but not refused**.
> Record this where you rely on the derivation being tamper-evident rather than
> tamper-proof.

### TC-08-04 — Mitigation and residual risk *(URS-RSK-04)* — **normally N/A**

> **Read this before executing — and record the reason precisely.** Initial-versus-residual
> scoring **is supported by the data model**. The system can hold one initial and one
> residual assessment per record and workflow step. What is missing is the interface: the
> control that selects between initial and residual is **not currently exposed**, so every
> assessment recorded through the application is an **Initial** assessment.
>
> This test case is therefore **N/A in the shipped configuration for that reason** — an
> interface gap, not a modelling limitation. Mark it N/A and record that justification.
>
> **Do not record this as "the system cannot represent residual risk."** That statement is
> untrue and would misreport the product's capability to an auditor.
>
> Where your procedure requires initial-versus-residual scoring, **raise the interface gap
> with the supplier** and control the activity procedurally in the meantime — record where
> the residual assessment is performed and how it is traceable. The mitigating action
> itself is the record that implements it (the CAPA or change request), not a field on the
> assessment.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the mitigating action for the assessed risk — in this system, the record that implements it | Action recorded and linked |  |  |  |
| 2 | Where a post-mitigation assessment is configured, score it | A second assessment is recorded against the same record |  |  |  |
| 3 | Verify the post-mitigation risk level against a hand calculation | Values agree |  |  |  |
| 4 | Confirm the **initial** assessment is retained alongside it | Both are present; the original is not overwritten |  |  |  |
| 5 | Where the remaining risk is above your acceptability threshold, confirm this is evident on the record | Unacceptable risk is visible, not buried |  |  |  |
| 6 | Confirm the assessment is visible from the record that carries it | Assessment visible in context |  |  |  |

### TC-08-05 — Review and approval *(URS-RSK-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Submit the **workflow step** carrying the assessment for approval | It routes to the step's configured reviewer |  |  |  |
| 2 | As a user who is **not** that step's assigned reviewer, attempt to approve | Refused |  |  |  |
| 3 | As **Approver**, approve — with signature where required | Approval recorded with name, date/time and meaning |  |  |  |
| 4 | Attempt to edit the assessment after approval | Editing is prevented — record the behaviour |  |  |  |
| 5 | Re-open the step, change a score and re-approve | The stored assessment is **updated in place**, not versioned |  |  |  |
| 6 | Print the assessed record or its workflow step | Complete, legible copy showing the scores, band, RPN and justification |  |  |  |

> **Read this before executing.** There is **no assessment lifecycle** in this product: the
> assessment has no status of its own, no submit-for-review action and no versioning. The
> review and approval that exist belong to the **workflow step**. Every step below is
> therefore executed against the step, not against the assessment.

> **Step 3 — where the signature evidence lives.** The objective evidence is the workflow
> step's **task approval and its signature record**, not a signature stored on the
> assessment. Capture the step's approval record as the evidence for this step.

> **Step 4 — this is a workflow-state control, not a technical lock.** The read-only
> behaviour after approval comes from the step's state, not from a database-level
> restriction on the assessment row. Read it together with the note under TC-08-03 step 7:
> a change made outside the interface would be recorded in the audit trail but is not
> refused.

> **Step 5 — confirm the overwrite, and where the history goes.** Re-approving after a
> change **overwrites the stored assessment row in place**. No second version is created,
> so do not record a versioning failure. The previous values survive **only in the audit
> trail** — confirm you can recover them there, and state in your record that the audit
> trail is the sole history for a re-scored assessment.

> **Step 6 — there is no standalone assessment printout.** Print the assessed record or its
> workflow step; the assessment appears in that context. Note also that **"mitigations" are
> not a field on the assessment** — the mitigating action is the record itself. Do not
> record a missing-mitigations failure against the printout.

### TC-08-06 — Audit trail *(URS-RSK-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the audit trail of the **record being assessed** and locate the Risk Assessment entries | Creation and subsequent changes are recorded, each with performer and timestamp |  |  |  |
| 2 | Inspect a score change entry | Previous and new score both shown |  |  |  |
| 3 | Confirm each entry carries performer and timestamp | Present |  |  |  |
| 4 | Confirm no audit entry can be edited or deleted | None available |  |  |  |

> **Read this before recording step 1.** There is **no per-assessment audit view** to open —
> do not look for one. The Risk Assessment entries appear in the audit trail of the assessed
> record.
>
> Note where the history begins. Score changes made **before the step is approved** live on
> the step's form payload, not on an assessment row; the assessment row and its audit
> entries **begin at step approval**. So an in-progress score that was changed twice before
> approval will not show two assessment audit entries. Record that boundary rather than
> raising a gap in the audit trail.

## 5. Controls this protocol does not test

The behaviours below are present in the product but are not exercised by the test cases
above. A risk assessment may require the organisation to cover them with its own test cases
or procedural controls — review each against your procedure and record the decision.

- **Labels and scores are frozen onto the assessment at finalize**, so renaming or
  rescaling a template later does not retroactively alter assessments already recorded.
  This is a core data-integrity control and **a test step is recommended**: finalize an
  assessment, rename or rescale the template, then confirm the historical assessment still
  shows the original labels and scores.
- **An assessment can be auto-finalized** when the workflow step is saved or marked
  complete, without the assessor clicking **Finalize**.
- **The assessment is derived inside the step-approval transaction**, so a failure writing
  it rolls back the step approval itself.
- **Only one initial and one residual assessment per record and workflow step** is
  permitted, enforced by a database constraint.
- **An AI-suggested likelihood and severity can be applied** through the same path as a
  human selection, with nothing on the stored row distinguishing the two.
- **An unmapped matrix cell finalizes with a real RPN but no risk band**, so an assessment
  can carry a numeric score with no band assigned.

## 6. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 7. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --- | --- | --- | --- | --- | --- |
| TC-08-01 |  |  |  |  |  |
| TC-08-02 |  |  |  |  |  |
| TC-08-03 |  |  |  |  |  |
| TC-08-04 |  |  |  |  |  |
| TC-08-05 |  |  |  |  |  |
| TC-08-06 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
