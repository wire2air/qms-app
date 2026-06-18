---
id: workflows
title: Workflows
sidebar_position: 1
description: Design multi-step review and approval workflows, then launch and run them against your documents, nonconformances, and other records.
keywords: [workflows, approvals, workflow steps, send back, reviewers, workflow versions]
---

# Workflows

## Overview

Workflows let you turn a repeatable review or approval process into a reusable template, then run that template against real records such as documents, nonconformances, CAPAs, and change controls. You design a template once — its steps, assignees, and rules — publish it, and from then on anyone submitting a record can launch a tracked, step-by-step process with clear ownership and a full timeline.

There are two sides to Workflows:

- **Workflow templates** — the reusable blueprint you design and publish.
- **Workflow instances** — a live run of a published template attached to a specific record.

## Key concepts

### Step types

| Step type | What it does |
| --- | --- |
| Action | A work step. Can include form fields and (in some modules) sub-tasks. The assignee completes the work and marks it complete. |
| Approval | A gate step. One or more approvers sign off. No form — comment-only. |

### Approval rule (Approval steps)

| Rule | Meaning |
| --- | --- |
| ALL | Every assigned approver must complete their task before the workflow advances. |
| ANY | Only one assigned approver needs to complete the step to advance. |

### Template version statuses

| Status | What it means |
| --- | --- |
| Draft | An editable, unpublished version. You can add and change steps here. |
| Published | Locked and available to launch. To change it, create a new draft. |
| Retired | An older published version, kept read-only for history. |

### Instance statuses

| Status | What it means |
| --- | --- |
| In Progress | The run is active and moving through its steps. |
| Completed | All steps finished successfully. |
| Rejected | An approver rejected a step and stopped the run. |
| Changes Requested | An approver asked the owner for changes before approving. |

### Step-level settings

| Setting | What it controls |
| --- | --- |
| Instructions | Guidance shown to the assignee. |
| SLA: Due in (days) | Business days from when the step activates until it is due. |
| Require Comments | Forces the assignee to leave a comment when acting. |
| Require E-signature | Prompts for identity verification before the action is recorded. |
| Allow child steps | (Action steps, some modules) Lets the record owner add ad-hoc sub-tasks while the run is live. |

## How to design a workflow template

1. Go to **Workflows** and select **Create Workflow**.
2. Enter a **Workflow Name**, choose the **Module** the workflow applies to, and optionally add a description. Select **Create Workflow**.
3. The designer opens with a first draft version and a starter step. Use the left **Workflow Sequence** panel to manage steps and the right panel to configure the selected step.
4. Select **Add Step** to add steps. Use the up/down arrows on each step card to reorder, and the remove control to delete a step.

:::note
You can only edit a version while it is in **Draft**. Published versions are locked.
:::

### Configure a step

1. Select a step in the left panel.
2. Set the **Step Name** and **Instructions**.
3. Choose the **Step Type** — **Action** or **Approval**.
4. For an Approval step, choose the **Rule** (**ALL** or **ANY**).
5. Set the **SLA** in business days, and toggle **Require Comments** and **Require E-signature** as needed.
6. For Action steps in supported modules, you can add form fields and turn on **Allow adding child steps at runtime**.

### Assign who handles each step

1. With a step selected, select **Manage Assignees**.
2. Assign one or more **Roles** to the step. Roles define the pool of people eligible to be picked when the workflow is launched.

:::tip
Assigning roles is optional. If a step has no roles, the person launching the workflow can pick any active user for that step. Assigning roles narrows the choices to the right people.
:::

## How to publish a template

1. Open the workflow and make sure the **Draft** version is selected (use the version badge in the header to switch versions).
2. Select **Publish**. The version becomes **Published** and locked, and is now available to launch.

To change a published workflow, select **Create New Draft**. This copies the current steps into a fresh draft you can edit and publish as a new version. Older published versions become **Retired** and stay available for history.

:::note
Use **Archive** to take a workflow out of use without deleting it; **Restore** brings it back. A draft that has never been published can be discarded with **Discard Draft** (or **Delete** if it is the only version).
:::

## How to launch a workflow on a record

Workflows are launched from the record you want to route (for example when submitting a document version or a nonconformance):

1. On the record, choose the **workflow version** to run.
2. In the **Assign Step Reviewers** dialog, pick a user for each step. The choices come from the roles you assigned in the template (or all active users if no roles were set). The first step requires a reviewer.
3. Select **Confirm** to start the run. A workflow instance is created, the first step activates, and assigned users get their tasks.

## How to act on a step

When you are assigned to the active step, open the workflow instance to see your **required action**:

1. Review the step details and any form fields or instructions.
2. For an Approval step, select **Approve** or **Reject** (and **Request Changes** where available).
3. If the step requires comments, enter one. **Reject** and **Request Changes** always ask for a comment.
4. If the step requires an e-signature, complete the identity verification prompt to record your action.

Once the step's rule is satisfied (**ALL** or **ANY** approvers done), the workflow advances to the next step automatically. You can follow progress on the instance's **timeline** and health card, which show completed steps, elapsed time, and overall status.

## Send-back and rejections

- **Reject** stops the run and marks the instance **Rejected**.
- **Request Changes** sends the record back to its owner as **Changes Requested**, with your comment, so they can fix it.
- When a step is sent back, the system automatically routes it to the right person — the record owner for a main step, or the parent step's assignee for a sub-task — so you don't configure send-back targets in the template.

:::tip
Use the **Workflow Instances** list to find and filter all in-flight and completed runs across your records.
:::
