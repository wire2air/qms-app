---
id: oq-item-master
title: OQ-14 Item Master
sidebar_position: 14
description: Operational Qualification protocol for item registration, code uniqueness, supplier association, downstream use and withdrawal.
keywords: [OQ, item master, product, part number, UOM, supplier link, test script]
---

# OQ-14 — Item Master

**Document ID:** VAL-OQ-14 · **Version:** 1.0 · **Module:** Item Master

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify that items are registered with unambiguous identification, that codes cannot be
duplicated, that items can be associated with their suppliers, and that an item withdrawn
from use never breaks or rewrites the records that already reference it.

The item master is reference data other modules depend on. Its risk is not that it fails
loudly, but that an ambiguous or reused item code silently makes a nonconformance point at
the wrong product.

## 2. Requirements verified

URS-ITM-01 … URS-ITM-06. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §17.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | At least one supplier exists |  |
| 4 | Units of measure and item types configured |  |
| 5 | Test accounts: **Item Manager**, **Read-Only User**, **No-Access** |  |

## 4. Test cases

### TC-14-01 — Registration *(URS-ITM-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Create an item | The form opens |  |  |  |
| 2 | Attempt to save without the item name | Refused |  |  |  |
| 3 | Attempt to save without the item code / SKU | Refused |  |  |  |
| 4 | Enter name, code, description, item type and unit of measure | Saved |  |  |  |
| 5 | Record the ERP or external reference code, where used | Saved |  |  |  |
| 6 | Confirm the item is retrievable by name and by code | Search returns it |  |  |  |
| 7 | Confirm long names and names containing special characters are stored and displayed unchanged | Round-trip unchanged |  |  |  |

**Item code used:** ______________________

### TC-14-02 — Code uniqueness *(URS-ITM-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Attempt to create a second item with the same code | Refused, with a clear message |  |  |  |
| 2 | Attempt the same code in a different letter case | Record whether this is treated as a duplicate — confirm the behaviour matches your procedure |  |  |  |
| 3 | Attempt the same code with leading or trailing whitespace | Record the behaviour; whitespace should not create a near-duplicate |  |  |  |
| 4 | Confirm an existing item's code cannot be changed to one already in use | Refused |  |  |  |

> Steps 2 and 3 are where near-duplicates get in. If either creates a second item, raise it
> as a deviation and put a procedural control in place, even if the software permits it.

### TC-14-03 — Supplier association *(URS-ITM-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Associate the item with a supplier | Association saved |  |  |  |
| 2 | Associate the same item with a second supplier | Both associations exist |  |  |  |
| 3 | Confirm the associations are visible from the item and from each supplier | Bidirectional visibility |  |  |  |
| 4 | Record the supplier's own part reference against the association, where supported | Saved |  |  |  |
| 5 | Remove one association | Removed; the other is unaffected |  |  |  |
| 6 | Confirm the change appears in the audit trail | Entry present |  |  |  |

### TC-14-04 — Downstream use *(URS-ITM-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Raise a nonconformance and select the item | Item selectable; selection saved |  |  |  |
| 2 | Log a complaint and select the item | Item selectable; selection saved |  |  |  |
| 3 | Where QC Inspection is in use, create an inspection lot for the item | Item selectable |  |  |  |
| 4 | Confirm the item shown on each downstream record is the one selected, with the correct code | Correct item in every case |  |  |  |
| 5 | Where the item's unit of measure drives a quantity field, confirm the correct unit is applied | Unit correct |  |  |  |
| 6 | Confirm records referencing the item can be found from the item, where such a view exists | Cross-reference available, or note it is not |  |  |  |

### TC-14-05 — Withdrawal from use *(URS-ITM-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Deactivate or withdraw the item | Status change saved and attributed |  |  |  |
| 2 | Attempt to select the withdrawn item on a **new** record | Not offered for selection |  |  |  |
| 3 | Open an **existing** record that references the withdrawn item | The record still shows the item correctly, with its code and name intact |  |  |  |
| 4 | Confirm the withdrawn item is still retrievable for reference | Retrievable, clearly marked inactive |  |  |  |
| 5 | Reactivate the item and confirm it becomes selectable again | Restored |  |  |  |
| 6 | Confirm both status changes are in the audit trail | Entries present |  |  |  |

### TC-14-06 — Audit trail *(URS-ITM-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the item's audit history | Creation, every field change, supplier associations and status changes are recorded |  |  |  |
| 2 | Inspect an update entry | Old and new values shown |  |  |  |
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
| TC-14-01 |  |  |  |  |  |
| TC-14-02 |  |  |  |  |  |
| TC-14-03 |  |  |  |  |  |
| TC-14-04 |  |  |  |  |  |
| TC-14-05 |  |  |  |  |  |
| TC-14-06 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
