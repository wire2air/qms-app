---
id: oq-capa
title: OQ-04 CAPA
sidebar_position: 4
description: Operational Qualification protocol for corrective and preventive action — creation, investigation, closure, effectiveness verification and cancellation.
keywords: [OQ, CAPA, corrective action, preventive action, effectiveness check, closure, test script]
---

# OQ-04 — CAPA

**Document ID:** VAL-OQ-04 · **Version:** 1.0 · **Module:** CAPA

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify the CAPA lifecycle end to end: that a CAPA is raised with the required
classification, becomes a permanent record when started, is investigated through
controlled workflow steps, cannot be closed with work outstanding, and schedules and
records an effectiveness check that closes the loop.

The effectiveness check is the test that most matters. A CAPA process that cannot
demonstrate the fix worked is not a CAPA process.

## 2. Requirements verified

URS-CAP-01 … URS-CAP-10. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §7.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | CAPA types, sources and priorities are configured |  |
| 4 | A published workflow template exists for the CAPA module |  |
| 5 | Test accounts: **CAPA Owner**, **Reviewer**, **No-Access** |  |
| 6 | E-signature credentials established for the owner |  |
| 7 | At least one nonconformance exists, for the linking test |  |

## 4. Test cases

### TC-04-01 — Creation with mandatory classification *(URS-CAP-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **CAPA Owner**, start creating a CAPA | The form opens |  |  |  |
| 2 | Attempt to submit with the title empty | Refused |  |  |  |
| 3 | Attempt to submit without site, department, CAPA type, source, priority or owner | Refused in each case, identifying the missing field |  |  |  |
| 4 | Complete all required fields, including the problem statement, and select a workflow | Fields accepted |  |  |  |
| 5 | Submit | The CAPA is created in **Draft** with its own number |  |  |  |
| 6 | Confirm the CAPA number follows the configured pattern and is unique | Number correct and unique |  |  |  |

**CAPA number created:** ______________________

### TC-04-02 — Starting the CAPA *(URS-CAP-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | While in Draft, amend the problem statement and confirm it saves | Editable in draft |  |  |  |
| 2 | Delete a **separate** draft CAPA | Deletion permitted while in draft |  |  |  |
| 3 | As a user other than the owner, attempt to start the CAPA | Unavailable or refused |  |  |  |
| 4 | As **CAPA Owner**, start the CAPA | A confirmation explains the record becomes permanent |  |  |  |
| 5 | Confirm | Status becomes **Open**; the first workflow step activates |  |  |  |
| 6 | Attempt to delete the CAPA now | Refused |  |  |  |
| 7 | Confirm the assigned reviewer is tasked | Task appears |  |  |  |

### TC-04-03 — Investigation through workflow steps *(URS-CAP-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Reviewer**, open the active step | Step detail and any form fields are shown |  |  |  |
| 2 | Attempt to complete the step with a required form field empty | Refused |  |  |  |
| 3 | Complete the required fields and the step | Step completes; the next activates |  |  |  |
| 4 | Confirm the entered investigation content is retained on the record | Content persists and is retrievable |  |  |  |
| 5 | Where the workflow permits, add a sub-task with its own assignee and due date | Sub-task is created and assigned |  |  |  |
| 6 | Complete the sub-task | Sub-task completes and is recorded |  |  |  |
| 7 | Confirm each action records who performed it and when | Attribution present throughout |  |  |  |
| 8 | Send a step back for rework and confirm it routes to the expected person | Send-back routes correctly with the comment |  |  |  |

### TC-04-04 — Closure is gated on completion *(URS-CAP-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | With at least one workflow step still open, attempt to close the CAPA | Closure is refused, and the outstanding work is identified to the user |  |  |  |
| 2 | With a sub-task open but its parent step complete, attempt to close | Closure is refused |  |  |  |
| 3 | Complete or cancel all remaining steps and sub-tasks | No open work remains |  |  |  |
| 4 | Confirm closure is now offered | Closure available |  |  |  |

