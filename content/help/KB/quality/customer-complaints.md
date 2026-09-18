---
id: customer-complaints
title: Customer Complaints
sidebar_position: 9
description: Receive, acknowledge, and answer customer complaints — intake forms, the conversation thread, SLA targets and canned responses.
keywords:
  [customer complaints, support, sla, intake form, conversation, canned responses, acknowledgement]
---

# Customer Complaints

## Overview

Customer Complaints is the **support** side of complaint handling: receiving what
the customer said, acknowledging it, working it, and replying. It carries the
conversation, the clock and the customer relationship.

Its quality counterpart is [Complaints](./complaints.md), which handles
investigation and escalation. The same complaint routinely appears in both — one
view for answering the customer, one for deciding what it means.

## What you can do

| Capability           | What it gives you                                                    |
| -------------------- | -------------------------------------------------------------------- |
| **Intake forms**     | Publishable forms so complaints arrive structured, not as free text. |
| **Conversation**     | A threaded exchange with the customer, kept on the record.           |
| **SLA targets**      | Response and resolution clocks, with visible breach.                 |
| **Canned responses** | Reusable replies for the things you answer repeatedly.               |
| **Attachments**      | Photos, documents and samples from the customer.                     |
| **Convert to NC**    | Hand a complaint to quality when it reveals a real problem.          |
| **Close approval**   | Optionally require the owner's e-signature to close.                 |

## Statuses

The support side tracks a complaint in more detail than the quality side,
because the state of a conversation matters to whoever picks it up next.

| Status           | What it means                                                 |
| ---------------- | ------------------------------------------------------------- |
| New              | Received; not yet triaged.                                    |
| Open             | Acknowledged or reopened; awaiting assignment.                |
| Assigned         | An agent has taken it.                                        |
| In Progress      | Being actively worked.                                        |
| Waiting Customer | You have replied; the ball is with them.                      |
| On Hold          | Paused on an internal team or third party — not the customer. |
| Resolved         | Resolution communicated; awaiting confirmation.               |
| Closed           | Finished. A customer reply reopens it.                        |

:::note On Hold and Waiting Customer are deliberately different
Both mean "not being worked right now", but only one is the customer's move.
Keeping them apart stops the SLA clock penalising you for time you were waiting
on the customer, and stops work stalled on a third party hiding inside that
excuse.
:::

## Receiving complaints

Complaints arrive three ways:

- **An intake form** you publish, so the customer supplies what you need up front.
- **Manual entry**, when someone phones or emails.
- **Import**, from a CSV or your support system.

Intake forms are worth setting up: a complaint that arrives with the batch
number, the date and a photo already attached can be investigated immediately
rather than after a round trip.

## Working a complaint

1. Open it and check what the customer sent.
2. Acknowledge — this usually starts the resolution clock and is what the
   customer is waiting for.
3. Use the **conversation** thread to correspond. Everything stays on the record.
4. Reach for a **canned response** for the routine ones, then edit it. The point
   is a consistent starting sentence, not an impersonal reply.
5. Set the status honestly as you go — that is what makes the queue readable.
6. Resolve, then close.

## SLA targets

Configure response and resolution targets in the complaints settings, along with
whether closing requires the owner's approval and e-signature.

Targets are visible on the record and in the list, so an approaching breach can
be seen before it is a breach.

## Converting to a nonconformance

When a complaint suggests something actually went wrong, convert it. The
nonconformance is created with the complaint's context and linked back to it.

The customer conversation continues on the complaint; the investigation happens
on the NC. Neither blocks the other, which matters because the customer usually
needs an answer sooner than the investigation can conclude.

## Who can do what

The standard capability set at Own, Department, Site or Company-wide scope.
Converting needs Update on Complaints and Create on Nonconformances.

See [Roles and Permissions](../administration/roles-and-permissions.md).

## Related

- [Complaints](./complaints.md) — the quality investigation view
- [Nonconformances](./nonconformances.md) — where a converted complaint goes
- [Forms and Form Templates](../automation/forms-and-form-templates.md) — building intake forms
