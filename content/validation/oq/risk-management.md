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

**How risk is assessed in this product.** A risk assessment is scored **on the record
being assessed** — a nonconformance, CAPA or change request is assessed as part of its
workflow, against a configured risk template, and the resulting risk level belongs to that
record. There is no separate hazard register in which hazards are catalogued, mitigated and
re-scored. If your procedure requires a standalone hazard register or an FMEA, that
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

**Scoring method in use:** ______________________________________________
**Risk acceptability thresholds:** ____________________________________

## 4. Test cases

### TC-08-01 — Risk template configuration *(URS-RSK-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open or create the risk assessment template used by your procedure | Template opens |  |  |  |
| 2 | Confirm the scoring dimensions match your approved method (for example severity, occurrence, detectability) | Dimensions match the SOP |  |  |  |
| 3 | Confirm each dimension's scale and the meaning of each value match the SOP | Scales match |  |  |  |
| 4 | Confirm the risk-level bands match the SOP's acceptability criteria | Bands match |  |  |  |
| 5 | Confirm the template cannot be silently altered by an ordinary user | Change is controlled |  |  |  |

> Discrepancies between the configured template and the approved SOP are a finding
> against configuration, not against the software. Resolve before continuing.

### TC-08-02 — Creating an assessment *(URS-RSK-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Risk Author**, create a risk assessment from the template | Assessment created with its own identifier |  |  |  |
| 2 | Attempt to save without a title or scope | Refused |  |  |  |
| 3 | Record the scope, the process or product assessed, and the assessment team | Saved |  |  |  |
| 4 | Add a hazard with its cause and potential harm | Saved |  |  |  |
| 5 | Add a second and third hazard | All saved and listed |  |  |  |
| 6 | Attempt to score a hazard with a value outside the configured scale | Refused |  |  |  |

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
| 6 | Change one score on an existing hazard | The risk level recalculates immediately and correctly |  |  |  |
| 7 | Confirm the risk level cannot be overridden by hand without a record of the override | Override is either prevented or recorded with justification |  |  |  |

### TC-08-04 — Mitigation and residual risk *(URS-RSK-04)* — **normally N/A**

> **Read this before executing.** In this product a risk assessment is scored **once, on
> the record being assessed** — a nonconformance, CAPA or change request is assessed as
> part of its workflow, and the assessment belongs to that record. There is no separate
> hazard register in which a hazard is scored, mitigated, and then re-scored as residual.
>
> For most intended uses, **mark this test case N/A and record the justification**: the
> pre-mitigation / post-mitigation cycle is not how risk is assessed in this system, and
> the mitigating action is the record itself (the CAPA or change request), not a field on
> an assessment. Where your procedure requires initial-versus-residual scoring of hazards,
> that activity sits outside this system — record where it is performed and how it is
> traceable, exactly as you would for any other excluded function.
>
> Execute the steps below **only** if your configuration has been set up to capture both an
> initial and a residual assessment on the same record. Confirm that with your
> administrator first; if it has not been, the steps have no surface to test and N/A is the
> correct disposition.

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
| 1 | Submit the assessment for review | It routes to the configured approver |  |  |  |
| 2 | As a user other than the approver, attempt to approve | Refused |  |  |  |
| 3 | As **Approver**, approve — with signature where required | Approval recorded with name, date/time and meaning |  |  |  |
| 4 | Attempt to edit the approved assessment | Editing is prevented, or requires a new version — record the behaviour |  |  |  |
| 5 | Create a revision of the approved assessment | New version created; the approved version is retained |  |  |  |
| 6 | Print the approved assessment | Complete, legible copy including scores, mitigations and approval |  |  |  |

### TC-08-06 — Audit trail *(URS-RSK-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the assessment's audit history | Creation, each hazard, every score change, mitigations and approval are recorded |  |  |  |
| 2 | Inspect a score change entry | Previous and new score both shown |  |  |  |
| 3 | Confirm each entry carries performer and timestamp | Present |  |  |  |
| 4 | Confirm no audit entry can be edited or deleted | None available |  |  |  |

## 5. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 6. Execution summary

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
