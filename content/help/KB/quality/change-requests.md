---
id: change-requests
title: Change Control
sidebar_position: 3
description: Plan, approve, implement, and verify controlled changes with Change Control in Qability QMS.
keywords: [change control, change request, approval workflow, implementation, effectiveness check]
---

# Change Control

## Overview

A Change Request (CR) is the controlled way to propose, approve, and carry out a
change to your quality system — a procedure update, a process modification, an
equipment swap, a supplier change, and so on. Instead of making changes ad hoc,
you raise a CR, route it through an approval workflow, implement it as a set of
tracked sub-tasks, and (optionally) verify that the change worked.

You'll find **Change Control** under **Quality Management**. The landing page shows
summary tiles (Open CRs, Awaiting approval, Urgent open, Closed this month), a
filterable list, and a **New Change Request** button. A CR can also be raised
directly from a Nonconformance or a CAPA, in which case its title, site, and
department are pre-filled from the originating record.

## Key concepts

### Statuses

A CR moves through a lifecycle from draft to closure. The status appears in the
**Overview** panel of each CR and as a filter on the list.

| Status | What it means |
| --- | --- |
| Draft | Being prepared by the owner. Editable and can be deleted. |
| Under Review | Submitted; the approval workflow is running and reviewers are acting on it. |
| Approved | Approvals are complete; implementation can begin. |
| In Implementation | Implementation sub-tasks are being worked. |
| Pending Effectiveness | Implementation done; awaiting the effectiveness check. |
| On Hold | Temporarily paused. |
| Rejected | An approver declined the change. |
| Cancelled | Abandoned after submission, with a recorded reason. |
| Closed | Completed successfully and signed off. |

### Change types and classification

| Field | Purpose |
| --- | --- |
| Change Type | Category of the change (configured by your admin). Some types may flag that a risk assessment or root-cause analysis is expected. |
| Classification | Impact level: **Minor**, **Major**, or **Critical**. Optional, but useful for prioritising. |
| Priority | How urgent the change is (e.g. Low, Medium, High, Urgent — configured by your admin). |

:::note
Change types, priorities, and statuses are configured for your company, so the
exact names you see may differ from the examples above.
:::

## How to raise a Change Request

1. Open **Change Control** and click **New Change Request**.
2. Enter a **Title** and, optionally, a **Description** explaining what is changing and why.
3. Choose the **Change Type** (required) and, if relevant, a **Classification**.
4. Set the **Priority** (required).
5. Select the approval **Workflow** (required). Only active Change Control workflows appear here.
6. Pick the **Site**, **Department**, and **Owner** (all required). Changing the site resets the department.
7. Set the **Initiated** date (required), and optionally a **Target Implementation Date** and **Due Date**.
8. Fill in **Reason for Change** and **Business Justification** if you have them.
9. Turn on **Requires effectiveness check** if you want post-implementation verification tracked (recommended for Major or Critical changes).
10. Click **Create Draft**.

The CR opens as a **Draft**. While it is a draft, you (the owner) can click any
field on the detail page to edit it; changes save automatically.

## How to submit for approval

1. Open the draft CR.
2. In the **Approval Workflow Plan** section, assign a reviewer to each approval step. The reviewer picker only offers people in the role required for that step.
3. Click **Submit for Approval** in the page header and confirm in the dialog.

The status changes to **Under Review**, each reviewer receives a task in their
inbox, and the CR becomes a permanent audit record.

:::warning
Once submitted, a CR can no longer be deleted — it can only be closed or cancelled
with a recorded reason. Delete a CR while it is still a draft if you don't intend
to proceed.
:::

## How reviewers approve a CR

Each approval step appears as a workflow step on the CR. The assigned reviewer can
**Mark Complete** to approve and advance, and (where configured) may need to add an
e-signature. Owners can **Reassign**, **Cancel**, or send a step back. When all
approval steps are complete, the CR becomes **Approved** and implementation begins.

## How to implement an approved change

Once approved, the Implementation stage lets the owner break the change into
**sub-tasks** — one per affected area.

1. Open the CR and find the Implementation stage in the workflow section.
2. Click **Add Sub-task**.
3. Enter a **Sub-task name** (e.g. "Update SOP-001", "Assign training", "Notify supplier").
4. Add **Instructions**, an optional **SLA (due in days)**, and choose an **Assignee**.
5. Optionally attach a **Form** (build one, or start from a template) and toggle **Require Comments** or **Require E-signature**.
6. Click **Add Sub-task**.

Each assignee sees their sub-task, fills in any form, and clicks **Mark Complete**.
Owners can reassign or cancel a sub-task while it is still active. Use sub-tasks to
cover every item the change affects — document updates, training, supplier
notifications, validation, and so on.

## How to close or cancel a CR

- **Close** marks the change complete. It's available once the CR is Approved, In Implementation, Pending Effectiveness, or On Hold. Add optional closure notes and sign to confirm.
- **Cancel** abandons a CR after it was submitted. A reason is required and you'll sign to confirm. The record stays in the audit log and cannot be re-opened.

:::tip
Use **Print** to generate a printable record and **Audit Log** to see the full
history of the CR and its workflow steps — useful for inspections and audits.
:::
