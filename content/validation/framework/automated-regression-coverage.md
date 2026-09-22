---
id: automated-regression-coverage
title: Automated Regression Coverage
sidebar_position: 7
description: Which baseline user requirements are covered by Qability's own automated regression suite, which are only partly covered, and which are not covered at all — supplier evidence to inform your test effort, not a substitute for your execution.
keywords: [automated testing, regression, supplier evidence, coverage, GAMP 5, test effort, risk based testing]
---

# Automated Regression Coverage

**Document ID:** VAL-ARC-001 · **Version:** 1.2 · **System:** Qability QMS

> **Changes in 1.2 (2026-09-22).** Seven modules re-assessed after 26 new E2E suites were
> added across them: Change Control (§8), Quality Complaints (§9), Audit Management (§10),
> Risk Management (§11), QC Inspection (§12), Log Books (§13) and Equipment & Calibration
> (§14). **Covered rises from 66 to 93 of 163 requirements**, and *Not automated* falls
> from 30 to 16. Quality Complaints and Risk Management, which previously had no Covered
> requirement at all, now carry four each. Three requirements tested for the first time
> are recorded as **Gap pinned** rather than Covered, because the new test shows the
> product does not meet them: URS-CMP-03, URS-RSK-05 and URS-QCI-04. Summary totals and
> the by-module table are restated accordingly, and the suite size is refreshed to the
> current 362 files / 1,456 tests.
>
> **Changes in 1.1 (2026-09-22).** Customer Complaint Management (§19) re-assessed after
> five new E2E suites were added to that module: URS-CCM-03, -04, -05, -06 and -08 move
> from *Not automated* / *Partial* to **Covered**, and URS-CCM-02 is reclassified as
> **Product non-conformant** (defect CC-D1 — the fields it demands are not columns on the
> customer complaint record). Summary totals and the by-module table are restated
> accordingly.

| Role             | Name | Title | Signature | Date |
| ---------------- | ---- | ----- | --------- | ---- |
| Compiled by      |      |       |           |      |
| Approved by (QA) |      |       |           |      |

## 1. Purpose and status of this document

This document states which of the baseline user requirements in the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) are
exercised by Qability's own automated regression suite, and which are not.

It exists for one reason: to let you **direct your testing effort where the supplier's
evidence is thinnest**. Under a risk-based approach (GAMP 5, 2nd edition) you may reduce
effort where a supplier can show competent, repeatable verification, and you must not
reduce it where they cannot.

:::danger This is supplier evidence. It is not your validation.
Nothing in this document discharges any part of your obligation as the regulated user.
A requirement marked **Covered** here has been verified **on Qability's development and
test environment, against Qability's test data and configuration** — not on your tenant,
not with your workflow templates, roles and document types, and not against your intended
use.

Every requirement in scope still needs its own executed OQ test case, signed and dated by
your organisation. Treat a **Covered** row as grounds for confidence and for a lighter
touch where your risk assessment permits it — never as a test you may skip and reference
instead.
:::

## 2. How to read this document

Each module section lists every requirement from the corresponding Traceability Matrix
section, with one of six statuses.

| Status                     | What it means for your testing                                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Covered**                | An automated test asserts the substance of the requirement and passes. Supplier evidence is available on request.                                                                      |
| **Partial**                | Part of the requirement is asserted; the Note says what is **not**. Plan to test the untested part yourself.                                                                            |
| **Product non-conformant** | A test asserts the behaviour the requirement demands, and the product does **not** currently meet it. The named defect is open. Read the linked protocol's note before you execute.     |
| **Gap pinned**             | A test exists, but it records the product's **current, unguarded** behaviour so that a future change is noticed. It is **not** evidence the requirement is met. Test this one yourself. |
| **Not automated**          | No automated evidence. This is where your own testing carries the full weight.                                                                                                         |
| **N/A**                    | Not verifiable by test — a procedural control, a supplier-assessment item, or a capability the product does not provide. The Traceability Matrix records the justification.             |

Three points that a reader will otherwise get wrong:

- **"Not automated" does not mean "not implemented".** Two requirements are enforced by
  the product but have no test that arms the control: the log book training gate
  (URS-LOG-05) is enforced server-side but the test data binds no training to a log book,
  and line clearance (URS-QCI-11) ships switched off, so nothing exercises the block. Both
  are working controls with no automated evidence. Verify them yourself, and read the
  prerequisite notes in [OQ-10](/validation/oq/log-books) and
  [OQ-09](/validation/oq/qc-inspection) before you do.
- **The audit trail is the weakest family.** The trail *mechanism* is well covered —
  capture, field-level before/after values, and immutability at both the database
  privilege layer and the trigger — but only for two record types. Most modules have no
  test of their own record history. Where you rely on a specific module's audit trail,
  test it.
- **A cited test proves what its assertion says, nothing broader.** Where a control is
  enforced only in the user interface and not at the server, the Note and the module
  protocol say so. Publication locks and material review in
  [OQ-02](/validation/oq/training-management) are the two that matter most.

## Summary

Across the 163 baseline requirements in the Traceability Matrix:

| Status                       | Requirements | Share |
| ---------------------------- | ------------ | ----- |
| Covered                      | 93           | 57%   |
| Partial                      | 38           | 23%   |
| Not automated                | 16           | 10%   |
| N/A (not verifiable by test) | 7            | 4%    |
| Product non-conformant       | 5            | 3%    |
| Gap pinned                   | 4            | 2%    |
| **Total**                    | **163**      |       |

The suite behind these figures is **362 test files containing 1,456 tests**, organised as
40 module suites driven against a running instance of the full application stack — the
database, the API, the background worker, the data-sync layer and the web client — on a
dedicated, isolated test tenant. Tests assert against the database as well as the screen,
so a control that exists only in the interface is recorded as such rather than passing
silently.

**Read the two middle rows together.** Covered and Partial account for 80% of
requirements, but *Partial means your testing still carries the remainder*. The Note on
every Partial row names the untested part. There is no row where a gap has been left
unstated.

**A note on the four *Gap pinned* rows.** Three of them are new, and they are new because
the requirement was tested for the first time and the product did not meet it. A test now
records the current behaviour so that a future change is noticed, but the row is **not**
evidence the requirement is met: URS-CMP-03 (no justification is required to decline an
investigation), URS-RSK-05 (a send-back plus re-score leaves two live assessments) and
URS-QCI-04 (amending a result destroys the original). Test these three yourself.

### Where the coverage sits, by module

The figures above are not evenly distributed. This table exists so that you can target
your own testing at the modules you actually rely on, rather than spreading effort across
all seventeen. **Cov** = Covered, **Part** = Partial, **None** = Not automated,
**PNC** = Product non-conformant, **Gap** = Gap pinned.

