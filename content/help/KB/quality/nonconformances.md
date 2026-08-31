---
id: nonconformances
title: Nonconformances
sidebar_position: 1
description: Log, investigate, disposition, and close nonconformances (NCs) through their full review workflow in Qability QMS.
keywords: [nonconformance, NC, disposition, root cause, CAPA, quality]
---

# Nonconformances

## Overview

A nonconformance (NC) records something that did not meet your quality requirements — a defective part, an out-of-spec result, a missing standard, or a supplier issue. The Nonconformances area lets you raise an NC, classify it, route it through a review workflow, decide how to handle the affected material (the disposition), link any follow-up CAPA, and finally approve and close the record.

The Nonconformances home page shows summary cards (Open NCs, Overdue, Critical open, Closed this month), a searchable, filterable list, and a **Raise NC** button. You can filter the list with the quick pills (All open, My NCs, Critical, Major, Overdue, Closed) or by status, severity, and type.

## Key concepts

### Statuses

| Status | What it means |
| --- | --- |
| Draft | Started but not yet opened. Can still be edited freely or deleted. |
| Open | Opened and being worked. The record is now a permanent audit record. |
| Closed | Approved and closed. Read-only. |
| Cancelled | Withdrawn with a recorded reason instead of being closed. |

:::note One vocabulary across the quality modules
Nonconformances, CAPAs, Quality Events, Change Requests, Complaints, Audits, QC
lots and module records all use these same four words. They used to each have
their own — "Under review", "Pending", "Awaiting decision" — which meant a report
asking "how many are open?" had to know three vocabularies and get all three
right.

The record's status is deliberately **not** the workflow's status. The workflow
has its own steps and its own states; it advances and sets the record's status,
never the other way round. A record is Open from the moment it leaves draft until
it closes, however many steps it passes through.
:::

### Severity and priority

| Field | Options |
| --- | --- |
| Severity (required) | Minor, Major, Critical |
| Priority (optional) | Low, Medium, High, Critical |

### Other classification fields

| Field | Purpose |
| --- | --- |
| NC Type | The nature of the nonconformance (configured by your admin). Required. |
| Detection source | Where the issue was found (e.g. inspection, audit, customer). Required. |
| Category | The shared quality taxonomy — the same list used by Quality Events and CAPAs, so an issue keeps its classification along the whole chain. Optional. |
| Site / Department | Where the issue occurred. Both required. |
| Owner | The person responsible for the NC. Required. |
| Product / Supplier | The item or vendor involved. Optional. |
| Qty affected, Unit of measure, PO #, Order #, Lot # | Commercial and material reference details. Optional. |

Category, description and severity **propagate** down the chain: raise a CAPA from
an NC and it inherits them, so the same problem is classified the same way
wherever it is being worked.

## How to log a nonconformance

1. On the Nonconformances home page, click **Raise NC**.
2. Under **Basic information**, enter a **Title** and an optional rich-text **Description**. As you type, the Similar records panel may surface existing NCs so you can avoid duplicates.
3. Under **Classification**, choose the **Site**, **Department**, **NC Type**, **Detection source**, **Severity**, and **Owner** (all required). Optionally set **Category**, **Priority** and **Detected date**.
4. Under **Product & material** (optional), add the product, supplier, quantity affected, unit of measure, and any PO, order, or lot numbers. Tick **Supplier-facing NC** and pick a supplier if the review steps should be handled by that supplier's users.
5. Under **Immediate containment action** (optional), describe anything done right away to contain the problem.
6. Under **Initial investigation** (optional), record what you already know — first findings, who you spoke to, what you checked.
7. Under **Workflow**, choose the review workflow to attach. Where your company has only one, it is selected for you.
8. Click **Submit**, picking the reviewer for each workflow step. The NC is created as a **Draft**.

You can also **Save as Draft** at any point and come back to it.

:::note
Title, Severity, NC Type, Detection source, Site, Department, Owner, Detected date and a workflow must all be filled in before the NC can be submitted. NCs no longer carry their own due date — timing lives on the workflow steps, which is what reminders and escalation actually run on.
:::

## How to open an NC for review

A new NC starts in **Draft**. While in Draft, the owner can edit any field inline and can plan the reviewer for each step in the workflow preview.

