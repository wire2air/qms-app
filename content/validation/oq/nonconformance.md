---
id: oq-nonconformance
title: OQ-03 Nonconformance
sidebar_position: 3
description: Operational Qualification protocol for raising, investigating, dispositioning and closing nonconformances under workflow control.
keywords: [OQ, nonconformance, NC, disposition, closure, e-signature, test script]
---

# OQ-03 — Nonconformance

**Document ID:** VAL-OQ-03 · **Version:** 1.0 · **Module:** Nonconformance / NCR

| Role                      | Name | Title | Signature | Date |
| ------------------------- | ---- | ----- | --------- | ---- |
| Protocol prepared by      |      |       |           |      |
| Protocol approved by (QA) |      |       |           |      |
| Executed by               |      |       |           |      |
| Execution reviewed by     |      |       |           |      |

**System version under test:** ******\_\_****** **Environment:** ******\_\_******

## 1. Objective

To verify that nonconformances are captured with the classification your procedure
requires, become permanent records once opened, are investigated through a controlled
workflow, and cannot be closed until disposition, justification and any required corrective
action are in place.

## 2. Requirements verified

URS-NCR-01 … URS-NCR-10. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §6.

## 3. Prerequisites

| #   | Prerequisite                                                            | Confirmed (init/date) |
| --- | ----------------------------------------------------------------------- | --------------------- |
| 1   | This protocol is approved before execution                              |                       |
| 2   | IQ executed and passed                                                  |                       |
| 3   | NC types, detection sources, severities and dispositions are configured |                       |
| 4   | A published workflow template exists for the Nonconformance module      |                       |
| 5   | Test accounts: **NC Owner**, **Reviewer**, **No-Access**                |                       |
| 6   | E-signature credentials established for the owner                       |                       |

## 4. Test cases

### TC-03-01 — Raising with mandatory classification _(URS-NCR-01)_

| #   | Test step                                                                              | Expected result                          | Actual result | P/F | Init / Date |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------- | ------------- | --- | ----------- |
| 1   | As **NC Owner**, start raising a nonconformance                                        | The form opens                           |               |     |             |
| 2   | Attempt to submit with the title empty                                                 | Refused; the missing field is identified |               |     |             |
| 3   | Attempt to submit without a severity                                                   | Refused                                  |               |     |             |
| 4   | Attempt to submit without an NC type                                                   | Refused                                  |               |     |             |
| 5   | Attempt to submit without a detection source                                           | Refused                                  |               |     |             |
| 6   | Attempt to submit without site, department or owner                                    | Refused in each case                     |               |     |             |
| 7   | Attempt to submit without selecting a workflow                                         | Refused                                  |               |     |             |
| 8   | Complete all required fields and add optional product, lot and quantity detail; submit | The NC is created in **Draft**           |               |     |             |
| 9   | Confirm any duplicate-detection prompt behaves as configured                           | Behaviour recorded                       |               |     |             |

**NC number created:** **********\_\_**********

### TC-03-02 — Unique identification _(URS-NCR-02)_

| #   | Test step                                          | Expected result                            | Actual result | P/F | Init / Date |
| --- | -------------------------------------------------- | ------------------------------------------ | ------------- | --- | ----------- |
| 1   | Record the number assigned                         | It follows the configured pattern          |               |     |             |
| 2   | Raise a second NC for the same site and department | A different, sequential number is assigned |               |     |             |
| 3   | Attempt to edit the NC number                      | Not editable by the user                   |               |     |             |

### TC-03-03 — Draft is provisional _(URS-NCR-03)_

| #   | Test step                                                 | Expected result                         | Actual result | P/F | Init / Date |
| --- | --------------------------------------------------------- | --------------------------------------- | ------------- | --- | ----------- |
| 1   | While in Draft, amend the title, severity and description | Changes save                            |               |     |             |
| 2   | Confirm the amendments are recorded in the audit trail    | Entries present with old and new values |               |     |             |
| 3   | Delete the **second** draft NC raised in TC-03-02         | Deletion succeeds while in Draft        |               |     |             |
| 4   | Confirm the deletion is recorded in the audit trail       | Delete entry present                    |               |     |             |

### TC-03-04 — Opening creates a permanent record _(URS-NCR-04)_

| #   | Test step                                              | Expected result                                                  | Actual result | P/F | Init / Date |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | As a user other than the owner, attempt to open the NC | The action is unavailable or refused                             |               |     |             |
| 2   | As **NC Owner**, open the NC                           | A confirmation explains that the record becomes permanent        |               |     |             |
| 3   | Confirm                                                | Status becomes **Open**; the workflow's first step activates     |               |     |             |
| 4   | Confirm the assigned reviewer receives a task          | Task appears for **Reviewer**                                    |               |     |             |
| 5   | Attempt to delete the NC now                           | Deletion is refused — the record can only be closed or cancelled |               |     |             |

### TC-03-05 — Workflow execution _(URS-NCR-05)_

