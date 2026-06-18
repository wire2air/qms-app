---
id: training-matrix
title: Training Matrix
sidebar_position: 2
description: Use the Training Matrix to define which trainings are automatically assigned to people based on the roles they hold.
keywords: [training matrix, role-based training, training requirements, compliance, training assignment]
---

# Training Matrix

## Overview

The Training Matrix is where you define which trainings people need based on the roles they hold. Each entry in the matrix is a simple rule: "anyone with this role needs this training." When someone is given a role, the trainings mapped to that role are automatically assigned to them.

This keeps training requirements consistent across your organization. Instead of assigning trainings to people one by one, you set the requirement once at the role level, and everyone who holds that role inherits it. As people change roles, their required trainings follow automatically.

You reach the Training Matrix from the Training area of the app. You need the right permission to add or remove rules; if you do not have it, you can still view the matrix but the action buttons are hidden.

## Key concepts

The matrix is built from rules. Each rule connects one training to one role.

| Concept | What it means |
| --- | --- |
| Rule | A single mapping that says a training is required for a role. Each rule pairs exactly one training with one role. |
| Training | A course or learning item from your training library. A role can have several trainings mapped to it. |
| Role | A job role or responsibility in your organization. A training can apply to several roles. |
| Row | The matrix groups rules by training. Each row shows one training on the left and all the roles that require it on the right. |

:::note
Only **active** trainings can be added to the matrix. Trainings that are driven by a controlled document (where the training is generated from a document) are not selectable here, because their assignment is handled through the document. Only **active** roles appear in the role list.
:::

## How to read the Training Matrix

1. Open the **Training Matrix** page from the Training area.
2. Each row represents one training. The training name appears on the left.
3. To the right of each training, you see the roles that require it, shown as badges.
4. Read a row as a sentence: "this training is required for these roles." Anyone holding one of those roles will be assigned the training.
5. If the page shows "No rules yet," the matrix is empty and no role-based trainings have been set up.

:::tip
Reading the matrix is the quickest way to see your role-based training requirements at a glance. If a training has no roles next to it, no one is being assigned it automatically through the matrix.
:::

## How to add a training-to-role rule

1. On the Training Matrix page, click **Add Rule** in the top right.
2. In the **Add Training Matrix Rule** dialog, choose a **Training** from the dropdown. Only active trainings that are not document-driven appear here.
3. Choose a **Role** from the dropdown. Roles already mapped to the selected training are filtered out so you cannot create a duplicate.
4. Click **Add Rule** to save. The new mapping appears in the matrix, and people holding that role will have the training assigned.

If every role is already mapped to the training you picked, the dialog shows "All roles already mapped to this training" and there is nothing more to add for it.

## How to add another role to an existing training

If a training already has roles and you want to add one more:

1. Find the training's row in the matrix.
2. Click **Add Role** at the end of that row.
3. The dialog opens with the training already selected. Pick a role and click **Add Rule**.

This is a shortcut for the same action as **Add Rule**, but it saves you from selecting the training again.

## How to remove a role from a training

1. Find the training's row in the matrix.
2. On the role badge you want to remove, click the clear (x) control.
3. The rule is removed immediately, and that role no longer requires the training through the matrix.

:::warning
Removing a rule changes a future requirement: people newly given that role will no longer be assigned the training. Review the matrix carefully before removing a rule, especially for trainings tied to compliance.
:::

## Checking gaps and compliance

The matrix defines what *should* happen: which roles require which trainings. Use it as your reference point when reviewing compliance.

1. Read the matrix to confirm every role has the trainings it should require. A missing role badge next to a training is a gap in your requirements.
2. Cross-check against the people and their assigned trainings in the Training and User areas to confirm assignments have been applied.
3. When you add a new training requirement to a role here, expect it to flow to everyone holding that role going forward.

Keeping the matrix accurate is the foundation of training compliance, because it is the single place that drives automatic, role-based assignment.
