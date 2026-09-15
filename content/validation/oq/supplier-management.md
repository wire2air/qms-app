---
id: oq-supplier-management
title: OQ-12 Supplier Management
sidebar_position: 12
description: Operational Qualification protocol for supplier registration, qualification scoring, certificate expiry, approved status and external participation.
keywords: [OQ, supplier, vendor qualification, approved supplier list, certificate, SCAR, test script]
---

# OQ-12 — Supplier Management

**Document ID:** VAL-OQ-12 · **Version:** 1.0 · **Module:** Supplier Management

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify that suppliers are registered and qualified against defined criteria, that
approval status is controlled and visible, that certificates are tracked to expiry, and
that where an external supplier contact participates in a quality record they can reach
that record **and nothing else**.

**TC-12-05 step 4 is the one to execute carefully.** External access that leaks other
tenants' or other suppliers' records is the highest-consequence failure in this module.

## 2. Requirements verified

URS-SUP-01 … URS-SUP-07. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §15.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | Supplier categories, certificate types and qualification criteria configured |  |
| 4 | Test accounts: **Supplier Manager**, **Supplier Contact (external)**, **No-Access** |  |
| 5 | A nonconformance or corrective action exists that can be routed to a supplier |  |

## 4. Test cases

### TC-12-01 — Registration *(URS-SUP-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Create a supplier record | The form opens |  |  |  |
| 2 | Attempt to save without the supplier name | Refused |  |  |  |
| 3 | Enter name, code, category, address and contact details | Saved |  |  |  |
| 4 | Attempt to create a second supplier with the same code | Refused, if uniqueness is enforced — record the behaviour |  |  |  |
| 5 | Add a supplier contact person with an email address | Contact saved |  |  |  |
| 6 | Confirm the supplier is retrievable by name and code | Search returns it |  |  |  |

**Supplier code used:** ______________________

### TC-12-02 — Qualification and scoring *(URS-SUP-02)* — **N/A in this system**

> **Read this before executing.** This product does not provide supplier
> qualification scoring. There is no qualification assessment record, no criteria
> set, no derived score, no rating band or threshold, no approver-of-record for a
> qualification decision, and no derived requalification due date. The module's own
> design notes state it has no formal qualification workflow.
>
> Two adjacent fields exist and are easy to mistake for this capability, so state
> plainly in your record that they are **not** it:
>
> | Field | What it actually is |
> | --- | --- |
> | **Risk level** | A self-declared Low / Medium / High selection. Not derived from any assessment, and nothing validates it. |
> | **Last evaluation date** | A free date field. Nothing computes it, nothing is stored behind it, and no requalification date is derived from it. |
>
> **Mark this test case N/A and record the justification.** Supplier qualification
> is performed outside this system — record where it is performed (your approved
> supplier SOP, a qualification questionnaire, a spreadsheet or a separate system),
> how the decision is approved, and how the outcome is traceable to the supplier
> record here. The fields above may be used to *transcribe* an outcome reached
> elsewhere; if you do that, say so, and treat them as transcription rather than
> as the system deriving anything.
>
> Do not record a deviation against the software for this test case — an absent
> capability, excluded with a written justification, is a legitimate validation
> outcome. An unexplained gap is not.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Confirm no qualification-assessment capability is offered in the system | Absent — recorded as N/A above |  |  |  |
| 2 | Record where supplier qualification IS performed, and how its outcome is approved | Documented |  |  |  |
| 3 | Where you transcribe an outcome onto the supplier record, confirm the value saves and is retrievable | Saved and retrievable |  |  |  |
| 4 | Confirm your procedure defines the requalification interval and how it is tracked | Documented — the system does not derive it |  |  |  |

### TC-12-03 — Certificates and expiry *(URS-SUP-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Add a certificate with a type, issue date and expiry date | Saved |  |  |  |
| 2 | Attach the certificate file | Attachment saves and reopens |  |  |  |
| 3 | Add a certificate with an expiry date already in the past | The record is identifiable as expired |  |  |  |
| 4 | Confirm expiring and expired certificates are surfaced to the responsible person | Alert, task or list flag present |  |  |  |
| 5 | Replace an expired certificate with a current one | The new certificate applies; the superseded one is retained in history |  |  |  |
| 6 | Confirm certificate changes appear in the audit trail | Entries present |  |  |  |

