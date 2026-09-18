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
| 7 | The Change Control workflow template defines at least one send-back target and at least one approval step requiring an electronic signature |  |
| 8 | Audit Trail read permission — and export, if the export step is exercised — granted to the executing account |  |

## 4. Test cases

### TC-05-01 — Raising a change request *(URS-CHG-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Requester**, start a new change request | The form opens |  |  |  |
| 2 | Attempt to submit with the title empty | Refused |  |  |  |
| 3 | Attempt to submit without site, department, change type or owner | Refused in each case |  |  |  |
| 4 | Attempt to submit without a description of the proposed change | Refused, if configured as required — record the observed behaviour |  |  |  |
| 5 | Complete all required fields and select a workflow; submit | The change request is created in **Draft** and carries **no change-request number yet** |  |  |  |
| 6 | After the change request is opened in TC-05-03, confirm the assigned number is unique and follows the configured pattern | Number correct |  |  |  |

> **Read this before recording steps 2–4 as a pass.** These steps verify the interface's
> field validation. Title, change type, priority, site, department, owner and initiation
> date are additionally enforced by the server; the description and the workflow selection
> are enforced by the interface only.
>
> **Read this before recording steps 5 and 6.** Numbering is deferred by design. A change
> request is created in Draft with no number, and the number is minted when the change
> request is **opened** (submitted) in TC-05-03 — so that a deleted draft never burns a
> number and the register has no gaps. Do not record the absence of a number at step 5 as a
> deviation, and execute step 6 only after opening the record. Capture the number in
> TC-05-03.

### TC-05-02 — Impact and risk assessment *(URS-CHG-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the reason and justification for the change | Saved |  |  |  |
| 2 | Record the impact assessment where your configuration captures it — see the note below for what the record itself holds | Saved and retrievable |  |  |  |
| 3 | Record whether the change is regulatory-notifiable, where your configuration captures it | Saved |  |  |  |
| 4 | Record the risk assessment or link to a risk record | Saved or linked |  |  |  |
| 5 | Confirm all assessment content is visible to approvers before they approve | Content available at the approval step |  |  |  |

> **Read this before recording step 2.** The five impact categories are not dedicated
> fields on the change request. The record itself provides Description, Reason for Change,
> Business Justification, Classification, Change Nature (planned or emergency), Duration
> (temporary or permanent), Regulatory Impact, and Customer Notification Required. Affected
> products, documents, equipment and training are captured as **linked records**
> (TC-05-04) and/or as fields on the workflow's impact-assessment step. Record the
> assessment wherever your configuration captures it, and note which surface you used —
> the absence of dedicated fields is not a deviation.
>
> **Execute step 5 as the Approver account**, while it holds the active approval task —
> not as an administrator, whose visibility does not demonstrate the control. The
> approver's visibility derives from the workflow assignment. Confirm both the record's
> assessment fields and any linked records or step form data are readable at that point.
> An approver who cannot see the impact assessment cannot make an informed approval.
> Step 5 is the one that proves the process is sound rather than merely present.

### TC-05-03 — Approval before implementation *(URS-CHG-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Start the change request and confirm the first approval step activates | Workflow runs; approver is tasked |  |  |  |
| 2 | As a user who is not the assignee, attempt to approve | Refused |  |  |  |
| 3 | As **Approver**, reject the change with a comment | The change request returns to **Draft** for correction; the rejection and its comment are recorded in the workflow history and the audit trail |  |  |  |
| 4 | On a second change request, request changes with a comment | The request returns to the owner with the comment |  |  |  |
| 5 | Revise and resubmit | The workflow resumes at the configured point |  |  |  |
| 6 | Approve with an **incorrect** signing credential, where signature is required | Refused; the approval is not recorded |  |  |  |
| 7 | Approve with the correct credential | Approval recorded with name, date/time and meaning |  |  |  |
| 8 | With an approval step still open, attempt to close the change request | Refused, naming the number of steps still open |  |  |  |

