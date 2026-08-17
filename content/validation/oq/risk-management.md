---
id: oq-risk-management
title: OQ-08 Risk Management
sidebar_position: 8
description: Operational Qualification protocol for risk assessment templates, hazard scoring, risk level derivation, mitigation and residual risk.
keywords: [OQ, risk management, FMEA, risk assessment, residual risk, ISO 14971, test script]
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
mitigations and residual risk are recorded and approved.

**The calculation is the critical test.** A risk tool that derives the wrong risk class,
or that lets one assessor's score mean something different from another's, produces
decisions that cannot be defended. TC-08-03 verifies the derivation against
independently calculated expected values — do not skip it.

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

### TC-08-04 — Mitigation and residual risk *(URS-RSK-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record a mitigation against a hazard | Saved |  |  |  |
| 2 | Re-score the hazard post-mitigation | Residual risk level is derived from the new scores |  |  |  |
| 3 | Verify the residual risk level against a hand calculation | Values agree |  |  |  |
| 4 | Confirm the **initial** risk scores are retained alongside the residual | Both are visible; the original is not overwritten |  |  |  |
| 5 | Where residual risk remains above the acceptability threshold, confirm this is evident on the record | Unacceptable residual risk is visible, not buried |  |  |  |
| 6 | Link a mitigation to the record that implements it (for example a CAPA or change request), where your process does so | Link created and visible |  |  |  |

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
