---
id: oq-item-master
title: OQ-14 Item Master
sidebar_position: 14
description: Operational Qualification protocol for item registration, code uniqueness, supplier association, downstream use and withdrawal.
keywords: [OQ, item master, product, part number, UOM, supplier link, test script]
---

# OQ-14 — Item Master

**Document ID:** VAL-OQ-14 · **Version:** 1.0 · **Module:** Item Master (Products)

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

> **Read this before starting — the module is named differently in the product.** This
> protocol calls the module *Item Master*; in the application it appears as **Products**. Its
> URL and its exports use `products`, and the item code is labelled **SKU**. Without this an
> executor cannot find the module or its audit entries. Read every reference below to an
> "item" as a product record, and every reference to an "item code" as its SKU.

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
| 7 | Confirm long names and names containing special characters are stored and displayed unchanged, testing within the field limits recorded in the note below | Round-trip unchanged, up to 200 characters of item name and 100 characters of code |  |  |  |

**Item code used:** ______________________

> **Read this before recording steps 2 and 3.** The refusal is real, but it comes from only
> two layers: the database's not-null constraints and the interface's required-field rules.
> There is no server validation layer for this module. Two consequences to record:
>
> - Neither the name nor the code is **trimmed**, so a code consisting only of spaces is
>   accepted. Test that case as well as the empty one.
> - A violation that reaches the database surfaces as a **raw technical database error**, not
>   a friendly message. Confirm the save is refused, but do not record a failure against the
>   wording of the message.

> **Read this before recording step 7.** The limits are: item name **200 characters**, SKU
> **100 characters**. There is no length limit in the interface, so exceeding either cap
> produces a database error rather than a validation message — record that behaviour, not a
> clear-message expectation. Special characters are unconstrained: there is **no format rule
> on the item code**, so any character set round-trips. Where your procedure requires a code
> format, that is a procedural control.

### TC-14-02 — Code uniqueness *(URS-ITM-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Attempt to create a second item with the same code | Refused, with a clear message |  |  |  |
| 2 | Attempt the same code in a different letter case | A second item is created — uniqueness is case-sensitive. Record it as a deviation |  |  |  |
| 3 | Attempt the same code with leading or trailing whitespace | A second item is created — the code is not trimmed. Record it as a deviation |  |  |  |
| 4 | Attempt to change an existing item's code, confirming the field is not editable after creation | The item code cannot be changed at all — the SKU field is disabled once the item exists |  |  |  |

> Steps 2 and 3 are where near-duplicates get in. If either creates a second item, raise it
> as a deviation and put a procedural control in place, even if the software permits it.

> **Read this before recording steps 2 and 3 — the determined answer.** Keep the shape of
> these steps and record what you observe, but record it correctly: code uniqueness is
> **case-sensitive and untrimmed**. The same code in a different letter case, or with leading
> or trailing spaces, creates a second distinct live item. The interface pre-check replicates
> the same comparison and is additionally **blind to soft-deleted items**, so it will not warn
> about a code held by a deleted item. Per the guidance above, both of these become
> deviations with procedural controls.

> **Read this before recording step 4.** The item code is **immutable** — the field is
> disabled after creation, so there is nothing to submit and no refusal message to capture.
> "Refused" does not describe what you will see. Record that the code cannot be changed, and
> confirm this matches your procedure for correcting a mis-keyed code: since the code cannot
> be edited, that procedure must rely on withdrawing the item and creating a replacement.

### TC-14-03 — Supplier association *(URS-ITM-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Associate the item with a supplier | Association saved |  |  |  |
| 2 | Associate the same item with a second supplier | Both associations exist |  |  |  |
| 3 | Confirm the associations are visible from the item record | Both suppliers listed on the item; visibility is one-directional — see the note below |  |  |  |
| 4 | Record the supplier's own part reference against the association, where supported — **N/A** | **N/A** — the association records the supplier link only; see the note below |  |  |  |
| 5 | Remove one association | Removed; the other is unaffected |  |  |  |
| 6 | Confirm whether the supplier association change appears in the audit trail, recording the behaviour | Record what the audit trail shows — see the note below |  |  |  |

> **Read this before recording step 3.** Associations are visible from the **item only**. The
> supplier record has no items or products tab, so it does not display its linked items and
> visibility is **one-directional**. Confirm the associations from the item record and record
> the absence of the supplier-side view rather than a bidirectional failure. Where your
> procedure requires a per-supplier item list, control it procedurally and see
> [OQ-12](/validation/oq/supplier-management).

> **Step 4 is N/A — record the justification.** The association records the supplier link
> **only**. There is no field for the supplier's own part reference, no price and no lead
> time. Record where your procedure holds that information instead.

> **Read this before recording step 5.** Removing an association is a **soft delete**. The
> row is retained, and the same item-supplier pair can be re-linked later. Confirm the other
> association is unaffected.

> **Read this before recording step 6.** An entry **is** written — the association table
> carries an audit trigger, so adding or removing a supplier link is captured with its
> performer and timestamp. What the entry does **not** carry is a legible field change: the
> table holds only the two identifiers and its timestamps, none of which the audit
> configuration tracks, so the entry records that the link changed without naming the
> supplier added or removed.
>
> Record what you actually see rather than a bare pass or fail. If your procedure relies on
> the audit trail to show **which** supplier was linked or unlinked, that is a **deviation** —
> the evidence is the association list on the item record, not the trail. Note also that
> removal is a soft delete, so the entry reflects a deletion timestamp rather than a removal
> of the row.

