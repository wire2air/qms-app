---
id: oq-equipment-calibration
title: OQ-11 Equipment & Calibration
sidebar_position: 11
description: Operational Qualification protocol for equipment registration, calibration due tracking, preventive maintenance scheduling and status control.
keywords: [OQ, equipment, calibration, preventive maintenance, due date, out of service, test script]
---

# OQ-11 — Equipment & Calibration

**Document ID:** VAL-OQ-11 · **Version:** 1.0 · **Module:** Equipment / Calibration

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify that equipment is registered and identifiable, that calibration and preventive
maintenance due dates are tracked and surfaced before they lapse, and that equipment
status changes are recorded — so that a measurement is never taken on an instrument that
is out of calibration without that being visible.

## 2. Requirements verified

URS-EQP-01 … URS-EQP-06. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §14.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | Sites and departments configured |  |
| 4 | Test accounts: **Equipment Owner**, **Read-Only User**, **No-Access** |  |
| 5 | The equipment owner has an e-signature credential (PIN) established |  |
| 6 | The **Equipment Owner** account holds create, update and delete on the equipment module, plus **Audit Trail read** for TC-11-06 |  |

> **Read this before planning any access test.** The equipment register needs **no permission
> at all to read**. The module has no read action — it was deliberately removed — and the list
> and get routes carry no permission gate, so the **Read-Only User** and the **No-Access**
> account both see the whole register. An executor who plans a no-access denial test against
> the register will record a false failure. Confine access testing to create, update and
> delete, and record the open read as observed behaviour. Audit Trail read is gated
> separately — see TC-11-06.

## 4. Test cases

### TC-11-01 — Registration *(URS-EQP-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Create an equipment record | The form opens |  |  |  |
| 2 | Attempt to save without the equipment code or name | Refused |  |  |  |
| 3 | Enter code, name, manufacturer, model, serial number, site, department and location | Saved |  |  |  |
| 4 | Attempt to create a second record with the same equipment code | Refused — uniqueness is enforced at the database |  |  |  |
| 4a | Attempt the same equipment code again in a different case (for example `bal-001` against `BAL-001`) | Accepted as a separate item — record the outcome |  |  |  |
| 5 | Confirm the record is retrievable by code and by name | Search returns it |  |  |  |
| 6 | Record the calibration certificate reference and its URL on the equipment record | Certificate number and URL both save and reopen |  |  |  |

**Equipment code used:** ______________________

> **Read this before recording step 2.** The equipment **code cannot be changed after
> creation** — the field is disabled on edit. Record the correct code first time; a
> mistyped code has to be corrected by creating a new record.

> **Read this before recording steps 4 and 4a.** Uniqueness is enforced at the database and
> scoped to the tenant, but it is **case-sensitive**: the same code in a different case is
> accepted as a separate item. Step 4a is not a failure of step 4 — record both outcomes,
> and identify the procedural control for code case if your numbering convention relies on
> it.

> **Read this before recording step 6.** There is **no attachment capability for equipment**.
> What the record holds is a certificate **number and an external URL** — the system stores a
> link, not an uploaded file. The linked document must therefore be retained under the
> organisation's own document control; record where it is held.

### TC-11-02 — Calibration due tracking *(URS-EQP-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the calibration interval and the last calibration date | Saved |  |  |  |
| 2 | Confirm the next calibration due date is derived correctly from the interval | Date matches manual calculation |  |  |  |
| 3 | Record a completed calibration with its date and result | Saved; the next due date advances correctly |  |  |  |
| 4 | Record the calibration certificate number and its document link | Certificate number and link both save and reopen |  |  |  |
| 5 | Confirm what record of the previous calibration is retained, and record the behaviour | The equipment record holds only the **current** calibration |  |  |  |
| 6 | Set an equipment record's due date to a past date | The record is identifiable as overdue |  |  |  |

> **Read this before starting.** The calibration interval carries a **unit** — days, weeks or
> months. Record the interval *and* its unit, or the manual calculation in step 2 will not
> match. Calibration tracking is also an **opt-in flag** on the equipment: unless it is
> enabled, no due date is computed and no notification is ever sent. Confirm the flag is on
> before executing.

> **Read this before recording step 3.** Recording a calibration requires three inputs: a
> **certificate number**, a **vendor**, and an **e-signature**. Have the owner's signature
> credential to hand (prerequisite 5) — without it the calibration cannot be saved and the
> step will appear to fail for the wrong reason.

> **Read this before recording step 4.** There is no attachment capability. The record holds
> a certificate number and an **external document link**, not an uploaded file, so the
> certificate itself must be retained under the organisation's own document control.

