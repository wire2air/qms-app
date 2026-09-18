---
id: inspections-and-logs
title: Inspections & Logs
sidebar_position: 1
description: Build log books, schedule who fills them, complete entries from your task inbox, and review the records they produce.
keywords: [inspections, log books, field records, assignments, scheduling, review]
---

# Inspections & Logs

## Overview

Inspections & Logs is where your team captures routine field entries: daily temperature
checks, gemba rounds, shift handovers, cleaning logs, calibrations, and batch-release
records. You build a **log book** to define what each entry looks like, optionally schedule
**who** fills it and **when**, and every completed entry is saved as a permanent **log**
(also called a field record). Once an entry's edit window closes, it locks and can no longer
be quietly changed, which gives you a trustworthy audit trail.

The module landing page shows four quick stat tiles (My queue, Awaiting your review, Missed
this week, Submitted this week) and cards that take you into Log Books, Log Book Assignments,
My Tasks, and Logs.

## The sub-menus, and what to create first

| Menu                   | What it holds                                         |
| ---------------------- | ----------------------------------------------------- |
| **Log Forms**          | The reusable field layouts a log book captures.       |
| **Log Books**          | The books themselves — a form, a policy, a lifecycle. |
| **Inspections & Logs** | The entries people have filed.                        |
| **Assignments**        | Who fills which book, and on what schedule.           |

Build them in that order:

### Step 1 — Create a Log Form

Define the fields to capture — readings, checks, observations — with their types
and limits. Forms are reusable, so several books can share one.

### Step 2 — Create a Log Book

A book pairs a form with a policy: who may make entries, whether a supervisor
signs off, the edit window, the equipment it belongs to, and the controlled
documents it follows.

Submit it for approval. Once approved and **Active**, its definition is frozen —
which is the point, and why it is worth getting right before submitting.

### Step 3 — Assign who fills it

Schedule the people or roles responsible, and how often. This is what turns a
book into recurring tasks in someone's list.

### Step 4 — Entries get filed

People make entries from their tasks, or from a mobile device at the point of
work. See [Mobile Logging](./mobile-logging.md).

:::tip
Get the form right before approving the book. A book's fields are frozen on
approval, so changing them later means creating a replacement book — deliberate,
but more work than a few minutes' thought up front.
:::

## Key concepts

### Log book classifications

When you create a log book you choose how strict it is. This sets sensible defaults for
edit windows, signatures, and review.

| Classification | Best for                                                    | Edit window                     | E-signature        | Reviewer approval                   |
| -------------- | ----------------------------------------------------------- | ------------------------------- | ------------------ | ----------------------------------- |
| Operational    | Routine field entries (temperature, gemba, walk-throughs)   | Auto-locks ~15 min after submit | Not required       | Not required                        |
| Controlled     | Regulated records (batch release, deviations, calibrations) | Stays open until reviewed       | Required on submit | Second-person review before locking |

### Two different approvals — don't confuse them

A log book can involve **two separate approvals**, which do different things:

|              | **Log Book Approval**                                                                                                       | **Entry review**                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Approves     | The **log book itself** — its fields (schema) and policy                                                                    | An **individual entry** (a filled-in log)               |
| Set by       | The **Log Book Approval** workflow (bottom of the Details tab)                                                              | The **Require reviewer approval before locking** toggle |
| Who approves | The reviewers/approvers defined in the chosen workflow (e.g. technical review → Quality Manager)                            | The log book's **Supervisor**                           |
| When         | When you **create or replace** the log book — every book must be approved before it becomes **Active** and can take entries | **Every entry**, before it locks                        |
| Steps        | Multi-step workflow                                                                                                         | Single reviewer sign-off                                |

In short: **Log Book Approval controls the template; Entry review controls the daily records.** The reviewer for entries is the **Supervisor** you set on the log book — entries land in that person's review queue.

### Edit window options

| Setting               | What it means                                          |
| --------------------- | ------------------------------------------------------ |
| Time window           | Edits allowed for a set number of minutes after submit |
| Until next entry      | Edits allowed until the next entry is logged           |
| Until reviewed        | Edits allowed until a reviewer signs off               |
| No edits after submit | The entry locks immediately                            |

### Log (field record) statuses