1. Open the NC from the list.
2. Click **Open NC**.
3. Review the confirmation — once opened, the NC becomes a permanent audit record that can no longer be deleted, only closed or cancelled with a reason.
4. Click **Open NC** to confirm. The status moves to **Open**, the workflow's first step activates, and that assignee receives a task.

:::tip
Each action is gated on the matching capability rather than on ownership: closing
an NC needs the Close capability, deleting it needs Delete. Owning an NC is not by
itself permission to close it. To remove one raised by mistake, delete it while it
is still in Draft.
:::

## How to record the disposition and root cause

The disposition is your decision about what to do with the affected material. As the owner works through the NC (and its workflow steps), capture:

1. In the **Disposition** card, pick a **Disposition** (for example Scrap, Rework, Use-as-is, Quarantine, Return to supplier — your admin configures the list).
2. Set **CAPA required?** to **Yes** or **No**.
3. If the chosen disposition tracks cost, a **Cost of NC** field appears and is required; you can also record **Credit from Supplier** to offset that cost.
4. Enter **Disposition notes** explaining your decision. Notes are required before the NC can be closed.

Root cause findings are captured as the assigned reviewers complete their workflow steps, alongside the investigation each step calls for.

## How to link a CAPA

When **CAPA required?** is set to **Yes**, a **Linked CAPAs** card appears.

1. Click **Create CAPA** (or **Create Change Request**) in that card.
2. The new record opens pre-linked to this NC.
3. Linked CAPAs are listed with their number and status. You can open any of them directly from the card.

If CAPA is required, at least one linked CAPA must exist before the NC can be closed.

## Linking related records

Beyond CAPAs, an NC can be linked to any other record in the system — the audit
finding that raised it, the complaint it came from, the change request that
resolved it, a deviation held in a module you built yourself.

Use the **Related records** card in the right rail: pick the module, search by
number or title, and link. Links work across every module, so a chain like
*Complaint → NC → Deviation → Filling Instruction* stays navigable from any point
in it.

## Sharing outside the company

Two ways an NC reaches someone outside your organisation.

**Supplier portal access.** Tick **Supplier-facing NC** and pick a supplier, and
the review steps route to that supplier's portal users. The
**Supplier portal access** card also lets you grant read access directly, at any
status.

**Notify by email.** The notify field reaches people with no account at all — a
customer's quality contact, an external consultant. They get a secure link to a
read-only summary, opened with a code sent to that same address. The rail shows
who outside the company can currently read the record, and access can be
withdrawn at any time.

## Raising a supplier NC with its 8D

For supplier issues there is a shortcut that creates the NC and its linked
supplier CAPA together, with the 8D structure already in place, so you are not
raising two records by hand and joining them up afterwards.

## Reporting on effectiveness

Where an NC's workflow includes an effectiveness check, the record carries a
second-level status for it. That means you can filter the list for NCs whose
check is **pending**, **effective** or **not effective** without opening each
record to look at its workflow steps.

## How to close an NC

Closing is a single, final action handled by the owner once everything is complete.

1. Make sure every workflow step is complete (approved, skipped, or cancelled).
2. Confirm the disposition is chosen, disposition notes are filled in, a CAPA is linked if required, and Cost of NC is entered if the disposition tracks it.
3. Click **Approve and Close**. If any requirement is missing, the button is disabled and its tooltip tells you what's left.
4. Add optional **Completion notes**, then click **Sign & Close**.
5. Confirm your identity with the e-signature step. The NC transitions to **Closed** and becomes read-only.

:::warning
Approving and closing an NC is a regulated, attested action and requires an e-signature. It cannot be undone, so complete all investigation and disposition work first.
:::

## Tips

- Use **Print** to generate a printable record and **Audit Log** to see the full timeline of the NC and its workflow steps.
- The **Ask AI** button can answer questions about the open NC.
- Overdue steps are flagged in red in the list and on the detail page. Overdue is driven by the workflow step's due date.
- The **Insights** tab shows trends across your NCs — by type, site, severity and time.
- Search covers NC content, not just titles.

## Related

- [CAPAs](./capas.md) — corrective and preventive actions raised from an NC
- [Quality Events](./quality-events.md) — lighter-weight intake that can escalate into an NC
- [Workflows](../automation/workflows.md) — designing the review path
- [Suppliers](../suppliers/suppliers.md) — supplier-facing NCs and the portal
- [Roles and Permissions](../administration/roles-and-permissions.md) — who can do what
