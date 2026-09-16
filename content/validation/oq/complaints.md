---
id: oq-complaints
title: OQ-06 Quality Complaints
sidebar_position: 6
description: Operational Qualification protocol for the internal quality complaint record — intake, QA review, reportability assessment, escalation to nonconformance and closure.
keywords: [OQ, complaint, quality complaint, QA review, reportability, escalation, test script]
---

# OQ-06 — Quality Complaints

**Document ID:** VAL-OQ-06 · **Version:** 1.0 · **Module:** Quality Complaints

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

**This is a different module from OQ-17.** This protocol covers **Quality Complaints**, the
internal QA-investigation record. The customer-facing intake and response module is
**Complaint Management**, covered by
[OQ-17 Customer Complaint Management](/validation/oq/customer-complaints). The two use
different tables, different permissions and different lifecycles, and are granted to users
independently. If your organisation uses only one of them, execute only the corresponding
protocol and record the exclusion in the Validation Master Plan.

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
| 3 | Attempt to submit with the description empty | Refused **by the entry form only** — see the note |  |  |  |
| 4 | Attempt to submit without the product | Refused **by the entry form only** |  |  |  |
| 5 | Attempt to submit without the lot / batch reference | Refused **by the entry form only** |  |  |  |
| 6 | Complete all required fields and submit | The complaint is created with its own number |  |  |  |
| 7 | Confirm the number follows the sequence | Number correct — see the note on uniqueness |  |  |  |
| 8 | Confirm the **creation date** and the recorder are captured | Both recorded — there is no separate date-received field |  |  |  |

> **Read this before recording steps 2 to 8.**
>
> **Only the subject is mandatory at the server.** Steps 3, 4 and 5 are enforced by the
> entry form, and through the application the refusals are real — record them. Beneath it,
> a complaint created through the data interface or the API needs **only a subject**;
> description, product and lot are all optional there. Record steps 3 to 5 as
> interface-level controls, and if your risk assessment depends on mandatory narrative,
> product or lot capture, control access to those interfaces procedurally.
>
> **Step 7 — the number is sequential but its uniqueness is not sealed.** Numbers are
> allocated from a locked counter, so duplicates are not expected in practice, but there is
> **no database constraint preventing one** — unlike the customer-complaint register, which
> has one. Confirm the number follows the sequence; do not attempt to prove uniqueness, and
> record the absent constraint if your procedure relies on it. The prefix is fixed in the
> product; there is no configurable numbering pattern to check.
>
> **Step 8 — there is no "date received" field.** The complaint records its creation date
> and its recorder, and nothing else date-wise. If your process must capture when a
> complaint was *received* as distinct from when it was *logged*, that has nowhere to go —
> record it as a gap and capture it in the narrative.

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

> **Read this before executing — reportability cannot be entered through the
> application today.** The escape hatch below is almost certainly the route you
> must take, and it is worth knowing why rather than discovering it at step 1.
>
> The underlying record is fully built: a complaint holds a reportability
> decision, a reporting scheme, a rationale, the decider, the decision date and a
> report due date; the API accepts all of them; changes are audit-logged; and the
> printed complaint renders the decision and rationale. What is missing is the
> **input** — no screen in the application offers a control that sets any of
> those fields. They are display- and print-only. So steps 1 to 4 cannot be
> executed through the interface as written, and step 5 has nothing to produce an
> entry from.
>
> Mark this test case **N/A with justification** and record: where the
> reportability decision **is** made, who approves it, how it is traceable to this
> complaint, and how the reporting due date is tracked. If your process needs the
> decision to live on the complaint record in this system, raise it as a gap —
> the data model already supports it and only the entry screen is absent, so note
> in your record that the capability is partially present rather than absent, and
> that the printed complaint will show these fields as empty.
>
> Do not record a deviation against the software for a capability excluded with a
> written justification. Do record one if you were relying on this test case to
> evidence a regulatory reporting control.

