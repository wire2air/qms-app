---
id: oq-document-control
title: OQ-01 Document Control
sidebar_position: 1
description: Operational Qualification protocol for controlled document creation, versioning, review, approval, release, printing and archival.
keywords: [OQ, document control, SOP, versioning, approval, effective, superseded, test script]
---

# OQ-01 — Document Control

**Document ID:** VAL-OQ-01 · **Version:** 1.0 · **Module:** Document Control

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________
**Execution start:** ______________  **Execution end:** ______________

## 1. Objective

To verify that controlled documents can be created, authored, reviewed, approved,
released, revised, printed and archived under control, and that the system prevents
uncontrolled or out-of-sequence changes to the effective version.

## 2. Requirements verified

URS-DOC-01 … URS-DOC-16. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §4.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | [IQ](/validation/framework/installation-qualification) executed and passed |  |
| 3 | At least one document type with a numbering prefix is configured |  |
| 4 | At least one published workflow template exists for the Document module |  |
| 5 | Test accounts available: **Author**, **Reviewer**, **Approver**, and **No-Access** (a user with no document permission) |  |
| 6 | Each test account has an e-signature credential established |  |
| 7 | Site and Department reference data exist |  |

**Test accounts used**

| Role in test | User name | Permissions granted |
| --- | --- | --- |
| Author |  |  |
| Reviewer |  |  |
| Approver |  |  |
| No-Access |  |  |

## 4. Acceptance criteria

All test steps pass, or any failure is raised as a deviation, assessed, and closed with
QA approval. In particular: no path exists to make a version effective without approval,
and no version's content can be altered after approval.

## 5. Test cases

### TC-01-01 — Document creation with mandatory metadata *(URS-DOC-01)*

**Objective:** Required fields are enforced at creation.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Author**, open Documents and start creating a new document |  The creation form opens |  |  |  |
| 2 | Leave the title empty and attempt to save | Save is refused; the missing field is identified to the user |  |  |  |
| 3 | Omit the Site, then attempt to save | Save is refused; the missing field is identified |  |  |  |
| 4 | Omit the Department, then attempt to save | Save is refused; the missing field is identified |  |  |  |
| 5 | Complete document type, title, site, department and prefix; select a workflow; save as draft | Document is created; version 1.0 opens in **Draft** status |  |  |  |
| 6 | Record the document number assigned | Number recorded below |  |  |  |

**Document number created:** ______________________

### TC-01-02 — Automatic, unique numbering *(URS-DOC-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Inspect the number assigned in TC-01-01 | It follows the configured prefix pattern for the document type, including site/department codes where the prefix uses them |  |  |  |
| 2 | Create a second document of the same type, site and department | A different number is assigned; the counter has incremented |  |  |  |
| 3 | Attempt to edit the document number directly | The number cannot be changed by the user |  |  |  |
| 4 | Create a third document of a **different** type | The number reflects that type's prefix and its own counter |  |  |  |

> Where your configuration defers numbering until first submission, record the observed
> behaviour and confirm it matches your procedure. Draft documents that never submit must
> not consume a number.

### TC-01-03 — Section authoring *(URS-DOC-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the draft version's content and add a text section with a heading, a list and a table | Content saves and renders as entered |  |  |  |
| 2 | Add a second section and confirm it is numbered sequentially | Sections are numbered in order |  |  |  |
| 3 | Insert a new section between the two existing sections | The new section takes the correct position and the following sections renumber |  |  |  |
| 4 | Add an attachment section and upload a file | The file uploads and is retrievable from the section |  |  |  |
| 5 | Download the attachment and confirm the content is unchanged from the original | File opens correctly and matches the source |  |  |  |
| 6 | Re-open the document as a different permitted user | All sections and the attachment are present and identical |  |  |  |

### TC-01-04 — Submission into the approval workflow *(URS-DOC-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Author**, submit the draft version for review, selecting the required reviewer for each step | Submission is accepted; the version status changes to **In Review** |  |  |  |
| 2 | Confirm the assigned reviewer receives a task | The task appears for **Reviewer** and links to the document |  |  |  |
| 3 | As **Author**, attempt to edit a section of the in-review version | Editing is prevented, or is restricted in line with your configured behaviour — record exactly what is observed |  |  |  |
| 4 | Confirm the workflow progress is visible on the document | The step sequence and current step are shown |  |  |  |

### TC-01-05 — Reviewer requests changes *(URS-DOC-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Reviewer**, open the assigned task and select the option to request changes without a comment | The action is refused; a comment is required |  |  |  |
| 2 | Enter a comment and request changes | The version status changes to reflect that changes were requested; the author is notified |  |  |  |
| 3 | As **Author**, confirm the comment is visible and the version is editable again | Comment is visible; editing is permitted |  |  |  |
| 4 | Amend the content and resubmit | The version returns to **In Review** and the workflow restarts at the configured point |  |  |  |

### TC-01-06 — Approval with electronic signature *(URS-DOC-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Approver**, open the assigned approval task | The task shows the version under approval |  |  |  |
| 2 | Approve and, at the signature prompt, enter an **incorrect** credential | The signature is refused; the approval is **not** recorded |  |  |  |
| 3 | Approve again with the correct credential | The approval is recorded and the version status becomes **Approved** |  |  |  |
| 4 | Inspect the recorded signature | It shows the signer's name, the date and time, and the meaning of the signature |  |  |  |
| 5 | As **Author**, attempt to edit a section of the approved version | Editing is prevented |  |  |  |