| Status                | What it means                                              |
| --------------------- | ---------------------------------------------------------- |
| Submitted (in window) | Just entered; still editable until the window closes       |
| Completed             | Locked; no further edits allowed                           |
| Under review          | Waiting for a supervisor or reviewer to approve or reject  |
| Approved              | Reviewer accepted the entry                                |
| Rejected              | Reviewer sent it back                                      |
| Voided                | Cancelled with a recorded reason; kept for the audit trail |

### Assignment schedule types

| Type      | What it does                                             |
| --------- | -------------------------------------------------------- |
| Recurring | Repeats on a schedule you set (frequency plus timezone)  |
| Ad-hoc    | No schedule; the log book is available to fill on demand |

## Roles — who does what

Inspections & Logs separates **setting up** log books from **filling them in**, so day-to-day staff can record entries without changing the controlled templates.

| Role                            | Typical activities                                                                                                                                                                                   | Permissions                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **QA Manager / owner** (setup)  | Create and edit log books, define the schema (fields), set the edit-window / signature / review policy, submit books for **approval**, schedule assignments, and **review, amend, or void** entries. | `log_books:create`, `log_books:update`, `field_records:review`, `field_records:amend`, `field_records:void`, `field_records:read_all`, `inspections:assign` |
| **Day-to-day user** (execution) | Fill in and submit logs from their task inbox, and edit their own entry **while its edit window is still open**.                                                                                     | `field_records:create`                                                                                                                                      |

A day-to-day user can only edit **their own** entry, and only **before** the edit window closes or a reviewer locks it. After that, corrections must go through a QA Manager as an **amendment** or **void** (both keep the original for the audit trail).

## Log books and equipment

A log book can be tied to a specific piece of **equipment** (for example a "pH Meter Daily Calibration" log). This links routine records to the instrument they belong to.

For a **calibration** log, you can go one step further: on the log book's **Details** tab, after choosing the Equipment, turn on **"Update this instrument's calibration when an entry is logged."** From then on, completing (or approving) a calibration entry automatically rolls that instrument's calibration forward — the entry's submit time becomes the last-calibrated date and the next-due date advances by the instrument's interval. No separate "Record calibration" step, and the date can't be back-dated from the log. Corrections are made in the **Equipment** module (managers only), where the calibration interval, next-due date, and the QC-inspection gate all live.

## How to create a log book

1. Open **Inspections & Logs** and select the **Log Books** card.
2. Click **New Log Book** (or pick the Operational or Controlled quick-create card).
3. In the dialog, give it a title, code, and category (for example Daily, Calibration,
   Cleaning, Safety), then confirm the classification.
4. The new log book starts as a **Draft**. You land on its detail page, opened to the
   **Log Template** tab — add the fields people will fill in.