### TC-04-05 — Closure with signature and effectiveness scheduling *(URS-CAP-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Initiate closure | The dialog requires an effectiveness check date |  |  |  |
| 2 | Select a preset interval and confirm the resulting date is calculated correctly from the closure date | Date correct |  |  |  |
| 3 | Enter closure comments | Accepted |  |  |  |
| 4 | Enter an **incorrect** signing credential | Closure refused; the CAPA remains open |  |  |  |
| 5 | Enter the correct credential | Status becomes **Closed**; signature recorded |  |  |  |
| 6 | Inspect the signature | Name, date/time and meaning present |  |  |  |
| 7 | Confirm an effectiveness check has been scheduled for the chosen date | Check exists and is pending |  |  |  |
| 8 | Attempt to edit the closed CAPA | Editing prevented |  |  |  |

**Effectiveness check date set:** ______________

### TC-04-06 — Effectiveness verification *(URS-CAP-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | On the effectiveness check due date, confirm a verification task is raised to the responsible person | Task appears for the CAPA owner |  |  |  |
| 2 | Open the check and attempt to complete it without an outcome | Refused |  |  |  |
| 3 | Attempt to complete it without verification notes | Refused; notes are required |  |  |  |
| 4 | Select outcome **Effective**, enter notes, and complete with signature | The check is recorded as effective and signed |  |  |  |
| 5 | Inspect the signature and notes | Both retained on the record |  |  |  |
| 6 | Confirm the completed check appears in the check history | Present in history |  |  |  |

### TC-04-07 — Not-effective outcome *(URS-CAP-07)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | On a second closed CAPA, complete its effectiveness check with outcome **Not Effective** and notes | Outcome recorded |  |  |  |
| 2 | Confirm the record makes the not-effective outcome plainly visible | Outcome is not buried; it is evident on the record |  |  |  |
| 3 | Renew the check with a new due date, where supported | A further check is scheduled |  |  |  |
| 4 | Confirm the earlier not-effective result remains in the history and is not overwritten | Original outcome retained |  |  |  |
| 5 | Confirm your procedure's follow-up action can be initiated (for example a new CAPA or reopening) | Follow-up path exists — record what it is |  |  |  |

### TC-04-08 — Cancellation *(URS-CAP-08)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | On a separate started CAPA, initiate cancellation without a reason | Refused |  |  |  |
| 2 | Enter a reason and cancel with signature | Status becomes **Cancelled**; reason and signature recorded |  |  |  |
| 3 | Confirm in-progress workflow steps are stopped | Steps no longer actionable |  |  |  |
| 4 | Confirm the cancelled CAPA remains retrievable | Readable, clearly not active |  |  |  |

### TC-04-09 — Linking to nonconformances *(URS-CAP-09)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | From an existing nonconformance, create a CAPA | The CAPA is created pre-linked to that NC |  |  |  |
| 2 | Confirm the link is visible from both records | Link on the NC and on the CAPA |  |  |  |
| 3 | From the CAPA, link a **second, existing** nonconformance | The additional link is created |  |  |  |
| 4 | Confirm both nonconformances now show on the CAPA | Many-to-one linking works |  |  |  |
| 5 | Confirm an already-linked NC is not offered again for linking | No duplicate link is possible |  |  |  |
| 6 | Confirm the link creation is recorded in the audit trail | Entry present |  |  |  |

### TC-04-10 — Audit trail *(URS-CAP-10)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the CAPA audit history | Creation, start, every workflow action, sub-tasks, closure, effectiveness checks and links are all recorded |  |  |  |
| 2 | Inspect an update entry | Old and new values shown |  |  |  |
| 3 | Confirm every entry carries performer and timestamp | Present |  |  |  |
| 4 | Confirm no audit entry can be edited or deleted | None available |  |  |  |
| 5 | Print the CAPA and confirm the signatures and history are included | Complete copy produced |  |  |  |

## 5. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 6. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --- | --- | --- | --- | --- | --- |
| TC-04-01 |  |  |  |  |  |
| TC-04-02 |  |  |  |  |  |
| TC-04-03 |  |  |  |  |  |
| TC-04-04 |  |  |  |  |  |
| TC-04-05 |  |  |  |  |  |
| TC-04-06 |  |  |  |  |  |
| TC-04-07 |  |  |  |  |  |
| TC-04-08 |  |  |  |  |  |
| TC-04-09 |  |  |  |  |  |
| TC-04-10 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