### TC-06-05 — Escalation to nonconformance *(URS-CMP-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | From the complaint, initiate conversion to a nonconformance | The NC creation flow opens, pre-filled from the complaint |  |  |  |
| 2 | Complete the required NC fields and create it | The NC is created |  |  |  |
| 3 | Confirm the complaint shows the linked nonconformance | Link visible on the complaint |  |  |  |
| 4 | Confirm the nonconformance shows the originating complaint | Link visible on the NC |  |  |  |
| 5 | Confirm the complaint records the escalation — the linked nonconformance is shown on the complaint, and the complaint is closed | Link present; complaint status is **Closed** |  |  |  |
| 6 | Where your process links several complaints to one nonconformance, link a second complaint to the same NC | Both complaints appear on the NC |  |  |  |
| 7 | Confirm the link is recorded in the audit trail | Entry present |  |  |  |

> **There is no "converted" status — the link IS the record of escalation.**
> Step 5 was reworded for this reason. Converting a complaint sets its status to
> **Closed**, and the fact that it was escalated lives in the record link to the
> nonconformance, not in a distinct status value. A dedicated "converted" status
> existed previously and was deliberately retired as a duplicate of that link.
> Do not expect a status such as "Converted" or "Escalated"; if you look for one
> and record a failure, the failure is against a design that was changed on
> purpose.
>
> Two behaviours worth confirming while you are here, both intended:
>
> - **Conversion is one-way and one-time.** Attempting to convert a complaint
>   that has already been converted is refused and names the complaint. Worth
>   exercising: it is the control that stops one complaint spawning several
>   nonconformances.
> - **Several complaints convert into ONE nonconformance in a single action**
>   (step 6). Each converted complaint is closed and linked to the same
>   nonconformance, and the new record's description is pre-filled from all of
>   them. That is the intended route for "these five complaints are one problem",
>   rather than converting one and manually linking the rest.

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

## 5. Controls this protocol does not test

The behaviours below are present in the product but are **not exercised by any test case
above**. A risk assessment may require the organisation to cover them with its own test
cases or procedural controls. Two known product defects are recorded at the end.

- **The lifecycle seal at the database** — the application's data interface can never change
  a complaint's status, and a complaint may only be created in draft or open. This is what
  makes the closure gate unbypassable, and no test case attempts a direct status write.
  Note its limit: the seal covers the **status column only**, so other fields — including
  the reportability decision, the investigation waiver and the closure approver — are not
  protected by it and can be written on a closed record through the data interface.
- **Cancellation is terminal, and a closed complaint may be reopened** — both are permitted
  by the database's transition rules. This protocol has no cancel and no reopen test case.
  See the defect note below before testing reopen.
- **Scope narrowing on reads** — a site-scoped reader sees only complaints at their sites,
  enforced by row-level policy on the application's own read path. Note a documented
  consequence: a complaint with **no site** is invisible to a purely site-scoped reader.
- **Three visibility routes that bypass permission** — a complaint is also visible to its
  owner, to anyone holding an assigned task on it, and to anyone it has been explicitly
  shared with. No test case probes these.
- **The closure completeness gate** — closure is refused while any workflow step remains
  open, and the refusal is server-side. TC-06-06 gestures at it but never asserts the
  refusal.
- **A record-level re-check on closure** — the closure permission is evaluated a second time
  against the specific record after the route-level check.
- **Electronic signature on a workflow step rejection** — where a step requires one, a
  rejection cannot be recorded without it, and a signature record is written. A Part 11
  control with no test case in this protocol.
- **The one-time conversion guard** — a complaint already escalated to a nonconformance
  cannot be escalated again, and the refusal names the existing complaint. TC-06-05
  describes this in its note but gives it no numbered step, so it is not evidenced.
- **Duplicate-complaint search and linking** — searching for similar complaints and linking
  them is a permission-gated feature with no test case.
- **Audit Trail read is a separate grant** — from Complaints read. TC-06-08 assumes the
  reviewer can open the trail; a complaints-only grant cannot.

**Two product defects found while writing this protocol.** Neither is a protocol error:

- **The Reopen action does not work.** A closed complaint offers a Reopen control, but the
  action it calls does not exist on the server, so it fails. The database and the permission
  model both support reopening — only the endpoint is missing. Do not add a reopen test case
  until this is corrected; record it as a known defect.
- **No uniqueness constraint on the complaint number** — see TC-06-01 step 7.

## 6. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 7. Execution summary

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
