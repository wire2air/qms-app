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

### TC-12-02 — Qualification and scoring *(URS-SUP-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Initiate a supplier qualification assessment | Assessment created |  |  |  |
| 2 | Complete the qualification criteria | Responses saved |  |  |  |
| 3 | Confirm the resulting score is derived from the responses | Score matches manual calculation |  |  |  |
| 4 | Confirm the score maps to the correct rating band per your criteria | Band correct |  |  |  |
| 5 | Test a boundary case — a score exactly at a band threshold | Band assignment matches the SOP |  |  |  |
| 6 | Record the qualification decision and its approver | Decision and approver recorded |  |  |  |
| 7 | Confirm the assessment and its date are retained on the supplier record | Retained |  |  |  |
| 8 | Confirm the requalification due date is derived per your policy | Date correct |  |  |  |

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
| 1 | Block the supplier without a reason | Refused, if a reason is required — record the behaviour |  |  |  |
| 2 | Block with a reason | Status becomes blocked; reason recorded and attributed |  |  |  |
| 3 | Confirm the blocked status is prominent wherever the supplier appears | Clearly indicated |  |  |  |
| 4 | Requalify the supplier | Status restored; the requalification is recorded |  |  |  |
| 5 | Confirm the block and the requalification both remain in history | Both retained |  |  |  |

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
