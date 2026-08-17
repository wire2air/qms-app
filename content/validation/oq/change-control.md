---
id: oq-change-control
title: OQ-05 Change Control
sidebar_position: 5
description: Operational Qualification protocol for raising, assessing, approving, implementing and closing controlled changes.
keywords: [OQ, change control, change request, impact assessment, approval, test script]
---

# OQ-05 — Change Control

**Document ID:** VAL-OQ-05 · **Version:** 1.0 · **Module:** Change Control

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify that changes are proposed, assessed for impact, approved before implementation,
linked to the records they affect, and closed with evidence — and that no change can be
implemented and closed without passing its approval gate.

## 2. Requirements verified

URS-CHG-01 … URS-CHG-06. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §8.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | Change types and priorities configured |  |
| 4 | A published workflow template exists for the Change Control module |  |
| 5 | Test accounts: **Requester / Owner**, **Approver**, **No-Access** |  |
| 6 | At least one controlled document and one CAPA exist, for linking |  |

## 4. Test cases

### TC-05-01 — Raising a change request *(URS-CHG-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Requester**, start a new change request | The form opens |  |  |  |
| 2 | Attempt to submit with the title empty | Refused |  |  |  |
| 3 | Attempt to submit without site, department, change type or owner | Refused in each case |  |  |  |
| 4 | Attempt to submit without a description of the proposed change | Refused, if configured as required — record the observed behaviour |  |  |  |
| 5 | Complete all required fields and select a workflow; submit | The change request is created in draft with its own number |  |  |  |
| 6 | Confirm the number is unique and follows the configured pattern | Number correct |  |  |  |

**Change request number:** ______________________

### TC-05-02 — Impact and risk assessment *(URS-CHG-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the reason and justification for the change | Saved |  |  |  |
| 2 | Record the impact assessment — affected products, processes, documents, equipment and training | Saved and retrievable |  |  |  |
| 3 | Record whether the change is regulatory-notifiable, where your configuration captures it | Saved |  |  |  |
| 4 | Record the risk assessment or link to a risk record | Saved or linked |  |  |  |
| 5 | Confirm all assessment content is visible to approvers before they approve | Content available at the approval step |  |  |  |

> An approver who cannot see the impact assessment cannot make an informed approval.
> Step 5 is the one that proves the process is sound rather than merely present.

### TC-05-03 — Approval before implementation *(URS-CHG-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Start the change request and confirm the first approval step activates | Workflow runs; approver is tasked |  |  |  |
| 2 | As a user who is not the assignee, attempt to approve | Refused |  |  |  |
| 3 | As **Approver**, reject the change with a comment | The run stops; the change is marked rejected and the comment is recorded |  |  |  |
| 4 | On a second change request, request changes with a comment | The request returns to the owner with the comment |  |  |  |
| 5 | Revise and resubmit | The workflow resumes at the configured point |  |  |  |
| 6 | Approve with an **incorrect** signing credential, where signature is required | Refused; the approval is not recorded |  |  |  |
| 7 | Approve with the correct credential | Approval recorded with name, date/time and meaning |  |  |  |
| 8 | Confirm no path existed to mark the change implemented before approval | Sequence enforced |  |  |  |

### TC-05-04 — Linking affected records *(URS-CHG-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Link a controlled document to the change request | Link created and visible |  |  |  |
| 2 | Link a CAPA to the change request | Link created and visible |  |  |  |
| 3 | Confirm the link is visible from the linked record as well | Bidirectional visibility |  |  |  |
| 4 | Confirm links are recorded in the audit trail | Entries present |  |  |  |
| 5 | Open a linked record from the change request | Navigation reaches the correct record |  |  |  |

### TC-05-05 — Implementation and closure *(URS-CHG-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Complete the implementation steps defined by the workflow | Steps complete and are attributed |  |  |  |
| 2 | Attempt to close the change with a step still open | Refused |  |  |  |
| 3 | Record implementation evidence or completion notes | Saved |  |  |  |
| 4 | Close the change request, with signature where required | Status becomes closed; signature recorded |  |  |  |
| 5 | Attempt to edit the closed record | Editing prevented |  |  |  |
| 6 | Print the closed change request | Complete, legible copy with status and approvals |  |  |  |

### TC-05-06 — Audit trail *(URS-CHG-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the change request audit history | Creation, assessment entries, approvals, rejections, links, implementation and closure are all recorded |  |  |  |
| 2 | Inspect an update entry | Old and new values shown |  |  |  |
| 3 | Confirm the rejection from TC-05-03 is recorded with its comment | Present |  |  |  |
| 4 | Confirm every entry carries performer and timestamp | Present |  |  |  |
| 5 | Confirm no audit entry can be edited or deleted | None available |  |  |  |

## 5. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 6. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --- | --- | --- | --- | --- | --- |
| TC-05-01 |  |  |  |  |  |
| TC-05-02 |  |  |  |  |  |
| TC-05-03 |  |  |  |  |  |
| TC-05-04 |  |  |  |  |  |
| TC-05-05 |  |  |  |  |  |
| TC-05-06 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
