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
| 3 | At least one document **template** with a numbering prefix is configured — the prefix is a property of the template, not of a document type |  |
| 4 | The approval flow is inherited from the document template, so confirm the template you will use carries one; a template-less draft falls back to the company ad-hoc flow |  |
| 5 | Test accounts available: **Author**, **Reviewer**, **Approver**, and **No-Access** (a user with no document permission) |  |
| 6 | Each test account has an e-signature credential established |  |
| 7 | Site and Department reference data exist |  |
| 8 | Each signing account holds an electronic-signature **PIN** credential specifically — approval, draft deletion and periodic review all prompt for the PIN |  |
| 9 | At least one test account holds **Audit Trail read** permission — a separate grant from Document Control read; without it audit and signature blocks render as *not shown* |  |
| 10 | Decide and record whether the test document uses **auto-release on approval**, and execute TC-01-07 accordingly |  |

**Test accounts used**

| Role in test | User name | Permissions granted |
| --- | --- | --- |
| Author |  |  |
| Reviewer |  |  |
| Approver |  |  |
| No-Access |  |  |

## 4. Acceptance criteria

All test steps pass, or any failure is raised as a deviation, assessed, and closed with
QA approval. In particular: no path exists to make a version effective without approval;
approved content is locked **in the interface**, and its integrity after release is
evidenced by an immutable, hash-anchored PDF snapshot of the effective version.

## 5. Test cases

### TC-01-01 — Document creation with mandatory metadata *(URS-DOC-01)*

**Objective:** Required fields are enforced at creation.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Author**, open Documents and start creating a new document |  The creation form opens |  |  |  |
| 2 | Leave the title empty and attempt to save | Save is refused; the missing field is identified to the user |  |  |  |
| 3 | Omit the Site, then attempt to save | Save is refused; the missing field is identified |  |  |  |
| 4 | Omit the Department, then attempt to save | Save is refused **in the interface**; the missing field is identified |  |  |  |
| 5 | Complete document template, title, **Sites** (or *All sites*), department, **Owner** and prefix, then use **Create Document** | Document is created; version 1.0 opens in **Draft** status |  |  |  |
| 6 | Confirm whether a document number has yet been assigned | **No** number is assigned at creation; numbering is deferred to first submission for review — verified in TC-01-04 |  |  |  |

> **Read this before recording steps 2 to 5 as passes.** Four points.
>
> First, the field captured at creation is Document **Template** — there is no "document
> type" field in the creation interface; read step 5 accordingly.
>
> Second, **use the "Create Document" button, not "Save as Draft"**. Saving as a draft
> requires the title alone, by design, so that a part-finished document can be parked. If
> you attempt steps 3 and 4 by saving as a draft, they will pass vacuously — the omitted
> field is simply not asked for. Only the Create Document path exercises the validation.
>
> Third, the field-by-field enforcement layers differ, and this determines what each step
> evidences. **Title** is required by both the form and the database. **Department**,
> **Sites** and **Owner** are required by the form only — each is nullable at the data
> layer — so steps 3 and 4 demonstrate usability controls rather than data-integrity ones:
> a write reaching the data layer directly is not refused. Record this distinction if your
> risk assessment relies on mandatory Department, Site or Owner capture.
>
> Fourth, the form asks for **Sites** (plural, with an *All sites* option) and for
> **Owner**. Both are required on the Create Document path.

### TC-01-02 — Automatic, unique numbering *(URS-DOC-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Inspect the number minted on submission in TC-01-04 | It follows the pattern configured on the document **template**, with any site-code and department-code placeholders resolved to the document's site and department |  |  |  |
| 2 | Submit a second document of the same template, site and department for review | A different number is assigned; the counter for that resolved prefix has incremented |  |  |  |
| 3 | Attempt to edit the document number directly | The number cannot be changed by the user |  |  |  |
| 4 | Create and submit a third document whose resolved prefix **differs** from the first two | The number reflects that prefix and advances a counter of its own, independent of the first sequence |  |  |  |

