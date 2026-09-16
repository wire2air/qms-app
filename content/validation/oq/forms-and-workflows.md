---
id: oq-forms-and-workflows
title: OQ-13 Forms & Workflows
sidebar_position: 13
description: Operational Qualification protocol for the configuration layer — form templates, field validation, workflow design, versioning, sequencing and approval rules.
keywords: [OQ, workflow, form template, configuration, approval rule, versioning, sequencing, test script]
---

# OQ-13 — Forms & Workflows

**Document ID:** VAL-OQ-13 · **Version:** 1.0 · **Module:** Forms & Workflows

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify the configuration layer that every other module runs on: that forms enforce the
validation they declare, that workflow templates version and lock properly, that steps
activate strictly in sequence, and that approval rules, mandatory comments and mandatory
signatures behave exactly as configured.

This protocol qualifies **the mechanism**. Each module's own protocol qualifies the
specific workflows you have configured for it. Both are needed: a correct mechanism running
a wrong configuration still produces wrong outcomes.

## 2. Requirements verified

URS-WFL-01 … URS-WFL-11. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §16.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | Test accounts: **Designer**, **Approver A**, **Approver B**, **Assignee**, **Record Owner** |  |
| 4 | Roles exist that can be assigned to workflow steps |  |
| 5 | E-signature credentials established for approvers |  |

## 4. Test cases

### TC-13-01 — Form template construction *(URS-WFL-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Designer**, create a form template | Template created |  |  |  |
| 2 | Add a short-text field, a long-text field and a number field | Fields save |  |  |  |
| 3 | Add a date field, a single-select field and a multi-select field | Fields save |  |  |  |
| 4 | Add a checkbox/boolean field and a file-attachment field | Fields save |  |  |  |
| 5 | Reorder the fields | New order persists |  |  |  |
| 6 | Preview the form | Preview matches the design |  |  |  |

### TC-13-02 — Validation enforcement *(URS-WFL-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Mark a field required, then attempt to submit the form leaving it empty | Refused; the field is identified |  |  |  |
| 2 | Enter text into the number field | Refused or coerced — record the behaviour |  |  |  |
| 3 | Where minimum/maximum limits are set on a number field, enter a value outside them | Refused |  |  |  |
| 4 | Enter an invalid date | Refused |  |  |  |
| 5 | Select an option not in the configured list, where technically possible | Refused |  |  |  |
| 6 | Attach a file and confirm it is stored and retrievable | Attachment persists |  |  |  |
| 7 | Submit a valid form and confirm every entered value is stored exactly as entered | Values round-trip unchanged, including special characters and long text |  |  |  |

### TC-13-03 — Form versioning and publication *(URS-WFL-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Publish the form template | Status becomes published |  |  |  |
| 2 | Attempt to edit the published template | Prevented, or requires a new version — record the behaviour |  |  |  |
| 3 | Create a new version and change a field | New version created; the published one is unchanged |  |  |  |
| 4 | Confirm records already captured against the earlier version still render with the fields they were captured under | Historical records are unaffected by the new version |  |  |  |

> Step 4 is the one that protects your existing records. A form change that retrospectively
> alters how old records display would make those records unreliable.

### TC-13-04 — Workflow template design *(URS-WFL-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Create a workflow template for a chosen module | Template created with a draft version |  |  |  |
| 2 | Add three steps: an action step, then an approval step, then a second approval step | Steps created in order |  |  |  |
| 3 | Set each step's name, instructions and SLA | Saved |  |  |  |
| 4 | Assign a role to each step | Roles assigned |  |  |  |
| 5 | Reorder two steps | New order persists |  |  |  |
| 6 | Set step 2's approval rule to **ALL** and assign two approver roles | Saved |  |  |  |
| 7 | Set step 3's approval rule to **ANY** and assign two approver roles | Saved |  |  |  |
| 8 | Enable **require comments** on step 2 and **require e-signature** on step 3 | Saved |  |  |  |