| §  | Module                                                                        | Reqs | Cov | Part | None | N/A | PNC | Gap |
| -- | ----------------------------------------------------------------------------- | ---- | --- | ---- | ---- | --- | --- | --- |
| 3  | Cross-cutting — electronic records and access ([OQ-16](/validation/oq/security-and-electronic-records)) | 23   | 10  | 8    | 1    | 4   | —   | —   |
| 4  | Document Control ([OQ-01](/validation/oq/document-control))                    | 16   | 7   | 6    | 3    | —   | —   | —   |
| 5  | Training Management ([OQ-02](/validation/oq/training-management))              | 11   | 5   | 3    | 1    | —   | 2   | —   |
| 6  | Nonconformance ([OQ-03](/validation/oq/nonconformance))                        | 10   | 5   | 3    | 2    | —   | —   | —   |
| 7  | CAPA ([OQ-04](/validation/oq/capa))                                           | 10   | 5   | 3    | 1    | —   | 1   | —   |
| 8  | Change Control ([OQ-05](/validation/oq/change-control))                        | 6    | 6   | —    | —    | —   | —   | —   |
| 9  | Quality Complaints ([OQ-06](/validation/oq/complaints))                        | 8    | 4   | 2    | —    | 1   | —   | 1   |
| 10 | Audit Management ([OQ-07](/validation/oq/audit-management))                     | 8    | 7   | —    | —    | —   | 1   | —   |
| 11 | Risk Management ([OQ-08](/validation/oq/risk-management))                       | 6    | 4   | —    | —    | 1   | —   | 1   |
| 12 | QC Inspection ([OQ-09](/validation/oq/qc-inspection))                          | 12   | 10  | 1    | —    | —   | —   | 1   |
| 13 | Log Books ([OQ-10](/validation/oq/log-books))                                  | 9    | 8   | 1    | —    | —   | —   | —   |
| 14 | Equipment & Calibration ([OQ-11](/validation/oq/equipment-calibration))         | 6    | 6   | —    | —    | —   | —   | —   |
| 15 | Supplier Management ([OQ-12](/validation/oq/supplier-management))               | 7    | 1   | 2    | 2    | 1   | —   | 1   |
| 16 | Forms & Workflows ([OQ-13](/validation/oq/forms-and-workflows))                 | 11   | 5   | 3    | 3    | —   | —   | —   |
| 17 | Item Master ([OQ-14](/validation/oq/item-master))                              | 6    | 2   | 3    | 1    | —   | —   | —   |
| 18 | Retain Samples ([OQ-15](/validation/oq/retain-samples))                         | 6    | 2   | 3    | 1    | —   | —   | —   |
| 19 | Customer Complaint Management ([OQ-17](/validation/oq/customer-complaints))      | 8    | 6   | —    | 1    | —   | 1   | —   |
| **Total** |                                                                        | **163** | **93** | **38** | **16** | **7** | **5** | **4** |

**Three things to take from this table.**

- **Every module now has automated evidence, and seven were rebuilt in this revision.**
  Quality Complaints (§9) and Risk Management (§11) previously had *no* Covered
  requirement at all; both now carry four. Change Control (§8), Equipment & Calibration
  (§14), QC Inspection (§12), Log Books (§13) and Audit Management (§10) were raised in
  the same pass. Where a newly written test found the product wanting, the row is marked
  *Gap pinned* rather than Covered — see the note above the module table.
- **The remaining thin areas are Supplier Management (§15), Item Master (§17) and Retain
  Samples (§18).** Together they hold 5 Covered of 19 requirements and 4 of the 16 *Not
  automated* rows. Forms & Workflows (§16) and Document Control (§4) carry three *Not
  automated* rows each. If you rely on any of these, your own testing still carries most
  of the weight.
- **The cross-cutting section (§3) is the strongest, and that is deliberate.** Electronic
  records, signatures, access control and audit-trail integrity carry 10 Covered of 23 —
  the controls an inspector reaches for first. Its four *N/A* rows are procedural
  obligations that no test can discharge for you.

## Requirements where the product does not currently conform

Five requirements have a test that asserts what the requirement demands, and the product
does not currently satisfy it. These are the rows to read before you plan your execution,
because in each case the protocol's own note tells you what you will actually observe.

| Req ID     | What the requirement demands                          | What the product does today                                                                             | Protocol note                                              |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| URS-TRN-02 | Publishing locks training content against edit        | The lock is in the interface only; the server applies the edit (defect D13)                             | [OQ-02](/validation/oq/training-management) TC-02-02       |
| URS-TRN-04 | Trainees review all material before assessment        | Enforced in the browser only; a completion can be scored and signed without the material (defect D14)   | [OQ-02](/validation/oq/training-management) TC-02-04       |
| URS-CAP-10 | The full CAPA history is available in the audit trail | The per-record dialog omits entries written under the other record-type spelling; the trail itself is complete (defect D9) | [OQ-04](/validation/oq/capa) TC-04-10                      |
| URS-AUD-08 | Audit history is captured in the audit trail          | Writes made by the scheduled audit generator leave no trail entry                                       | [OQ-07](/validation/oq/audit-management)                   |
| URS-CCM-02 | A customer complaint records its category, severity, product and lot reference | `customer_complaints` has **no such columns** — they belong to the internal Quality Complaint record. The API used to accept them and return 201 with the values silently discarded (defect CC-D1); it now refuses them outright | [OQ-17](/validation/oq/customer-complaints) TC-17-02 |

:::warning Two of these bear directly on Part 11 signed records
**URS-TRN-04** is the most consequential in this document. A read-and-understood training
produces an electronically signed attestation of competency against specific material; if
the material requirement is not enforced where the record is created, that signature
attests to something the system did not verify. **URS-TRN-02** compounds it: content can
change after learners have signed against it.

If any user or integration can reach the API directly, treat both as open gaps and control
them procedurally until the server enforces them. If your users reach the system only
through the application, the interface controls plus the audit trail may be an acceptable
control — but the justification must be written into your validation report, not assumed.
See [OQ-02](/validation/oq/training-management) TC-02-02 and TC-02-04 for the full
assessment and the wording to record.
:::