5. On the **Details** tab, set the supervisor, edit-window behavior, whether a signature or
   review is required, and any compliance references (related standard, regulatory citation,
   retention). You can also link the log book to controlling documents (for example "this log
   book implements SOP-001") so auditors can trace from a procedure to its evidence.
6. When the template is ready, click **Submit for Approval**, pick a reviewer for each
   workflow step, and describe the change. Once approved the book becomes **Active** and
   starts accepting entries.

:::tip
Use the **Category** filter on the Log Books list to quickly find a log book by its type,
and the **Type** filter to separate operational from controlled log books.
:::

### The log book lifecycle — like a physical bound book

A log book works like a physical bound book: once approved, the book itself — its fields,
entry policy, equipment link, location, and code — is **frozen**, so every entry in it keeps
full integrity forever. The lifecycle is:

| Status       | What it means                                                  |
| ------------ | -------------------------------------------------------------- |
| Draft        | Being built or revised — fully editable, takes no entries      |
| Under review | Submitted for approval — locked while reviewers decide         |
| Rejected     | Sent back with a reviewer comment — edit and resubmit          |
| Active       | Approved and accepting entries; template and policy are frozen |
| Inactive     | Paused — takes no entries, can be resumed                      |
| Obsolete     | Retired with a recorded reason; kept for the audit trail       |

Submitting a draft routes it through the **Log Book Approval** workflow (set at the bottom
of the Details tab), so attach a workflow there before submitting. This approves the **log
book's definition** — its fields and policy — not the entries filed against it.

To change a frozen setting on an Active book, click **Create Replacement**. That opens a new
Draft book — a full copy including assignments — numbered from the same lineage: `CAL-LOG-QA`
is replaced by `CAL-LOG-QA-V2`, whose entries number `CAL-LOG-QA-V2-0001` onward. When the
replacement is approved, the old book is automatically marked **Obsolete** ("Replaced by …")
and any of its open scheduled fills are closed out. The two books stay linked — the banner on
each shows "Replaces" / "Replaced by" — and the old book's entries remain readable exactly as
they were recorded.

## Training gate — only trained people may make entries

A log book can be linked to controlled documents: the SOP the entry follows, the
method it applies. When it is, being trained on those documents is enforced, not
just expected.

The gate applies at three points, each deliberately different:

| Point                     | What happens                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Assigning someone         | A **warning** — you can still assign them, so you can schedule ahead of the training landing. |
| The task and notification | The outstanding training is **named**, so the person knows what to complete.                  |
| Making an entry           | **Blocked.** An untrained user cannot file an entry against the book.                         |

Only training that is fully **verified** clears the gate.

:::note Why the block is at entry and not at assignment
Assignment is scheduling — often done weeks ahead, by someone planning a rota,
for training that is booked and not yet done. Blocking there would make the rota
unusable.

The entry is the moment the claim is made: this reading was taken by someone
competent to take it. That is the moment worth enforcing, and it is the one an
auditor examines.
:::

## Over-the-shoulder review

Some entries need a supervisor's sign-off at the moment they are made — the
operator is at the workstation and the supervisor is standing beside them.

Enable it per book. The operator stays signed in; the reviewer picks their own
name and enters their **PIN** to approve or reject on the spot. No session
switch, no walking to another machine.

The signature is attributed to the **reviewer** — they are the one attesting —
and the record also captures that the operator's session was used. Both facts are
kept, because either alone would misrepresent what happened.

Only a book's authorised reviewers can sign this way: its designated supervisor,
or additional reviewers named on the book.

## How to schedule who fills a log book

1. From the landing page, open **Log Book Assignments**, then click **New Assignment** (you
   need the assignment permission). You can also add one from a log book's **Assignments** tab.
2. Choose the log book this plan covers.
3. Pick the schedule. For a recurring plan, set the frequency and timezone; for ad-hoc,
   choose ad-hoc so it can be filled on demand.
4. Assign it to specific people or to a role.
5. Set the completion window and **grace** period. These scale with frequency (for example a
   daily check defaults to a 4-hour window with 2 hours grace; a monthly check gets several
   days). Choose what happens if the window and grace lapse unfilled — mark it missed or keep
   it open.
6. Make sure **Active** is on and save.

The scheduler then creates upcoming occurrences automatically and drops each due entry into
the assignee's task inbox. On the assignments list you can toggle a plan Active or Inactive
and edit it at any time.

## How to fill a log

1. Scheduled inspections and log collections appear in **My Tasks** (your unified task
   inbox), alongside approvals and reviews. Open a task and complete the form.
2. To log something unprompted, use **Submit a log**, pick the log book, and fill it in.
3. Submit. The entry is saved as a log. Operational entries lock after their short edit
   window; controlled entries require your e-signature and then wait for review.

:::note
Your due inspections and logs appear in My Tasks, so all of your work
live in one inbox.
:::

## How to review and find logs

When a log book has **Require reviewer approval** on, each submitted entry is held **Under review** for the log book's **Supervisor** — that's the designated reviewer, and entries land in their queue. (Any user with the review permission can also action them, but the Supervisor is who it's routed to.)

1. Open the **Logs** card to see every entry submitted across your log books. Filter by log
   book or by status to narrow the list.
2. To review entries waiting on you, use the **Awaiting your review** tile on the landing
   page, or filter Logs to **Under review**.
3. Tick the checkbox on the entries you want to act on, then choose **Approve** or **Reject**.
   Both outcomes require your e-signature and let you add a comment in one step.

:::warning
Logs are immutable once their edit window closes. To correct a locked entry you amend or void
it (with a reason) rather than overwriting it, so the original is preserved for the audit
trail.
:::