### TC-13-05 — Publication and versioning *(URS-WFL-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Attempt to launch the workflow while the version is still a draft | Not available |  |  |  |
| 2 | Publish the version | Status becomes published and it becomes launchable |  |  |  |
| 3 | Edit a step in the published version, then confirm a workflow **already in flight** is unaffected by that edit | The running instance keeps the rules it started under |  |  |  |
| 4 | Create a new draft from the published version | New draft created with the steps copied |  |  |  |
| 5 | Modify and publish the new version | New version published; the earlier becomes retired |  |  |  |
| 6 | Confirm records already running on the earlier version continue on that version | In-flight runs are unaffected by the new version |  |  |  |

> **Editing a published version is permitted, by design — step 3 tests the control that
> matters instead.** Blocking the edit outright would also block the publish and retire
> transitions, which run through the same permissions, and it would do nothing for
> instances already running against a template edited earlier. The enforced invariant is
> narrower and stronger: the step's control fields — whether a signature is required, and
> the approval rule — are **frozen onto each workflow instance when it starts**, so editing
> the published template cannot retroactively change the rules of an approval in progress.
> Verify that, not the absence of the edit. If your procedure requires published templates
> to be immutable, implement it as a procedural control and record it here.

### TC-13-06 — Sequential activation *(URS-WFL-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Launch the workflow on a test record, assigning a user to each step | The run starts; only step 1 is active |  |  |  |
| 2 | Confirm steps 2 and 3 are not actionable | Not actionable |  |  |  |
| 3 | As the step 2 assignee, attempt to complete step 2 before step 1 | Refused |  |  |  |
| 4 | Complete step 1 | Step 2 activates and its assignees are tasked |  |  |  |
| 5 | Confirm step 1 is now closed and cannot be re-completed | Closed |  |  |  |
| 6 | Confirm the timeline shows completed, current and pending steps correctly | Timeline accurate |  |  |  |

### TC-13-07 — Approval rules ALL and ANY *(URS-WFL-07)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | On step 2 (**ALL**), have **Approver A** approve | The step does **not** advance; it still awaits Approver B |  |  |  |
| 2 | Have **Approver B** approve | The step completes and step 3 activates |  |  |  |
| 3 | On step 3 (**ANY**), have **Approver A** approve | The step completes immediately without Approver B |  |  |  |
| 4 | Confirm Approver B's task for step 3 is withdrawn or closed | No stale task remains |  |  |  |
| 5 | Confirm both approvers' actions are recorded on the ALL step | Both recorded individually |  |  |  |
| 6 | **On the ANY step (step 3), inspect the per-approver record for Approver B — who never acted** | **Approver B is recorded as having approved.** This is the expected *observation*, not the required behaviour — raise it as a deviation and read the note |  |  |  |

> **Read this before executing TC-13-07, and do not stop at step 5.** Steps 1 to 5 will all
> pass. They are correct as far as they go — but none of them looks at the place where this
> requirement is not met, so an execution that ends at step 5 produces a clean record over a
> known non-conformance. Step 6 exists to prevent that.
>
> **What the product does.** When an ANY step is satisfied by a single approval, the
> per-approver record for **every** assignee on that step is set to approved — including
> assignees who never acted, and including one who had explicitly declined or been
> reassigned. Under the **ALL** rule the same behaviour is harmless, because the step is
> only reached once everyone genuinely has approved; that is why step 5 passes and why the
> defect is invisible from steps 1 to 5.
>
> **What is not affected, which bounds the deviation.** No electronic signature is created
> for a user who did not sign — the signature ledger stays truthful, and so does the task
> list, where the untaken task is correctly closed as superseded (step 4). The falsification
> is confined to the per-approver assignment record. The consequence is that two records of
> the same event disagree, and the per-approver one cannot be relied on to show who
> actually approved.
>
> **How to record it.** Execute step 6, record the observation, and raise a deviation
> against URS-WFL-07. Until it is corrected, do not rely on the per-approver record as
> evidence of individual approval on any step using the ANY rule; the signature record is
> the reliable evidence. Assess whether any of your own procedures cite per-approver
> approval history, and control those procedurally.