## 3. Cross-cutting — electronic records and access

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-SEC-01 | Covered | `e2e/authentication/j6-login-happy-path.spec.js` — "GATE · the sign-in page authenticates and writes every side effect" | Session row is attributed to the named user. |
| URS-SEC-02 | Partial | `e2e/authentication/j10-password-reset-lifecycle.spec.js` — "GATE · a weak password is refused by the SERVER, not just by the page" | Expiry period and history depth are not tested. |
| URS-SEC-03 | Covered | `e2e/authentication/j5-lockout-actually-works.spec.js` — "GATE · 5 failures lock the account, and the lock refuses the CORRECT password (G3)" | Lockout holds even against the correct password. |
| URS-SEC-04 | Covered | `e2e/roles/j1-control-policy-agreement.spec.js` — "AGREEMENT · every persona × every surface: what is offered is what is permitted" | Offered affordances agree with granted permissions. |
| URS-SEC-05 | Covered | `e2e/auditLogs/a2-trail-page.spec.js` — "a granted persona reads the page; a denied persona never reaches it" | Trail page access is restricted to granted personas. |
| URS-SEC-06 | Covered | `e2e/auditLogs/a1-read-gate.spec.js` — "the company clause is intact — a granted reader sees one tenant only" | Readers see their own tenant's trail only. |
| URS-SEC-07 | Partial | `e2e/auditLogs/a3-change-to-row.spec.js` — "trigger → worker → audit_logs, with the diff the registry says it should carry" | DELETE, IP address and system-vs-person attribution are not tested. |
| URS-SEC-08 | Covered | `e2e/auditLogs/a5-record-history.spec.js` — "the trail is append-only — at the privilege layer and at the trigger" | Append-only enforced at privilege layer and trigger. |
| URS-SEC-09 | Partial | `e2e/auditLogs/a5-record-history.spec.js` — "reading the trail is not permission to export it" / "the owner bypass reaches audit_trail:export too" | Review is covered; the export permission gate is asserted, but no export is downloaded or its content checked. The only export is the per-record dialog — the filtered page has none. |
| URS-SEC-10 | Not automated | — | No test asserts a complete human-readable record copy; only a screenshot exists. |
| URS-SEC-11 | Partial | `e2e/documents/j2-review-approve-esign.spec.js` — "full approval chain with e-signature and snapshot" | Signature non-transferability is not tested. |
| URS-SEC-12 | Partial | `e2e/workflow/j16-per-module-reject-signature.spec.js` — "rejecting an e-sign-required step through the per-module endpoint demands a signature, then writes one" | A bad PIN is refused and nothing is signed, asserted atomically. Not covered: that a prompt is demanded of an already-signed-in user, signing lockout, and one data-interface route that signs with no credential at all. |
| URS-SEC-13 | Partial | `e2e/training/j2-manager-verification.spec.js` — "manager verifies a passed learner → VERIFIED, instance COMPLETED, verification recorded" | The signature's meaning on a printout is not tested. |
| URS-SEC-14 | Covered | `e2e/authentication/j14-idle-signout.spec.js` — "past the window it signs out, says why, and the session is really gone" | Idle timeout signs out and invalidates the session. |
| URS-SEC-15 | Covered | `e2e/authentication/j8-mfa-totp-enrolment.spec.js` — "enrol a factor, then login demands and accepts the challenge" | Second factor is enrolled and demanded at login. |
| URS-SEC-16 | Partial | `e2e/users/j6-deactivation-does-not-end-session.spec.js` — "a session opened BEFORE the deactivation is cut off" | Retention of the leaver's historical records is not tested. |
| URS-SEC-17 | N/A | — | Verified by supplier assessment and IQ rather than by test. |
| URS-SEC-18 | N/A | — | Procedural control with no application behaviour to test. |
| URS-SEC-19 | N/A | — | Procedural control with no application behaviour to test. |
| URS-SEC-20 | N/A | — | Procedural control with no application behaviour to test. |
| URS-SEC-21 | Covered | `e2e/multiSite/ms1-reach-follows-assignment.spec.js` — "MS-J2 · assigning a second site widens the reach" | Data reach follows the user's site assignments. |
| URS-SEC-22 | Covered | `e2e/capas/j9-matrix-scope-access.spec.js` — "no capa:update → read-only: no affordance in the UI, 403 from the API" | Missing update permission yields read-only UI and API refusal. |
| URS-SEC-23 | Partial | `e2e/capas/j9-matrix-scope-access.spec.js` — "a site-scoped editor — no assignment, no ownership — edits, completes and approves" | Assignee notification on acting-on-behalf is not tested. |

## 4. Document Control

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-DOC-01 | Partial | `e2e/documents/j11-required-field-refusals.spec.js` — "UI: submitting an empty create form tells the user what is missing" | Interface refusal only; no REST create route exists to test server-side. |
| URS-DOC-02 | Covered | `e2e/documents/j1-author-create-submit.spec.js` — "fill sections → submit → IN_REVIEW with doc number, workflow and task" | Draft authoring and submission for review are proven. |
| URS-DOC-03 | Partial | `e2e/documents/j1-author-create-submit.spec.js` — "create from template → DRAFT 1.0 with no doc number" | Section renumbering and attachments are not tested. |
| URS-DOC-04 | Covered | `e2e/documents/j1-author-create-submit.spec.js` — "fill sections → submit → IN_REVIEW with doc number, workflow and task" | Document number and review workflow are assigned on submit. |
| URS-DOC-05 | Covered | `e2e/documents/j3-reject-and-cancel.spec.js` — "reviewer rejects → REJECTED → author resubmits → IN_REVIEW" | Rejection returns the document to the author for resubmission. |
| URS-DOC-06 | Covered | `e2e/documents/j2-review-approve-esign.spec.js` — "full approval chain with e-signature and snapshot" | Approval chain completes with e-signature and snapshot. |
| URS-DOC-07 | Partial | `e2e/documents/j5-new-version-supersede.spec.js` — "effective → new revision (auto-demote) → approve → supersede, one EFFECTIVE" | Releasing an unapproved draft is never attempted. |
| URS-DOC-08 | Covered | `e2e/documents/j5-new-version-supersede.spec.js` — "effective → new revision (auto-demote) → approve → supersede, one EFFECTIVE" | Exactly one version stays effective after supersede. |
| URS-DOC-09 | Partial | `e2e/documents/j5-new-version-supersede.spec.js` — "effective → new revision (auto-demote) → approve → supersede, one EFFECTIVE" | A blank change reason is never refused. |
| URS-DOC-10 | Partial | `e2e/documents/j5-new-version-supersede.spec.js` — "effective → new revision (auto-demote) → approve → supersede, one EFFECTIVE" | The revision-history view is not tested. |
| URS-DOC-11 | Not automated | — | No test asserts printout identifier, version, status or uncontrolled-copy marking. |
| URS-DOC-12 | Not automated | — | Periodic review scheduling and its due task have no test. |
| URS-DOC-13 | Covered | `e2e/documents/j4-obsoletion.spec.js` — "detail archive: reason validation → ARCHIVED + soft-deleted + audit stamps" | Obsoletion requires a reason and stamps the audit trail. |
| URS-DOC-14 | Partial | `e2e/auditLogs/a5-record-history.spec.js` — "the History affordance is offered to a trail holder and withheld from the record owner" | A document's own full lifecycle history is not walked. |
| URS-DOC-15 | Covered | `e2e/documents/j9-permission-denials.spec.js` — "a user with no document permission is redirected to /no-access" | Users without document permission are denied access. |
| URS-DOC-16 | Not automated | — | Bulk or legacy document import has no test. |

