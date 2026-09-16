---
id: oq-log-books
title: OQ-10 Log Books
sidebar_position: 10
description: Operational Qualification protocol for controlled log books — definition, activation, scheduled entries, training gating, review sign-off and corrections.
keywords: [OQ, log book, GMP records, entries, review, sign-off, corrections, test script]
---

# OQ-10 — Log Books

**Document ID:** VAL-OQ-10 · **Version:** 1.0 · **Module:** Log Books / Inspections & Logs

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify that controlled log books replace paper logs safely: the entry form is frozen
once the book is in use, entries are attributable and contemporaneous, only trained
operators can record, a reviewer signs off, and a correction never erases what was
originally recorded.

**TC-10-07 is the ALCOA+ test.** An electronic log that lets a value be quietly changed is
worse than paper, because paper at least shows the crossing-out.

## 2. Requirements verified

URS-LOG-01 … URS-LOG-09. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §13.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | Test accounts: **Log Book Owner**, **Operator (trained)**, **Operator (untrained)**, **Reviewer / Supervisor** |  |
| 4 | An effective controlled document exists that can be linked as the training requirement |  |
| 5 | Operators have e-signature credentials established |  |

## 4. Test cases

### TC-10-01 — Defining a log book *(URS-LOG-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Log Book Owner**, create a log book with a name and purpose | Created in draft |  |  |  |
| 2 | Define the entry form with a numeric field, a text field, a date field and a selection field | Fields save |  |  |  |
| 3 | Mark at least one field as required | Saved |  |  |  |
| 4 | Set numeric limits on the numeric field, where supported | Saved |  |  |  |
| 5 | Link the controlled document that operators must be trained on | Link saved |  |  |  |
| 6 | Assign the reviewer / supervisor for entry sign-off | Saved |  |  |  |

**Log book reference:** ______________________

### TC-10-02 — Activation freezes the definition *(URS-LOG-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Activate the log book | Status becomes active and it becomes usable |  |  |  |
| 2 | Attempt to add a field to the entry form | Prevented |  |  |  |
| 3 | Attempt to remove or rename a field | Prevented |  |  |  |
| 4 | Attempt to change a field's required flag | Prevented |  |  |  |
| 5 | Where a change is genuinely needed, confirm the supported route is a replacement/superseding book | Route exists and the superseded book remains readable |  |  |  |

### TC-10-03 — Scheduling and assignment *(URS-LOG-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Configure the log book's schedule per your process (ad hoc, recurring, or triggered) | Schedule saved |  |  |  |
| 2 | Assign the operators responsible | Assignment saved |  |  |  |
| 3 | For a recurring schedule, confirm an occurrence becomes due at the expected time | Occurrence appears when due |  |  |  |
| 4 | Confirm the assigned operator is tasked or notified | Task/notification received |  |  |  |
| 5 | Allow an occurrence to pass without completion and confirm it is treated per your configuration (missed or held open) | Behaviour recorded and matches the SOP |  |  |  |

### TC-10-04 — Entry capture *(URS-LOG-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Operator (trained)**, open the log book and start an entry | Entry form opens with the frozen field set |  |  |  |
| 2 | Attempt to submit with a required field empty | Refused **by the entry form only** — see the note |  |  |  |
| 3 | Attempt to enter a value outside the configured numeric limits | Refused **by the entry form only** — the value is accepted if the form is bypassed |  |  |  |
| 4 | Complete and submit the entry, signing where required | Entry saved and signed |  |  |  |
| 5 | Confirm the entry records who made it and the actual time it was made | Attribution and system timestamp present |  |  |  |
| 6 | Confirm the recorded time is system-generated and not editable by the operator | Timestamp not user-controlled |  |  |  |
| 7 | Confirm the entry's **activity date** is recorded alongside the entry time | Both stored — but the activity date cannot be set through the interface; read the note |  |  |  |

