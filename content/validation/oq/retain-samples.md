---
id: oq-retain-samples
title: OQ-15 Retain Samples
sidebar_position: 15
description: Operational Qualification protocol for retain sample registration, labelling, custody and location tracking, authorised disposal and register reporting.
keywords: [OQ, retain sample, reserve sample, custody, disposal, chain of custody, test script]
---

# OQ-15 — Retain Samples

**Document ID:** VAL-OQ-15 · **Version:** 1.0 · **Module:** Retain Samples

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify that retained samples are registered against their product and lot, remain
identifiable through a durable label, that location and custody changes are traceable, and
that disposal is an authorised, authenticated act with a recorded reason.

Retention samples exist to be produced years later during an investigation. The controls
that matter are identification and custody: a sample you cannot confidently tie back to a
lot is worthless as evidence.

## 2. Requirements verified

URS-RET-01 … URS-RET-06. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §18.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | At least one item/product exists in the item master |  |
| 4 | Storage locations configured |  |
| 5 | Test accounts: **Sample Custodian**, **Authorised Disposer**, **Read-Only User** |  |
| 6 | The disposer has an e-signature credential established |  |

## 4. Test cases

### TC-15-01 — Registration *(URS-RET-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Register a retain sample | The form opens |  |  |  |
| 2 | Attempt to save without the product | Refused |  |  |  |
| 3 | Attempt to save without the lot / batch reference | Refused |  |  |  |
| 4 | Enter product, lot, quantity, retention period and storage location | Saved |  |  |  |
| 5 | Confirm a unique sample identifier is assigned | Identifier assigned and unique |  |  |  |
| 6 | Confirm the retention expiry date is derived correctly from the retention period | Date matches manual calculation |  |  |  |
| 7 | Confirm the registering user and date are recorded | Attribution present |  |  |  |

**Sample identifier:** ______________  **Retention expiry:** ______________

### TC-15-02 — Labelling *(URS-RET-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Produce the sample label | A label is generated |  |  |  |
| 2 | Confirm the label carries the sample identifier, product, lot and retention date | All present and legible |  |  |  |
| 3 | Confirm the label's machine-readable code resolves to the correct sample record | Scanning or entering the code opens the right sample |  |  |  |
| 4 | Print the label at the size your process uses | Prints legibly at that size |  |  |  |
| 5 | Reprint a label and confirm it is identical, not a new identifier | Same identifier reprinted |  |  |  |

**Attach a printed label as objective evidence.**

### TC-15-03 — Location and custody *(URS-RET-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Move the sample to a different storage location | Change saved |  |  |  |
| 2 | Confirm the previous location remains in the history | History retained, not overwritten |  |  |  |
| 3 | Record a custody change — the sample is taken out for testing | Custody change recorded with who and when |  |  |  |
| 4 | Return the sample to storage | Return recorded |  |  |  |
| 5 | Confirm the full custody chain can be read in order | Chronological chain available |  |  |  |
| 6 | Confirm each custody event is attributed to a named person with a timestamp | Attribution present throughout |  |  |  |

### TC-15-04 — Authorised disposal *(URS-RET-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Read-Only User**, attempt to dispose of the sample | Refused |  |  |  |
| 2 | As **Authorised Disposer**, initiate disposal before the retention expiry date | Either refused, or permitted with a justification — record which, and confirm it matches your SOP |  |  |  |
| 3 | Attempt disposal without a reason | Refused; a reason is required |  |  |  |
| 4 | Enter a reason and confirm with an **incorrect** credential | Refused; the sample is **not** disposed |  |  |  |
| 5 | Confirm the sample record is unchanged after the failed attempt | No partial change |  |  |  |
| 6 | Complete disposal with the correct credential | Disposal recorded with the disposer's name, date/time and reason |  |  |  |
| 7 | Confirm the disposed sample is clearly marked as disposed and no longer appears as available | Status unambiguous |  |  |  |
| 8 | Confirm the disposed sample's full history remains retrievable | History retained |  |  |  |

### TC-15-05 — Register report *(URS-RET-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Produce the retain sample register | Register generated |  |  |  |
| 2 | Confirm it lists identifier, product, lot, location, retention date and status for each sample | All columns present |  |  |  |
| 3 | Filter the register by status and confirm the filtered output is correct | Filter works |  |  |  |
| 4 | Confirm samples approaching their retention expiry can be identified | Expiring samples surfaced |  |  |  |
| 5 | Save the register as PDF and confirm nothing is truncated | Complete |  |  |  |

**Attach the register as objective evidence.**

### TC-15-06 — Audit trail *(URS-RET-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the sample's audit history | Registration, location moves, custody changes and disposal are recorded |  |  |  |
| 2 | Inspect a location change entry | Previous and new location both shown |  |  |  |
| 3 | Confirm the disposal entry records the reason and the signature | Both present |  |  |  |
| 4 | Confirm each entry carries performer and timestamp | Present |  |  |  |
| 5 | Confirm no audit entry can be edited or deleted | None available |  |  |  |

## 5. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 6. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --- | --- | --- | --- | --- | --- |
| TC-15-01 |  |  |  |  |  |
| TC-15-02 |  |  |  |  |  |
| TC-15-03 |  |  |  |  |  |
| TC-15-04 |  |  |  |  |  |
| TC-15-05 |  |  |  |  |  |
| TC-15-06 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
