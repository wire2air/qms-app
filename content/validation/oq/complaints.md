---
id: oq-complaints
title: OQ-06 Complaints
sidebar_position: 6
description: Operational Qualification protocol for complaint intake, QA review, reportability assessment, escalation to nonconformance and closure.
keywords: [OQ, complaint, customer complaint, QA review, reportability, escalation, test script]
---

# OQ-06 — Complaints

**Document ID:** VAL-OQ-06 · **Version:** 1.0 · **Module:** Complaints

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify that complaints are captured completely, reviewed by QA with a recorded
decision on whether investigation is required, assessed for regulatory reportability, and
escalated to a nonconformance where warranted — with the link between the two preserved.

For medical-device manufacturers, complaint handling is a specifically inspected process
(21 CFR 820.198). The decision *not* to investigate is as regulated as the decision to
investigate, and must carry a justification. TC-06-03 tests exactly that.

## 2. Requirements verified

URS-CMP-01 … URS-CMP-08. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §9.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | Complaint categories, types, severities and sources configured |  |
| 4 | At least one item/product with a lot reference exists |  |
| 5 | Test accounts: **Intake User**, **QA Reviewer**, **No-Access** |  |
| 6 | A published workflow template exists for the Complaint module, if workflow is used |  |

## 4. Test cases

### TC-06-01 — Intake with mandatory detail *(URS-CMP-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Intake User**, start logging a complaint | The form opens |  |  |  |
| 2 | Attempt to submit with the subject empty | Refused |  |  |  |
| 3 | Attempt to submit with the description empty | Refused — the complaint narrative is mandatory |  |  |  |
| 4 | Attempt to submit without the product | Refused |  |  |  |
| 5 | Attempt to submit without the lot / batch reference | Refused |  |  |  |
| 6 | Complete all required fields and submit | The complaint is created with its own number |  |  |  |
| 7 | Confirm the number is unique and follows the configured pattern | Number correct |  |  |  |
| 8 | Confirm the date received and the recorder are captured | Both recorded |  |  |  |

**Complaint number:** ______________________

### TC-06-02 — Classification and product detail *(URS-CMP-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the complaint category, type and severity | Saved |  |  |  |
| 2 | Record the product, lot, quantity affected and order reference | Saved |  |  |  |
| 3 | Record customer name and contact detail | Saved |  |  |  |
| 4 | Record whether samples were received | The Yes/No value is captured and displayed |  |  |  |
| 5 | Set the safety-issue and potential-recall flags | Flags save and are prominent on the record |  |  |  |
| 6 | Attach a supporting file (photograph or correspondence) | Attachment uploads and reopens correctly |  |  |  |

### TC-06-03 — QA review and investigation decision *(URS-CMP-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **QA Reviewer**, open the complaint's QA review | The review section is presented |  |  |  |
| 2 | Set the investigation decision to **not required** and attempt to save without a justification | Refused — a reason is required to decline investigation |  |  |  |
| 3 | Enter a justification and save | Decision and justification recorded, attributed to the reviewer with a timestamp |  |  |  |
| 4 | On a second complaint, set investigation to **required** | An investigation is initiated per your configuration |  |  |  |
| 5 | Record the investigation findings and conclusion | Saved and retrievable |  |  |  |
| 6 | Confirm a user without QA permission cannot complete the review | Refused |  |  |  |

### TC-06-04 — Reportability assessment *(URS-CMP-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the regulatory reportability decision for the complaint | Decision saved |  |  |  |
| 2 | Where the decision is "reportable", confirm the record captures the rationale and any due date | Captured |  |  |  |
| 3 | Where the decision is "not reportable", confirm a rationale is still captured | Captured |  |  |  |
| 4 | Confirm the decision, the decider and the date are all recorded | All present |  |  |  |
| 5 | Confirm the decision appears in the audit trail | Entry present |  |  |  |

> If your configuration does not manage reportability in this system, mark N/A and record
> where the decision *is* made and how it is traceable to the complaint.

### TC-06-05 — Escalation to nonconformance *(URS-CMP-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | From the complaint, initiate conversion to a nonconformance | The NC creation flow opens, pre-filled from the complaint |  |  |  |
| 2 | Complete the required NC fields and create it | The NC is created |  |  |  |
| 3 | Confirm the complaint shows the linked nonconformance | Link visible on the complaint |  |  |  |
| 4 | Confirm the nonconformance shows the originating complaint | Link visible on the NC |  |  |  |
| 5 | Confirm the complaint's status reflects that it was escalated | Status updated |  |  |  |
| 6 | Where your process links several complaints to one nonconformance, link a second complaint to the same NC | Both complaints appear on the NC |  |  |  |
| 7 | Confirm the link is recorded in the audit trail | Entry present |  |  |  |

### TC-06-06 — Closure *(URS-CMP-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Attempt to close a complaint before the QA review is complete | Refused, per your configured gate — record the observed behaviour |  |  |  |
| 2 | Complete all required review and investigation content | Complete |  |  |  |
| 3 | Close the complaint, recording the resolution and any customer response | Status becomes closed; content recorded |  |  |  |
| 4 | Where signature is required at closure, enter an incorrect credential | Closure refused |  |  |  |
| 5 | Complete closure with the correct credential | Closed and signed |  |  |  |
| 6 | Attempt to edit the closed complaint | Editing prevented, or restricted per configuration — record the behaviour |  |  |  |

### TC-06-07 — Printed record *(URS-CMP-07)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Print the complaint | A complete, legible copy is produced |  |  |  |
| 2 | Confirm the printout includes the narrative, classification, product and lot, customer detail and the QA assessment | All sections present |  |  |  |
| 3 | Confirm the printout shows status and print provenance | Present |  |  |  |
| 4 | Save as PDF and confirm nothing is truncated | Complete |  |  |  |

**Attach the printout as objective evidence.**

### TC-06-08 — Audit trail *(URS-CMP-08)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the complaint audit history | Intake, classification changes, QA review, reportability decision, escalation and closure are all recorded |  |  |  |
| 2 | Inspect an update entry | Old and new values shown |  |  |  |
| 3 | Confirm the investigation decision and its justification are traceable | Both present |  |  |  |
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
| TC-06-01 |  |  |  |  |  |
| TC-06-02 |  |  |  |  |  |
| TC-06-03 |  |  |  |  |  |
| TC-06-04 |  |  |  |  |  |
| TC-06-05 |  |  |  |  |  |
| TC-06-06 |  |  |  |  |  |
| TC-06-07 |  |  |  |  |  |
| TC-06-08 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