> **Read this before recording steps 2, 3 and 7.**
>
> **Steps 2 and 3 are interface controls, and nothing enforces them beneath.** The entry
> form applies the field set's required flags and numeric limits, so through the application
> the refusals are real and should be recorded. The server performs **no validation of the
> entry content at all** — an entry submitted directly to the data interface with a required
> field empty, or a numeric value far outside its limits, is accepted and stored. Record
> steps 2 and 3 against the interface, and record this limitation. If your risk assessment
> relies on limit enforcement for GMP data, control access to the data interface
> procedurally and state that justification.
>
> **Step 7 — the activity date exists, is sealed, and has no input control.** Every entry
> stores an activity date separately from its submission time, and once written **neither
> can ever be changed**, by any user or by the application itself. But no entry surface
> offers the activity date, so through the interface it always equals the submission time
> and you cannot make the two differ. Record both values as stored and note that they match.
> See *Controls this protocol does not test* for the consequence: the data interface does
> accept a caller-supplied activity date, without any bound on how far in the past or future
> it may be.

### TC-10-05 — Training gate *(URS-LOG-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Operator (untrained)** — not trained on the linked document — attempt to make an entry | The entry is **blocked**, with a reason identifying the missing training |  |  |  |
| 2 | Confirm the block cannot be bypassed by the operator | No override available to the operator |  |  |  |
| 3 | Complete the required training for that operator **and have a manager verify the competency** | Training verified |  |  |  |
| 4 | Attempt the entry again | The entry is now permitted |  |  |  |
| 5 | Confirm assigning an untrained operator produces a warning to the assigner | Warning shown at assignment |  |  |  |

> **A passed assessment is not enough — competency must be manager-verified.**
> Step 3 is written deliberately. The system treats an operator as trained only
> once their training record reaches **verified** status; a passed-but-unverified
> assessment leaves the entry block fully in place. If the training you use
> requires manager verification and you stop at the trainee's own submission, the
> entry will still be refused and step 4 will fail — that is correct behaviour,
> not a defect. (Where a training is configured not to require manager
> verification, the record advances to verified on its own, so the same rule
> holds either way.)
>
> Two further points worth recording as you execute:
>
> - **A linked document only gates entries if it carries a training.** The gate
>   asks whether an active training is bound to the linked document — either the
>   document's own training or a library training linked to it. A document linked
>   to the log book with no active training bound to it never blocks anyone, so
>   confirm the prerequisite is genuinely in place before recording step 1 as a
>   pass. How the document is linked (implements / references / evidence of) makes
>   no difference; all three count.
> - **The entry block is absolute; the assignment warning is not.** A manager may
>   override at assignment time — they can hand the book to an untrained operator
>   over the warning in step 5 — but nobody can override at entry time, including
>   the operator themselves. That asymmetry is by design, and step 2 is testing
>   the half that has no override.

### TC-10-06 — Review and sign-off *(URS-LOG-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As a user who is **not** a designated reviewer, attempt to sign off an entry | Refused |  |  |  |
| 2 | As **Reviewer**, open a submitted entry | Entry content is shown for review |  |  |  |
| 3 | Sign off the entry with an incorrect credential | Refused; the entry remains unreviewed |  |  |  |
| 4 | Sign off with the correct credential | Review recorded with name, date/time and meaning |  |  |  |
| 5 | Where over-the-shoulder review is used, have the supervisor sign at the operator's workstation | The signature is attributed to the **supervisor**, and the record identifies the operator's session |  |  |  |
| 6 | Reject or query an entry, where supported | The entry returns to the operator with the comment |  |  |  |

> Step 5 matters: an over-the-shoulder signature that ends up attributed to whoever was
> logged in would falsify the record. Confirm the attribution explicitly.

### TC-10-07 — Corrections preserve the original *(URS-LOG-07)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Attempt to correct a submitted entry | Either a controlled correction path is offered, or correction is prevented — record which |  |  |  |
| 2 | Where correction is permitted, attempt it without a reason | Refused; a reason is required |  |  |  |
| 3 | Make a correction with a reason | Correction recorded |  |  |  |
| 4 | Confirm the **original value remains visible** and is not overwritten | Original value retrievable |  |  |  |
| 5 | Confirm the correction records who made it, when, and why | All three present |  |  |  |
| 6 | Confirm a signed-off entry cannot be silently altered | Any change after sign-off is controlled and evident |  |  |  |
| 7 | Attempt to delete an entry | Prevented, or soft-deleted with full history retained — record the behaviour |  |  |  |