> **Read this before recording step 5.** Each calibration **overwrites** the equipment
> record — the module keeps one calibration table by design, and there is no
> calibration-history view. Prior calibrations survive only in the **audit trail** and in the
> **signature records**. Record that behaviour rather than a missing-history failure.
>
> If the organisation's SOP requires a retrievable calibration history, this is a
> **deviation**: raise it in the deviation log and identify the compensating control — for
> example retaining each certificate under document control.

### TC-11-03 — Preventive maintenance *(URS-EQP-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the preventive maintenance interval and last service date | Saved |  |  |  |
| 2 | Confirm the next PM due date is derived correctly | Date matches manual calculation |  |  |  |
| 3 | Record a completed maintenance activity | Saved; next due date advances |  |  |  |
| 4 | Confirm what record of the previous maintenance is retained, and record the behaviour | The equipment record holds only the **current** maintenance dates |  |  |  |
| 5 | Where PM generates a scheduled task, confirm the responsible person is tasked when it falls due | Task raised to the right person |  |  |  |

> **Read this before starting.** As with calibration, the preventive-maintenance interval
> carries a **unit** (days, weeks or months) — record interval and unit together so the
> manual calculation in step 2 matches. Preventive-maintenance tracking is an **opt-in flag**
> on the equipment: unless it is enabled, no due date is computed and no notification is ever
> sent.

> **Read this before recording step 4.** Each maintenance entry **overwrites** the equipment
> record; there is no maintenance-history view. Previous entries survive only in the **audit
> trail**. Record that behaviour, and if the SOP requires a retrievable maintenance history,
> raise it as a **deviation** and identify the compensating control — for example retaining
> service reports under document control.

### TC-11-04 — Status control *(URS-EQP-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Change the equipment status to out of service | Status change saved |  |  |  |
| 2 | Confirm whether a reason is captured for the status change | No reason field is provided — record the procedural control by which the reason is documented |  |  |  |
| 3 | Confirm the out-of-service state is plainly visible on the record and in the equipment list | Clearly indicated |  |  |  |
| 4 | Return the equipment to service | Status restored; the change is recorded |  |  |  |
| 5 | Confirm both status changes appear in the audit trail with performer and timestamp | Entries present |  |  |  |

> **Read this before recording step 2.** There is **no reason field** for an equipment status
> change anywhere in the product. Record that, and record where the reason is documented
> instead — the procedural control, not a system field. Text typed into the **Notes** field
> is **not captured in the audit trail**, so it cannot serve as the record.

> **Read this before recording step 4.** Equipment set to **RETIRED cannot be returned
> directly to service** — reinstatement must go through out-of-service first. Permitted
> transitions are: in-service to out-of-service or retired; out-of-service to in-service or
> retired; retired to out-of-service only. If the instrument was retired rather than taken
> out of service, route it back through out-of-service and record that path, not a failure.

### TC-11-05 — Overdue visibility *(URS-EQP-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Using the overdue record from TC-11-02, open the equipment list | The overdue item is visibly flagged |  |  |  |
| 2 | Sort or filter by calibration due date to bring overdue items together | Overdue items are identifiable in the list |  |  |  |
| 3 | Confirm a notification or task is raised to the responsible person for an approaching due date | Alert received |  |  |  |
| 4 | Record the advance-warning intervals in use | Notifications are issued **30 and 7 days before due, on the due date, and at 1, 7, 14 and 30 days overdue**; the list highlights items due within 30 days |  |  |  |
| 5 | Where your process requires it, confirm equipment out of calibration cannot be selected in an inspection or record | Behaviour recorded — see the note below for the one place this is enforced |  |  |  |

> **Read this before recording step 2.** There is **no overdue or due-soon filter preset**.
> The list offers status and category filters plus a date-range filter on the due-date
> columns. Overdue items are flagged visually and items due within 30 days are highlighted,
> so sort or filter by due date and confirm they are identifiable that way.

> **Read this before recording step 3.** Notifications come from **nightly scheduled jobs**,
> not on save — calibration and preventive maintenance run as separate jobs, each daily at a
> fixed time. The step therefore requires waiting for the next run or having the job
> triggered, otherwise it will appear to fail.
>
> The notification windows are **exact-day matches, not ranges**: an instrument whose due date
> is 12 days away receives nothing until day 7. An instrument is **skipped entirely** unless
> its *requires calibration* (or *requires PM*) flag is enabled, and **retired equipment is
> excluded from all reminders**. Recipients escalate from the custodian to the department
> supervisor to the company owners, so the equipment must have an **owner set**.