## 5. Training Management

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-TRN-01 | Partial | `e2e/training/j9-required-field-refusals.spec.js` — "control: the body the negative arm is derived from is accepted" | Passing score, material and assessment are not required at create. |
| URS-TRN-02 | Product non-conformant | `e2e/training/j10-authoring-lock.spec.js` — "the assessment of a published training cannot be rewritten over REST" | Defect D13: the authoring lock is interface-only and the server applies the edit. |
| URS-TRN-03 | Covered | `e2e/training/j1-learner-completes.spec.js` — "ASSIGNED → IN_PROGRESS → COMPLETED, scored and e-signed" | Learner assignment through scored, signed completion is proven. |
| URS-TRN-04 | Product non-conformant | `e2e/training/j11-material-review-gate.spec.js` — "a submit with NO material opened is refused, and writes no signed record" | Defect D14: a completion can be signed without opening the material. |
| URS-TRN-05 | Covered | `e2e/training/j1-learner-completes.spec.js` — "a failing score does not complete the training and leaves a retry" | A failing score withholds completion and leaves a retry. |
| URS-TRN-06 | Partial | `e2e/training/j1-learner-completes.spec.js` — "a failing score does not complete the training and leaves a retry" | Exhausting the maximum attempts and being refused is not tested. |
| URS-TRN-07 | Covered | `e2e/training/j1-learner-completes.spec.js` — "ASSIGNED → IN_PROGRESS → COMPLETED, scored and e-signed" | Completion is scored and captured with an e-signature. |
| URS-TRN-08 | Covered | `e2e/training/j2-manager-verification.spec.js` — "manager verifies a passed learner → VERIFIED, instance COMPLETED, verification recorded" | Manager verification is recorded against the completion. |
| URS-TRN-09 | Covered | `e2e/training/j2-manager-verification.spec.js` — "rejecting for retraining → RETRAIN_REQUIRED plus a fresh retraining instance" | Rejection raises a fresh retraining instance. |
| URS-TRN-10 | Partial | `e2e/training/j11-material-review-gate.spec.js` — "control: the same submit SUCCEEDS once the material has been viewed" | Serving the pinned version after a new release is not tested. |
| URS-TRN-11 | Not automated | — | No test produces a training record or matrix report per person or training. |

## 6. Nonconformance

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-NCR-01 | Covered | `e2e/nonconformances/j11-required-field-refusals.spec.js` — "control: the body every negative arm is derived from is accepted" | Nine per-field refusals proven at the server. |
| URS-NCR-02 | Covered | `e2e/nonconformances/j1-raise-draft-open.spec.js` — "raise NC → auto-opened (OPEN), workflow instantiated" | Raising a nonconformance instantiates its workflow. |
| URS-NCR-03 | Not automated | — | Product auto-opens on create, so amending or deleting a draft is untested. |
| URS-NCR-04 | Partial | `e2e/nonconformances/j1-raise-draft-open.spec.js` — "raise NC → auto-opened (OPEN), workflow instantiated" | Permanence proven on create; refusal to delete an open record is untested. |
| URS-NCR-05 | Covered | `e2e/nonconformances/j2-reviewer-workflow.spec.js` — "reviewer Mark-Completes step 1 -> workflow advances, approver task created" | Reviewer completion advances the workflow and creates the approver task. |
| URS-NCR-06 | Covered | `e2e/nonconformances/j3-approve-close-gates-esign.spec.js` — "every gate blocks in turn with its specific reason; satisfying all closes the NC" | Each closure gate blocks with its own reason before close succeeds. |
| URS-NCR-07 | Partial | `e2e/nonconformances/j3-approve-close-gates-esign.spec.js` — "every gate blocks in turn with its specific reason; satisfying all closes the NC" | Gate clears by unsetting the flag; linking an actual CAPA is untested. |
| URS-NCR-08 | Covered | `e2e/nonconformances/j3-approve-close-gates-esign.spec.js` — "every gate blocks in turn with its specific reason; satisfying all closes the NC" | Closure requires an electronic signature. |
| URS-NCR-09 | Not automated | — | Cancelling a nonconformance, and its required reason, has no test. |
| URS-NCR-10 | Partial | `e2e/auditLogs/a5-record-history.spec.js` — "the trail is append-only — at the privilege layer and at the trigger" | Immutability proven; the record's own history is undercounted by the dialog defect. |

## 7. CAPA

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-CAP-01 | Covered | `e2e/capas/j11-required-field-refusals.spec.js` — "UI: submitting an empty create form tells the user what is missing" | Nine per-field server refusals proven alongside the form message. |
| URS-CAP-02 | Covered | `e2e/capas/j1-create-draft-open.spec.js` — "create CAPA (DRAFT) → Start CAPA (OPEN), workflow instantiated" | Draft creation and start-to-open both proven. |
| URS-CAP-03 | Covered | `e2e/capas/j2-reviewer-workflow.spec.js` — "reviewer Mark-Completes step 1 -> workflow advances, approver task created" | Reviewer completion advances the workflow and creates the approver task. |
| URS-CAP-04 | Partial | `e2e/capas/j3-close-gates-esign.spec.js` — "the open-steps gate blocks in turn; completing steps unblocks close" | Open-step gate proven; an open sub-task under a complete parent is untested. |
| URS-CAP-05 | Partial | `e2e/capas/j3-close-gates-esign.spec.js` — "the open-steps gate blocks in turn; completing steps unblocks close" | Signature proven; the requirement's second clause is stale, effectiveness is now a workflow step. |
| URS-CAP-06 | Covered | `e2e/capas/j4-effectiveness-check.spec.js` — "the check parks SCHEDULED, survives close, fires, and records the verdict" | Scheduled effectiveness check survives closure and records its verdict. |
| URS-CAP-07 | Not automated | — | The not-effective outcome test is disabled behind a dormant feature flag. |
| URS-CAP-08 | Covered | `e2e/capas/j5-cancel-esign.spec.js` — "owner cancels an OPEN CAPA — workflow aborted, e-signed" | Cancellation aborts the workflow and is electronically signed. |
| URS-CAP-09 | Partial | `e2e/recordLinks/j1-related-records.spec.js` — "link, see it on the record, unlink" | Manual link proven; many-to-one linking and the raise-with-CAPA path are not. |
| URS-CAP-10 | Product non-conformant | `e2e/capas/j12-audit-history-completeness.spec.js` — "the dialog shows the REJECT entry that explains the revert to DRAFT" | Defect D9: per-record dialog omits entries written under the other entity-type spelling. |

