---
id: oq-nonconformance
title: OQ-03 Nonconformance
sidebar_position: 3
description: Operational Qualification protocol for raising, investigating, dispositioning and closing nonconformances under workflow control.
keywords: [OQ, nonconformance, NC, disposition, closure, e-signature, test script]
---

# OQ-03 — Nonconformance

**Document ID:** VAL-OQ-03 · **Version:** 1.0 · **Module:** Nonconformance / NCR

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify that nonconformances are captured with the classification your procedure
requires, become permanent records once opened, are investigated through a controlled
workflow, and cannot be closed until disposition, justification and any required corrective
action are in place.

## 2. Requirements verified

URS-NCR-01 … URS-NCR-10. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §6.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | NC types, detection sources, severities and dispositions are configured |  |
| 4 | A published workflow template exists for the Nonconformance module |  |
| 5 | Test accounts: **NC Owner**, **Reviewer**, **No-Access** |  |
| 6 | E-signature credentials established for the owner |  |
| 7 | Audit Trail read and export permissions granted to the executing account |  |

## 4. Test cases

### TC-03-01 — Raising with mandatory classification *(URS-NCR-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **NC Owner**, start raising a nonconformance | The form opens |  |  |  |
| 2 | Attempt to submit with the title empty | Refused; the missing field is identified |  |  |  |
| 3 | Attempt to submit without a severity | Refused |  |  |  |
| 4 | Attempt to submit without an NC type | Refused |  |  |  |
| 5 | Attempt to submit without a detection source | Refused |  |  |  |
| 6 | Attempt to submit without site, department or owner | Refused in each case |  |  |  |
| 7 | Attempt to submit without selecting a workflow | Refused |  |  |  |
| 8 | Complete all required fields and add optional product, lot and quantity detail; submit | The NC is created in **Draft** |  |  |  |
| 9 | Duplicate detection — not provided for nonconformances | N/A; no duplicate-detection feature exists |  |  |  |

**NC number created:** ______________________

> **Read this before executing steps 2–7.** These steps test the **Create** path —
> the full submit — whose required fields are enforced by the server. Execute them
> via Create, not Save as Draft: the same form's **Save as Draft** deliberately
> accepts a title alone, and completeness is instead enforced when the draft is
> **Opened** (TC-03-04), where the refusal names the missing fields. A draft saving
> with fields blank is therefore correct behaviour, not a failure.
>
> **Step 9 is N/A.** There is no duplicate-detection feature for nonconformances —
> no prompt, no configuration behind one. Record N/A with that justification rather
> than a failure.

### TC-03-02 — Unique identification *(URS-NCR-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the number assigned | It follows the configured pattern |  |  |  |
| 2 | Raise a second NC for the same site and department | A different, sequential number is assigned |  |  |  |
| 3 | Attempt to edit the NC number | Not editable by the user |  |  |  |

### TC-03-03 — Draft is provisional *(URS-NCR-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | While in Draft, amend the title, severity and description | Changes save |  |  |  |
| 2 | Confirm the amendments are recorded in the audit trail | Entries present with old and new values |  |  |  |
| 3 | Delete the **second** draft NC raised in TC-03-02 | Deletion succeeds while in Draft |  |  |  |
| 4 | Confirm the deletion is recorded in the audit trail | Delete entry present |  |  |  |

### TC-03-04 — Opening creates a permanent record *(URS-NCR-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As a user other than the owner, attempt to open the NC | The action is unavailable or refused |  |  |  |
| 2 | As **NC Owner**, open the NC | A confirmation explains that the record becomes permanent |  |  |  |
| 3 | Confirm | Status becomes **Open**; the workflow's first step activates |  |  |  |
| 4 | Confirm the assigned reviewer receives a task | Task appears for **Reviewer** |  |  |  |
| 5 | Attempt to delete the NC now | Deletion is prevented **in the interface** |  |  |  |

> **Read this before recording step 5 as a pass.** The control is
> **interface-only**. The Delete action is offered only while the record is in
> Draft, so an executor working through the interface cannot delete an opened NC —
> which is what this step tests. The server, however, gates deletion on the
> **delete permission**, not on status. This step therefore evidences the interface
> control, not an API-level refusal; do not record it as proof that deletion is
> impossible for a caller holding that permission.