> **Configure this before executing steps 4 and 5.** The workflow template must define a
> **send-back target** for the approval step; an unconfigured target is refused, and that
> refusal is a configuration fault rather than a system defect.
>
> **Read this before recording step 2 as a pass.** Use a user who holds **neither** the
> approval action on this record **nor** the assignment. A user who does hold the approve
> permission at a covering scope may approve deliberately as a recorded take-over, with
> the assignee notified — that is designed behaviour, not a failure. If the account you
> chose approves successfully, check its permissions before raising a deviation.
>
> **Read this before recording steps 3 to 5.** There is no separate Rejected status. The
> vocabulary is **Draft, Open, Closed, Cancelled**. On send-back or rejection the change
> request returns to **Draft** for correction, and the run does not stop permanently —
> resubmission is via **Open Change Request**, and the record retains its original number.
> Permanent abandonment is **Cancel**, which is electronically signed and requires a
> reason. Record the return to Draft as the expected outcome.
>
> **Read this before recording step 8.** Implementation is tracked as **workflow steps**,
> not as a record status, so there is no separate implemented state to reach early. The
> control that matters is the closure gate: closure is refused while any step remains
> open, and the refusal names how many are outstanding.

### TC-05-04 — Linking affected records *(URS-CHG-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Link a controlled document to the change request | Link created and visible |  |  |  |
| 2 | Link a CAPA to the change request | Link created and visible |  |  |  |
| 3 | Confirm the link is visible from the linked record as well | Bidirectional visibility |  |  |  |
| 4 | Confirm links are recorded in the audit trail | Entries present |  |  |  |
| 5 | Open a linked record from the change request | Navigation reaches the correct record |  |  |  |

> **Read this before recording step 2.** Linked-item references are stored as a type and
> id pair and are **not validated against the target record**. Confirm the link resolves
> to the intended record when you open it in step 5, rather than trusting the link's
> presence on the record.

### TC-05-05 — Implementation and closure *(URS-CHG-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Complete the implementation steps defined by the workflow | Steps complete and are attributed |  |  |  |
| 2 | Attempt to close the change with a step still open | Refused |  |  |  |
| 3 | Record implementation evidence or completion notes | Saved |  |  |  |
| 4 | Close the change request, with signature where required | Status becomes closed; signature recorded |  |  |  |
| 5 | Attempt to edit the closed record | Editing is prevented **in the interface** — a read-only banner appears and the fields lock |  |  |  |
| 6 | Print the closed change request | Complete, legible copy with status and approvals |  |  |  |

> **Read this before recording step 2 as a pass.** The closure gate is enforced by the
> server, with one designed exception: a deferred **effectiveness-check delay step** may
> remain scheduled after closure. Any other open step must refuse closure. Record which
> steps were outstanding.
>
> **Read this before recording step 5 as a pass.** The lock is **interface-only**. The
> database prevents further status transitions on a closed record, but not writes to its
> other columns — so the read-only banner and locked fields are the whole of the control
> at this step. Record the observed interface behaviour, and see *Controls this protocol
> does not test* for the data-interface boundary.

### TC-05-06 — Audit trail *(URS-CHG-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the change request audit history | Creation, assessment entries, approvals, rejections, links, implementation and closure are all recorded |  |  |  |
| 2 | Inspect an update entry | Old and new values shown |  |  |  |
| 3 | Confirm the rejection from TC-05-03 is recorded with its comment | Present |  |  |  |
| 4 | Confirm every entry carries performer and timestamp | Present |  |  |  |
| 5 | Confirm no audit entry can be edited or deleted | None available |  |  |  |

> **Read this before recording step 5 as a pass.** Audit entries cannot be edited or
> deleted by **anyone**, and this is enforced at the database rather than only in the
> interface — the absence of a control in the interface is not the whole of the evidence.
> If the export is exercised, the **Audit Trail export** permission is required.

## 5. Controls this protocol does not test

The behaviours below are present in the product but are **not exercised by any test case
above**. A risk assessment may require the organisation to cover them with its own test
cases or procedural controls.

- **Company scoping of the owner and assignees** — the change request's owner and every
  workflow assignee are verified to belong to the same company, a multi-tenancy seal.
- **Parent-step ownership** — a child step's parent must belong to this record's own
  workflow instance, so a step id from another record is refused.
- **Lifecycle enforcement at the data layer** — the record's lifecycle cannot be driven
  through the application's data interface: the database refuses any status change from an
  untrusted caller and permits creation only in **Draft**, which is what makes the closure
  gate and the electronic signature unbypassable.
- **Soft delete permission** — a soft delete requires the delete permission at the
  database.
- **Attributed take-over** — a deliberate take-over of another user's step is attributed
  to the actual actor and notified to the assignee.
- **Post-closure reopening** — a "not effective" effectiveness verdict can reopen a closed
  change request, a post-closure loop this protocol does not cover.

## 6. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 7. Execution summary

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