## 8. Change Control

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-CHG-01 | Covered | `e2e/changeRequests/j10-required-field-refusals.spec.js` — "control: the body every negative arm is derived from is accepted" | Seven per-field server refusals proven. |
| URS-CHG-02 | Covered | `e2e/changeRequests/j11-impact-assessment.spec.js` — "TC-05-02 steps 1–3 · the assessment an executor types is saved and reads back" | Assessment content persists, a risk record can be linked, and the approver holding the live task can read the whole assessment. |
| URS-CHG-03 | Covered | `e2e/changeRequests/j1-create-submit-approve-close.spec.js` — "reviewer → approver → implementation completes the workflow, CR stays OPEN" | Full review, approval and implementation sequence proven. |
| URS-CHG-04 | Covered | `e2e/changeRequests/j5-links-lineage.spec.js` — "owner adds a link, lists it, then removes it" | Linking related records and removing the link are proven. |
| URS-CHG-05 | Covered | `e2e/changeRequests/j1-create-submit-approve-close.spec.js` — "owner closes a finished OPEN CR with e-signature → CLOSED + Part-11 ledger row" | Closure requires a signature and writes a Part-11 ledger row. |
| URS-CHG-06 | Covered | `e2e/changeRequests/j12-audit-history-view.spec.js` — "TC-05-06 step 1 · a closed change request's history view holds creation, submission, approval and closure" | The history view is opened on the record; entries carry timestamps and old/new values, and no entry can be edited or deleted. Pinned: nothing writes a REJECT row under the plural entity type the view queries. |

## 9. Quality Complaints

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-CMP-01 | Partial | `e2e/complaints/j6-required-field-refusals.spec.js` — "REST: creating a complaint without 'subject' is refused 400 and writes nothing" | Only subject is mandatory; protocol expects description, product and lot refused too. |
| URS-CMP-02 | Covered | `e2e/complaints/j12-classification-and-detail.spec.js` — "TC-06-02 steps 2-5 · product, lot, quantity, order ref, customer detail, samples and the safety/recall flags all reach their own columns" | Classification and detail persist to their own columns, FK-sealed to the tenant. Note: `complaint_number` carries no uniqueness constraint (asserted, TC-06-01 step 7). |
| URS-CMP-03 | Gap pinned | `e2e/complaints/j13-qa-review-investigation.spec.js` — "KNOWN DEFECT · declining an investigation with NO justification is accepted, at every layer" | The QA-review chain and its permission gate are proven, but TC-06-03 step 2's mandatory justification is **not enforced at any layer**, and the investigation decision has no input surface in the application. |
| URS-CMP-04 | N/A | — | Reportability has no input surface in the product; marked not applicable in the protocol. |
| URS-CMP-05 | Covered | `e2e/complaints/j14-escalation-to-nonconformance.spec.js` — "TC-06-05 steps 1-5 · converting one complaint creates the NC, links it both ways, and CLOSES the complaint" | Single and many-to-one escalation, the one-time conversion guard, the permission gate and the audit entry are all asserted. |
| URS-CMP-06 | Partial | `e2e/complaints/j15-closure-esignature.spec.js` — "TC-06-06 steps 3+5 · the correct credential closes the complaint and writes one signature bound to the approver's task" | Proven: closure is refused while review is incomplete, refused without or with a wrong credential, and writes one bound signature. Not met: TC-06-06 step 6 — closure seals the **status only**, and the regulated fields stay writable on a closed record. |
| URS-CMP-07 | Covered | `e2e/complaints/j17-printed-record.spec.js` — "TC-06-07 steps 1+2 · the printout carries the narrative, classification, product and lot, customer detail and the QA assessment" | Print content, status and provenance are asserted; an undecided reportability prints empty rather than as a decision. |
| URS-CMP-08 | Covered | `e2e/complaints/j16-audit-trail.spec.js` — "TC-06-08 step 2 · an update entry shows OLD and NEW values, field by field" | Intake, update diffs, review, escalation and closure are all traceable and attributed; entries are immutable at the trigger and the privilege layer. |

## 10. Audit Management

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-AUD-01 | Covered | `e2e/audits/j6-standard-authoring-approval.spec.js` — "v1.0 DRAFT → UNDER_REVIEW → EFFECTIVE, then v1.1 supersedes it" | Standard authoring, approval and supersession are exercised end to end. |
| URS-AUD-02 | Covered | `e2e/audits/j13-program-schedule-trail.spec.js` — "a recurring programme is projected onto the annual calendar before any instance exists" | Programme scheduling and its calendar projection are asserted. **Pinned (AUD-D1):** changing a planned date writes no audit-trail entry, so TC-07-02 step 4 is unmet. |
| URS-AUD-03 | Covered | `e2e/audits/j2-adhoc-lifecycle-esign.spec.js` — "OPEN: Scheduled → In Progress → Review, then CLOSED — auto-finding raised and resolved" | Full ad-hoc audit lifecycle transitions are asserted. |
| URS-AUD-04 | Covered | `e2e/audits/j2-adhoc-lifecycle-esign.spec.js` — "OPEN: Scheduled → In Progress → Review, then CLOSED — auto-finding raised and resolved" | Finding creation during execution is asserted. |
| URS-AUD-05 | Covered | `e2e/audits/j2-adhoc-lifecycle-esign.spec.js` — "OPEN: Scheduled → In Progress → Review, then CLOSED — auto-finding raised and resolved" | Finding resolution before closure is asserted. |
| URS-AUD-06 | Covered | `e2e/audits/j4-finding-conversion.spec.js` — "attach an existing CAPA, then raise a new one from the deep link" | Both attaching and raising a CAPA from a finding are exercised. |
| URS-AUD-07 | Covered | `e2e/audits/j14-per-clause-results.spec.js` — "every leaf clause carries its own verdict, attributed to the auditor with a timestamp" | Per-clause verdicts are attributed and timestamped, the published conformance figure reconciles with them, and a changed verdict replaces rather than duplicates. The printed report still omits per-clause detail. |
| URS-AUD-08 | Product non-conformant | `e2e/audits/j1-program-generator.spec.js` — "generator-created rows leave no audit trail (finding #4)" | Writes made by the scheduled generator are not recorded in the audit trail. |

## 11. Risk Management

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-RSK-01 | Covered | `e2e/riskAssessment/j9-template-and-scoring-controls.spec.js` — "step 5 — a user without risk_assessment_templates:update cannot alter the template, proven AT THE POLICY (an inspection is not evidence)" | Dimensions, every level's score and all nine band mappings are reconciled against the declared method; the edit refusal is proven at the policy with an admitting control. |
| URS-RSK-02 | Covered | `e2e/riskAssessment/j9-template-and-scoring-controls.spec.js` — "TC-08-02 steps 2 and 6 — the matrix offers ONLY the template's levels" | Completeness gate and scale-only selection asserted; steps 3–5 are N/A by the protocol and their justifications are now schema-pinned. |
| URS-RSK-03 | Covered | `e2e/riskAssessment/j6-scoring-derivation.spec.js` — "every cell in the hand-calculation table derives the expected RPN *and* the expected band" | Six-cell hand calculation, both derivations, the boundary cells that prove the band is a lookup, recalculation on change, and no hand-entry path. |
| URS-RSK-04 | N/A | — | No surface; `j9` pins that the data model *does* support it, so the N/A is an interface gap and correctly justified. |
| URS-RSK-05 | Gap pinned | `e2e/riskAssessment/j7-approval-esignature.spec.js` — "step 5 — the in-place upsert is scoped to ONE instance step: a send-back re-score leaves a SECOND live assessment (KNOWN DEFECT RA-D1)" | Non-approver refusal, signature evidence and post-approval read-only are all proven. **Not met:** TC-08-05 step 5 — a send-back plus re-score leaves two live assessments on one record, neither superseded nor marked. |
| URS-RSK-06 | Covered | `e2e/riskAssessment/j8-audit-trail.spec.js` — "step 2 — a score change records BOTH the previous and the new value" | Capture with scores (not a bare `{id}`), before/after values, timestamp and performer, and immutability at the database. |