| #   | Test step                                                                                         | Expected result                                                        | Actual result | P/F | Init / Date |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | As a user who is **not** the step assignee, attempt to complete the active step                   | Refused                                                                |               |     |             |
| 2   | As **Reviewer**, open the active step and complete any required form fields                       | Field validation is enforced                                           |               |     |             |
| 3   | Attempt to complete the step leaving a required comment blank, where the step requires comments   | Refused                                                                |               |     |             |
| 4   | Complete the step correctly                                                                       | The step completes; the next step activates and its assignee is tasked |               |     |             |
| 5   | Confirm the completed step records who completed it and when                                      | Attribution and timestamp present                                      |               |     |             |
| 6   | Confirm no later step could be actioned before its predecessor completed                          | Sequence enforced                                                      |               |     |             |
| 7   | Where a step requires a signature, confirm the prompt appears and refuses an incorrect credential | Signature enforced                                                     |               |     |             |

### TC-03-06 — Disposition and justification _(URS-NCR-06)_

| #   | Test step                                                                     | Expected result                                                   | Actual result | P/F | Init / Date |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | Attempt to close the NC before selecting a disposition                        | Closure is unavailable or refused, and the reason is communicated |               |     |             |
| 2   | Select a disposition                                                          | Saved                                                             |               |     |             |
| 3   | Attempt to close with disposition notes blank                                 | Refused; notes are required                                       |               |     |             |
| 4   | Where the selected disposition tracks cost, attempt to close without the cost | Refused; cost is required                                         |               |     |             |
| 5   | Enter the disposition notes and any required cost                             | Saved                                                             |               |     |             |
| 6   | Confirm the disposition and notes are recorded in the audit trail             | Entries present                                                   |               |     |             |

### TC-03-07 — CAPA gating _(URS-NCR-07)_

| #   | Test step                                                                            | Expected result                         | Actual result | P/F | Init / Date |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------- | ------------- | --- | ----------- |
| 1   | Set **CAPA required** to Yes                                                         | A linked-CAPA section becomes available |               |     |             |
| 2   | Attempt to close the NC with no CAPA linked                                          | Closure is refused                      |               |     |             |
| 3   | Create a CAPA from the NC                                                            | The CAPA opens pre-linked to this NC    |               |     |             |
| 4   | Confirm the link is visible from both records                                        | Link shown on the NC and on the CAPA    |               |     |             |
| 5   | Confirm closure is now permitted, once all other conditions are met                  | Gate is satisfied                       |               |     |             |
| 6   | On a separate NC, set CAPA required to No and confirm closure does not demand a CAPA | Gate applies only when required         |               |     |             |

### TC-03-08 — Closure and immutability _(URS-NCR-08)_

| #   | Test step                                                  | Expected result                                                   | Actual result | P/F | Init / Date |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | Ensure all workflow steps are complete                     | No steps remain open                                              |               |     |             |
| 2   | Initiate closure and enter an incorrect signing credential | Closure is refused and the NC remains open                        |               |     |             |
| 3   | Complete closure with the correct credential               | Status becomes **Closed**                                         |               |     |             |
| 4   | Inspect the closure signature                              | Name, date/time and meaning recorded                              |               |     |             |
| 5   | Attempt to edit any field of the closed NC                 | Editing is prevented                                              |               |     |             |
| 6   | Attempt to delete the closed NC                            | Refused                                                           |               |     |             |
| 7   | Print the closed NC                                        | A complete, legible copy is produced showing status and signature |               |     |             |

### TC-03-09 — Cancellation _(URS-NCR-09)_

| #   | Test step                                                       | Expected result                                             | Actual result | P/F | Init / Date |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | On a separate opened NC, initiate cancellation without a reason | Refused; a reason is required                               |               |     |             |
| 2   | Enter a reason and complete cancellation with signature         | Status becomes **Cancelled**; reason and signature recorded |               |     |             |
| 3   | Confirm any in-progress workflow steps are stopped              | Steps no longer actionable                                  |               |     |             |
| 4   | Confirm the cancelled record remains retrievable                | Record readable, clearly not active                         |               |     |             |

### TC-03-10 — Audit trail _(URS-NCR-10)_

| #   | Test step                                                     | Expected result                                                                                         | Actual result | P/F | Init / Date |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | Open the NC audit history                                     | Creation, field changes, opening, each workflow action, disposition, CAPA link, closure are all present |               |     |             |
| 2   | Inspect an update entry                                       | Old and new values shown                                                                                |               |     |             |
| 3   | Confirm workflow step actions appear with their performer     | Present                                                                                                 |               |     |             |
| 4   | Confirm no edit or delete capability exists for audit entries | None available                                                                                          |               |     |             |
| 5   | Export the NC audit history                                   | Export produced and complete                                                                            |               |     |             |

## 5. Deviation log

| #   | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | -------- | ----------- | ----------------- | ----------- | ------------- | ---------------- |
| 1   |          |             |                   |             |               |                  |
| 2   |          |             |                   |             |               |                  |

## 6. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --------- | ----- | ------ | ------ | --- | ------------- |
| TC-03-01  |       |        |        |     |               |
| TC-03-02  |       |        |        |     |               |
| TC-03-03  |       |        |        |     |               |
| TC-03-04  |       |        |        |     |               |
| TC-03-05  |       |        |        |     |               |
| TC-03-06  |       |        |        |     |               |
| TC-03-07  |       |        |        |     |               |
| TC-03-08  |       |        |        |     |               |
| TC-03-09  |       |        |        |     |               |
| TC-03-10  |       |        |        |     |               |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role                                   | Name | Signature | Date |
| -------------------------------------- | ---- | --------- | ---- |
| Executed by                            |      |           |      |
| Reviewed by (independent of execution) |      |           |      |
| Approved by (QA)                       |      |           |      |