### TC-03-05 — Workflow execution *(URS-NCR-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As a user who holds **neither** the assignment **nor** the step's own action (update for a task step, approve for an approval step), attempt to complete the active step | Refused |  |  |  |
| 2 | As **Reviewer**, open the active step and complete any required form fields | Field validation is enforced |  |  |  |
| 3 | Attempt to complete the step leaving a required comment blank, where the step requires comments | Record the observed behaviour |  |  |  |
| 4 | Complete the step correctly | The step completes; the next step activates and its assignee is tasked |  |  |  |
| 5 | Confirm the completed step records who completed it and when | Attribution and timestamp present |  |  |  |
| 6 | Confirm no later step could be actioned before its predecessor completed | Sequence enforced |  |  |  |
| 7 | Where a step requires a signature, confirm the prompt appears and refuses an incorrect credential | Signature enforced |  |  |  |

> **Read this before recording steps 1 and 3 as a pass.**
>
> **Step 1 — an assignment is routing, not an exclusive lock.** A user whose role
> grants the step's action on that record — update for a task step, approve for an
> approval step — **may** complete it deliberately as a recorded take-over, and the
> assignee is notified. The audit trail names the actual actor, not the assignee.
> This is designed behaviour, not a failure. Only a user whose permissions do not
> cover the step's action is refused, which is why step 1 must be executed with an
> account holding neither the assignment nor that action. Choose the test account
> accordingly before you start.
>
> **Step 3 — the comment requirement is not enforced on this path.** The
> require-comments setting is stored and displayed, but the server does not enforce
> it when a step is completed. Record what you observe and verify it against the
> configuration; if your procedure relies on a mandatory step comment, raise a
> deviation and record the procedural control. A comment **is** genuinely mandatory
> when **rejecting or sending back** a step, and on an **effectiveness-check
> verdict** — test it there if you need evidence of an enforced comment.

### TC-03-06 — Disposition and justification *(URS-NCR-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Attempt to close the NC before selecting a disposition | Closure is unavailable or refused, and the reason is communicated |  |  |  |
| 2 | Select a disposition | Saved |  |  |  |
| 3 | Attempt to close with disposition notes blank | Refused; notes are required |  |  |  |
| 4 | Where the selected disposition tracks cost, attempt to close without the cost | Refused; cost is required |  |  |  |
| 5 | Enter the disposition notes and any required cost | Saved |  |  |  |
| 6 | Confirm the disposition and notes are recorded in the audit trail | Entries present |  |  |  |

> **Confirm the configuration before executing step 4.** The cost field is demanded
> only when the **selected** disposition is configured to track cost — it is a
> per-disposition setting, not a module-wide one. Confirm at least one such
> disposition exists and that step 4 uses it; otherwise the step cannot demonstrate
> the control and there is nothing to record.

### TC-03-07 — CAPA gating *(URS-NCR-07)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Set **CAPA required** to Yes | A linked-CAPA section becomes available |  |  |  |
| 2 | Attempt to close the NC with no CAPA linked | Closure is refused |  |  |  |
| 3 | Create a CAPA from the NC | The CAPA opens pre-linked to this NC |  |  |  |
| 4 | Confirm the link is visible from both records | Link shown on the NC and on the CAPA |  |  |  |
| 5 | Confirm closure is now permitted, once all other conditions are met | Gate is satisfied |  |  |  |
| 6 | On a separate NC, set CAPA required to No and confirm closure does not demand a CAPA | Gate applies only when required |  |  |  |

> **Record which path you used for step 3.** If your configuration offers the
> one-step **Raise NC with linked CAPA** shortcut, note that you used it. Both paths
> create the same link; the shortcut opens both records in a single transaction, so
> a failure part-way leaves nothing created — there is no orphaned NC or CAPA to
> clean up.

### TC-03-08 — Closure and immutability *(URS-NCR-08)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Ensure all workflow steps are complete | No steps remain open |  |  |  |
| 2 | Initiate closure and enter an incorrect signing credential | Closure is refused and the NC remains open |  |  |  |
| 3 | Complete closure with the correct credential | Status becomes **Closed** |  |  |  |
| 4 | Inspect the closure signature | Name, date/time and meaning recorded |  |  |  |
| 5 | Attempt to edit any field of the closed NC | Editing is prevented **in the interface** |  |  |  |
| 6 | Attempt to delete the closed NC | Deletion is prevented **in the interface** |  |  |  |
| 7 | Print the closed NC | A complete, legible copy is produced showing status and signature |  |  |  |

