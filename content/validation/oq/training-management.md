---
id: oq-training-management
title: OQ-02 Training Management
sidebar_position: 2
description: Operational Qualification protocol for training authoring, assignment, completion, assessment scoring and competency verification.
keywords: [OQ, training, competency, assessment, verification, retraining, test script]
---

# OQ-02 — Training Management

**Document ID:** VAL-OQ-02 · **Version:** 1.0 · **Module:** Training

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify that training can be authored and locked, assigned to the right people, completed
with material review enforced, scored objectively against a passing standard, signed by the
trainee, and verified by a designated manager — producing a defensible competency record.

## 2. Requirements verified

URS-TRN-01 … URS-TRN-11. See the
[Requirements Traceability Matrix](/validation/framework/traceability-matrix) §5.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | IQ executed and passed |  |
| 3 | Test accounts: **Training Author**, **Training Manager**, **Trainee A**, **Trainee B** |  |
| 4 | Trainees have e-signature credentials established |  |
| 5 | At least one effective controlled document exists, to be linked as training material |  |

## 4. Test cases

### TC-02-01 — Authoring *(URS-TRN-01)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Training Author**, create a new training with a title | The training is created in draft |  |  |  |
| 2 | Set the passing score, maximum attempts and completion deadline | Values save |  |  |  |
| 3 | Assign a **Training Manager** and enable manager verification | Values save |  |  |  |
| 4 | Add instructions and link the effective controlled document as material | Material is attached and opens |  |  |  |
| 5 | Add an external link as additional material | Link is saved and reachable |  |  |  |
| 6 | Add a single-choice question, marking one option correct | Question saves |  |  |  |
| 7 | Add a multiple-choice question with more than one correct option | Question saves |  |  |  |
| 8 | Add the intended assignees, by role and by named user | Assignees save |  |  |  |

### TC-02-02 — Publication locks content *(URS-TRN-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Remove the training manager and attempt to publish | Publication is refused; a training manager is required |  |  |  |
| 2 | Restore the manager and publish | Status becomes active/published |  |  |  |
| 3 | Attempt to edit the assessment questions after publication | Editing is prevented |  |  |  |
| 4 | Attempt to edit the passing score after publication | Editing is prevented |  |  |  |
| 5 | Attempt to change the linked material after publication | Editing is prevented |  |  |  |

### TC-02-03 — Assignment *(URS-TRN-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Launch the published training | The assignee list is pre-populated from the configured roles and users |  |  |  |
| 2 | Confirm role-based assignees are expanded to their individual members | Each member appears individually |  |  |  |
| 3 | Add one further user for this launch only | The user is added |  |  |  |
| 4 | Remove one user from this launch | The user is removed from this launch |  |  |  |
| 5 | Launch, then confirm the saved template's assignee list is unchanged | The template is unaffected by launch-time edits |  |  |  |
| 6 | Confirm each assignee receives a task | Tasks appear for **Trainee A** and **Trainee B** |  |  |  |
| 7 | Confirm the completion due date is derived from the launch date and configured deadline | Due date correct |  |  |  |

### TC-02-04 — Material review is enforced *(URS-TRN-04)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Trainee A**, open the training task and start it | The material step opens |  |  |  |
| 2 | Without opening any material, attempt to advance to the assessment | Advancing is prevented |  |  |  |
| 3 | Open one of two material items and attempt to advance | Still prevented — all items are required |  |  |  |
| 4 | Open all material items | Each is marked as reviewed |  |  |  |
| 5 | Advance to the assessment | Advancing is now permitted |  |  |  |

### TC-02-05 — Assessment scoring *(URS-TRN-05)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Trainee A**, answer all questions correctly and submit | Score is 100%; result is a pass |  |  |  |
| 2 | Confirm the recorded score matches manual calculation | Scores agree |  |  |  |
| 3 | As **Trainee B**, answer deliberately below the passing score and submit | Result is a fail; the score shown matches the answers given |  |  |  |
| 4 | On the multiple-choice question, select only some of the correct options | The question is scored per the configured rule — record the observed behaviour |  |  |  |
| 5 | Confirm answers submitted are retained for later review | Submitted answers are retrievable |  |  |  |

