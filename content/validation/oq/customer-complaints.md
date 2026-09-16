---
id: oq-customer-complaints
title: OQ-17 Customer Complaint Management
sidebar_position: 17
description: Operational Qualification protocol for the customer-facing complaint management module — intake, acceptance, assignment, closure approval and conversion to a nonconformance.
keywords: [OQ, customer complaint, complaint management, support, ticket, closure approval, test script]
---

# OQ-17 — Customer Complaint Management

**Document ID:** VAL-OQ-17 · **Version:** 1.0 · **Module:** Complaint Management

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify that customer-facing complaints are received, acknowledged, assigned, worked and
closed under control, and that a complaint requiring quality investigation is escalated to
a nonconformance with the link between the two preserved.

**This is a different module from OQ-06.** The two are separate: OQ-06 covers **Quality
Complaints**, the internal QA-investigation record; this protocol covers **Complaint
Management**, the customer-facing intake and response module. They use different tables,
different permissions and different lifecycles, and are granted to users independently. If
your organisation uses only one of them, execute only the corresponding protocol and record
the exclusion in the Validation Master Plan.

**The escalation is the regulated join.** A customer complaint that reveals a product
problem must reach the quality system, and the trail between the two records is what an
inspector follows. TC-17-06 tests exactly that, and the conversion is one-way.

## 2. Requirements verified

URS-CCM-01 … URS-CCM-08. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §19.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | Complaint categories, priorities and sources are configured |  |
| 4 | The company setting **require closure approval** is set as your procedure requires — record the setting below |  |
| 5 | Test accounts: **Support Agent** (create + update), **Owner / Approver**, **No-Access** |  |
| 6 | E-signature credentials established for the approver, if closure approval is in use |  |
| 7 | At least one item/product exists, for the escalation test |  |

**Require closure approval:** ☐ On ☐ Off   **Recorded by:** ______________