> **Read this before recording steps 2, 5 and 6 as a pass.**
>
> **Step 2 — name what a correct refusal looks like.** Expect a rejection that
> names the credential — "Invalid password" or "Invalid PIN". The nonconformance
> must remain **Open** with **no signature recorded**: verification runs inside the
> closing transaction, so nothing is written on a failed attempt. Allow for
> lock-out when planning retries — repeated wrong PIN attempts may lock
> e-signature for the account.
>
> **Step 5 — the edit lock is interface-only.** The database prevents **status
> changes** on a closed record but does not lock its other columns. Confirm the
> fields render **read-only**, not merely that a change fails to save: the detail
> page autosaves, so a field that still accepts input is the thing to look for.
>
> **Step 6 — as in TC-03-04 step 5**, the Delete action is offered only on a Draft,
> while the server gates deletion on the delete permission rather than on status.
> These steps evidence the interface control, not an API-level refusal.

### TC-03-09 — Cancellation *(URS-NCR-09)* — **Not implemented in this version — mark N/A**

> **Read this before executing.** A Cancelled state exists in the database, and the
> transition guard permits Draft-to-Cancelled and Open-to-Cancelled, but **no
> cancellation action is provided to the user** — there is no endpoint and no
> button. The only "cancel" in the module cancels a single **workflow step**, which
> is a different thing; do not record that as evidence of record cancellation. Note
> also that the Open-confirmation dialog's own wording promises cancellation that
> the product does not offer.
>
> An unwanted nonconformance is therefore disposed of one of two ways: **deleted
> while still in Draft** (TC-03-03), or **taken to closure with a disposition**
> (TC-03-08).
>
> **Mark this test case N/A and record that justification.** Then confirm your
> organisation's procedure does not require nonconformance cancellation as a
> distinct outcome. If it does, raise it as a supplier gap before go-live and
> record the interim procedural control. Do not assume parity across modules —
> [OQ-05](/validation/oq/change-control) does provide a cancellation action.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Confirm no record-level cancellation action is offered on an opened NC | Absent — recorded as N/A above |  |  |  |
| 2 | Confirm the module's "cancel" control acts on a workflow step, not the record | Step-level only |  |  |  |
| 3 | Record how your procedure disposes of an unwanted NC — Draft deletion or closure with a disposition | Documented |  |  |  |
| 4 | Confirm your procedure does not require NC cancellation; if it does, raise a supplier gap | Documented |  |  |  |

### TC-03-10 — Audit trail *(URS-NCR-10)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the NC audit history | Creation, field changes, opening, each workflow action, disposition, CAPA link, closure are all present |  |  |  |
| 2 | Inspect an update entry | Old and new values shown |  |  |  |
| 3 | Confirm workflow step actions appear with their performer | Present |  |  |  |
| 4 | Confirm no edit or delete capability exists for audit entries | None available |  |  |  |
| 5 | Export the NC audit history | Export produced and complete |  |  |  |

> **Read this before recording step 5.** Exporting the audit history needs the
> **Audit Trail** module's **read and export** permissions. These are separate
> grants from the nonconformance module's — an account that can read an NC and its
> history in full may still have neither. Without the export permission the CSV
> control is **hidden**, which is correct behaviour and not a failure: confirm the
> grant on the executing account (prerequisite 7) before recording a result, and
> record N/A with that justification if your procedure does not grant it.

## 5. Controls this protocol does not test

The controls below are enforced by the product but are out of scope here, because
reaching them requires access or tooling beyond the application's own screens. A
risk assessment may require your organisation to cover any of them with its own
test cases — decide that before approving this protocol, and record the decision.

- A nonconformance's owner and every workflow assignee are checked to belong to the same company — a multi-tenancy seal.
- A workflow step action is bound to this record's own workflow instance, so a step id belonging to another record is refused.
- The record's lifecycle cannot be driven through the application's data interface at all: the database refuses any status change from an untrusted caller and permits creation only in **Draft** — which is what makes the closure gates and the electronic signature unbypassable.
- A soft delete requires the delete permission at the database.
- A deliberate take-over of another user's step is attributed to the actual actor and notified to the assignee.
- The post-closure effectiveness-check loop can reopen a closed record on a "not effective" verdict.
- The supplier-facing nonconformance controls — approval steps must stay internal, and a supplier-facing record is otherwise immutable — are untested.

## 6. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 7. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --- | --- | --- | --- | --- | --- |
| TC-03-01 |  |  |  |  |  |
| TC-03-02 |  |  |  |  |  |
| TC-03-03 |  |  |  |  |  |
| TC-03-04 |  |  |  |  |  |
| TC-03-05 |  |  |  |  |  |
| TC-03-06 |  |  |  |  |  |
| TC-03-07 |  |  |  |  |  |
| TC-03-08 |  |  |  |  |  |
| TC-03-09 |  |  |  |  |  |
| TC-03-10 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