### TC-13-08 — Mandatory comments and signatures *(URS-WFL-08)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | On the comment-required step, attempt to act with no comment | Refused |  |  |  |
| 2 | Enter a comment and act | Accepted; the comment is stored and visible on the record |  |  |  |
| 3 | On the signature-required step, act and enter an **incorrect** credential | Refused; the step does not complete |  |  |  |
| 4 | Confirm the record is unchanged after the failed signature | No partial change |  |  |  |
| 5 | Act with the correct credential | Step completes; the signature is recorded with name, date/time and meaning |  |  |  |
| 6 | On a step where signature is **not** required, confirm no prompt appears | Setting is respected per step |  |  |  |

### TC-13-09 — Reject and request-changes routing *(URS-WFL-09)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | On a fresh run, reject at an approval step without a comment | Refused; a comment is required |  |  |  |
| 2 | Reject with a comment | The run stops and is marked rejected; the comment is retained |  |  |  |
| 3 | Confirm no further steps can be actioned on the rejected run | Run is closed |  |  |  |
| 4 | On another run, request changes with a comment | The record returns to its owner with the comment |  |  |  |
| 5 | Confirm the send-back reaches the **record owner** for a main step | Routed correctly |  |  |  |
| 6 | Where sub-tasks are used, send back a sub-task and confirm it routes to the parent step's assignee | Routed correctly |  |  |  |
| 7 | Resubmit and confirm the workflow resumes at the expected point | Resumption correct |  |  |  |

### TC-13-10 — Retired versions remain readable *(URS-WFL-10)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open a completed record that ran on the retired version | The record opens |  |  |  |
| 2 | Confirm its workflow history shows the steps as they were on that version | Historical steps accurate |  |  |  |
| 3 | Confirm the version that ran is identified on the record | Version identified |  |  |  |
| 4 | Confirm the retired workflow version can still be viewed | Readable, marked retired |  |  |  |

> **How a version becomes retired, and what "the version" means here.**
>
> There is no retire button. A published workflow version is retired
> **automatically when you publish a newer version of the same workflow** — the
> previous published version is moved to retired in the same action. So to reach
> the starting state this test case assumes: publish version 1, run a record to
> completion on it, then publish version 2. Version 1 is now retired, and the
> completed record from step 1 is the one that ran on it.
>
> Note also that "template version" throughout this test case means the
> **approval workflow version**, which is the versioned, retirable artifact that
> a record's approval runs against and that the record identifies by name and
> version on its workflow panel. Retired versions stay fully readable and stay
> referenced by the records that ran on them — they are only withdrawn from the
> picker for new attachments, which is what step 4 is confirming.
>
> A workflow that has ever been published cannot be deleted at all, for this
> reason; it can only be archived. If you want to confirm that, attempt the
> deletion — the refusal is the control that protects every completed record's
> history.

### TC-13-11 — Audit trail *(URS-WFL-11)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open the audit history for the workflow template | Creation, step changes, publication and retirement are recorded |  |  |  |
| 2 | Open the audit history for a workflow run | Launch, each step activation and completion, rejections and send-backs are recorded |  |  |  |
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
| TC-13-01 |  |  |  |  |  |
| TC-13-02 |  |  |  |  |  |
| TC-13-03 |  |  |  |  |  |
| TC-13-04 |  |  |  |  |  |
| TC-13-05 |  |  |  |  |  |
| TC-13-06 |  |  |  |  |  |
| TC-13-07 |  |  |  |  |  |
| TC-13-08 |  |  |  |  |  |
| TC-13-09 |  |  |  |  |  |
| TC-13-10 |  |  |  |  |  |
| TC-13-11 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
