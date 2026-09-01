---
id: oq-qc-inspection
title: OQ-09 QC Inspection
sidebar_position: 9
description: Operational Qualification protocol for specifications, sampling plans, inspection lots, result capture, out-of-specification detection and disposition.
keywords:
  [
    OQ,
    QC inspection,
    specification,
    sampling plan,
    AQL,
    out of specification,
    disposition,
    test script,
  ]
---

# OQ-09 — QC Inspection

**Document ID:** VAL-OQ-09 · **Version:** 1.0 · **Module:** QC Inspection

| Role                      | Name | Title | Signature | Date |
| ------------------------- | ---- | ----- | --------- | ---- |
| Protocol prepared by      |      |       |           |      |
| Protocol approved by (QA) |      |       |           |      |
| Executed by               |      |       |           |      |
| Execution reviewed by     |      |       |           |      |

**System version under test:** ******\_\_****** **Environment:** ******\_\_******

## 1. Objective

To verify that inspections are performed against controlled specifications and sampling
plans, that results are captured accurately, that out-of-specification results are detected
by the system rather than by the inspector's judgement, and that lot accept/reject follows
the sampling plan.

**The two decisive tests are TC-09-05 and TC-09-06.** A QC module that relies on the
operator to notice an out-of-spec value provides no control at all.

## 2. Requirements verified

URS-QCI-01 … URS-QCI-12. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §12.

## 3. Prerequisites

| #   | Prerequisite                                                           | Confirmed (init/date) |
| --- | ---------------------------------------------------------------------- | --------------------- |
| 1   | This protocol is approved before execution                             |                       |
| 2   | IQ executed and passed                                                 |                       |
| 3   | At least one item/product exists in the item master                    |                       |
| 4   | Test accounts: **QC Inspector**, **QC Approver**, **No-Access**        |                       |
| 5   | The sampling standard in use (for example ANSI/ASQ Z1.4) is configured |                       |

## 4. Test cases

### TC-09-01 — Specifications _(URS-QCI-01)_

| #   | Test step                                                                        | Expected result                                             | Actual result | P/F | Init / Date |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | Create a specification for a product                                             | Specification created                                       |               |     |             |
| 2   | Add a numeric characteristic with a lower and upper limit, a target and a unit   | Saved                                                       |               |     |             |
| 3   | Add an attribute (pass/fail) characteristic                                      | Saved                                                       |               |     |             |
| 4   | Add a characteristic marked critical                                             | Saved and flagged                                           |               |     |             |
| 5   | Attempt to save a numeric characteristic where the lower limit exceeds the upper | Refused                                                     |               |     |             |
| 6   | Approve/release the specification                                                | Specification becomes usable                                |               |     |             |
| 7   | Attempt to edit an approved specification                                        | Prevented, or requires a new version — record the behaviour |               |     |             |

**Specification reference:** ******\_\_****** **Characteristic used for OOS test:** ******\_\_******
**Limits:** LSL **\_\_\_\_** USL **\_\_\_\_**

### TC-09-02 — Sampling plans _(URS-QCI-02)_

| #   | Test step                                                          | Expected result                                                                           | Actual result | P/F | Init / Date |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | Create a sampling plan of the type your process uses               | Plan created                                                                              |               |     |             |
| 2   | For a standard-based plan, set the inspection level and AQL        | Saved                                                                                     |               |     |             |
| 3   | For a given lot size, confirm the sample size the plan derives     | Sample size matches the published standard table — verify against the table independently |               |     |             |
| 4   | Confirm the accept and reject numbers derived for that sample size | Values match the standard table                                                           |               |     |             |
| 5   | Repeat for a second, materially different lot size                 | Values again match the table                                                              |               |     |             |
| 6   | Approve/release the sampling plan                                  | Plan becomes usable                                                                       |               |     |             |

| Lot size | Sample size (system) | Sample size (standard table) | Ac / Re (system) | Ac / Re (table) | Match? |
| -------- | -------------------- | ---------------------------- | ---------------- | --------------- | ------ |
|          |                      |                              |                  |                 |        |
|          |                      |                              |                  |                 |        |

### TC-09-03 — Creating an inspection lot _(URS-QCI-03)_

| #   | Test step                                                                               | Expected result                      | Actual result | P/F | Init / Date |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------ | ------------- | --- | ----------- |
| 1   | Create an inspection lot for the product, selecting the specification and sampling plan | Lot created with a unique lot number |               |     |             |
| 2   | Attempt to create a lot without a product, specification or quantity                    | Refused in each case                 |               |     |             |
| 3   | Enter the lot quantity and confirm the sample size is derived from the sampling plan    | Sample size correct for the quantity |               |     |             |
| 4   | Confirm the inspection point (incoming / in-process / final / outgoing) is recorded     | Saved                                |               |     |             |
| 5   | Confirm the characteristics from the specification are loaded into the lot              | All characteristics present          |               |     |             |

