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

**Where this module lives.** Retain samples ship **within QC Inspection**, not as a
top-level module: the register is a tab there, and a sample is registered from inside an
inspection lot. Navigate through QC Inspection throughout this protocol, and see
[OQ-09](/validation/oq/qc-inspection) for the inspection lot controls this protocol
depends on.

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
| 6 | Persona grants are exactly: **Sample Custodian** = retain samples read + create + update, **no dispose**; **Authorised Disposer** = read + dispose; **Read-Only User** = read only. Dispose is a **distinct permission from update** — a custodian who can edit a sample cannot dispose of one |  |
| 7 | The disposer holds an **e-signature PIN** credential specifically, established and distinct from the login password — disposal prompts for the PIN, not the password |  |
| 8 | A QC inspection lot exists carrying a product, a lot number and, where applicable, an expiry date — samples are registered from inside a lot and inherit these from it |  |

> **Read this before executing TC-15-04 step 4.** PIN attempts are rate-limited. Perform the
> incorrect-credential step **once only**; repeated wrong attempts may lock the account and
> block the rest of the test case.

## 4. Test cases

### TC-15-01 — Registration *(URS-RET-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open an inspection lot and register a retain sample against it | The form opens |  |  |  |
| 2 | Confirm the product, lot number and batch number are carried onto the sample from the parent lot | All three are displayed read-only and match the parent lot |  |  |  |
| 3 | Enter the sample type, quantity, unit, storage location and position; optionally a retain-until date and notes | Saved; quantity and storage location are required, and a zero or negative quantity is refused |  |  |  |
| 4 | Confirm a unique sample identifier is assigned | Identifier assigned and unique |  |  |  |
| 5 | Leave **Retain until** blank and confirm the system applies its default | A retain-until date is applied: lot expiry + 12 months, or, where the lot has no expiry, the retained date + 24 months |  |  |  |
| 6 | Confirm the registering user and date are recorded | Attribution present |  |  |  |

**Sample identifier:** ______________  **Retention expiry:** ______________

**Default rule that applied:** ☐ Lot expiry + 12 months ☐ Retained date + 24 months
**Matches the retention policy:** ☐ Yes ☐ No

> **Read this before recording step 2.** Product, lot number and batch number are
> **inherited read-only from the parent inspection lot**. There is no product picker on the
> sample, and the product column is nullable — a lot with no product yields a sample with no
> product, and nothing refuses it. The original steps 2 and 3, which expected a refusal when
> the product or the lot reference was omitted, are therefore not executable and have been
> replaced by the single positive confirmation above. Do not record a refusal for either.
>
> Because the sample inherits rather than validates, **confirm the parent lot carries a
> product and a lot number before registering** — a lot lacking them produces a sample
> lacking them, and that is a configuration finding against the lot, not a software failure.
>
> Registration is only possible from within an inspection lot. A lot belonging to another
> tenant is refused as not found.

> **Read this before recording step 5.** There is **no retention-period field** to derive a
> date from, so the original step's manual calculation against an entered period is not
> executable. The system instead applies a default when the date is left blank. Record which
> of the two rules applied and whether the resulting date matches your retention policy.
>
> The retain-until date may also be **typed directly**, and it is validated neither against
> the retention policy nor against being in the past. Where your procedure fixes retention
> periods, that is a procedural control.

### TC-15-02 — Labelling *(URS-RET-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Produce the sample label | A label is generated |  |  |  |
| 2 | Confirm the label carries the sample identifier, product, lot and retention date | All present and legible |  |  |  |
| 3 | Scan the label's machine-readable code and confirm it resolves to the correct sample record | Scanning the code opens the right sample |  |  |  |
| 4 | Print the label at the size your process uses | Prints legibly at that size |  |  |  |
| 5 | Reprint a label and confirm it is identical, not a new identifier | Same identifier reprinted |  |  |  |

**Attach a printed label as objective evidence.**

**Label stock tested:** ☐ A4 sheet of identical labels ☐ 4in x 2in thermal label

