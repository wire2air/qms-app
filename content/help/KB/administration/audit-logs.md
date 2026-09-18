---
id: audit-logs
title: Audit Logs
sidebar_position: 7
description: Review, filter, and export the tamper-evident record of every action taken across your Qability QMS workspace.
keywords: [audit log, compliance, traceability, change history, investigation, export]
---

# Audit Logs

## Overview

The **Audit Logs** page gives administrators a complete, tamper-evident record of the actions people take across your Qability workspace. Every time a record is created, edited, approved, deleted, or moved through a status change, an entry is written here showing **what** happened, **who** did it, **when**, and **what changed**.

This history is essential for quality and regulatory compliance (such as ISO 9001 and FDA 21 CFR Part 11 traceability), for internal investigations, and for answering "who changed this and why" during an audit. You don't create or edit audit entries yourself — the system records them automatically. Your job is to read, filter, and export them.

To open it, go to the **Audit Logs** page under Administration. Entries appear newest first.

## Key concepts

Each audit entry pairs an **action** with the **module** and record it affected. The most common actions you'll see:

| Action | What it means |
| --- | --- |
| Create | A new record was added |
| Update | An existing record's fields were edited |
| Delete / Restore | A record was removed, or brought back |
| Activate / Deactivate | A record was switched on or off |
| Archive / Obsolete | A record was retired from active use |
| Submit for Review / Approve / Reject | A document or step moved through review |
| Initiate / Complete / Reassign | Workflow lifecycle and routing changes |
| Invite / Assign Role / Revoke Role / Assign Team | User and access changes |
| Investigate / Disposition / Close / Reopen | Nonconformance lifecycle changes |
| Block / Requalify / Share Doc | Supplier actions |
| Publish / Lock / Rotate / Cancel | Other lifecycle events |

Entries are grouped by **module** so you can focus on one area of the system:

| Module | Covers |
| --- | --- |
| Document Control | Controlled documents and versions |
| Workflows | Workflow definitions and running instances |
| Forms & Records | Form templates and submitted records |
| Suppliers | Supplier records and qualification |
| Asset Requests | Asset request activity |
| Nonconformances | NC records and dispositions |
| Users & Access | User accounts, roles, invitations |
| Teams / Org / Products / Tasks | Team, department, product, and task changes |
| Configuration / Organization / API Keys | Workspace settings and key management |

Every entry also captures the **performer** (resolved to the person's name, or "System" for automated actions), the **date and time**, and the originating **IP address**.

## How to read an entry

1. Open the **Audit Logs** page. Each row shows an action badge, the affected record, its type, who performed it, and the timestamp.
2. Where the affected record is still available, its name appears as a link — select it to jump straight to that document, workflow, supplier, or other record.
3. If the entry includes field-level changes, the row is expandable. Select it to open the change detail.
4. In the detail view, **Update** entries show each changed field with the old value (struck through in red) and the new value (in green). **Create** entries show only the new values; **Delete** entries show only what was removed. Fields that hold structured data show a **raw** toggle if you need the full underlying detail.

## How to filter the log

Use the filter bar at the top of the page to narrow the list. Filters combine, so you can stack several at once.

1. **Modules** — choose one or more modules to limit results to those areas.
2. **Actions** — choose one or more action types (for example, only Delete and Reject).
3. **Performed by** — pick a specific user to see only their activity.
4. **Start date / End date** — set a date range to focus on a particular period.
5. Select **Clear** to remove all active filters and return to the full list.

:::tip
For an investigation, start with a **Performed by** user and a tight **date range**, then add an **Action** filter (such as Delete or Update) to zero in on exactly what changed.
:::

## How to use audit logs for compliance and investigations

The audit trail is your evidence record during inspections and internal reviews.

1. Filter to the module, user, action, and date range relevant to your question.
2. Expand the entries to confirm the exact before-and-after values for each change.
3. Follow the record links to review the current state of the affected item in context.
4. When you need an export — for an auditor, an investigation file, or your records — open the audit view for the specific record or user and select **Export CSV**. The export includes the timestamp, action, record type and ID, the performer's name, the IP address, and the old and new values.

:::note
Audit entries are recorded automatically and are designed to be tamper-evident, so they reflect what actually happened in the system. The main list shows the most recent activity; use filters and per-record audit views to reach older history.
:::

:::warning
Audit logs can contain sensitive information about people and records. Limit access to administrators, and handle any exported CSV files according to your organization's data-handling and retention policies.
:::
