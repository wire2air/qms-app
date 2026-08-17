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
| 2 | Attempt to submit with a required field empty | Refused |  |  |  |
| 3 | Attempt to enter a value outside the configured numeric limits | Refused or flagged — record the behaviour |  |  |  |
| 4 | Complete and submit the entry, signing where required | Entry saved and signed |  |  |  |
| 5 | Confirm the entry records who made it and the actual time it was made | Attribution and system timestamp present |  |  |  |
| 6 | Confirm the recorded time is system-generated and not editable by the operator | Timestamp not user-controlled |  |  |  |
| 7 | Where the form captures an activity date distinct from the entry time, confirm both are stored | Both present |  |  |  |

### TC-10-05 — Training gate *(URS-LOG-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Operator (untrained)** — not trained on the linked document — attempt to make an entry | The entry is **blocked**, with a reason identifying the missing training |  |  |  |
| 2 | Confirm the block cannot be bypassed by the operator | No override available to the operator |  |  |  |
| 3 | Complete and verify the required training for that operator | Training verified |  |  |  |
| 4 | Attempt the entry again | The entry is now permitted |  |  |  |
| 5 | Confirm assigning an untrained operator produces a warning to the assigner | Warning shown at assignment |  |  |  |

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
| 3 | Confirm review sign-offs appear on the register | Sign-offs shown |  |  |  |
| 4 | Confirm corrections are identifiable on the register | Corrections visible |  |  |  |
| 5 | Save as PDF and confirm nothing is truncated | Complete |  |  |  |

**Attach the register as objective evidence.**

### TC-10-09 — Audit trail *(URS-LOG-09)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the log book's audit history | Definition, activation, assignments, entries, corrections and sign-offs are recorded |  |  |  |
| 2 | Inspect a correction entry | Original and corrected values both shown, with the reason |  |  |  |
| 3 | Confirm each entry carries performer and timestamp | Present |  |  |  |
| 4 | Confirm no audit entry can be edited or deleted | None available |  |  |  |

## 5. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 6. Execution summary

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