**Lot number:** ******\_\_****** **Quantity:** **\_\_** **Sample size derived:** **\_\_**

### TC-09-04 — Result capture _(URS-QCI-04)_

| #   | Test step                                                                              | Expected result                                          | Actual result | P/F | Init / Date |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | As **QC Inspector**, record an in-specification numeric result                         | Saved and evaluated as conforming                        |               |     |             |
| 2   | Record an attribute result                                                             | Saved                                                    |               |     |             |
| 3   | Attempt to enter text into a numeric characteristic                                    | Refused                                                  |               |     |             |
| 4   | Attempt to submit with a required characteristic unrecorded                            | Refused                                                  |               |     |             |
| 5   | Where per-sample capture is configured, record results for each sample individually    | Each sample's result is stored separately and attributed |               |     |             |
| 6   | Confirm each result records who entered it and when                                    | Attribution and timestamp present                        |               |     |             |
| 7   | Amend a recorded result and confirm the original value is preserved in the audit trail | Original retained; change recorded                       |               |     |             |

### TC-09-05 — Out-of-specification detection _(URS-QCI-05)_

| #   | Test step                                                                                           | Expected result                                                                                                     | Actual result | P/F | Init / Date |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | Enter a value **below** the lower specification limit                                               | The system flags it as out of specification without the inspector having to judge it                                |               |     |             |
| 2   | Enter a value **above** the upper specification limit                                               | Flagged as out of specification                                                                                     |               |     |             |
| 3   | Enter a value **exactly at** the lower limit                                                        | Evaluated per your specification convention (inclusive or exclusive) — record which, and confirm it matches the SOP |               |     |             |
| 4   | Enter a value **exactly at** the upper limit                                                        | As above                                                                                                            |               |     |             |
| 5   | Enter a value just inside both limits                                                               | Evaluated as conforming                                                                                             |               |     |             |
| 6   | Record a failing attribute result                                                                   | Flagged as nonconforming                                                                                            |               |     |             |
| 7   | Confirm the out-of-specification condition is visible on the lot, not only on the individual result | Escalates to lot level                                                                                              |               |     |             |

### TC-09-06 — Lot accept / reject _(URS-QCI-06)_

| #   | Test step                                                                            | Expected result                   | Actual result | P/F | Init / Date |
| --- | ------------------------------------------------------------------------------------ | --------------------------------- | ------------- | --- | ----------- |
| 1   | Record defects **below** the plan's accept number                                    | The lot evaluates as acceptable   |               |     |             |
| 2   | Record defects **equal to** the accept number                                        | The lot evaluates as acceptable   |               |     |             |
| 3   | Record defects **equal to** the reject number                                        | The lot evaluates as rejectable   |               |     |             |
| 4   | Confirm the decision shown matches the sampling plan's criteria recorded in TC-09-02 | Decision reconciles with the plan |               |     |             |
| 5   | Confirm a critical-characteristic failure drives the outcome per your procedure      | Behaviour matches the SOP         |               |     |             |

### TC-09-07 — Disposition and nonconformance _(URS-QCI-07)_

| #   | Test step                                                                                  | Expected result                         | Actual result | P/F | Init / Date |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------- | ------------- | --- | ----------- |
| 1   | On a rejected lot, attempt to close the inspection without a disposition                   | Refused                                 |               |     |             |
| 2   | Record a disposition with supporting notes                                                 | Saved                                   |               |     |             |
| 3   | Raise a nonconformance from the rejected lot                                               | The NC is created pre-linked to the lot |               |     |             |
| 4   | Confirm the link is visible from both the lot and the NC                                   | Bidirectional visibility                |               |     |             |
| 5   | Confirm the rejected material's quality state prevents its release, per your configuration | State reflects the rejection            |               |     |             |
| 6   | Confirm the disposition and the link appear in the audit trail                             | Entries present                         |               |     |             |

### TC-09-08 — Approval of results _(URS-QCI-08)_

| #   | Test step                                                                                             | Expected result                                                       | Actual result | P/F | Init / Date |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | As **QC Inspector**, attempt to approve your own inspection where segregation of duties is configured | Refused, or permitted — record which, and confirm it matches your SOP |               |     |             |
| 2   | Submit the completed inspection for approval                                                          | Routes to the approver                                                |               |     |             |
| 3   | As **QC Approver**, approve — with signature where required                                           | Approval recorded with name, date/time and meaning                    |               |     |             |
| 4   | Attempt to change a result after approval                                                             | Prevented                                                             |               |     |             |
| 5   | Confirm the approved lot's status reflects the decision                                               | Status correct                                                        |               |     |             |