> **Read this before recording steps 3 and 4.** The machine-readable code is a **QR code**,
> not a barcode. It encodes the sample record's internal link, which is why scanning
> resolves correctly.
>
> There is no path for **entering** the code by hand: the printed RS number is not
> searchable from any global search, so the original step's "or entering the code" cannot be
> executed and must not be recorded as a failure. A sample is located by its RS number from
> the **Retain Samples register list** — confirm that route instead if your procedure relies
> on manual lookup.
>
> Two label stocks are offered: an A4 sheet of identical labels, and a 4in x 2in thermal
> label. Record which stock was tested above; test both if your process uses both.

### TC-15-03 — Location and custody *(URS-RET-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Move the sample to a different storage location | Change autosaved; a relocation custody event is recorded |  |  |  |
| 2 | Confirm the previous location remains in the history | History retained, not overwritten |  |  |  |
| 3 | Record the removal from storage by setting the seal state to **Opened**, supplying a reason | A seal-break custody event is recorded with the reason, the named person and a timestamp |  |  |  |
| 4 | Move the sample back to its original storage location | A further relocation event records the return with who and when |  |  |  |
| 5 | Confirm the full custody chain can be read in order | Chronological chain available |  |  |  |
| 6 | Confirm each custody event is attributed to a named person with a timestamp | Attribution present throughout |  |  |  |

> **Read this before recording step 1.** The sample detail page **autosaves — there is no
> Save button**. Change the value, click away, then wait for the saving indicator to clear
> before confirming the result.
>
> A custody event is written **only when the location or position actually changes**.
> Re-selecting the same location produces no history entry, which is correct behaviour and
> must not be recorded as a missing event.

> **Read this before recording steps 3 and 4 — record a deviation.** This test case covers
> the module's stated purpose, and as written it could not be executed. The system mints
> **only four custody events**: registration, relocation, seal break and disposal. There is
> **no withdraw-for-testing action and no return action** — the vocabulary for a withdrawal
> and an examination exists in the data model with no code that writes it. Reducing the
> recorded quantity is an ordinary field edit that mints **no event at all**.
>
> A distinct withdrawal and return are therefore **not implemented in this version**. A
> sample removed for testing and returned is recorded as a **seal break plus two
> relocations**, which is what steps 3 and 4 above now ask you to evidence. A **partial
> withdrawal leaves no event behind it**.
>
> Record this as a **deviation against steps 3 and 4**. Keep the withdrawal and return
> movements in your own custody log, and state in your record whether you rely on this
> system history as custody evidence.

### TC-15-04 — Authorised disposal *(URS-RET-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Read-Only User**, attempt to dispose of the sample | The **Record Disposal** control is not offered |  |  |  |
| 2 | As **Authorised Disposer**, initiate disposal before the retention expiry date | Permitted, with no warning and no additional justification |  |  |  |
| 3 | Confirm the disposal method is mandatory and drawn from a fixed list | Only the five listed methods are selectable; one is pre-selected by default, so the field cannot be left empty |  |  |  |
| 4 | Enter the disposal details and confirm with an **incorrect** credential | Refused; the sample is **not** disposed |  |  |  |
| 5 | Confirm the sample record is unchanged after the failed attempt | No partial change |  |  |  |
| 6 | Complete disposal with the correct credential | Disposal recorded with the disposer's name, date/time and reason |  |  |  |
| 7 | Confirm the disposed sample is clearly marked as disposed and no longer appears as available | Status unambiguous |  |  |  |
| 8 | Confirm the disposed sample's full history remains retrievable | History retained |  |  |  |

> **Read this before recording step 1.** The dispose control is **hidden** from a user
> without the dispose permission rather than shown disabled, so the expected result is that
> nothing is offered. The absent button is not the whole control: the server independently
> refuses the action, so a caller who reaches past the interface is still refused. Record the
> hidden control as the observation, not a disabled one.

> **Read this before recording step 2 — identify the procedural control.** Early disposal is
> **permitted**. A sample may be disposed at any time, including on day one of its retention
> period, with no block, no warning, no extra justification and **no record that the disposal
> was early**. The retain-until date is itself editable without justification. The retention
> date drives only a task raised 30 days before it falls due.
>
> Do not record a refusal here. Where your procedure forbids early disposal, that is a
> **procedural control** — identify it and record it below.
>
> **Procedural control preventing early disposal:** ______________________________________