> **Read this before recording steps 1 and 4 as passes.** Number counters are keyed on the
> **resolved prefix**, not on the document template. Two consequences to confirm against your
> procedure. Two templates that resolve to the same prefix **share one sequence**, so numbers
> interleave between them. One template used at two sites resolves to two prefixes and
> therefore gets two independent counters, each starting from the beginning. Step 4 is only
> evidence of an independent counter if the third document's *resolved prefix* differs — a
> different template alone is not sufficient.
>
> **Numbering is deferred.** No number is assigned at creation; the number is minted on the
> first submission for review. This is the only behaviour the product has, not a
> configuration variant. A draft deleted before it is ever submitted therefore consumes no
> number, and gaps in a sequence are not expected from abandoned drafts.

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
| 1 | As **Author**, submit the draft version for review, selecting the required reviewer for each step | Submission is accepted; the version status changes to **In Review**, and the document number is minted at this point |  |  |  |
| 2 | Confirm the assigned reviewer receives a task | The task appears for **Reviewer** and links to the document |  |  |  |
| 3 | As **Author**, attempt to edit a section of the in-review version | Editing is prevented **in the interface** |  |  |  |
| 4 | Confirm the workflow progress is visible on the document | The step sequence and current step are shown |  |  |  |

**Document number assigned on submission:** ______________________

> **Read this before recording step 3 as a pass.** Section content is not status-locked at
> the server. There is no status predicate in row-level security on document sections and no
> database trigger on them, so editing an in-review version is prevented **in the interface
> only** — a write reaching the data layer directly is not refused. What *is* sealed at the
> database is the version's status machine: an untrusted caller may never change a version's
> status, and even trusted code is held to a fixed set of legal transitions. The snapshot and
> approval columns are sealed the same way. Record step 3 as an interface-level control.

### TC-01-05 — Reviewer requests changes *(URS-DOC-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Reviewer**, open the assigned task and select the option to request changes without a comment | The action is refused; a comment is required |  |  |  |
| 2 | Enter a comment and request changes | The version status changes to reflect that changes were requested; the author is notified |  |  |  |
| 3 | As **Author**, confirm the comment is visible and the version is editable again | Comment is visible; editing is permitted |  |  |  |
| 4 | Amend the content and resubmit | The version returns to **In Review** and the workflow restarts at the configured point |  |  |  |

> **Read this before recording step 1 as a pass.** The comment requirement when requesting
> changes is enforced by the server's request validation, not only by the dialog, so a direct
> API call that omits the comment is refused as well. Record step 1 as a genuine
> data-integrity control.

### TC-01-06 — Approval with electronic signature *(URS-DOC-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Approver**, open the assigned approval task | The task shows the version under approval |  |  |  |
| 2 | Approve and, at the signature prompt, enter an **incorrect** credential | The signature is refused; the approval is **not** recorded |  |  |  |
| 3 | Approve again with the correct credential | The approval is recorded; record the version status observed immediately afterwards — **Approved**, or **Effective** where auto-release on approval is enabled |  |  |  |
| 4 | Inspect the recorded signature | It shows the signer's name, and the date and time of signing |  |  |  |
| 5 | As **Author**, attempt to edit a section of the approved version | Editing is prevented **in the interface** |  |  |  |

> **Read this before recording steps 2, 3, 4 and 5.** Four points.
>
> **Step 2 is a genuine control.** Identity is verified before anything is written, so a
> wrong credential records no approval at all. Note that repeated incorrect PIN attempts lock
> the signing credential — use one deliberate failure only, then continue with step 3.
>
> **Step 3 may not rest on Approved.** A document setting, auto-effective on approval, is
> **on by default**, so final approval flows straight through to **Effective** and
> **Approved** is a transient state. Record the status you actually observe; either value is
> a pass provided it matches the setting recorded in prerequisite 10.
>
> **Step 4 shows performer, timestamp and action only.** The on-screen and printed signature
> block is derived from the audit trail. The underlying Part 11 signature record — which
> additionally carries the signature's **meaning** and a tamper-evidence hash — is not
> surfaced in the interface. If validation requires the meaning of the signature to be
> legible to a user, raise a deviation.
>
> **Step 5 is an interface control.** As in TC-01-04 step 3, document sections carry no
> status predicate in row-level security and no database trigger, so a direct data-layer
> write to an approved version's content is not refused. Approved content's integrity after
> release rests on the immutable, hash-anchored PDF snapshot taken when the version becomes
> effective (TC-01-09), not on a server-side write refusal.