### TC-09-09 — Inspection report _(URS-QCI-09)_

| #   | Test step                                                                                                      | Expected result  | Actual result | P/F | Init / Date |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------------- | ------------- | --- | ----------- |
| 1   | Produce the inspection report for the lot                                                                      | Report generated |               |     |             |
| 2   | Confirm it shows lot detail, specification, sampling plan, per-characteristic results, defects and disposition | All present      |               |     |             |
| 3   | Confirm out-of-specification results are identifiable on the report                                            | Clearly marked   |               |     |             |
| 4   | Save as PDF and confirm nothing is truncated                                                                   | Complete         |               |     |             |

**Attach the report as objective evidence.**

### TC-09-10 — Audit trail _(URS-QCI-10)_

| #   | Test step                                          | Expected result                                                                                | Actual result | P/F | Init / Date |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | Open the lot's audit history                       | Lot creation, every result entry and amendment, defects, disposition and approval are recorded |               |     |             |
| 2   | Inspect an amended result                          | Original and new values both shown                                                             |               |     |             |
| 3   | Confirm each entry carries performer and timestamp | Present                                                                                        |               |     |             |
| 4   | Confirm no audit entry can be edited or deleted    | None available                                                                                 |               |     |             |

### TC-09-11 — Line clearance gates collection _(URS-QCI-11)_

Line clearance is a **preventive control**, not a record: it must stop sampling,
not merely warn. Verify the block, not just the form.

| #   | Test step                                                                                                | Expected result                                               | Actual result | P/F | Init / Date |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | On an in-process inspection with a production lot that has no line clearance, attempt to collect samples | Refused — collection is unavailable until the line is cleared |               |     |             |
| 2   | Complete the line clearance checklist and record a **Hold** decision                                     | Hold recorded, attributed and timestamped                     |               |     |             |
| 3   | Attempt to collect samples again                                                                         | Still refused                                                 |               |     |             |
| 4   | Record a **Release** decision                                                                            | Release recorded, attributed and timestamped                  |               |     |             |
| 5   | Attempt to collect samples                                                                               | Now permitted                                                 |               |     |             |
| 6   | Add a new production lot to the same inspection and attempt to collect against it                        | Refused until that lot has its own passed clearance           |               |     |             |
| 7   | Confirm both clearance decisions remain on the record                                                    | Retrievable, with decision, reason and signature              |               |     |             |

### TC-09-12 — In-process check-in and collection cadence _(URS-QCI-12)_

| #   | Test step                                                                                            | Expected result                                                                                     | Actual result | P/F | Init / Date |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------- | --- | ----------- |
| 1   | As **QC Inspector**, check in to an in-process inspection, recording shift and production lot        | Check-in recorded and attributed                                                                    |               |     |             |
| 2   | As a **second inspector**, take over the inspection                                                  | Takeover is explicit; the record shows who was responsible for each period                          |               |     |             |
| 3   | Collect a set of sample units                                                                        | Units appended, stamped with the server time and the acting inspector, tagged to the production lot |               |     |             |
| 4   | Where the sampling plan sets a collection interval, attempt a further collection immediately         | Refused until shortly before the next collection is due                                             |               |     |             |
| 5   | Confirm the record indicates when the next collection is due                                         | Due time shown; a warning appears as it approaches and once overdue                                 |               |     |             |
| 6   | Confirm collection timestamps are server-generated and cannot be edited by the inspector             | Times are system-recorded, not user-entered                                                         |               |     |             |
| 7   | Confirm samples collected before and after a production-lot change are attributed to the correct lot | Attribution correct for each                                                                        |               |     |             |

## 5. Deviation log

| #   | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | -------- | ----------- | ----------------- | ----------- | ------------- | ---------------- |
| 1   |          |             |                   |             |               |                  |
| 2   |          |             |                   |             |               |                  |

## 6. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --------- | ----- | ------ | ------ | --- | ------------- |
| TC-09-01  |       |        |        |     |               |
| TC-09-02  |       |        |        |     |               |
| TC-09-03  |       |        |        |     |               |
| TC-09-04  |       |        |        |     |               |
| TC-09-05  |       |        |        |     |               |
| TC-09-06  |       |        |        |     |               |
| TC-09-07  |       |        |        |     |               |
| TC-09-08  |       |        |        |     |               |
| TC-09-09  |       |        |        |     |               |
| TC-09-10  |       |        |        |     |               |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role                                   | Name | Signature | Date |
| -------------------------------------- | ---- | --------- | ---- |
| Executed by                            |      |           |      |
| Reviewed by (independent of execution) |      |           |      |
| Approved by (QA)                       |      |           |      |
