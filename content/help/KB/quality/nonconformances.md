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
| Draft | The NC has been started but not yet opened for review. It can still be edited freely or deleted. |
| Under review | The NC has been opened and its workflow is running. The record is now a permanent audit record. |
| Closed | The NC has been approved and closed. It becomes read-only. |
| Void | The NC was cancelled with a recorded reason instead of being closed. |

A small **Completed** badge appears next to the status once the owner marks the NC complete, while final close is being recorded.

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
| Issue type | The discovery dimension (e.g. out-of-spec, receiving, missing standard). Optional. |
| Site / Department | Where the issue occurred. Both required. |
| Owner | The person responsible for the NC. Required. |
| Product / Supplier | The item or vendor involved. Optional. |
| Qty affected, Unit of measure, PO #, Order #, Lot # | Commercial and material reference details. Optional. |

## How to log a nonconformance

1. On the Nonconformances home page, click **Raise NC**.
2. Under **Basic information**, enter a **Title** and an optional rich-text **Description**. As you type, the Similar records panel may surface existing NCs so you can avoid duplicates.
3. Under **Classification**, choose the **Site**, **Department**, **NC Type**, **Detection source**, **Severity**, and **Owner** (all required). Optionally set **Issue type**, **Priority**, **Detected date**, and a **Due date**.
4. Under **Product & material** (optional), add the product, supplier, quantity affected, unit of measure, and any PO, order, or lot numbers. Tick **Supplier-facing NC** and pick a supplier if the review steps should be handled by that supplier's users.
5. Under **Immediate containment action** (optional), describe anything done right away to contain the problem.
6. Under **Workflow**, choose the review workflow to attach.
7. Click **Submit**. You'll then pick the reviewer for each workflow step before the NC is created as a **Draft**.

:::note
Title, Severity, NC Type, Detection source, Site, Department, Owner, Detected date, and a workflow must all be filled in before the NC can be submitted.
:::

## How to open an NC for review

A new NC starts in **Draft**. While in Draft, the owner can edit any field inline and can plan the reviewer for each step in the workflow preview.

1. Open the NC from the list.
2. Click **Open NC**.
3. Review the confirmation — once opened, the NC becomes a permanent audit record that can no longer be deleted, only closed or cancelled with a reason.
4. Click **Open NC** to confirm. The status moves to **Under review**, the workflow's first step activates, and that assignee receives a task.

:::tip
Only the NC owner sees the **Open NC**, **Delete**, and **Approve and Close** actions. To remove an NC that was raised by mistake, delete it while it is still in Draft.
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
- Overdue NCs are flagged in red in the list and on the detail page.
