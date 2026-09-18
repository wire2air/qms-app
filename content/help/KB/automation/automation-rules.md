---
id: automation-rules
access: public
title: Automation Rules
sidebar_position: 3
description: Automatically notify people or create tasks when a module form's records meet conditions you define — triggers, conditions, operators, and actions explained.
keywords: [automation, rules, conditions, triggers, notify, create task, due date, effectiveness check, reminders]
---

# Automation Rules

Automation rules watch the records of a **module form** and act when a record
meets the conditions you set — sending a notification or creating a task,
automatically. They are how you turn a form into a process that chases work
instead of waiting to be checked.

You manage them on a module form's **Automation** tab (open the form template →
**Automation**). Each rule is read as one sentence:

> **When** *something happens* **→ if** *these conditions are true* **→ do**
> *these actions* (optionally only for certain sites/departments).

:::tip
Automation is available once a form template is **promoted to a Module**. Notify
actions and Create-Task actions both work on module records.
:::

## The four parts of a rule

1. **Trigger** — *when* the rule is checked.
2. **Conditions** — *which* records match (a field, an operator, and usually a value).
3. **Actions** — *what* happens for a matching record.
4. **Scope** (optional) — limit the rule to certain Sites / Departments. Leave
   empty to apply company-wide.

## Triggers

| Trigger | Fires when… | Use it for |
| --- | --- | --- |
| **When created** | a new record is added | welcome/assignment on intake |
| **When updated** | any field on the record changes | reacting to edits |
| **When status changes** | the record moves to a new status | hand-offs between stages |
| **On a daily schedule (time-based)** | once a day, for every record | due-date and reminder rules |

**On a daily schedule** is the important one for anything *time-based*. Nothing
changes on a record when a due date simply passes, so a daily pass re-checks
every record against the conditions (using the date operators below) and acts
once per record. Pair it with a **date condition** like *Due Date is older than
(days) 0* to mean "overdue."

## Conditions

A condition is **Field · Operator · Value**. Add as many as you like and choose
whether a record must **Match ALL (AND)** or **Match ANY (OR)** of them. With no
conditions, the rule matches every record for the chosen trigger.

**Fields you can test** are your form's own fields **plus** these built-ins:
**Status**, **Date Created**, **Date Completed**, and **Due Date**.

### Operators by field type

The operators offered depend on the field's type, and the value input adapts to
match (a dropdown for choices, a date picker for dates, a number box for
relative dates):

- **Text** (text, email, phone, …): *equals, not equals, contains, does not
  contain, like, not like, is empty, is not empty*.
- **Number**: *=, ≠, >, ≥, <, ≤, between*.
- **Date** (Date Created / Completed / Due Date, and date fields): *before,
  after, older than (days), within (days), older than (months), within
  (months), is empty, is not empty*.
  - *before* / *after* show a **date picker**.
  - *older than / within (days|months)* take a **number** (e.g. "older than 15
    days ago").
- **Yes / No** (checkbox, toggle): *is true, is false*.
- **Choice** (Status, dropdown, radio, multi-select): *is, is not, is any of, is
  none of*.
  - *is / is not* pick **one** value from a dropdown.
  - *is any of / is none of* pick **multiple** values.
  - **Status** lists only this form's lifecycle: *Draft, Open, Pending,
    Complete, Closed, Rejected*.

### Adding a condition

1. Click **Add condition**.
2. Pick the **field** — the operator list updates to that field's type.
3. Pick the **operator** — the value input updates to match.
4. Enter the **value** (choose from the dropdown, pick a date, or type).

Set **Match ALL** when every condition must hold (e.g. *overdue* **and** *not
closed*), or **Match ANY** when any one is enough.

## Actions

Add one or more actions. A matching record runs them all.

- **Notify Group / User** — send an in-app + email notification to a team or to
  specific people.
- **Notify Requester / Owner** — notify the record's creator or its owner /
  assignee.
- **Create Task** — create a task on the record assigned to the **Owner**,
  **Requester**, **specific user(s)**, or a **team**. Choose a **task type**
  (Action, **Effectiveness Check**, Review, Acknowledgement), an optional **due
  in (days)**, and a **note** for the assignee. The assignee is notified
  (in-app + email) automatically, just like a workflow task, and the task shows
  up in their task list linked back to the record.

:::tip
Time-based rules fire **once per record**, and Create-Task de-duplicates per
rule + record, so a daily rule won't pile up duplicate reminders or tasks.
:::

## Examples

**Overdue reminder**
> Trigger: *On a daily schedule* · Conditions (Match ALL): *Due Date · older
> than (days) · 0* **and** *Status · is not · Closed* · Action: *Notify Owner*.

**Effectiveness check**
> Add a checkbox "Effectiveness check" and a date "Effectiveness Due Date" to the
> form. Rule — Trigger: *On a daily schedule* · Conditions: *Effectiveness check
> · is true* **and** *Effectiveness Due Date · older than (days) · 0* · Action:
> *Create Task* (type **Effectiveness Check**, assign **Owner**, note "Verify
> corrective action effectiveness").

**Escalate critical intake**
> Trigger: *When created* · Condition: *Severity · is · Critical* · Action:
> *Notify Group* (Quality).

## Notes & limits

- Status is decided by your **conditions**, not hidden filters — a scheduled rule
  can target open *or* closed records; add a Status condition if you want to
  narrow it.
- Notifications go in-app and by email. SMS is available only where SMS is
  configured.
- Scope a rule to specific Sites/Departments under **Scope**, or leave it empty
  for the whole company.