### TC-01-07 — Release and supersession *(URS-DOC-07, URS-DOC-08)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Take a **second** document that has a draft version, and attempt to make that draft effective without approval — first as the **company owner**, then as **Author** and as **Approver** | No release action is offered on an unapproved version to any of the three; an unapproved version cannot be released |  |  |  |
| 2 | Return to the version approved in TC-01-06. **With auto-release enabled (the default):** confirm it became **Effective** automatically on final approval, and record the release timestamp and performer. **With auto-release disabled:** release it manually as the **company owner** | Status is **Effective**; the release is recorded with performer and timestamp |  |  |  |
| 3 | Confirm which version the document presents as current | The effective version is clearly identified as current |  |  |  |
| 4 | Create, approve and release a **subsequent** version of the same document | The new version becomes **Effective** |  |  |  |
| 5 | Inspect the previous version | It is now **Superseded**, still retrievable, and clearly not current |  |  |  |

> **Read this before recording steps 1 and 2.** Manual release is restricted to the company
> owner, and only on versions already **Approved** — both restrictions are enforced at the
> server, not merely hidden in the interface. The database permits no direct Draft-to-Effective
> transition on any path. Step 1 therefore confirms the absence of an offered action; the
> underlying seal is exercised as a negative data-layer test only if your risk assessment
> calls for one (see *Controls this protocol does not test*). Step 2 branches on the
> auto-release setting recorded in prerequisite 10: with it enabled there is no manual release
> action to perform, because final approval has already carried the version to **Effective**.

### TC-01-08 — Revision under change control *(URS-DOC-09, URS-DOC-10)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | On an effective document, create a new draft version | The change-control dialog requires change reason, change type and summary |  |  |  |
| 2 | Attempt to proceed with the change reason blank | The action is refused |  |  |  |
| 3 | Complete the change-control details and proceed | A new draft version is created, carrying the previous version's content |  |  |  |
| 4 | Confirm the previously effective version remains effective while the new draft is in progress | The effective version is unchanged and still current |  |  |  |
| 5 | Open the revision history | Every version is listed with its change control detail and approval chain |  |  |  |

> **Read this before recording steps 1, 2 and 5.** Change-reason capture on a revision is
> enforced at **both** layers: the revision dialog requires it, and a database constraint
> requires a change reason on every version above 1.0. Steps 1 and 2 are therefore genuine
> data-integrity controls on the revision path that TC-01-08 exercises. Change **type** is
> enforced by the dialog only — its column is nullable — so if you evidence change-type
> capture separately, record it as an interface-level control. For step 5, the
> approval column of the revision history draws on the Audit Trail module, whose read
> permission is a **separate grant** from Document Control read (prerequisite 9). Without it
> the column renders as *not shown* rather than empty — deliberately, so that a missing
> permission cannot be mistaken for "never approved". Confirm the executing account holds the
> grant before recording a failure here.

### TC-01-09 — Printed controlled copy *(URS-DOC-11)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Print the **effective** version | The printout shows company header, document identifier and version, status, and approval detail |  |  |  |
| 2 | Confirm the printout records who printed it and when | Print provenance is present |  |  |  |
| 3 | Print a **draft** version | The printout is clearly marked as not for controlled use |  |  |  |
| 4 | Print a **superseded** version | The printout identifies it as superseded |  |  |  |
| 5 | Save a printout as PDF and confirm it is complete and legible | PDF contains the full document content |  |  |  |

**Attach printouts from steps 1, 3 and 4 as objective evidence.**