## 12. QC Inspection

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-QCI-01 | Covered | `e2e/qcInspection/j4-j7-authoring-and-aql.spec.js` — "create a spec with characteristics and approve it to EFFECTIVE" | Specification authoring and approval to effective are exercised. |
| URS-QCI-02 | Covered | `e2e/qcInspection/j4-j7-authoring-and-aql.spec.js` — "create, preview and approve a sampling plan" | Sampling plan creation, preview and approval are exercised. |
| URS-QCI-03 | Covered | `e2e/qcInspection/j1-incoming-lifecycle.spec.js` — "the seeded template, spec and sampling plan are snapshotted onto the lot" | Controlled inputs are snapshotted onto the inspection lot. |
| URS-QCI-04 | Gap pinned | `e2e/qcInspection/j15-per-sample-and-aql-reconciliation.spec.js` — "KNOWN DEFECT — amending a result overwrites it; the superseded value is not recoverable anywhere" | Per-sample capture, per-unit attribution and the completeness gate are proven. **Not met:** amending a result destroys the original, so the protocol's "retain the original" step is unsatisfied. |
| URS-QCI-05 | Covered | `e2e/qcInspection/j14-spec-limit-evaluation.spec.js` — "the LSL/USL boundary ladder is evaluated inclusively and without inspector judgement" | At-limit and just-inside boundary values evaluated inclusively; attribute failures flagged. Pinned: a non-numeric value on a numeric test is recorded rather than refused. |
| URS-QCI-06 | Covered | `e2e/qcInspection/j15-per-sample-and-aql-reconciliation.spec.js` — "the lot reconciles defect counts against the sampling plan: below, at, and on the reject number" | Defect counts reconciled against the plan's accept/reject criteria at all three boundaries. |
| URS-QCI-07 | Covered | `e2e/qcInspection/j16-disposition-esign-nc-and-audit.spec.js` — "a rejected lot raises a pre-linked nonconformance, visible from both sides; a released lot cannot" | Raising a nonconformance from a rejected lot is proven, with the link visible from both records. **See QCI-D1 below — the route carries no QC permission gate.** |
| URS-QCI-08 | Covered | `e2e/qcInspection/j16-disposition-esign-nc-and-audit.spec.js` — "the disposition is refused without an e-signature, and accepted with one — recording name, meaning and time" | E-signed approval and the result lock after approval are both asserted. |
| URS-QCI-09 | Covered | `e2e/qcInspection/j18-inspection-report-content.spec.js` — "the report carries lot detail, the sampling plan, per-characteristic results and the OOS marking" | Content inventory asserted. Pinned: logged defects appear nowhere on the report. |
| URS-QCI-10 | Covered | `e2e/qcInspection/j16-disposition-esign-nc-and-audit.spec.js` — "results are locked once the lot is under review, and stay locked after approval" | Lot history carries old and new result values with attribution. |
| URS-QCI-11 | Covered | `e2e/qcInspection/j17-line-clearance-and-checkin-cadence.spec.js` — "with clearance REQUIRED the gate blocks, a Hold does not lift it, and a Release does" | The gate is exercised in both settings: off by default and permitting collection, on and blocking until released. |
| URS-QCI-12 | Partial | `e2e/qcInspection/j3-execution-gates.spec.js` — "results cannot be recorded until an inspector checks in" | Not covered: takeover attribution. The sampling cadence is **not implemented** rather than untested — the plan's interval is advisory and nothing displays or enforces a next-collection due time. |

## 13. Log Books

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-LOG-01 | Covered | `e2e/inspectionsLogs/j9-book-authoring-freeze.spec.js` — "an owner authors a book with a four-type entry form, and it is born DRAFT at generation 1" | Authoring a book and its entry form, and the draft rework path, are exercised. |
| URS-LOG-02 | Covered | `e2e/inspectionsLogs/j9-book-authoring-freeze.spec.js` — "a draft is still editable — the form can be reworked, and each rework bumps the schema version" | The active-book field guard is now exercised directly at the trigger. Two pinned defects: the no-op guard on the version bump is dead code, and two fields are not covered by the guard. |
| URS-LOG-03 | Partial | `e2e/inspectionsLogs/j6-assignment-instance.spec.js` — "filling the entry discharges the instance and links the two both ways" | Not covered: schedule configuration and an occurrence falling due. |
| URS-LOG-04 | Covered | `e2e/inspectionsLogs/j1-submit-entry.spec.js` — "an operator files an operational entry and it lands SUBMITTED, inside its edit window" | Entry submission and its edit window are asserted. |
| URS-LOG-05 | Covered | `e2e/inspectionsLogs/j10-training-gate.spec.js` — "an untrained operator is refused, and the refusal names the document they owe" | The training block is armed and proven, including that manager verification — not merely passing — opens the gate. |
| URS-LOG-06 | Covered | `e2e/inspectionsLogs/j3-review.spec.js` — "the book supervisor approves under e-signature and the entry seals" | Supervisor review under e-signature and entry sealing are asserted. |
| URS-LOG-07 | Covered | `e2e/inspectionsLogs/j4-amend-void.spec.js` — "an amend-holder corrects a sealed entry under signature, and the original survives" | Amendment under signature with retention of the original is asserted. |
| URS-LOG-08 | Covered | `e2e/inspectionsLogs/j11-register-printout.spec.js` — "the register prints every entry in the range with its number, time, operator and status" | Register printing over a date range is asserted, including that the range is a real filter. |
| URS-LOG-09 | Covered | `e2e/inspectionsLogs/j12-audit-trail.spec.js` — "a correction shows both the original and the corrected value, with the reason" | Filing, correction, review, flag and void all reach the trail with their own semantics. Pinned: the flag's audit row carries `{id}` and nothing more. |