### TC-14-04 — Downstream use *(URS-ITM-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Raise a nonconformance and select the item | Item selectable; selection saved |  |  |  |
| 2 | Log a complaint and select the item | Item selectable; selection saved |  |  |  |
| 3 | Where QC Inspection is in use, create an inspection lot for the item | Item selectable |  |  |  |
| 4 | Confirm the item shown on each downstream record is the one selected, with the correct code | Correct item in every case |  |  |  |
| 5 | Where the item's unit of measure drives a quantity field, confirm the correct unit is applied | Unit correct |  |  |  |
| 6 | Confirm records referencing the item can be found from the item, where such a view exists — **N/A** | **N/A** — the item record carries no view of the records that reference it; see the note below |  |  |  |

> **Read this before recording step 5.** The unit of measure is **reference data only**. It
> pre-fills one downstream form — a retain sample's unit — and remains editable there. **No
> quantity field anywhere validates its unit against the item's unit of measure.** Confirm
> the unit pre-fills where it is used, and record the procedural control that keeps entered
> quantities in the item's unit.

> **Step 6 is N/A — record the justification.** There is no view on the item showing the
> records that reference it; the item record has only overview and specifications. Note that
> this compounds withdrawal (TC-14-05): an item can be obsoleted with no interface surface
> showing what still references it. Record where you would establish that impact instead.

### TC-14-05 — Withdrawal from use *(URS-ITM-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Deactivate or withdraw the item | Status change saved and attributed |  |  |  |
| 2 | Attempt to select the withdrawn item on a **new** record | The item is not offered in the selection list — **enforced in the interface only** |  |  |  |
| 3 | Open an **existing** record that references the withdrawn item | The record still shows the item correctly, with its code and name intact |  |  |  |
| 4 | Confirm the withdrawn item is still retrievable for reference | Retrievable, clearly marked inactive |  |  |  |
| 5 | Reactivate the item and confirm it becomes selectable again | Restored |  |  |  |
| 6 | Confirm both status changes are in the audit trail | Entries present |  |  |  |

> **Read this before recording step 1.** The four statuses are **Active**, **Under review**,
> **Obsolete** and **Discontinued**. Setting an item to obsolete, or soft-deleting it, is
> **refused while a live specification still references it**. If your test item has a
> specification, record that refusal as **correct behaviour**, not a failure — remove or
> supersede the specification first, then withdraw the item.

> **Read this before recording step 2 — this control is not enforced by the server.** The
> filter that hides a withdrawn item is a **client-side filter in one interface component
> only**. There is no server or database enforcement, and the module has no server-side
> validation layer at all. The application therefore **does not reject an obsolete or
> discontinued item submitted through the API, an import, or an integration**. Record this
> step as enforced in the interface only — do **not** record the control as enforced — and
> identify the procedural or technical control covering non-interface data entry.

> **Read this before recording step 3.** Test the mechanism deliberately: an item already
> selected on an existing record stays visible and **re-saveable** even when obsolete, so
> re-saving that record will not refuse the withdrawn item. Note also that some downstream
> records store a **copy of the item code**, so what you see on an old record may be the
> stored copy rather than a live lookup.

> **Read this before recording step 5.** Reactivation is unconstrained because item status
> transitions are **ungoverned by design**: every edge between the four statuses is permitted
> in both directions, with no transition rule in the database. Record that any status may be
> set from any other, and control the intended sequence procedurally.

### TC-14-06 — Audit trail *(URS-ITM-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open **Audit Logs** and filter by module **Item Master / Products** | Entries covering creation, tracked field changes and status changes are present |  |  |  |
| 2 | Inspect an update entry | Old and new values shown |  |  |  |
| 3 | Confirm each entry carries performer and timestamp | Present |  |  |  |
| 4 | Confirm no audit entry can be edited or deleted | None available |  |  |  |

> **Read this before recording step 1.** There is **no audit history on the item record** and
> no per-record filter. Open **Audit Logs**, filter by module **Item Master / Products**, and
> identify the item's own entries within the module-filtered list, which shows the most recent
> 200 entries. Two boundaries to record: supplier associations are not captured (see TC-14-03
> step 6), and **changes to the Description field are not captured** in the audit trail either
> — confirm that is acceptable against your procedure.

> **Read this before recording step 2.** Old and new values appear in an **expandable row
> detail**: click the entry to expand the comparison. Capture that expanded view as the
> evidence.

## 5. Controls this protocol does not test

The behaviours below are present in the product but are not exercised by the test cases
above. A risk assessment may require the organisation to cover them with its own test cases
or procedural controls — review each against your procedure and record the decision.

- **An item cannot be obsoleted or deleted while a live specification references it**, which
  is one of the few enforced blocks in this module.
- **Deleting and restoring an item each require the item-delete permission at the database**,
  and this protocol tests neither deletion nor restore.
- **A CSV bulk import exists which reuses the same write path** and reports failures only as
  a count, so near-duplicate codes can be created in bulk without an itemised report.
- **Audit entries cannot be edited or deleted by anyone**, enforced at the database.

## 6. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 7. Execution summary

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
