---
id: performance-qualification
title: Performance Qualification (PQ)
sidebar_position: 5
description: PQ / UAT scenario templates — end-to-end business cases executed by real users against your own SOPs, with worked examples per module.
keywords: [PQ, performance qualification, UAT, user acceptance, business scenario, end to end]
---

# Performance Qualification — Qability QMS

**Document ID:** VAL-PQ-001 · **Version:** 1.0

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Execution reviewed by |  |  |  |  |

## 1. Purpose

OQ proves the system *functions* as specified. PQ proves it *performs* for your intended
use: real users, following your approved SOPs, completing real business processes on
representative data, in the environment you will actually run.

PQ is where configuration errors surface. A workflow that passes OQ because every step
works can still fail PQ because the approval route does not match your delegation of
authority, or because the required fields do not capture what your procedure demands.

## 2. What makes PQ different from OQ

| | OQ | PQ |
| --- | --- | --- |
| Executed by | Validation tester | The people who will use the system |
| Follows | The test script | Your SOP |
| Data | Contrived test data | Representative real-world data |
| Proves | The function works | The process works, end to end |
| Fails when | A function is broken | A function works but does not fit the process |

Run PQ **after** OQ passes, in the environment you will go live in, with the final
configuration.

## 3. Rules for PQ execution

1. **Users follow the SOP, not the script.** Hand the user the procedure and the scenario,
   not a list of clicks. If they cannot complete the task from the SOP, that is a finding
   — against the SOP, the training, or the configuration.
2. **Use representative data.** Not `Test 1` / `asdf`. Use a real (or realistically
   shaped) document, nonconformance or complaint, including the awkward cases: long text,
   attachments, special characters, multiple sites.
3. **Cross the module boundaries.** Most real failures are at the seams — a complaint that
   becomes a nonconformance that spawns a CAPA that triggers a document change that
   requires retraining. Scenario PQ-A below is exactly that chain.
4. **Record what the user did and what happened**, including hesitation and workarounds.
   A step that "passed" after the user asked for help is a training or usability finding.
5. **Include the negative cases** you actually care about: the wrong person trying to
   approve, closing a record with something missing, working after a session timeout.

## 4. Scenario record template

Copy this block for each scenario.

**Scenario ID:** PQ-___ **Title:** ______________________________

| Field | Detail |
| --- | --- |
| Business process | **[what real process this represents]** |
| Governing SOP | **[SOP number and title]** |
| Requirement refs | **[URS ids from the traceability matrix]** |
| Executed by | **[name, role — a real user of this process]** |
| Date |  |
| Test data used | **[describe]** |

| Step | User action (per SOP) | Expected business outcome | Actual outcome | P/F | Init |
| --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |
| 4 |  |  |  |  |  |
| 5 |  |  |  |  |  |

**Findings / observations:**

<br /><br />

**Scenario result:** ☐ Pass ☐ Pass with observations ☐ Fail

## 5. Recommended scenarios

Tailor to your processes. These are the chains most worth proving because they cross
module boundaries and involve more than one person.

### PQ-A — Complaint through to corrective action and retraining

The full quality chain. If only one PQ scenario is run, run this one.

1. A customer complaint is received and logged, with product and lot details.
2. QA reviews it and decides it is a nonconformance; the nonconformance is raised and
   linked to the complaint.
3. The nonconformance is investigated through its workflow; a disposition and disposition
   notes are recorded; CAPA is flagged as required.
4. A CAPA is raised from the nonconformance and its investigation completed through the
   workflow steps.
5. The CAPA identifies an SOP gap; a change request and a new document version are raised.
6. The document version is reviewed, approved and made effective.
7. Affected staff are assigned training on the new version and complete it; the manager
   verifies competency.
8. The nonconformance is closed with e-signature; the CAPA is closed with an effectiveness
   check scheduled.
9. On the effectiveness-check due date, the check is completed and recorded as effective.

**Prove:** the links between records survive the whole chain; every signature is
attributable; the audit trail reconstructs the full history; nothing could be closed out
of sequence.

### PQ-B — Controlled document lifecycle with a rejection

1. Author creates a new SOP from the correct document type and template.
2. Submits for review; the workflow routes to the configured reviewers.
3. A reviewer **requests changes** with a comment.
4. Author revises and resubmits.
5. Approver approves with e-signature; the document is released and becomes effective.
6. Previously effective version becomes superseded.
7. A controlled copy is printed and the watermark/status is checked.
8. A new draft version is created with change-control details recorded.

**Prove:** the rejection path works as your procedure describes, the effective version is
unambiguous at all times, and a printed copy states its own status.

### PQ-C — Periodic and recurring obligations

1. A document reaches its periodic-review due date.
2. The owner receives the task and completes the review.
3. A recurring log-book entry or scheduled inspection falls due and is completed by an
   operator.
4. A calibration due date is reached and the equipment record reflects it.

**Prove:** scheduled work actually appears for the right person, at the right time,
without someone having to remember it.

### PQ-D — Access control in practice

1. A user with read-only permission attempts to edit and approve a record.
2. A user attempts to approve a step assigned to someone else.
3. A leaver's account is deactivated; confirm their access ends and their historical
   signatures and audit entries remain intact and attributed.
4. A user's role is changed; confirm their access changes accordingly.

**Prove:** the permission model matches your delegation of authority, and deactivating a
person never rewrites history.

### PQ-E — Supplier or external participation *(if used)*

1. A supplier-facing nonconformance or corrective action is routed to a supplier contact.
2. The external user signs in and completes only their assigned step.
3. Confirm the external user cannot see records outside what was shared with them.

### PQ-F — Business continuity and recovery *(recommended)*

1. Confirm the documented behaviour when the service is unavailable, and that staff know
   the fallback procedure.
2. Where the supplier can support it, witness or obtain evidence of a restore test.

**Prove:** you have a defensible answer to "what do you do when it is down, and how do you
know the data comes back".

## 6. PQ summary

| Scenario | Executed by | Date | Result | Findings |
| --- | --- | --- | --- | --- |
| PQ-A |  |  |  |  |
| PQ-B |  |  |  |  |
| PQ-C |  |  |  |  |
| PQ-D |  |  |  |  |
| PQ-E |  |  |  |  |
| PQ-F |  |  |  |  |

**Overall PQ result:** ☐ Pass ☐ Pass with observations ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Compiled by |  |  |  |
| Business Process Owner |  |  |  |
| Approved by (QA) |  |  |  |

## Related

- [Validation Master Plan](/validation/framework/validation-master-plan)
- [Requirements Traceability Matrix](/validation/framework/traceability-matrix)