> **Read this before recording step 3.** As originally written this step expected a refusal
> when no free-text reason was given, which would produce a **false failure**: no free-text
> reason is required at any layer. What is mandatory is the **disposal method**, chosen from a
> fixed list of five values and pre-selected by default — so it can never be empty through
> the interface, though an API call that omits it is refused. The narrative notes field is
> **optional at every layer**.
>
> If your organisation's procedure requires a documented justification for disposal, that
> must be enforced **procedurally**: the system will accept a disposal with no explanation.

### TC-15-05 — Register report *(URS-RET-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Produce the retain sample register | Register generated |  |  |  |
| 2 | Confirm it lists identifier, product, lot, location, retention date and status for each sample | All columns present |  |  |  |
| 3 | Filter the register by status and confirm the filtered output is correct | Filter works |  |  |  |
| 4 | Using the register's filter chips, confirm samples approaching their retention expiry can be identified | The due and overdue chips surface the expected samples |  |  |  |
| 5 | Open the register print view, then use the browser's **Print** and **Save as PDF** | Complete; nothing truncated |  |  |  |

**Attach the register as objective evidence.**

> **Read this before recording step 4.** The **due** and **overdue** states are derived at
> display time from the retain-until date using a **fixed 30-day window that is not
> configurable**. The stored status is only **Retained** or **Disposed** — there is no stored
> due or overdue status to filter on. Use the corresponding filter chips on the register, and
> record the 30-day window against your procedure's own notice period.

> **Read this before recording step 5.** There is **no in-application PDF export**. Open the
> register print view and produce the PDF from the **browser's own print dialog** — Print,
> then Save as PDF — switching to **landscape** if the table is wide, then confirm nothing is
> truncated.
>
> A **CSV export of the register list is separately available** and is the supported
> data-extract route. PDF comes from the browser print dialog rather than from the
> application; record which output you attached as evidence.

### TC-15-06 — Audit trail *(URS-RET-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the sample's **Chain of Custody** panel | Registration, relocation, seal break and disposal are recorded |  |  |  |
| 2 | Inspect the relocation entry in the Chain of Custody panel | Previous and new location both shown |  |  |  |
| 3 | Confirm the disposal entry records the reason and the signature | Both present |  |  |  |
| 4 | Confirm each entry carries performer and timestamp | Present |  |  |  |
| 5 | Confirm no audit entry can be edited or deleted | No edit or delete control exists, and the database refuses any update or delete of an audit row outright |  |  |  |

> **Read this before recording step 1.** There is **no audit-trail view on the sample record
> and no per-record audit filter** — do not look for one. The **Chain of Custody** panel is
> the surface for this test case, and it shows registration, relocation, seal break and
> disposal.
>
> Note the boundary carefully. Field-level changes — location, quantity, retain-until and
> seal state — do **not** generate audit entries. So the custody panel is the **only** system
> record of a relocation, and **quantity changes are not recorded at all**. Read this
> together with the deviation note under TC-15-03.
>
> The **disposal act is** written to the audit trail, but it is viewable only from the
> central **Audit Logs** page, which requires the separate **Audit Trail read** permission.
> Confirm who holds that permission and record it.

> **Read this before recording step 2.** The previous and new locations are both shown in the
> Chain of Custody panel, which is where this step is executed. The underlying audit record
> stores the **whole row before and after**, in which location identifiers are not
> name-resolved — so the panel, not the raw audit record, is the legible evidence here.

> **Read this before recording step 5.** The control is stronger than an absent button: no
> edit or delete control exists in the interface, **and** the database rejects any update or
> delete of an audit row outright, **including for privileged database accounts**. Record
> both halves.

## 5. Controls this protocol does not test

The behaviours below are present in the product but are **not exercised by any test case
above**. A risk assessment may require the organisation to cover them with its own test
cases or procedural controls.

- **Disposal is permission-gated separately from editing** — a custodian holding update but
  not dispose is refused, which is the separation-of-duties claim the dispose permission
  exists to make.
- **The disposal seal is enforced at the database, not only in the interface** — forging the
  disposed status, rewriting the disposal method or notes on a sealed record, and deleting a
  sample outside the signed endpoint are all refused.
- **Un-disposing a sample is refused for everyone**, including server code.
- **A sample is invisible to another tenant.**
- **A task is raised 30 days before the retention date falls due**, and is skipped where both
  the retainer and the lot creator are inactive.
- **The seal-break event records its reason.**
- **The disposal method is a controlled vocabulary**, so free text is refused.

## 6. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 7. Execution summary

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
