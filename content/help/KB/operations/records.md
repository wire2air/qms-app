---
id: records
title: Records
sidebar_position: 3
description: View, search, preview, and manage submitted form records and their statuses from the Records page.
keywords: [records, record number, record status, approve, draft, form submissions]
---

# Records

## Overview

The **Records** page is where submitted form entries are collected and managed. Whenever someone fills out and submits a form template, the result is saved here as a record with its own unique record number. From this page you can browse everything that has been submitted, search for a specific entry, open a record to read its contents, and move records through their approval status.

Records are useful as a running log of completed forms — for example, utility checklists and standalone forms your team submits day to day. Each record keeps the answers exactly as they were entered, so the page acts as a permanent reference of what was recorded and by whom.

## Key concepts

Every record carries a few core pieces of information that you will see in the table and the preview panel.

| Field | What it means |
| --- | --- |
| Record # | The unique, auto-generated identifier for the record (for example `ABC-QUAL-0001`). It combines the form template code, the document type, and a sequential number. |
| Document Type | The category the record belongs to, shown as a colored badge. |
| Status | Where the record sits in its lifecycle (see below). |
| Created By | The user who submitted the record. |
| Created | The date the record was submitted. |

### Record statuses

A record's status controls how it is treated and which actions are available. Statuses are shown as colored badges in the **Status** column.

| Status | Meaning |
| --- | --- |
| Draft | Being filled in. Not yet submitted. |
| Open | Submitted and being worked — its workflow, if it has one, is running. |
| Closed | Complete. |
| Cancelled | Withdrawn, with a recorded reason. |

These are the same four words used by Nonconformances, CAPAs, Quality Events,
Change Requests, Complaints, Audits and QC lots — so a module you build reports
alongside the built-in ones instead of needing its own vocabulary.

## The App Builder workspace

App Builder is organised in tabs:

| Tab | What it holds |
| --- | --- |
| **Submissions** | The records themselves. |
| **Forms** | The form templates behind them. |
| **Option Sets** | The dropdown lists those forms use. |

A form template can be **promoted to a module**, which gives it its own place in
the navigation, its own record list, its own numbering and its own permissions —
the same treatment the built-in modules get.

Promoted modules can carry a workflow, so records route for review and approval
like any other. You can also choose which of the form's fields appear as columns
in the list and which can be filtered on — see **Configure View** beside the
template.

## How to view and search records

1. Open the **Records** page from the navigation menu.
2. The table lists all submitted records, with the newest shown first.
3. To find a specific record, type into the **Search records...** box at the top of the table. The list filters as you type, matching against the record number.
4. Clear the search box to return to the full list.

:::note
The search box matches on the record number. To narrow results, enter all or part of the record number you are looking for.
:::

## How to preview a record

1. In the table, click anywhere on a record's row.
2. A preview panel slides in from the right, showing the record's title and all of its submitted answers laid out as the original form.
3. The preview is read-only — it is for reviewing the entry, not editing it.
4. Click the close control to dismiss the panel and return to the list.

## How to approve a record

1. Find the record you want to approve. It must currently be in **Draft** status.
2. In the **Actions** column at the right of its row, open the actions menu.
3. Choose **Approve**.
4. The record's status badge changes to **Approved** (green).

## How to return an approved record to Draft

1. Find an **Approved** record in the table.
2. Open the actions menu in the **Actions** column.
3. Choose **Unapprove**.
4. The record returns to **Draft** status, where it can be reviewed and approved again.

## How to add a record

If you have permission to create records, an **Add Record** button appears at the top right of the page.

1. Click **Add Record**.
2. Choose a form template from the list. Use the search box to filter templates by title or code.
3. Fill in the form fields. For standalone records, select the required **Document Type**.
4. Click **Save Record** to submit. A confirmation appears with the new record number.

:::tip
A new record number is assigned automatically when you save, using the template code and document type. You do not need to enter or track record numbers yourself.
:::

## How to delete a record

1. Locate the record in the table.
2. Use the record's actions to delete it, and confirm when prompted.

:::warning
Deleting a record removes it from the active list. Confirm carefully before deleting, as the action cannot be undone from this page.
:::

## Tips

- Click a column header that supports sorting (such as **Record #**, **Status**, or **Created**) to reorder the list.
- The **Created By** column tells you who submitted each record — handy when following up on a specific entry.
- If you cannot see the **Add Record** button, your account may not have permission to create records; contact your administrator.