### TC-10-08 — Register printout *(URS-LOG-08)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Print the log book register for a date range | A paginated register is produced |  |  |  |
| 2 | Confirm every entry in the range is present, with operator, timestamp and values | All entries present |  |  |  |
| 3 | Confirm review sign-offs appear on the register | **Only the entry's status appears** — the signature detail is not on the register |  |  |  |
| 4 | Confirm corrections are identifiable on the register | **Not identifiable** — the register prints the corrected value with no marker |  |  |  |
| 5 | Save as PDF and confirm nothing is truncated | Complete |  |  |  |

> **Read this before recording steps 3 and 4.** The register prints each entry's
> identifier, submission time, operator, status and the field values you select. It does
> **not** print signature detail, and it does not mark an entry that has been corrected — an
> amended entry appears with its corrected value only. Neither is a loss of the underlying
> record: the review signature and the full correction history, including every superseded
> value, are held against the entry and are visible on the entry itself and in its audit
> trail. It is the register view that omits them.
>
> Record steps 3 and 4 as observed, and if your procedure uses this register as the
> inspection-facing log, evidence sign-offs and corrections from the entry records instead
> and say so in your report.

**Attach the register as objective evidence.**

### TC-10-09 — Audit trail *(URS-LOG-09)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the log book's audit history | Definition, activation, assignments, entries, corrections and sign-offs are recorded |  |  |  |
| 2 | Inspect a correction entry | Original and corrected values both shown, with the reason |  |  |  |
| 3 | Confirm each entry carries performer and timestamp | Present |  |  |  |
| 4 | Confirm no audit entry can be edited or deleted | None available |  |  |  |

## 5. Controls this protocol does not test

The behaviours below are present in the product but are **not exercised by any test case
above**. A risk assessment may require the organisation to cover them with its own test
cases or procedural controls.

- **A back-dated activity date accepted through the data interface** — the highest-value
  omission. An entry's activity date may be supplied by the caller with **no check that it
  is not in the past or the future**, and the database then makes it permanently
  unchangeable. A back-dated entry is therefore sealed as authoritative. The interface never
  exposes the field (TC-10-04 step 7), so this is reachable only through the data interface.
  Recommended test: attempt it, and if it succeeds, control data-interface access
  procedurally and record the justification against contemporaneity.
- **The full set of frozen contract fields** — TC-10-02 tests that fields cannot be added,
  removed or renamed once the book is active. The same protection also covers the book's
  **signature-required** and **review-required** settings, its edit window, its record
  classification, its equipment link and its code. Turning off signature or review
  requirement on a live book is the most consequential configuration change in the module
  and no test case attempts it.
- **The entry lifecycle seal** — an entry's status can only follow the permitted sequence,
  and the database refuses any direct status change from the application's data interface.
  This closed a defect by which an entry's own author could reopen their sealed entry,
  approve it past the reviewer, or void it without a reason. No test case attempts a direct
  lifecycle write.
- **Entries cannot be deleted at all** — there is no deletion path, for any user.
- **The edit window** — an entry is editable by its submitter only until its window closes,
  after which it seals automatically; an edit within the window appends a revision rather
  than overwriting. The protocol never states the window as a control or tests its expiry.
- **Operator flags** — any member may raise a flag on an entry, which creates a supervisor
  review task and an immediate notification; resolving it is permission-gated. A
  GMP-relevant "the operator noticed something" channel with no test case.
- **Reviewer site scoping** — a named reviewer must also hold access to the book's site.
  TC-10-06 tests reviewer against non-reviewer, not the site dimension.
- **A book must be active to accept entries** — a draft, inactive or obsolete book refuses
  them. TC-10-02 activates a book but never tests the negative.

## 6. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 7. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --- | --- | --- | --- | --- | --- |
| TC-10-01 |  |  |  |  |  |
| TC-10-02 |  |  |  |  |  |
| TC-10-03 |  |  |  |  |  |
| TC-10-04 |  |  |  |  |  |
| TC-10-05 |  |  |  |  |  |
| TC-10-06 |  |  |  |  |  |
| TC-10-07 |  |  |  |  |  |
| TC-10-08 |  |  |  |  |  |
| TC-10-09 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
