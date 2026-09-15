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
| 3 | Attempt to submit with the description empty | Refused |  |  |  |
| 4 | Complete the required fields, including the customer's name and contact, and submit | The complaint is created with its own number |  |  |  |
| 5 | Confirm the number is unique and follows the configured pattern | Number correct and unique |  |  |  |
| 6 | Confirm the new complaint's status is the configured initial status | Status correct |  |  |  |
| 7 | Confirm the recorder and the date received are captured | Both recorded |  |  |  |
| 8 | Confirm the complaint does **not** appear in the internal Quality Complaints register | Absent from the other module's list |  |  |  |

**Complaint number:** ______________________

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

### TC-17-03 — Acceptance and assignment *(URS-CCM-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Support Agent**, accept the complaint | The agent becomes the assignee and the status moves off the initial status |  |  |  |
| 2 | Confirm the acceptance is attributed to the accepting user with a timestamp | Attribution present |  |  |  |
| 3 | Assign the complaint to a second user | The assignee changes |  |  |  |
| 4 | Confirm the new assignee is notified or tasked, per your configuration | Record the observed behaviour |  |  |  |
| 5 | As the **No-Access** account, attempt to reach the complaint by direct URL | Refused; no complaint detail is disclosed |  |  |  |
| 6 | As the **No-Access** account, confirm no entry point to the module is offered | No navigation entry |  |  |  |

### TC-17-04 — Working the complaint *(URS-CCM-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record a reply to the customer | Saved and attributed |  |  |  |
| 2 | Move the complaint to the status your procedure uses while awaiting the customer | Status accepted |  |  |  |
| 3 | Record the customer's response and return the complaint to an active status | Status accepted |  |  |  |
| 4 | Record the resolution | Saved |  |  |  |
| 5 | Confirm each action is attributed to the person who performed it, with a timestamp | Attribution throughout |  |  |  |
| 6 | Where your procedure puts a complaint on hold, exercise that path | Status accepted; record the behaviour |  |  |  |

### TC-17-05 — Closure *(URS-CCM-05)*

Execute **5a or 5b** according to the require-closure-approval setting recorded in §3, and
mark the other N/A with that setting as the justification.

**5a — closure approval OFF**

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Close the complaint, recording the closure detail | Status becomes closed |  |  |  |
| 2 | Attempt to close it a second time | Refused |  |  |  |
| 3 | Attempt to edit the closed complaint | Editing prevented |  |  |  |

**5b — closure approval ON**

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Support Agent**, submit the complaint for closure | The complaint moves to awaiting approval, **not** to closed |  |  |  |
| 2 | Confirm the owner or approver is tasked | Task appears |  |  |  |
| 3 | As a user who is not the approver, attempt to approve the closure | Refused |  |  |  |
| 4 | As **Approver**, approve the closure and enter an **incorrect** signing credential | Approval refused; the complaint is not closed |  |  |  |
| 5 | Enter the correct credential | Status becomes closed; signature recorded |  |  |  |
| 6 | Inspect the signature | Signer, date/time and meaning present |  |  |  |
| 7 | Attempt to edit the closed complaint | Editing prevented |  |  |  |

| # | Test step (both paths) | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 8 | Where your procedure permits reopening, reopen the closed complaint | Reopening is permitted from closed and is recorded |  |  |  |
| 9 | Confirm the closure and the reopening both appear in the audit trail | Both entries present |  |  |  |

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

> Step 6 is the control that matters: conversion is **one-way and final**. Once a complaint
> has been escalated it cannot be moved on, reopened or closed — the quality record now
> carries the work. Confirm this rather than assuming it.

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
| 5 | Confirm a user without audit-trail permission cannot read or export the history | Refused |  |  |  |

## 5. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 6. Execution summary

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