## 14. Equipment & Calibration

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-EQP-01 | Covered | `e2e/equipment/j1-register-crud.spec.js` — "create: the dialog persists over REST, and the service validates it" | Equipment registration persists and is validated server-side. |
| URS-EQP-02 | Covered | `e2e/equipment/j2-calibration-programme.spec.js` — "recording a calibration is e-signed and evidenced, and the schedule rolls forward" | Calibration recording is e-signed, evidenced, and reschedules the next due date. |
| URS-EQP-03 | Covered | `e2e/equipment/j8-pm-programme-reminders.spec.js` — "an upcoming PM reminds the custodian and the department supervisor — and nobody else" | Preventive-maintenance reminders reach the right people and escalate when no supervisor is set. Recorded as a weaker control than the protocol implies: PM raises a **notification, never a task**. |
| URS-EQP-04 | Covered | `e2e/equipment/j7-status-lifecycle-and-trail.spec.js` — "every status change is recorded as a semantic action with both values" | Status changes are audited with both values and refused in the illegal direction at the database. Recorded: there is **no reason field** for a status change anywhere in the write path, so the protocol's reason-capture step cannot be met. |
| URS-EQP-05 | Covered | `e2e/equipment/j2-calibration-programme.spec.js` — "the register paints the calibration schedule — overdue red, due-soon amber, clear neutral" | Register signals overdue, due-soon and clear calibration states. |
| URS-EQP-06 | Covered | `e2e/equipment/j7-status-lifecycle-and-trail.spec.js` — "the database refuses RETIRED → IN_SERVICE, on the superuser path as hard as on app_user" | The equipment audit trail is asserted, with retirement and reinstatement recorded as semantic actions. |

## 15. Supplier Management

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-SUP-01 | Covered | `e2e/suppliers/j15-registration-and-status.spec.js` — "TC-12-01: a supplier is registered with name, code and category" | Supplier registration captures name, code and category. |
| URS-SUP-02 | N/A | — | Marked not applicable in the protocol; no qualification scoring surface exists. |
| URS-SUP-03 | Not automated | — | Supplier certificates with expiry dates, and expiry surfacing, have no test. |
| URS-SUP-04 | Partial | `e2e/suppliers/j15-registration-and-status.spec.js` — "TC-12-04: a pending supplier is approved, and the change is attributed" | Status moves within a closed vocabulary; performer and timestamp recording not covered. |
| URS-SUP-05 | Partial | `e2e/assetRequest/j2-supplier-portal-review.spec.js` — "the portal user sees their own request and uploads against it" | Isolation and attribution shown on an asset request only, not an assigned quality-record step. |
| URS-SUP-06 | Gap pinned | `e2e/suppliers/j15-registration-and-status.spec.js` — "known-gap: there is no status transition graph — any status follows any other" | Test records unguarded behaviour: sequencing unenforced, capability control unexercised. |
| URS-SUP-07 | Not automated | — | No supplier audit-trail test exists. |

## 16. Forms & Workflows

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-WFL-01 | Partial | `e2e/records/r1-plain-submission.spec.js` — "fill and submit a form: the server mints the number and seals the schema" | Not covered: the full typed-field palette and field reordering; only a two-field probe. |
| URS-WFL-02 | Not automated | — | No required-field or data-type validation test; payload is stored verbatim. |
| URS-WFL-03 | Partial | `e2e/forms/f5-structural-integrity-trigger.spec.js` — "version is monotonic — pinned in direction, not in cadence" | Not covered: rendering an old record against a superseded form version. |
| URS-WFL-04 | Covered | `e2e/workflow/j1-template-authoring.spec.js` — "the 4-step wizard writes a mixed ACTION/APPROVAL/DELAY design graph — entirely over SyncEngine" | Template authoring of a mixed-step design graph is asserted. |
| URS-WFL-05 | Covered | `e2e/workflow/j5-control-field-snapshot.spec.js` — "BLOCKS the F-05 bypass: flipping requireEsignature on the PUBLISHED template does not disarm a live approval" | Control-field snapshot prevents disarming a live approval. |
| URS-WFL-06 | Covered | `e2e/workflow/j4-reviewer-picker-instantiation.spec.js` — "picking a reviewer per step mints one instance, one step per template step, one ledger row per reviewer, and activates only the first root step" | Instantiation with per-step reviewers and correct activation is asserted. |
| URS-WFL-07 | Covered | `e2e/workflow/j6-multi-approver-rules.spec.js` — "ANY records ONLY the approver who acted — the other assignee is not stamped APPROVED" | Both rules asserted, including that an ANY step records the acting approver and no one else. Previously non-conformant; the test was inverted from a defect pin when the fix landed. |
| URS-WFL-08 | Partial | `e2e/workflow/j16-per-module-reject-signature.spec.js` — "rejecting an e-sign-required step through the per-module endpoint demands a signature, then writes one" | Not covered: the mandatory-comment setting, which does not gate completion. |
| URS-WFL-09 | Covered | `e2e/workflow/j7-reject-and-resubmit.spec.js` — "rejecting a step terminates the whole cycle and returns the record to the owner" | Rejection terminates the cycle and returns the record to its owner. |
| URS-WFL-10 | Not automated | — | Reading a retired workflow version, or a record that ran on one, has no test. |
| URS-WFL-11 | Not automated | — | No workflow audit-trail assertion for template or run history. |

## 17. Item Master

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-ITM-01 | Covered | `e2e/products/j1-create-edit-lifecycle.spec.js` — "create: the dialog writes over GraphQL and issues no products REST call" | Item creation persists; required-field refusal is verified at the interface only. |
| URS-ITM-02 | Partial | `e2e/products/j1-create-edit-lifecycle.spec.js` — "edit: the detail page saves the same way, and SKU stays immutable" | Code immutability after creation is covered; duplicate-code refusal is not. |
| URS-ITM-03 | Not automated | — | Associating an item with its suppliers has no test. |
| URS-ITM-04 | Partial | `e2e/products/j2-list-filter-pick.spec.js` — "the QC lot picker offers ACTIVE items and refuses the OBSOLETE one" | Selection proven in QC; selection in nonconformances and complaints not covered. |
| URS-ITM-05 | Partial | `e2e/products/j1-create-edit-lifecycle.spec.js` — "lifecycle: all four statuses are reachable and each repaints the badge" | Withdrawal is reachable; retention on existing records and the audit entry not covered. |
| URS-ITM-06 | Covered | `e2e/products/j10-audit-coverage.spec.js` — "a browser edit of ONLY the revision produces an audit row, attributed" | A revision-only edit produces an attributed audit entry. |

## 18. Retain Samples

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-RET-01 | Covered | `e2e/qcInspection/j11-retain-registry.spec.js` — "create a retain sample from a lot, then move it" | A retain sample is created from a lot and recorded. |
| URS-RET-02 | Not automated | — | Producing a sample label, and its machine-readable code, has no test. |
| URS-RET-03 | Partial | `e2e/qcInspection/j11-retain-registry.spec.js` — "create a retain sample from a lot, then move it" | Storage move is proven; custody out and return have no code path to test. |
| URS-RET-04 | Covered | `e2e/qcInspection/j12-retain-dispose-esign.spec.js` — "a retain sample is disposed under PIN e-sign and then sealed" | Disposal requires PIN e-signature and the record is then sealed. |
| URS-RET-05 | Partial | `e2e/qcInspection/j11-retain-registry.spec.js` — "create a retain sample from a lot, then move it" | Sample appears on the register; register columns, filtering and export not covered. |
| URS-RET-06 | Partial | `e2e/qcInspection/j12-retain-dispose-esign.spec.js` — "a retain sample is disposed under PIN e-sign and then sealed" | Disposal entry is strongly asserted; registration and location-change entries not covered. |

