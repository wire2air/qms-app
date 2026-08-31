---
id: training
title: Training
sidebar_position: 1
description: Build training programs, assign them to your team, complete assigned trainings, and verify competency through manager sign-off.
keywords: [training, training library, assignment, assessment, verification, competency]
---

# Training

## Overview

Training lets you build training programs, deliver them to your team, and prove that people are competent to do their work. An admin or training owner creates a training in the **Training Library**, adds material and assessment questions, and launches it to selected employees. Each employee works through their assigned training in **My Tasks**, and — when required — a training manager reviews the results and signs off in the **Training Verification** dashboard.

This keeps a complete, audit-ready record of who was trained, what they scored, and who confirmed their competency.

## Key concepts

### Training statuses (Training Library)

| Status       | What it means                                                             |
| ------------ | ------------------------------------------------------------------------- |
| **Draft**    | Being built. You can edit every part of it. Not yet visible to employees. |
| **Active**   | Published. Content is locked and the training can be launched to people.  |
| **Archived** | Retired from active use. No longer launched.                              |

### Assignee statuses (a person's progress)

| Status               | What it means                                                  |
| -------------------- | -------------------------------------------------------------- |
| **Assigned**         | Sent to the person; not started yet.                           |
| **In Progress**      | The person has started but not submitted.                      |
| **Failed**           | Scored below the passing score; may retry if attempts remain.  |
| **Completed**        | Passed the assessment; awaiting verification if required.      |
| **Verified**         | Manager confirmed competency. Fully done.                      |
| **Retrain Required** | Manager rejected; a fresh training is launched for the person. |
| **Removed**          | Taken off this launch by a manager, with a recorded reason.    |

### Instance statuses (a single launch)

| Status                   | What it means                                   |
| ------------------------ | ----------------------------------------------- |
| **Active**               | People are still working through it.            |
| **Pending Verification** | Everyone finished; waiting on manager sign-off. |
| **Completed**            | Closed out.                                     |
| **Cancelled**            | Stopped early, with a recorded reason.          |

### Key settings on a training

| Field                             | What it controls                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Passing Score (%)**             | Minimum assessment score to pass (default 70).                                                            |
| **Max Attempts**                  | How many times a person can try the assessment (default 1).                                               |
| **Completion Due (days)**         | Deadline, counted from launch. Leave blank for no deadline.                                               |
| **Training Manager**              | The person who verifies competency. Required before publishing.                                           |
| **Manager Verification Required** | When on, completed trainees wait for sign-off. When off, the training closes automatically on completion. |

## How to build a training (Training Library)

1. Go to the **Training Library** and click **New Training**.
2. Enter a **Title** (required) and an optional **Description**, then click **Create Training**.
3. On the **Details** tab, set the passing score, max attempts, completion deadline, and choose a **Training Manager**. Turn **Manager Verification Required** on or off.
4. On the **Material** tab, add **Instructions**, link existing documents under **Linked Documents**, and add any **External Links** (web pages or YouTube videos).
5. On the **Assessment** tab, click **Add Question**. Choose **Single Choice** (one correct answer) or **Multiple Choice** (several correct answers), enter options, and mark the correct ones.
6. On the **Assignees** tab, click **Manage Assignees** to choose the roles and individual users who should receive this training.
7. When everything is ready, click **Publish**.

:::warning
Publishing locks the training so it can no longer be edited. Finalize the content, assessment, and assignees first. A training must have a Training Manager set before it can be published.
:::

## How to assign (launch) a training

1. Open a published (**Active**) training and click **Launch**.
2. Review the **Assignees** list. The list is pre-filled from the roles and users you set up, expanded to all members of those roles.
3. Use **Add user** or **Add by role** to include more people, or the remove icon to drop someone — this affects only this launch, not the saved template.
4. Click **Launch**. Each person receives a training task. You can then open the launch from **Training Instances** to track progress.

:::note
To make a training a standing requirement for a role rather than a one-off assignment, add it to a curriculum and map that curriculum to the role — see [Training Curriculum](./training-curriculum.md).
:::

## How to complete my training

1. Open the training task from **My Tasks**.
2. Read the **Instructions**, then click **Start Training**.
3. On the **Material** step, open every document and link. Each shows a green check once viewed; you must review all of them to continue.
4. If there is an assessment, answer the questions. Your answers save automatically as you go.
5. Click **Submit** (or **Mark Complete & Submit** when there's no assessment) and confirm with your electronic signature.
6. You'll see your score. If you fail and attempts remain, click **Retry Assessment** to try again.

## How to verify competency (managers)

1. Open the **Training Verification** dashboard. Instances awaiting your sign-off appear in the **Pending Training Instances** list.
2. Select an instance to open the verification panel. Only the assigned training manager can verify.
3. Choose the employees to act on. Expand any row with **View answers** to review what they submitted.
4. Confirm the three competency criteria — **demonstrated understanding**, **can perform independently**, and **practical observation completed** — add any **Manager Notes**, then click **Approve & Close** and sign. Approved employees become **Verified**.
5. To send someone back, tick **Reject — Retraining required** and click **Reject & Send to Retraining**. A fresh training is launched for them automatically.

## Tips

- Document and external links are pinned to the version that was effective when the training launched, so trainees always see the right material.
- A published training can be **unpublished** back to Draft only if no one has been launched into it yet.
- Managers can **Cancel Instance** to stop a launch early, or remove an individual assignee — both require a recorded reason that is kept in the audit log.
