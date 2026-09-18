---
id: quality-events
title: Quality Events
sidebar_position: 2
description: Low-friction intake for observations, near misses, concerns and suggestions — reviewed, then escalated into a formal record only when they warrant it.
keywords:
  [quality events, observations, near miss, intake, escalation, triage, continuous improvement]
---

# Quality Events

## Overview

> The module is labelled **Events & Observations** on its own page, and
> **Quality Events** in the navigation. They are the same thing.

Not every observation deserves a nonconformance. Someone notices a label printer
drifting, a near miss on the packing line, a supplier delivery that was fine but
awkward, an idea for doing something better. Raise an NC for all of it and the NC
process becomes noise; raise nothing and the information is lost.

Quality Events are the intake layer for exactly that material. Anyone can log one
in a few seconds. Someone reviews it. Most are closed with a note; the ones that
matter are **escalated** into a formal record — an NC, a CAPA, or a Change
Request — carrying their context with them.

The point is to lower the cost of reporting far enough that people actually
report, while keeping your formal records meaningful.

## What you can do

| Capability                    | What it gives you                                              |
| ----------------------------- | -------------------------------------------------------------- |
| **Fast capture**              | A short form — what happened, where, how serious.              |
| **Categories and severities** | Your own taxonomy, shared with NCs and CAPAs.                  |
| **Review and decide**         | Triage without a workflow: review, decide, close.              |
| **Escalation**                | Turn an event into an NC, CAPA or Change Request, linked back. |
| **Attachments and notes**     | Photos and follow-up on the event itself.                      |
| **Automation**                | Rules that notify or act when events match conditions.         |
| **Dashboard**                 | See what is coming in, by category, severity and site.         |

## Key concepts

### Statuses

| Status    | What it means                                        |
| --------- | ---------------------------------------------------- |
| Draft     | Being written. Not yet submitted.                    |
| Open      | Submitted and awaiting review or decision.           |
| Closed    | Reviewed and concluded — with or without escalation. |
| Cancelled | Withdrawn, with a recorded reason.                   |

These are the same four words used by Nonconformances, CAPAs and the other
quality modules.

:::note No workflow engine here — on purpose
Events do not run through workflow steps. The lifecycle is a status, a review and
a decision recorded on the record itself.

That is the whole point: an intake form that required a workflow, approvers and
task routing would cost as much to raise as the NC it exists to avoid. Formality
arrives when the event is escalated, not before.
:::

### Category and severity

Both are per-tenant lookups your administrator configures, with their own colours
so they read at a glance on the list.

**Category is shared** with Nonconformances and CAPAs — one taxonomy for the
whole quality chain. An event categorised "Labelling" that becomes an NC and then
a CAPA keeps that classification the whole way, so reporting by category actually
spans the chain rather than stopping at each module boundary.

## Logging an event

1. Go to **Quality Events** and choose to create one.
2. Describe **what happened**. Plain language is fine — this is intake, not a
   formal investigation.
3. Set the **category** and **severity**.
4. Add **site** and **department** so it reaches the right people.
5. Attach photos or files if you have them.
6. Submit.

:::tip
Encourage short, immediate entries over polished ones. An event logged in
30 seconds while the detail is fresh is worth more than a carefully written one
that never gets raised. The reviewer can ask for more.
:::

## Reviewing and deciding

Someone with the review capability picks the event up, adds their **review** and
records the **decision**. Notes and attachments accumulate on the record, so the
reasoning stays with the event.

Most events end here — closed with a note explaining the conclusion. That is a
successful outcome, not a failure to escalate: a closed event is a recorded
observation with a decision against it.

## Escalating

When an event does warrant formal handling, escalate it:

| Escalate to        | Use when                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| **Nonconformance** | Something did not meet a requirement and needs formal handling.                                 |
| **CAPA**           | The cause needs corrective or preventive action. Source is recorded as an internal observation. |
| **Change Request** | The fix is a controlled change to a document, process or specification.                         |

The new record is created with the event's context and **linked back to it**, so
the chain from "someone noticed something" to "here is what we did" stays intact
and navigable from either end.

An escalated event stays in place as the origin record — escalation does not
consume or replace it.

## Automation

Because events are high-volume and low-friction, they are the natural place for
condition-based rules: notify the site quality lead when a Critical event is
logged, alert a supervisor when a category crosses a threshold, route certain
categories to a named group.

Rules are configured centrally rather than per record — see
[Automation Rules](../automation/automation-rules.md).

## Who can do what

Quality Events use the standard capability set — Read, Create, Update, Delete,
Close, Reopen, Export, Assign — each grantable at Own, Department, Site or
Company-wide scope.

Intake works best when **Create** is granted broadly. The point is that anyone
can raise one; review and escalation are the parts worth restricting.

See [Roles and Permissions](../administration/roles-and-permissions.md).

## Related

- [Nonconformances](./nonconformances.md) — formal handling of a requirement breach
- [CAPAs](./capas.md) — corrective and preventive action
- [Change Requests](./change-requests.md) — controlled change
- [Automation Rules](../automation/automation-rules.md) — condition-based notifications