**Passing score configured:** ______ %  ·  **Trainee A score:** ______  ·  **Trainee B score:** ______

### TC-02-06 — Attempt limit *(URS-TRN-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the configured maximum attempts | Recorded: ______ |  |  |  |
| 2 | As **Trainee B** (failed), retry the assessment | A retry is offered while attempts remain |  |  |  |
| 3 | Continue failing until the configured maximum is reached | Attempts are counted correctly |  |  |  |
| 4 | Attempt one more time beyond the maximum | Further attempts are refused |  |  |  |
| 5 | Confirm the failed attempts are recorded against the trainee | All attempts are in the record |  |  |  |

### TC-02-07 — Completion signature *(URS-TRN-07)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Trainee A**, submit the completed training | A signature is requested |  |  |  |
| 2 | Enter an incorrect credential | Signature refused; completion is not recorded |  |  |  |
| 3 | Enter the correct credential | Completion is recorded and signed |  |  |  |
| 4 | Inspect the signature | Name, date/time and meaning are recorded |  |  |  |
| 5 | Confirm the trainee's status moves to completed, awaiting verification | Status correct |  |  |  |

### TC-02-08 — Manager verification and retraining *(URS-TRN-08, URS-TRN-09)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As a user who is **not** the assigned training manager, attempt to verify | Verification is refused |  |  |  |
| 2 | As **Training Manager**, open the verification view | Pending trainees are listed |  |  |  |
| 3 | Expand a trainee's submitted answers | Answers are visible for review |  |  |  |
| 4 | Approve **Trainee A** with the competency criteria confirmed, and sign | Trainee A becomes verified; the signature is recorded |  |  |  |
| 5 | Attempt to approve without confirming the competency criteria | Approval is refused, if the criteria are mandatory — record the observed behaviour |  |  |  |
| 6 | Reject **Trainee B** for retraining | A fresh training is launched for Trainee B and their status reflects retraining |  |  |  |
| 7 | Confirm the rejection reason/notes are retained | Notes recorded |  |  |  |
| 8 | Remove an assignee from the launch without a reason | Removal is refused; a reason is required |  |  |  |

### TC-02-09 — Material version pinning *(URS-TRN-10)*

This matters: a trainee must be able to prove *which* version of an SOP they were trained on.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Note the version of the linked document at launch | Version recorded: __________ |  |  |  |
| 2 | Release a **new effective version** of that document |  New version is effective |  |  |  |
| 3 | As a trainee still working through the launched training, open the material | The **originally linked version** is presented, not the new one |  |  |  |
| 4 | Confirm the completed training record identifies the document version trained on | Version is recorded on the training record |  |  |  |

### TC-02-10 — Records and reporting *(URS-TRN-11)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open a trainee's training history | All assigned, completed and verified training is listed with dates and scores |  |  |  |
| 2 | Open the training instance record | Every assignee's status is shown |  |  |  |
| 3 | Produce a training report or matrix view for a role or group | Report is produced and reflects the records |  |  |  |
| 4 | Print or export a training record | A legible copy is produced |  |  |  |
| 5 | Open the audit history for the training | Creation, publication, launch, completion, verification and any removals are all recorded with performer and timestamp |  |  |  |

## 5. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |

## 6. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --- | --- | --- | --- | --- | --- |
| TC-02-01 |  |  |  |  |  |
| TC-02-02 |  |  |  |  |  |
| TC-02-03 |  |  |  |  |  |
| TC-02-04 |  |  |  |  |  |
| TC-02-05 |  |  |  |  |  |
| TC-02-06 |  |  |  |  |  |
| TC-02-07 |  |  |  |  |  |
| TC-02-08 |  |  |  |  |  |
| TC-02-09 |  |  |  |  |  |
| TC-02-10 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
