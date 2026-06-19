---
id: capas
title: CAPAs
sidebar_position: 2
description: Raise, investigate, action, and close corrective and preventive actions (CAPAs) and verify they worked.
keywords: [CAPA, corrective action, preventive action, effectiveness check, root cause, closure]
---

# CAPAs

## Overview

A CAPA (Corrective and Preventive Action) is the controlled record you use to fix a
problem and stop it coming back. Each CAPA captures what happened, who owns it, a
workflow of review steps to investigate and act on the issue, and a follow-up
effectiveness check to confirm the fix actually worked. CAPAs can be raised on their
own or spawned automatically from a Nonconformance, which carries over the title, site,
department, and supplier so you do not have to retype them.

The CAPAs list page gives you at-a-glance stat cards (Open CAPAs, Overdue, Critical
open, Closed this month), a search box, status/priority/type filters, and quick filter
pills such as **All open**, **My CAPAs**, **Critical**, **High**, **Overdue**,
**Closed**, and **Cancelled**.

## Key concepts

### Statuses

| Status | What it means |
| --- | --- |
| Draft | Being set up. Editable, deletable, and not yet a permanent record. |
| Pending | Opened and active — the workflow is running and the CAPA is a controlled record. |
| Closed | Work is complete, signed off, and an effectiveness check is scheduled. |
| Cancelled | Stopped before completion, with a recorded reason. |

### Type, source, and priority

| Field | Examples / values | Notes |
| --- | --- | --- |
| CAPA Type | Corrective, Preventive (your configured types) | A corrective action fixes a problem that already happened; a preventive action stops a potential problem before it occurs. |
| Source | Nonconformance, Internal Audit, and other configured sources | Where the issue came from. A CAPA raised from a Nonconformance links back to it. |
| Priority | Low, Medium, High, Critical | Drives the Critical and High filters and stat cards. |

### Effectiveness check outcomes

| Outcome | Meaning |
| --- | --- |
| Effective | The corrective and preventive actions are preventing the issue from recurring. |
| Not Effective | The fix did not hold; further action or a renewed check may be needed. |

## How to create a CAPA

1. On the **CAPAs** page, click **Create CAPA**.
2. Under **Basic information**, enter a **Title** and an optional rich-text
   **Description**. The panel shows similar existing records so you can avoid duplicates.
3. Under **Classification**, set the required fields: **Site**, **Department**,
   **CAPA Type**, **Source**, **Priority**, **Initiated date**, and **Owner**.
   Add an optional **Due date**.
4. To route review steps to an external party, pick a **Supplier** and tick
   **Supplier-facing CAPA**. (This is locked once the CAPA is opened.)
5. Under **Workflow**, choose the workflow version that will drive the review and
   action steps, then pick the reviewer for each step when prompted.
6. Click **Submit**. The CAPA is created in **Draft** with its own CAPA number.

:::tip
If you start a CAPA from a Nonconformance, the title, site, department, root cause
category, and supplier details are pre-filled from that record.
:::

## How to open a CAPA

A Draft CAPA is a worksheet — nothing is running yet. To activate it:

1. Open the CAPA. As the owner, click **Open CAPA**.
2. Review the confirmation: opening starts the workflow, makes the CAPA a **permanent
   audit record**, and means it can no longer be deleted — only closed or cancelled.
3. Click **Open CAPA** to confirm. The status changes to **Pending**, the first
   workflow step becomes active, and reviewers receive their tasks.

To discard a CAPA you no longer need, use **Delete** while it is still in Draft.

## How to investigate and complete actions

The workflow section on the CAPA page is where the investigation and actions happen.

1. Each workflow step represents a stage of the CAPA — for example investigation, root
   cause, corrective action, or preventive action — and is assigned to a reviewer.
2. Reviewers open their step, fill in any required form fields and comments, and submit
   it. Steps requiring a signature prompt for e-signature confirmation.
3. Stages can contain **sub-tasks**. The owner or step assignee can add a child task
   with its own name, description, due window, assignee, and form fields to break the
   work down further.
4. A step can be reassigned, skipped, or sent back for rework as needed.
5. The CAPA stays editable (title, description, dates) until it is closed.

:::note
A CAPA cannot be closed while any workflow step or sub-task is still open. The Close
dialog tells you how many remain so you can complete, skip, or cancel them first.
:::

## How to close a CAPA

1. Open the CAPA and click **Close CAPA** (available to the owner while the CAPA is
   Pending).
2. The dialog confirms all workflow steps are complete. If any are open, finish them
   first.
3. Set the **Effectiveness Check Date** — choose a preset (30, 60, 90, 180, or 365 days
   from close) or pick a specific date. The industry default is 90 days.
4. Add optional **Closure Comments** summarising the action taken.
5. Click **Sign & Close CAPA** and confirm your identity with an e-signature. The
   status becomes **Closed** and a follow-up effectiveness check is scheduled.

## How to verify effectiveness

After closure, the **Effectiveness Check** section tracks whether the fix worked. On
the due date, a verification task is created for the CAPA owner.

1. Open the closed CAPA and, on the active check, click **Verify**.
2. Choose an **Outcome** — **Effective** or **Not Effective**.
3. Enter required **Verification Notes** describing what you checked.
4. Click **Mark Complete** and confirm with an e-signature.

If a check needs more time or another round of monitoring, it can be **renewed** with a
new due date, and completed checks remain visible under **History**.

:::tip
Before closing, you can set the planned check interval directly in the Effectiveness
Check section. This becomes the default preset in the Close dialog.
:::

## How to cancel a CAPA

If a Pending CAPA should not continue, click **Cancel CAPA**, enter a **Reason**, then
**Sign & Cancel CAPA** and confirm with an e-signature. This aborts any in-progress
workflow, records the reason, and sets the status to **Cancelled**.

## Tips

- Use **Print** for a controlled copy and **Audit Log** to see the full timeline of the
  CAPA, its workflow steps, and its effectiveness checks in one place.
- From an open CAPA you can also start a linked **Change Request** when the fix requires
  a controlled change.
