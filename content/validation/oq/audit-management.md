---
id: oq-audit-management
title: OQ-07 Audit Management
sidebar_position: 7
description: Operational Qualification protocol for audit standards, programmes, execution against clauses, findings and escalation to CAPA.
keywords: [OQ, internal audit, audit programme, findings, standards, ISO, test script]
---

# OQ-07 — Audit Management

**Document ID:** VAL-OQ-07 · **Version:** 1.0 · **Module:** Audit Management

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify that audits can be planned against a standard, scheduled through a programme,
executed with clause-by-clause responses and evidence, and that findings are raised,
classified, escalated to corrective action where required, and tracked to closure.

## 2. Requirements verified

URS-AUD-01 … URS-AUD-08. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §10.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | Finding categories and audit types configured |  |
| 4 | Test accounts: **Audit Programme Owner**, **Lead Auditor**, **Auditor**, **No-Access** |  |
| 5 | A published workflow template exists for the Audit module, if approval is used |  |

## 4. Test cases

### TC-07-01 — Standards and clauses *(URS-AUD-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Create an audit standard with a name and version | Standard is created |  |  |  |
| 2 | Add clauses/requirements to the standard, including a nested sub-clause | Clauses save with their hierarchy intact |  |  |  |
| 3 | Confirm each requirement is phrased as a closed question, per your audit procedure | Wording as intended |  |  |  |
| 4 | Create a second version of the standard | Both versions exist; the earlier remains available |  |  |  |
| 5 | Confirm an audit already executed against the earlier version still references that version | Historical reference preserved |  |  |  |

### TC-07-02 — Audit programme and schedule *(URS-AUD-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Create an audit programme covering a period | Programme created |  |  |  |
| 2 | Add scheduled audits with planned dates, scope and standard | Schedule entries created |  |  |  |
| 3 | Confirm the schedule is visible in the programme and, where used, on the audit calendar | Schedule visible |  |  |  |
| 4 | Change a planned date | Change saves and is recorded in the audit trail |  |  |  |
| 5 | Confirm an upcoming audit is surfaced to the responsible person | Notification or task raised |  |  |  |

### TC-07-03 — Audit planning *(URS-AUD-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Create an audit instance, selecting the standard and scope | Audit created with its own identifier |  |  |  |
| 2 | Attempt to create an audit without a standard or scope | Refused, per configuration — record the behaviour |  |  |  |
| 3 | Set the audit dates, type (internal / external / supplier) and auditee | Saved |  |  |  |
| 4 | Assign a **Lead Auditor** and one further team member | Team assigned; each is notified |  |  |  |
| 5 | Confirm the requirements from the selected standard are loaded into the audit | All clauses present |  |  |  |
| 6 | Confirm auditor independence can be evidenced — the assigned auditor is not the owner of the audited area | Record the control used (system or procedural) |  |  |  |

**Audit identifier:** ______________________

### TC-07-04 — Execution against requirements *(URS-AUD-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Auditor**, open the audit and record a conformant response against a requirement | Response saves with attribution |  |  |  |
| 2 | Record a nonconformant response against another requirement | Response saves |  |  |  |
| 3 | Attempt to record a nonconformant response without a comment or evidence | Refused, where configured — record the behaviour |  |  |  |
| 4 | Attach evidence to a response | Attachment uploads and reopens |  |  |  |
| 5 | Mark a requirement not applicable with a justification | N/A recorded with the justification |  |  |  |
| 6 | Confirm the audit shows progress and outstanding requirements | Progress is visible |  |  |  |
| 7 | Confirm responses are attributed to the auditor who recorded them, with a timestamp | Attribution present |  |  |  |

### TC-07-05 — Findings *(URS-AUD-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Raise a finding from a nonconformant response | Finding is created and linked to that requirement |  |  |  |
| 2 | Attempt to raise a finding without a category or description | Refused |  |  |  |
| 3 | Classify the finding (for example major / minor / observation) | Classification saved |  |  |  |
| 4 | Assign an owner and a due date | Saved; owner is notified |  |  |  |
| 5 | Record the response, correction and evidence against the finding | Saved |  |  |  |
| 6 | Close the finding | Closure recorded with performer and date |  |  |  |
| 7 | Attempt to close the audit with an open finding | Refused, or flagged — record the behaviour |  |  |  |

### TC-07-06 — Escalation to CAPA *(URS-AUD-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | From a finding, create a CAPA | The CAPA is created pre-linked to the finding |  |  |  |
| 2 | Confirm the CAPA source identifies it as audit-originated | Source recorded correctly |  |  |  |
| 3 | Confirm the link is visible from both the finding and the CAPA | Bidirectional visibility |  |  |  |
| 4 | Navigate from the CAPA back to the originating audit | Navigation reaches the audit |  |  |  |
| 5 | Confirm the link is recorded in the audit trail | Entry present |  |  |  |

### TC-07-07 — Audit report *(URS-AUD-07)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Produce the audit report | A complete report is generated |  |  |  |
| 2 | Confirm it includes scope, standard, dates, team, requirement results and all findings | All sections present |  |  |  |
| 3 | Confirm any conformance score shown is consistent with the recorded responses | Score reconciles with the data |  |  |  |
| 4 | Save as PDF and confirm nothing is truncated | Complete |  |  |  |
| 5 | Confirm the report identifies the audit and its status | Identification unambiguous |  |  |  |

**Attach the report as objective evidence.**

### TC-07-08 — Audit trail *(URS-AUD-08)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the audit history for the audit instance | Planning, team assignment, every response, findings and closure are recorded |  |  |  |
| 2 | Confirm a changed response shows its previous value | Old and new values present |  |  |  |
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
| TC-07-01 |  |  |  |  |  |
| TC-07-02 |  |  |  |  |  |
| TC-07-03 |  |  |  |  |  |
| TC-07-04 |  |  |  |  |  |
| TC-07-05 |  |  |  |  |  |
| TC-07-06 |  |  |  |  |  |
| TC-07-07 |  |  |  |  |  |
| TC-07-08 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