> **Read this before recording step 4.** These intervals are **fixed in the application and
> not user-configurable** — there is no lead-time setting to record. Confirm the fixed
> intervals satisfy your procedure, and raise a deviation if your SOP requires different
> advance warning.

> **Read this before recording step 5.** The product refuses an out-of-calibration instrument
> in **one place only**: recording QC inspection results against a characteristic that
> requires an instrument, where the refusal is server-side — see
> [OQ-09](/validation/oq/qc-inspection). Everywhere else there is no control: equipment
> pickers elsewhere do not filter on calibration state, an out-of-service instrument remains
> selectable, and the warning banner on the QC lot screen has no block behind it. Record that
> boundary, and identify the **procedural control for all other uses** — it must be
> documented, not assumed.

### TC-11-06 — Audit trail *(URS-EQP-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open **Audit Logs** and filter by module **Calibration / Equipment** | Entries for the record are present, covering creation, tracked field changes, calibration and maintenance updates, and status changes |  |  |  |
| 2 | Inspect an update entry | Old and new values shown |  |  |  |
| 3 | Confirm each entry carries performer and timestamp | Present |  |  |  |
| 4 | Confirm no audit entry can be edited or deleted | None available |  |  |  |
| 5 | Export the equipment list to CSV with the record included | Complete, legible export of current equipment data produced |  |  |  |

> **Read this before executing.** Equipment audit rows are readable only by a **company owner
> or a holder of Audit Trail read** permission. Without that grant the page renders **empty
> rather than denied** — and an empty trail is not evidence that no changes occurred. Confirm
> the executing account holds the grant before recording any step below.

> **Read this before recording step 1.** What is recorded is not in doubt: the audit registry
> tracks the whole calibration and preventive-maintenance programme, all four
> certificate-evidence columns and the soft-delete column, alongside the record's
> identification, location, ownership and status fields. Status changes
> are recorded as semantic actions (activate, deactivate, retire), old and new values are both
> captured, and the trigger fires on insert, update and delete. What is missing is only the
> **read surface**. Three traps follow from that:
>
> - There is **no audit view on the equipment record itself** — equipment has no detail page —
>   and **no per-record filter** on the central audit page, so identify the record's entries
>   within the module-filtered list. An equipment entry in the global trail is **unlinked
>   text**, not a link back to the record.
> - The module is named **Calibration / Equipment**, not Equipment.
> - The list returns only the **most recent 200 entries** — narrow the date range if entries
>   appear to be missing.
>
> One exclusion is deliberate: **description and notes are not tracked**, so an edit touching
> only those two fields produces **no audit entry at all**. Do not use a description-only or
> notes-only edit as the test change for this step.

> **Read this before recording step 2.** The old and new values appear in an **expandable row
> detail** — click the entry to expand the comparison. They are not shown on the collapsed
> line.

> **Read this before recording step 3.** System-initiated changes — such as the nightly
> due-date and notification jobs — legitimately show **no performer**. Record that as
> expected rather than as a missing attribution.

> **Read this before recording step 5.** There is **no print module and no per-record export**
> for equipment. Export the list to CSV instead. The export carries **current** calibration
> and maintenance due dates only, not a history — calibration history cannot be exported
> because it is not stored (see the note under TC-11-02 step 5).

## 5. Controls this protocol does not test

The behaviours below are present in the product but are not exercised by the test cases
above. A risk assessment may require the organisation to cover them with its own test cases
or procedural controls — review each against your procedure and record the decision.

- **The database refuses returning retired equipment directly to service**, independently of
  the interface.
- **Recording a calibration requires a verified e-signature and writes a signature record** —
  a Part 11 control with no step in this protocol.
- **The calibration certificate columns cannot be forged**: a database trigger refuses any
  write to them from the data-sync path and they are excluded from the ordinary update path,
  so they are writable only through the signed record-calibration action.
- **A wrong e-signature credential leaves the calibration date unchanged**, because the
  signature is verified inside the same transaction.
- **An out-of-calibration instrument is refused when recording QC inspection results against
  a characteristic requiring an instrument** — the module's headline control.
- **Audit entries cannot be edited or deleted by anyone**, enforced at the database.

## 6. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 7. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --- | --- | --- | --- | --- | --- |
| TC-11-01 |  |  |  |  |  |
| TC-11-02 |  |  |  |  |  |
| TC-11-03 |  |  |  |  |  |
| TC-11-04 |  |  |  |  |  |
| TC-11-05 |  |  |  |  |  |
| TC-11-06 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