### TC-12-04 — Approved status *(URS-SUP-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Set the supplier to approved | Status saved and clearly displayed |  |  |  |
| 2 | Confirm the approved status is visible in the supplier list, not only on the detail page | Visible in the list |  |  |  |
| 3 | Filter the supplier list to approved suppliers only | Filter returns the expected set — this is the approved supplier list |  |  |  |
| 4 | Confirm the status change is attributed and dated | Attribution present |  |  |  |
| 5 | Where your process restricts selection to approved suppliers in downstream records, confirm the restriction | Behaviour recorded — if not enforced by the system, note the procedural control |  |  |  |

### TC-12-05 — External participation *(URS-SUP-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Route a supplier-facing quality record step to the supplier contact | The contact is assigned and notified |  |  |  |
| 2 | As **Supplier Contact**, sign in | Access granted with external-user scope |  |  |  |
| 3 | Confirm the assigned record is reachable and the step can be completed | Step is actionable |  |  |  |
| 4 | Attempt to reach **any other** record — another nonconformance, a document, the supplier list, the audit log — including by direct URL | Access is refused in every case; no other data is visible |  |  |  |
| 5 | Confirm administrative areas are entirely inaccessible | Not reachable |  |  |  |
| 6 | Complete the assigned step, with signature where required | Step completes; the action is attributed to the supplier contact |  |  |  |
| 7 | Confirm the internal team sees the supplier's response on the record | Response visible internally |  |  |  |
| 8 | Remove the supplier's assignment and confirm their access to the record ends | Access withdrawn |  |  |  |

### TC-12-06 — Blocking and requalification *(URS-SUP-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Block the supplier, and confirm only a holder of the reject capability can do so | Blocking is refused for a user without it |  |  |  |
| 2 | Block the supplier | Status becomes blocked, attributed to the person who changed it |  |  |  |
| 3 | Confirm the blocked status is shown wherever the supplier appears — list and record | Status is indicated on both |  |  |  |
| 4 | Requalify the supplier by returning it to approved | Status restored; only a holder of the approve capability can do it |  |  |  |
| 5 | Confirm the block and the requalification both remain in the audit trail | Both retained, with performer and timestamp |  |  |  |

> **No reason is captured, and blocking is not styled as an alert.** Two things
> this test case previously asked for do not exist, and are corrected above rather
> than left to fail on execution:
>
> - **There is no reason field** on a supplier status change — no column, no
>   prompt, no validation. Blocking cannot be refused for a missing reason,
>   because there is nothing to omit. If your procedure requires a documented
>   reason for blocking a supplier, that is a **procedural control** — record it
>   in your SOP and capture the reason outside the status change.
> - **Blocked is shown with the standard status badge**, the same treatment every
>   other status gets, not a banner or a danger colour. It is visible in the
>   supplier list and on the supplier record; it is not a distinct alert.
>
> Also note the system has **no status transition graph**: any status may be set
> from any other, subject only to the approve / reject capability checks above.
> Sequencing (for example "a blocked supplier must be requalified before it can
> be approved") is procedural, not enforced.

### TC-12-07 — Audit trail *(URS-SUP-07)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the supplier's audit history | Creation, field changes, qualification, certificates, status changes and sharing are recorded |  |  |  |
| 2 | Inspect an update entry | Old and new values shown |  |  |  |
| 3 | Confirm actions taken by the external contact are attributed to them by name | Attribution correct |  |  |  |
| 4 | Confirm each entry carries performer and timestamp | Present |  |  |  |
| 5 | Confirm no audit entry can be edited or deleted | None available |  |  |  |

## 5. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 6. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --- | --- | --- | --- | --- | --- |
| TC-12-01 |  |  |  |  |  |
| TC-12-02 |  |  |  |  |  |
| TC-12-03 |  |  |  |  |  |
| TC-12-04 |  |  |  |  |  |
| TC-12-05 |  |  |  |  |  |
| TC-12-06 |  |  |  |  |  |
| TC-12-07 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