> **Permission note — read before granting.** Every action in this module is gated on the
> `Complaint Management` module's permissions, granted separately from `Quality
> Complaints`. Note that **update permission alone is sufficient to close a ticket** in the
> standard configuration: a separate close capability exists in the permission catalogue
> but is **not enforced by default**. Do not rely on withholding it to prevent closure —
> if your procedure requires closure to be restricted to named people, use the closure
> approval setting (TC-17-05) instead, and record that decision here.

## 4. Test cases

### TC-17-01 — Intake *(URS-CCM-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Support Agent**, log a new customer complaint | The form opens |  |  |  |
| 2 | Attempt to submit with the subject empty | Refused |  |  |  |
| 3 | Clear the subject a second time, leaving the description populated, and attempt to submit | Refused — the subject is the mandatory field |  |  |  |
| 4 | Complete the required fields, including the customer's name and contact, and submit | The complaint is created with its own number |  |  |  |
| 5 | Confirm the number is unique and follows the per-company sequence | Number unique; sequence advances per company |  |  |  |
| 6 | Confirm the new complaint's status is **New** | Status is New |  |  |  |
| 7 | Confirm the recorder and the date the complaint was raised are captured | Both recorded |  |  |  |
| 8 | Confirm the complaint does **not** appear in the internal Quality Complaints register | Absent from the other module's list |  |  |  |

**Complaint number:** ______________________

> **Read this before recording step 3 as a pass.** Only the **subject** is mandatory at the
> server. A complaint saves successfully with the description empty, so do not record a
> refusal for a blank narrative — requiring one is a **procedural control, not a software
> one**. If your procedure requires a narrative at intake, state that in the SOP and check
> it on review.
>
> **Step 5 — the number format is fixed, not configured.** Complaint numbers are always
> `CC-` followed by six digits; there is no pattern setting to compare against, so confirm
> uniqueness and the per-company sequence instead. Uniqueness is genuinely enforced: each
> company carries its own counter row, and a unique index on company plus complaint number
> refuses a duplicate.
>
> **Step 6 — the initial status is not configurable.** A new complaint is always created as
> **New**, and the database refuses creation in any other state. Record **New** as the
> expected value rather than looking for a configured initial status.
>
> **Step 7 — there is no separate "date received" field for web intake.** The date captured
> is the record's creation timestamp. Tickets that arrive by email carry the date of the
> originating message instead. Record whichever applies to the intake route you exercised.
>
> Step 8 matters: the two modules are separate records. A customer complaint appearing in
> the QA register — or the reverse — would mean the modules are not properly separated.

### TC-17-02 — Classification and detail *(URS-CCM-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the category, priority and source | Saved |  |  |  |
| 2 | Record the product and lot reference where applicable | Saved |  |  |  |
| 3 | Record the customer's order or account reference | Saved |  |  |  |
| 4 | Attach a supporting file (correspondence or photograph) | Attachment uploads and reopens correctly |  |  |  |
| 5 | Reopen the record and confirm every value persisted | All values retained |  |  |  |

> **Read this before recording step 2.** The QMS fields — product, lot, quantity affected
> and reportability — are enabled by configuration, so not every installation shows all of
> them. Confirm with the administrator which of these fields are enabled in your
> configuration, and mark any absent field **N/A** rather than failing the step.

### TC-17-03 — Acceptance and assignment *(URS-CCM-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Support Agent**, accept the complaint | The agent becomes the assignee and the status moves to **In Progress** |  |  |  |
| 2 | Confirm the acceptance is attributed to the accepting user with a timestamp | Attribution present |  |  |  |
| 3 | Assign the complaint to a second user | The assignee changes |  |  |  |
| 4 | Confirm the new assignee is notified or tasked, per your configuration | Record the observed behaviour |  |  |  |
| 5 | As the **No-Access** account, attempt to reach the complaint by direct URL | Refused; no complaint detail is disclosed |  |  |  |
| 6 | As the **No-Access** account, confirm no entry point to the module is offered | No navigation entry |  |  |  |

> **Read this before recording steps 1 and 4.** Accept moves the complaint to **In
> Progress** — not to "Assigned". The **Assigned** status is what results from assigning
> the complaint to *another* user, which is step 3. Where a QA-review workflow is
> configured, Accept also starts that workflow; record the workflow's appearance as part of
> step 1.
>
> For step 4, **no notification is sent when a user assigns a complaint to themselves** —
> which is what Accept does. Expect a notification only for the assignment to a second user
> in step 3, and record the self-assignment case as no notification rather than as a
> failure.

### TC-17-04 — Working the complaint *(URS-CCM-04)*

> **Configure this before execution.** A public reply requires a **customer email address**
> on the complaint. Without one the reply is refused, so confirm the test complaint carries
> a customer email before starting step 1.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record a reply to the customer | Saved and attributed |  |  |  |
| 2 | Confirm the public reply set the awaiting-customer status | Status becomes **Waiting on Customer** automatically |  |  |  |
| 3 | Record the customer's response and confirm the complaint returns to an active status | Status returns to **In Progress** |  |  |  |
| 4 | Record the resolution | Saved |  |  |  |
| 5 | Confirm each action is attributed to the person who performed it, with a timestamp | Attribution throughout |  |  |  |
| 6 | Where your procedure puts a complaint on hold, exercise that path | Status accepted; record the behaviour |  |  |  |

> **Read this before recording steps 2 and 3.** These status moves are automatic, not
> manual. Posting a **public reply** sets **Waiting on Customer** by itself, and an inbound
> **customer reply** returns the ticket to **In Progress** (a customer reply to a closed
> complaint reopens it to **Open**). Confirm the status the system set rather than setting
> it by hand. **Internal notes and QA notes never change the status** — use a public reply
> to exercise these steps.

### TC-17-05 — Closure *(URS-CCM-05)*

Execute **5a or 5b** according to the require-closure-approval setting recorded in §3, and
mark the other N/A with that setting as the justification.

**5a — closure approval OFF**

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Close the complaint, recording the closure detail | Status becomes closed |  |  |  |
| 2 | Attempt to close it a second time | Refused |  |  |  |
| 3 | Attempt to edit the closed complaint | Editing is prevented **in the interface** |  |  |  |

> **Read this before recording step 3 as a pass.** The control is **interface-only**. A
> closed complaint withdraws its edit controls and shows a read-only banner, so step 3 will
> pass exactly as written for the interface — record that observation.
>
> Do not conclude that the record is sealed. A user holding **update** permission is not
> refused a direct API edit of a closed complaint's **descriptive fields**. What *is*
> refused at the database is any **status change out of CLOSED**, and any such descriptive
> edit **is captured in the audit trail**. If your organisation's procedure requires closed
> records to be technically immutable, raise a **deviation** and control the gap
> procedurally until the server enforces it.

**5b — closure approval ON**

> **Confirm this before executing 5b.** Closure approval is driven by the company setting
> **require closure approval**, which is **off unless configured**. With it off, Close
> writes the complaint straight to CLOSED and the 5b path **has no surface to test** — mark
> 5b **N/A** and cite the setting as the justification. Execute 5b only where the setting
> is on and recorded as such in §3.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Support Agent**, submit the complaint for closure | The complaint moves to awaiting approval, **not** to closed |  |  |  |
| 2 | Confirm the complaint appears in the pending-approval list | The complaint is listed as pending approval |  |  |  |
| 3 | As a user **without** Complaint Management approve permission, attempt to approve the closure | Refused |  |  |  |
| 4 | As **Approver**, approve the closure and enter an **incorrect** signing credential | Approval refused; the complaint is not closed |  |  |  |
| 5 | Enter the correct credential | Status becomes closed; the approver's identity is verified by PIN |  |  |  |
| 6 | Inspect the complaint's **audit trail** entry for the approval | Signer, date/time and method present |  |  |  |
| 7 | Attempt to edit the closed complaint | Editing is prevented **in the interface** |  |  |  |

> **Read this before recording steps 2, 3 and 6.**
>
> **Step 2 — no task or notification is raised** when a complaint is submitted for closure
> approval. It appears in a **pending-approval list** instead, which is what to confirm. Do
> not wait for a task to arrive.
>
> **Step 3 — approval is gated on the `approve` permission, not on named ownership.** The
> owner column was removed from the table, so **any holder of Complaint Management approve
> permission can approve** a closure. Restricting approval to a named individual is
> therefore done by **granting that permission narrowly** — record who holds it as part of
> this step.
>
> **Steps 5–6 — the signature evidence is the audit trail.** The approver's identity *is*
> verified by PIN, and the event *is* recorded with signer, timestamp and method — but in
> the **complaint's audit trail**, not in the system-wide signature register, because
> customer complaints have no subject column there. Inspect the audit trail as the
> signature evidence; an empty signature register is the expected observation, not a
> failure.
>
> Step 7 is interface-only for the same reason as 5a step 3 — see that note.

| # | Test step (both paths) | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 8 | Where your procedure permits reopening, reopen the closed complaint | Reopening is permitted from closed and is recorded; the complaint returns to **Open**, unassigned |  |  |  |
| 9 | Confirm the closure and the reopening both appear in the audit trail | Both entries present |  |  |  |

> **Read this before recording step 8.** Reopening is offered only from **Closed** or
> **Resolved**, and it returns the complaint to **Open**. It also **deliberately clears the
> assignee**, so the complaint comes back **unassigned** and must be reassigned to be
> worked. This is the designed behaviour — record it as a pass, not a defect.

### TC-17-06 — Escalation to a nonconformance *(URS-CCM-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | On a complaint that warrants quality investigation, initiate conversion to a nonconformance | The nonconformance creation flow opens, pre-filled from the complaint |  |  |  |
| 2 | Complete the required fields and create the nonconformance | The NC is created with its own number |  |  |  |
| 3 | Confirm the complaint shows the linked nonconformance | Link visible on the complaint |  |  |  |
| 4 | Confirm the nonconformance shows the originating complaint | Link visible on the NC |  |  |  |
| 5 | Confirm the complaint's status reflects that it was escalated | Status updated |  |  |  |
| 6 | Attempt any further status change on the escalated complaint | **Refused — escalation is terminal** |  |  |  |
| 7 | Confirm the conversion appears in the audit trail of the complaint | Entry present |  |  |  |

**Complaint number:** ______________  **Nonconformance number:** ______________

> Step 6 is the control that matters: conversion is **one-way and final**, and it is
> enforced at the **database** — the converted state has no outgoing edge, so the complaint
> cannot be moved on, reopened or closed. The quality record now carries the work. Confirm
> this rather than assuming it.
>
> Note the limit of what is sealed: the **status** cannot change, but the complaint's
> **descriptive fields are not technically frozen** — the same position as a closed
> complaint, described in the TC-17-05 note. The audit trail captures any such edit.

### TC-17-07 — Printed record *(URS-CCM-07)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Print the complaint | A complete, legible copy is produced |  |  |  |
| 2 | Confirm the printout includes the customer detail, the narrative, classification, correspondence and the resolution | All sections present |  |  |  |
| 3 | Confirm the printout shows status and print provenance | Present |  |  |  |
| 4 | Save as PDF and confirm nothing is truncated | Complete |  |  |  |

**Attach the printout as objective evidence.**

### TC-17-08 — Audit trail *(URS-CCM-08)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the complaint's audit history | Intake, acceptance, assignment, replies, closure and any escalation are all recorded |  |  |  |
| 2 | Inspect an update entry | Old and new values shown |  |  |  |
| 3 | Confirm each entry carries performer and timestamp | Present |  |  |  |
| 4 | Confirm no audit entry can be edited or deleted | None available |  |  |  |
| 5 | Confirm a user without export permission is refused the export action, and that a permitted export is recorded in the audit trail | Export action refused; the permitted export appears in the audit trail |  |  |  |

> **Read this before recording step 5 as a pass.** The export permission gate is real — a
> user without it is refused the export action. But the export **file is generated in the
> browser** from data already synced to it; the endpoint's job is to **record the export in
> the audit trail**, not to produce the file. So a user who can read complaints can still
> copy that data locally by other means. **The control this step verifies is the audit
> record of an export, not the prevention of data leaving.** If your procedure relies on
> preventing extraction, that cannot be demonstrated here — control it procedurally and
> through the read permission itself.

## 5. Controls this protocol does not test

The behaviours below are present in the product but are **not exercised by any test case
above**. A risk assessment may require the organisation to cover them with its own test
cases or procedural controls.

- **Automatic routing rules** that assign tickets to a user or team on intake.
- **SLA target stamping and breach flagging** on complaints.
- **Email intake channels** and the verification round-trip that confirms an address.
- **Spam marking**, which removes a complaint from the register.
- **Bulk soft-delete** of complaints.
- **The public customer status page**, whose HMAC-token access allows an unauthenticated
  reply that can reopen a closed complaint.
- **The auto-close worker**, which closes resolved complaints with no human action.

## 6. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 7. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --- | --- | --- | --- | --- | --- |
| TC-17-01 |  |  |  |  |  |
| TC-17-02 |  |  |  |  |  |
| TC-17-03 |  |  |  |  |  |
| TC-17-04 |  |  |  |  |  |
| TC-17-05 |  |  |  |  |  |
| TC-17-06 |  |  |  |  |  |
| TC-17-07 |  |  |  |  |  |
| TC-17-08 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
