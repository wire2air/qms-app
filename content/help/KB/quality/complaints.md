---
id: complaints
title: Complaints
sidebar_position: 8
description: The quality view of customer complaints — investigate, decide, and escalate to a nonconformance when a complaint reveals a real problem.
keywords:
  [
    complaints,
    quality complaints,
    investigation,
    escalation,
    nonconformance,
    customer feedback,
    vigilance,
  ]
---

# Complaints

## Overview

Complaints is the **quality** view of what customers tell you. Every complaint
lands here regardless of how it arrived — typed in by hand, imported from a CSV,
or pulled in from your support system — and is framed for investigation rather
than for replying to the customer.

The question this module answers is not "have we responded?" but "does this tell
us something is wrong?" Most complaints are handled and closed. Some reveal a
genuine problem, and those become nonconformances with the complaint linked as
their origin.

:::note Complaints and Customer Complaints are two views, not two inboxes
[Customer Complaints](./customer-complaints.md) is the **support** side — the
conversation, the SLA clock, the reply to the customer.

Complaints is the **quality** side — investigation, decision and escalation.

Which you use depends on the job in front of you, and a complaint routinely
passes through both.
:::

## Statuses

| Status    | What it means                      |
| --------- | ---------------------------------- |
| Draft     | Being logged. Not yet submitted.   |
| Open      | Logged and under investigation.    |
| Closed    | Investigation complete.            |
| Cancelled | Withdrawn, with a recorded reason. |

The same four words used by Nonconformances, CAPAs, Quality Events and Change
Requests.

:::note "Converted to NC" is no longer a status
It used to be. It was removed because it duplicated a fact already recorded
properly: the link between the complaint and the nonconformance it produced. A
converted complaint is Closed, and its NC is on the record as a link — so you can
navigate from either end, and a complaint that produced two NCs is representable.
:::

## Investigating

1. Open the complaint from the list.
2. Read the customer's account and whatever the support side has already
   gathered — the conversation and attachments come with it.
3. Record your **QA notes**: what you checked, what you found, what you concluded.
4. Classify it so it counts in your trend data.
5. Close it, or escalate.

## Escalating to a nonconformance

When a complaint reveals a real problem, convert it. The NC is created carrying
the complaint's context and linked back to it, so the lineage from customer
report to corrective action stays intact.

From there the NC follows its normal path, including a CAPA where the cause needs
addressing. See [Nonconformances](./nonconformances.md).

:::tip
Escalate on evidence, not on volume or tone. A single complaint that shows a
control failed matters more than ten expressing dissatisfaction with something
working as designed — and the notes explaining that judgement are what an auditor
will want to read.
:::

## Reporting

The complaints list filters by status, category, site and date, and its reports
show what is arriving and how it is being handled. Because complaints share the
**Category** taxonomy with Quality Events, NCs and CAPAs, a category trend
follows the whole chain rather than stopping at the module boundary.

## Who can do what

The standard capability set — Read, Create, Update, Delete, Close, Reopen,
Export, Assign — at Own, Department, Site or Company-wide scope. Converting to an
NC needs Update on Complaints **and** Create on Nonconformances, since it writes
in both places.

See [Roles and Permissions](../administration/roles-and-permissions.md).

## Related

- [Customer Complaints](./customer-complaints.md) — the support-side conversation and SLA
- [Nonconformances](./nonconformances.md) — where an escalated complaint goes
- [Quality Events](./quality-events.md) — internal observations, same idea
