---
id: how-to-use-this-package
title: How to Use This Package
sidebar_position: 1
description: What this validation package is, what it is not, who does what, and how to execute and document a protocol.
keywords: [validation, CSV, GAMP 5, qualification, protocol, execution, deviation, how to]
---

# How to Use This Validation Package

**Document ID:** VAL-GDE-001 · **Version:** 1.0 · **Applies to:** Qability QMS (SaaS)

## 1. What this package is

Qability supplies the documents a regulated organisation needs to validate its use of
Qability QMS: a validation plan, a regulatory assessment, an installation qualification,
one operational qualification protocol per functional module, performance qualification
templates, and a requirements traceability matrix.

Each document is a **template you execute**, not a record of testing already done on
your behalf.

## 2. What this package is not

**It is not a completed validation, and it is not a certificate.** Validation of a
computerised system is the activity of the regulated user — the company that relies on
the system to make quality decisions. That obligation sits with you under 21 CFR Part 11,
EU GMP Annex 11 §4, and ISO 13485:2016 §4.1.6, and it cannot be transferred to a
software vendor.

What a vendor can do is reduce your effort: supply the specifications, describe the
controls, pre-write the test scripts, and make its own development and hosting evidence
available for your supplier assessment. That is what this package does.

Concretely, the split is:

| Qability provides | Your organisation provides |
| --- | --- |
| Protocol templates (this package) | Approval of the protocols before execution |
| Functional specification of each control | Your intended use, user requirements and risk assessment |
| Hosting, backup and change-control evidence on request | Execution against your own configured tenant |
| Release notes identifying what changed | Signed, dated executed records and the summary report |
| Supplier assessment / audit support | Deviation handling and the release decision |

> **Tailor before you approve.** These protocols are written against the product's
> standard behaviour. Your configuration — workflow templates, document types, roles,
> lookups — is yours, and a protocol that tests configuration you do not use is wasted
> effort, while one that omits a critical configuration you *do* use is a gap. Add,
> remove and reword test cases to match your intended use, then approve the tailored
> version.

## 3. Scope of validation effort

Follow a risk-based approach (GAMP 5, 2nd edition). Qability QMS is a configurable
commercial product — normally **GAMP category 4** — so the expected effort is
verification of configuration and of the functions you actually rely on, not source-code
review.

Scale your effort by what a failure would cost:

| Risk of the module in *your* process | Typical effort |
| --- | --- |
| High — the record is a GxP release decision, or a Part 11 signed record | Execute the full OQ protocol, plus PQ scenarios against real business cases |
| Medium — supports a GxP process but errors are detectable downstream | Execute the OQ protocol; PQ optional |
| Low — administrative or reporting only | Reduced testing, or justify exclusion in the VMP |

Excluding a module is a legitimate decision. Record it, and record why, in the Validation
Master Plan — an unexplained gap is what an inspector will find.

## 4. Sequence

1. **Assess the supplier.** Review Qability's development, hosting, and change-control
   practices. Request an audit or a completed supplier questionnaire.
2. **Define your requirements.** Write, or adopt and tailor, a User Requirements
   Specification. The [Requirements Traceability Matrix](/validation/framework/traceability-matrix)
   provides a baseline requirement set keyed to the protocols.
3. **Write and approve the plan.** Tailor the
   [Validation Master Plan](/validation/framework/validation-master-plan), including scope,
   risk assessment, roles, and acceptance criteria.
4. **Review the regulatory assessment.** The
   [21 CFR Part 11 / Annex 11 Assessment](/validation/framework/part-11-assessment) states
   which controls the product provides and which are procedural obligations you must meet.
   The procedural ones need SOPs before you go live.
5. **Execute IQ.** [Installation Qualification](/validation/framework/installation-qualification)
   confirms the environment, tenant configuration, and access controls.
6. **Execute OQ.** Run the module protocols in scope. Record every actual result.
7. **Execute PQ.** Run [Performance Qualification](/validation/framework/performance-qualification)
   scenarios with real users, real data, and your own SOPs.
8. **Report and release.** Summarise results, close deviations, and make a documented
   release decision.

## 5. How to execute a protocol

### 5.1 Before you start

- The protocol must be **approved and signed** before execution begins. Executing an
  unapproved protocol invalidates the result.
- Confirm the **system version** under test and record it on the protocol cover.
- Confirm prerequisites: test accounts, roles, and any reference data the protocol names.
- Use a **validation tenant** where possible. Where you must test in production, say so in
  the plan and make sure test records are identifiable and dispositioned afterwards.

### 5.2 During execution

- Work through the steps **in order**. Do not skip a step because it "obviously" works.
- Record the **actual result** for every step, even when it matches the expected result.
  "Pass" alone is not an actual result — write what you saw. Objective evidence (a
  screenshot, an exported record, a report) is what makes a result reviewable.
- Initial and date each step as you complete it, in indelible ink if on paper.
- **Never overwrite an entry.** Strike a single line through the error, write the
  correction next to it, and initial and date the change. The original must remain
  legible — this is ALCOA+, and it applies to your validation records exactly as it
  applies to your batch records.

### 5.3 When a step fails

A failure is not a reason to stop and quietly re-run. Raise a **deviation** on the
protocol's deviation log with:

- the step reference and what actually happened;
- an assessment of impact on the validated state and on patient/product safety;
- the disposition — corrected and retested, accepted with justification, or scope
  reduced;
- the retest result and evidence, where retested.

Every deviation must be closed, with QA approval, before the summary report is signed.

### 5.4 After execution

- The tester signs the execution; a **second person independent of execution** reviews it.
- File the executed protocol with its evidence attachments.
- Roll results into the validation summary report and make the release decision.

## 6. Printing a protocol

Every document in this package has a **Print** action that produces an A4 protocol with
your company header, ready to be executed on paper and filed. Test-step tables print with
blank **Actual Result**, **Pass/Fail** and **Initials/Date** columns.

Protocols default to landscape because the step tables are wide; switch to portrait in the
print toolbar if your template requires it.

## 7. Keeping validation current

Validation is a state you maintain, not an event you complete.

- **Qability releases.** Review each release note for changes affecting functions you
  validated. Assess the impact, and regression-test what the change touches. The
  [Traceability Matrix](/validation/framework/traceability-matrix) is what makes that
  assessment quick: it maps requirements to the protocol that proves them.
- **Your configuration changes.** A new workflow template, document type, or role
  permission is a change to the validated system. Route it through your change control and
  retest the affected protocol.
- **Periodic review.** Set a review interval in the VMP — annually is typical — and
  confirm the system is still operating as validated.

## Related

- [Validation Master Plan](/validation/framework/validation-master-plan)
- [21 CFR Part 11 / EU Annex 11 Assessment](/validation/framework/part-11-assessment)
- [Installation Qualification](/validation/framework/installation-qualification)
- [Requirements Traceability Matrix](/validation/framework/traceability-matrix)
