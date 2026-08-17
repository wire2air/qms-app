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

## 4. Test cases

### TC-11-01 — Registration *(URS-EQP-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Create an equipment record | The form opens |  |  |  |
| 2 | Attempt to save without the equipment code or name | Refused |  |  |  |
| 3 | Enter code, name, manufacturer, model, serial number, site, department and location | Saved |  |  |  |
| 4 | Attempt to create a second record with the same equipment code | Refused, if uniqueness is enforced — record the behaviour |  |  |  |
| 5 | Confirm the record is retrievable by code and by name | Search returns it |  |  |  |
| 6 | Attach a document to the equipment record (for example a manual or certificate) | Attachment saves and reopens |  |  |  |

**Equipment code used:** ______________________

### TC-11-02 — Calibration due tracking *(URS-EQP-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the calibration interval and the last calibration date | Saved |  |  |  |
| 2 | Confirm the next calibration due date is derived correctly from the interval | Date matches manual calculation |  |  |  |
| 3 | Record a completed calibration with its date and result | Saved; the next due date advances correctly |  |  |  |
| 4 | Attach the calibration certificate | Attachment saves and reopens |  |  |  |
| 5 | Confirm the calibration history is retained, not overwritten | Previous calibrations remain visible |  |  |  |
| 6 | Set an equipment record's due date to a past date | The record is identifiable as overdue |  |  |  |

### TC-11-03 — Preventive maintenance *(URS-EQP-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the preventive maintenance interval and last service date | Saved |  |  |  |
| 2 | Confirm the next PM due date is derived correctly | Date matches manual calculation |  |  |  |
| 3 | Record a completed maintenance activity | Saved; next due date advances |  |  |  |
| 4 | Confirm the maintenance history is retained | Previous entries remain |  |  |  |
| 5 | Where PM generates a scheduled task, confirm the responsible person is tasked when it falls due | Task raised to the right person |  |  |  |

### TC-11-04 — Status control *(URS-EQP-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Change the equipment status to out of service | Status change saved |  |  |  |
| 2 | Confirm a reason is captured for the status change | Reason recorded, or record that it is not required |  |  |  |
| 3 | Confirm the out-of-service state is plainly visible on the record and in the equipment list | Clearly indicated |  |  |  |
| 4 | Return the equipment to service | Status restored; the change is recorded |  |  |  |
| 5 | Confirm both status changes appear in the audit trail with performer and timestamp | Entries present |  |  |  |

### TC-11-05 — Overdue visibility *(URS-EQP-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Using the overdue record from TC-11-02, open the equipment list | The overdue item is visibly flagged |  |  |  |
| 2 | Filter the list to show only overdue or due-soon equipment | Filter returns the expected records |  |  |  |
| 3 | Confirm a notification or task is raised to the responsible person for an approaching due date | Alert received |  |  |  |
| 4 | Record the lead time configured for advance warning | Recorded: ______ days |  |  |  |
| 5 | Where your process requires it, confirm equipment out of calibration cannot be selected in an inspection or record | Behaviour recorded — if not enforced by the system, note the procedural control instead |  |  |  |

> Step 5 frequently reveals a gap. If the system does not block use of out-of-calibration
> equipment, that is not necessarily a failure — but the compensating procedural control
> must be identified and documented, not assumed.

### TC-11-06 — Audit trail *(URS-EQP-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the equipment record's audit history | Creation, field changes, calibrations, maintenance and status changes are recorded |  |  |  |
| 2 | Inspect an update entry | Old and new values shown |  |  |  |
| 3 | Confirm each entry carries performer and timestamp | Present |  |  |  |
| 4 | Confirm no audit entry can be edited or deleted | None available |  |  |  |
| 5 | Print or export the equipment record with its calibration history | Complete, legible copy produced |  |  |  |

## 5. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 6. Execution summary

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