## 19. Customer Complaint Management

| Req ID | Status | Automated evidence | Note |
| ------ | ------ | ------------------ | ---- |
| URS-CCM-01 | Covered | `j3-customer-complaint-lifecycle.spec.js` — "create: lands in customer_complaints, not complaints…"; `j9-intake-audit-trail.spec.js` — intake steps 3–8 | Creation is permission-gated, mints a per-company CC number, opens in New, records the recorder and the date raised, and never reaches the internal register. |
| URS-CCM-02 | Product non-conformant | `j9-intake-audit-trail.spec.js` — "priority, source and customer reference persist and read back"; `j10-assignment-permissions.spec.js` — "an attachment persists against the ticket" | Priority, source, customer reference and attachments are proven and do persist. **Category, severity, product and lot reference cannot be recorded at all** — they are not columns on `customer_complaints` (defect CC-D1). See the non-conformance table above before executing TC-17-02. |
| URS-CCM-03 | Covered | `j10-assignment-permissions.spec.js` — accept / reassign / no-access probes; `j3` — "accept: the agent becomes the assignee…" | Acceptance sets the assignee and advances status; reassignment works with no named-owner gate; a no-access account is refused every action at the API, not just in the interface. |
| URS-CCM-04 | Covered | `j10-assignment-permissions.spec.js` — public reply, internal/QA notes, attachment | Correspondence persists and is attributed to the actor; a public reply sets Waiting on Customer; internal and QA notes never move the status. |
| URS-CCM-05 | Covered | `j7-closure-approval.spec.js` — 10 tests across 5a and 5b | Both branches proven: direct close and second-close refusal; approval-on routes to PENDING_APPROVAL; a non-approver is refused; a wrong PIN is refused; the correct PIN closes it and the signature evidence lands in the audit trail; reopen returns to Open and clears the assignee. The empty system-wide signature register is asserted deliberately — see the note below. |
| URS-CCM-06 | Covered | `j8-nc-escalation.spec.js` — 9 tests | Conversion mints a linked NC; the link resolves in both directions; and finality is proven at the **database** on both the trusted and untrusted paths, not merely by a missing button. |
| URS-CCM-07 | Not automated | — | Printing a customer complaint in full has no test. Unchanged. |
| URS-CCM-08 | Covered | `j9-intake-audit-trail.spec.js` — "intake and each subsequent change leave an audit entry…", "the audit trail is append-only" | Entries carry actor, timestamp and the changed values; UPDATE and DELETE against `audit_logs` are refused by the `audit_logs_immutable` trigger. |

**Beyond the requirement baseline.** `j11-public-portal-autoclose.spec.js` (20 tests) covers
two surfaces OQ-17 §5 lists as untested: the public HMAC status page (token scope, tamper
and non-disclosure, internal-field leakage, customer attribution, the reopen window) and
the auto-close worker (threshold honoured per tenant, opt-in, already-closed and escalated
tickets untouched, SYSTEM attribution). These carry no URS row because the baseline does
not describe them; they are recorded here so the coverage is not invisible.

## Observations on the requirement baseline

Two requirements in the Traceability Matrix are worded against behaviour the product no
longer has. They are recorded here rather than silently rewritten, because the baseline
requirements are yours to own and amend.

**URS-CAP-05 — "Closure requires an electronic signature and schedules an effectiveness
check."** The first clause holds and is covered. The second is stale: closure does not
schedule a separate effectiveness record. Effectiveness is configured as a **delay step on
the CAPA workflow template**, which parks until its due date, survives closure and records
its verdict when it fires — verified by the test cited for URS-CAP-06, which also confirms
closure creates no separate check record. [OQ-04](/validation/oq/capa) TC-04-05 already
describes the current design, and its step 7 tests that closing does not cancel a parked
effectiveness step. When you adopt this requirement into your own URS, word it against the
workflow step.

**URS-SUP-06 — supplier blocking and requalification "under permission control."** Block
and requalify work and are covered. Two things are not: the status sequence is not
enforced — any status may follow any other — and the seeded test roles do not exercise the
capability control, so the automated evidence runs with an owner account that bypasses it.
This is the document's single **Gap pinned** row. Verify the permission control on your own
roles.

## Using this document to plan your effort

1. **Start from your own risk assessment**, not from this table. A requirement marked
   *Covered* that is critical to your process still warrants full execution; one marked
   *Not automated* that is administrative may warrant little.
2. **Where a row is *Not automated* or *Gap pinned***, plan your own test case in full, and
   do not reduce sample size or rely on inspection alone.
3. **Where a row is *Partial***, read the Note and cover the stated remainder.
4. **Where a row is *Product non-conformant***, read the protocol note first. You will
   either record a deviation or, with justification, an accepted limitation with a
   procedural control. Do not record a pass.
5. **Request the evidence you intend to rely on.** For any *Covered* row, Qability can
   supply the test source, its execution record and the run output as part of supplier
   assessment. Evidence you have not seen is not evidence you can cite.
6. **Re-check this document at each release.** Coverage changes as tests are added and
   defects are fixed; a requirement marked non-conformant here may be closed in the release
   you are validating. The version and date on this document are what you assessed against.

## Basis of this assessment

Every status in this document was determined by reading what each test **asserts** — not
from test names, file names or counts. A test whose name matches a requirement but whose
assertions do not reach its substance is recorded as *Partial* or *Not automated*.

Three exclusions are deliberate, and each is the kind of thing that would otherwise inflate
a coverage figure:

- **Tests that pin current defective or unguarded behaviour** so a future change is
  noticed are never counted as evidence. They appear as *Gap pinned*.
- **Tests that are disabled** — one effectiveness-outcome test sits behind a dormant
  feature flag and does not execute — are counted as *Not automated*, not as coverage.
- **A control proven for one record type is not claimed for another.** The audit-trail
  mechanism is verified thoroughly, but for two record types only; module requirements for
  audit history are scored on their own module's evidence.

| Role             | Name | Signature | Date |
| ---------------- | ---- | --------- | ---- |
| Compiled by      |      |           |      |
| Reviewed by (QA) |      |           |      |

## Related

- [How to Use This Package](/validation/framework/how-to-use-this-package)
- [Requirements Traceability Matrix](/validation/framework/traceability-matrix)
- [Validation Master Plan](/validation/framework/validation-master-plan)
- [21 CFR Part 11 / EU Annex 11 Assessment](/validation/framework/part-11-assessment)