> **Read this before recording steps 1, 2 and 5.** Three points. The printout's approval
> block is drawn from the Audit Trail module and requires its separate read permission
> (prerequisite 9); without that grant the block renders as *not shown* rather than empty.
> Print provenance in step 2 is rendered from the printing user's session at render time and
> is **not persisted** — there is no server-side register of who printed which copy, so if
> your procedure requires a print log, raise a deviation. In step 5, the browser's "Save as
> PDF" output is a convenience copy; the controlled, tamper-evident artefact is the PDF
> snapshot the system generates when a version becomes effective, anchored by a stored hash.
> Do not present a browser-saved PDF as the controlled copy.

### TC-01-10 — Periodic review *(URS-DOC-12)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Set a periodic review frequency on a document | The value is saved and shown |  |  |  |
| 2 | Confirm the next review date is derived from the **last-reviewed** date — or, where the document has never been reviewed, from its **creation** date — plus the configured frequency | The date shown matches that calculation; it is **not** derived from the effective date |  |  |  |
| 3 | Using a document whose review date has been set to fall due, confirm the review task is raised to the **document owner** | A review task/notification is raised to the document owner, escalating to the owner's department supervisor if the owner is inactive |  |  |  |
| 4 | Complete the review with the outcome "no change required" and **no** justification; then complete it with a justification and a valid PIN | The first attempt is refused because a justification is required (server-enforced); the second is accepted, the review is recorded as a signed decision, and the review clock restarts from the new last-reviewed date |  |  |  |

> If your configuration does not use periodic review, mark this case **N/A** with a
> justification rather than leaving it blank.

> **Read this before recording step 3 as a pass.** The due-date scan runs **nightly** with a
> 30-day lead, and only for documents that have an effective version and are not archived. A
> document with no effective version, or an archived one, raises no task — that is correct
> behaviour, not a failure. Allow for the nightly cycle when scheduling this step; a task is
> not expected to appear the moment the review date is changed.

### TC-01-11 — Archival *(URS-DOC-13)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Archive a document without entering a reason | The action is refused; a reason is required |  |  |  |
| 2 | Archive with a reason | The document is archived and the reason is recorded |  |  |  |
| 3 | Confirm the archived document is no longer listed, and record how an archived record is retrieved for inspection | The document is absent from the register and from direct navigation; retrieval is via the audit trail (TC-01-12) and the retained effective-version PDF snapshot |  |  |  |
| 4 | Confirm the archived document is excluded from the active document list | It no longer appears among active documents |  |  |  |

> **Read this before recording step 3 as a pass.** Archiving soft-deletes the document: it is
> removed from the register and from direct navigation, and is **not** retrievable through the
> document list. Evidence of the archived record is the audit trail and the retained PDF
> snapshot of the last effective version. If your organisation's procedure requires archived
> documents to remain browsable in the application, record that as a deviation. Step 1's reason
> requirement is enforced both by the dialog and by a database constraint, so it is a genuine
> data-integrity control.
>
> **Do not use the register's "Archived" filter to evidence steps 3 and 4.** That filter
> selects on the latest **version** status — archived or superseded versions — and will
> never list a document archived by the action in step 2, which is a document-level
> obsoletion. An empty Archived tab here is expected behaviour, not a failure. Evidence the
> document's absence from the default register instead, as step 3 directs.

### TC-01-12 — Audit trail *(URS-DOC-14)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the audit history for the document used above | Entries exist for creation, content changes, submission, review actions, approval, release, revision and archival |  |  |  |
| 2 | Inspect an update entry | It shows the field changed, the previous value and the new value |  |  |  |
| 3 | Confirm each entry records who performed it and when | Performer and timestamp present on every entry |  |  |  |
| 4 | Confirm no user interface exists to edit or delete an audit entry | No edit or delete action is available |  |  |  |

> **Read this before recording step 1 as a pass.** The Audit Trail module has its own read
> permission, a separate grant from Document Control read (prerequisite 9). Without it the
> audit history renders as *not shown* rather than as an empty list — by design, so that a
> missing permission cannot be mistaken for an absence of recorded activity. Confirm the
> executing account holds the grant before recording any failure in this test case.

