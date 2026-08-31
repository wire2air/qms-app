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

| Status    | What it means                                                                    |
| --------- | -------------------------------------------------------------------------------- |
| Draft     | Being set up. Editable, deletable, and not yet a permanent record.               |
| Open      | Opened and active — the workflow is running and the CAPA is a controlled record. |
| Closed    | Work is complete and signed off.                                                 |
| Cancelled | Stopped before completion, with a recorded reason.                               |

### Type, source, and priority

| Field     | Examples / values                                            | Notes                                                                                                                      |
| --------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| CAPA Type | Corrective, Preventive (your configured types)               | A corrective action fixes a problem that already happened; a preventive action stops a potential problem before it occurs. |
| Source    | Nonconformance, Internal Audit, and other configured sources | Where the issue came from. A CAPA raised from a Nonconformance links back to it.                                           |
| Priority  | Low, Medium, High, Critical                                  | Drives the Critical and High filters and stat cards.                                                                       |

### Effectiveness check verdicts

| Verdict                     | Meaning                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Effective                   | The actions are preventing the issue from recurring.                                                     |
| Not Effective — Close Check | The fix did not hold, and you are closing the check with a recorded justification rather than reopening. |

## How to create a CAPA

1. On the **CAPAs** page, click **Create CAPA**.
2. Under **Basic information**, enter a **Title** and an optional rich-text
   **Problem Statement**. The panel shows similar existing records so you can avoid duplicates.
3. Under **Classification**, set the required fields: **Site**, **Department**,
   **CAPA Type**, **Source**, **Priority**, **Initiated date**, and **Owner**.
   Add an optional.
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

1. Open the CAPA. As the owner, click **Start CAPA**.
2. Review the confirmation: opening starts the workflow, makes the CAPA a **permanent
   audit record**, and means it can no longer be deleted — only closed or cancelled.
3. Click **Start CAPA** to confirm. The status changes to **Pending**, the first
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

## Linking related records

A CAPA can be linked to any other record — the NC or complaint that prompted it,
the change request that carried out the fix, an audit finding, or a record in a
module you built yourself. Use the **Related records** card in the right rail:
pick the module, search by number or title, and link.

Raising a CAPA from an NC carries the context across — title, description, site,
department, supplier, category and priority — so the same problem stays
classified the same way along the chain.

## Sharing outside the company

Supplier CAPAs route to the supplier's portal users through workflow step
assignment, and the **Supplier portal access** card grants read access directly
at any status. The notify field additionally reaches people with no account,
sending a secure link to a read-only summary opened with a code. The rail shows
who outside the company can currently read the record.

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

"Did the fix actually work?" is a question you answer some time after
implementing it, not on the day you implement it. In Qability that wait is a
**Schedule Task step** in the CAPA's workflow, marked as capturing an
effectiveness verdict.

The step parks the CAPA for its configured window — 30, 60, 90, 180 or 365 days,
or a specific date — and then wakes up and asks for the verdict.

1. When the check comes due, the assignee gets a task like any other step.
2. Open it from the CAPA or from My Tasks.
3. Choose a verdict — **Effective**, or **Not Effective — Close Check**.
4. Enter the verdict comment describing what you checked. It is required.
5. Confirm with your PIN.

If it is too early to judge, the check can be **extended** — up to the maximum set
on the step, so a check cannot be deferred indefinitely. The record shows how many
extensions remain and why the cap applies. Every extension, and who granted it,
stays in the step's history.

:::note This replaces the old separate effectiveness section
Effectiveness used to be a card of its own on the CAPA, outside the workflow.
Making it a workflow step means it appears alongside every other step, uses the
same tasks, reminders, overdue handling and signatures, and can be positioned
wherever your process actually wants it.

It also means **reporting no longer has to dig through workflow steps**: the CAPA
carries a rollup status, so you can filter for checks that are pending, effective
or not effective directly from the list.
:::

:::tip
Set the check up in the workflow template, not on each CAPA. Every CAPA using
that workflow then gets it automatically, with the same window and the same
extension limit — which is what makes the practice consistent rather than
dependent on whoever raised the record.
:::

## How to cancel a CAPA

If an Open CAPA should not continue, click **Cancel CAPA**, enter a **Reason**, then
**Sign & Cancel CAPA** and confirm with an e-signature. This aborts any in-progress
workflow, records the reason, and sets the status to **Cancelled**.

## Tips

- Use **Print** for a controlled copy and **Audit Log** to see the full timeline of the
  CAPA, its workflow steps, and its effectiveness checks in one place.
- From an open CAPA you can also start a linked **Change Request** when the fix requires
  a controlled change.