### TC-01-07 — Release and supersession *(URS-DOC-07, URS-DOC-08)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Take a **second** document that has a draft version, and attempt to make that draft effective without approval | The action is not available, or is refused — an unapproved version cannot be released |  |  |  |
| 2 | Return to the approved version from TC-01-06 and release it | Status becomes **Effective**; the release is recorded with performer and timestamp |  |  |  |
| 3 | Confirm which version the document presents as current | The effective version is clearly identified as current |  |  |  |
| 4 | Create, approve and release a **subsequent** version of the same document | The new version becomes **Effective** |  |  |  |
| 5 | Inspect the previous version | It is now **Superseded**, still retrievable, and clearly not current |  |  |  |

### TC-01-08 — Revision under change control *(URS-DOC-09, URS-DOC-10)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | On an effective document, create a new draft version | The change-control dialog requires change reason, change type and summary |  |  |  |
| 2 | Attempt to proceed with the change reason blank | The action is refused |  |  |  |
| 3 | Complete the change-control details and proceed | A new draft version is created, carrying the previous version's content |  |  |  |
| 4 | Confirm the previously effective version remains effective while the new draft is in progress | The effective version is unchanged and still current |  |  |  |
| 5 | Open the revision history | Every version is listed with its change control detail and approval chain |  |  |  |

### TC-01-09 — Printed controlled copy *(URS-DOC-11)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Print the **effective** version | The printout shows company header, document identifier and version, status, and approval detail |  |  |  |
| 2 | Confirm the printout records who printed it and when | Print provenance is present |  |  |  |
| 3 | Print a **draft** version | The printout is clearly marked as not for controlled use |  |  |  |
| 4 | Print a **superseded** version | The printout identifies it as superseded |  |  |  |
| 5 | Save a printout as PDF and confirm it is complete and legible | PDF contains the full document content |  |  |  |

**Attach printouts from steps 1, 3 and 4 as objective evidence.**

### TC-01-10 — Periodic review *(URS-DOC-12)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Set a periodic review frequency on a document | The value is saved and shown |  |  |  |
| 2 | Confirm the next review date is derived as expected from the effective date and frequency | The date shown matches the calculation |  |  |  |
| 3 | Using a document whose review date has been set to fall due, confirm the responsible person is notified or tasked | A review task/notification is raised to the correct person |  |  |  |

> If your configuration does not use periodic review, mark this case **N/A** with a
> justification rather than leaving it blank.

### TC-01-11 — Archival *(URS-DOC-13)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Archive a document without entering a reason | The action is refused; a reason is required |  |  |  |
| 2 | Archive with a reason | The document is archived and the reason is recorded |  |  |  |
| 3 | Confirm the archived document is still retrievable and clearly marked as withdrawn | Record remains readable; status is unambiguous |  |  |  |
| 4 | Confirm the archived document is excluded from the active document list | It no longer appears among active documents |  |  |  |

### TC-01-12 — Audit trail *(URS-DOC-14)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the audit history for the document used above | Entries exist for creation, content changes, submission, review actions, approval, release, revision and archival |  |  |  |
| 2 | Inspect an update entry | It shows the field changed, the previous value and the new value |  |  |  |
| 3 | Confirm each entry records who performed it and when | Performer and timestamp present on every entry |  |  |  |
| 4 | Confirm no user interface exists to edit or delete an audit entry | No edit or delete action is available |  |  |  |

### TC-01-13 — Access control *(URS-DOC-15)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Sign in as **No-Access** | Sign-in succeeds |  |  |  |
| 2 | Confirm Documents is not offered in the navigation | The module is not presented |  |  |  |
| 3 | Paste the URL of the document list directly into the address bar | Access is refused |  |  |  |
| 4 | Paste the URL of the specific document created in TC-01-01 | Access is refused; no document content is displayed |  |  |  |
| 5 | As **Reviewer** (review permission only), attempt to release a version | The release action is unavailable or refused |  |  |  |

### TC-01-14 — Legacy import traceability *(URS-DOC-16)*

Execute only if bulk document import is used for data migration. Annex 11 §4.8 requires
migration to be qualified.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Import a batch of **[n]** known source files | The batch reports the number processed, succeeded and failed |  |  |  |
| 2 | Reconcile the count of created documents against the source file count | Counts agree; any discrepancy is explained |  |  |  |
| 3 | Open an imported document and confirm the original source file is attached and opens correctly | Source file present and identical to the original |  |  |  |
| 4 | Confirm imported documents are identifiable as imported | Imported records carry a distinguishing marker |  |  |  |
| 5 | Confirm imported documents are created as drafts and are not effective | No imported document is effective without going through approval |  |  |  |
| 6 | Deliberately include one unsupported file and confirm the failure is reported with a reason | Failure is reported per file, with a usable reason |  |  |  |

## 6. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |

## 7. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --- | --- | --- | --- | --- | --- |
| TC-01-01 |  |  |  |  |  |
| TC-01-02 |  |  |  |  |  |
| TC-01-03 |  |  |  |  |  |
| TC-01-04 |  |  |  |  |  |
| TC-01-05 |  |  |  |  |  |
| TC-01-06 |  |  |  |  |  |
| TC-01-07 |  |  |  |  |  |
| TC-01-08 |  |  |  |  |  |
| TC-01-09 |  |  |  |  |  |
| TC-01-10 |  |  |  |  |  |
| TC-01-11 |  |  |  |  |  |
| TC-01-12 |  |  |  |  |  |
| TC-01-13 |  |  |  |  |  |
| TC-01-14 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

**Comments:**

<br /><br /><br />

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