### TC-01-13 — Access control *(URS-DOC-15)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Sign in as **No-Access** | Sign-in succeeds |  |  |  |
| 2 | Confirm Documents is not offered in the navigation | The module is not presented |  |  |  |
| 3 | Paste the URL of the document list directly into the address bar | Access is refused |  |  |  |
| 4 | Paste the URL of the specific document created in TC-01-01, and record exactly what is displayed | No document content is displayed; the page renders empty or as not-found rather than showing an explicit access-denied message |  |  |  |
| 5 | As **Reviewer** (review permission only), attempt to release a version | The release action is unavailable or refused |  |  |  |

> **Read this before recording step 4 as a pass.** The document detail route is deliberately
> not blocked by the interface guard; access is refused at the data layer by row-level
> security, which returns no rows. The page therefore renders empty or as not-found instead of
> an explicit denial. Record the display verbatim. The absence of a denial message is not a
> failure — the control being evidenced is that no document content is disclosed.

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
| 6 | Confirm both rejection behaviours separately: **(a)** include one **unsupported** file in a batch; **(b)** cause one supported file to fail record creation | **(a)** The unsupported file is rejected **in the interface** with an aggregate message and **no** import item is created for it — it never appears as a per-file failure row. **(b)** The per-file failure row, with a usable reason, is produced for the record-creation failure |  |  |  |

> **Read this before recording step 6 as a pass.** The two rejection paths are distinct, and
> they sit at different layers.
>
> Step 6(a) is an **interface-level** control. The file-type allowlist is applied in the
> import dialog before anything is uploaded, and is reported as one aggregate message for
> the batch; an unsupported file therefore produces no per-file row, and its absence from
> the failure list is correct. There is **no server-side file-type validation** — see
> *Controls this protocol does not test*. Record step 6(a) as evidence of a usability
> control, not a data-integrity one.
>
> Step 6(b) is the per-file path: reasons are recorded for files that pass the dialog but
> fail **record creation**. Reconcile counts in step 1 with this in mind — an unsupported
> file is not counted among the processed items.

## 6. Controls this protocol does not test

The following controls exist in the module but are outside the scope of the test cases above.
A risk assessment may require the organisation to cover them with its own test cases.

- **The effective-version PDF snapshot and its stored hash** — the module's strongest
  records-integrity control, write-protected against any untrusted caller. Recommended test:
  release a version, retrieve the snapshot, verify the stored hash matches the file, and
  confirm the hash cannot be altered through the interface.
- **The version status machine as a database seal** — recommended negative test: attempt
  Draft-to-Effective and Draft-to-Approved transitions through the data layer and confirm both
  are refused.
- **Deletion constraints** — approved and effective versions cannot be deleted, while deleting
  a draft requires both a written reason and an electronic signature. The protection of
  finalised versions rests on database triggers added in September 2026; if your validation
  covers an earlier build, verify it rather than assuming it.
- **Scope-tiered read access** — a department- or site-scoped read grant should return only
  in-scope documents; TC-01-13 tests all-or-nothing access only.
- **Scope-tiered write access to versions** — a scoped editor is separately prevented from
  writing another tier's document **versions** (change summary, change reason, effective
  date, regulatory impact), a gate distinct from read scope above. Recommended test: as a
  department-scoped editor, attempt to modify a version belonging to another department.
- **Server-side validation of imported file types** — the bulk-import allowlist is applied in
  the interface only, so a caller reaching the data layer directly can create an import item
  for any file type. Recommended test, if bulk import is used for migration: confirm
  procedurally that import is performed only through the application.
- **Soft deletion without obsoletion metadata** — the reason requirement exercised in TC-01-11
  binds whenever a document is archived through the application. It does not, by itself,
  prevent a soft delete that sets no obsoletion metadata at all.
- **Named collaborators** — collaborators gain visibility of a draft through a separate access
  path from role-based read permission.
- **The second release path** — two distinct paths exist: automatic on approval, including
  deferred future-dated release, and manual by the company owner. This protocol exercises one,
  per prerequisite 10.

## 7. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |

## 8. Execution summary

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
