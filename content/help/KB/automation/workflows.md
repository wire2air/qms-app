---
id: workflows
title: Workflows
sidebar_position: 1
description: Design the review, approval and follow-up paths your records travel — steps, assignees, task forms, scheduled checks and electronic signatures.
keywords: [workflow, approval, template, steps, assignees, sla, e-signature, delay step, effectiveness check, version]
---

# Workflows

## Overview

A workflow is the path a record takes from raised to closed: who does what, in
what order, who signs off, and what has to be captured on the way. You design it
once as a **template**, and every record that uses it follows the same path — so
your process is enforced by the system rather than remembered by people.

Workflows drive Documents, Nonconformances, CAPAs, Change Requests, Quality
Events, Audits, Complaints and any module you build yourself. Different records
of the same type can follow different paths: a minor deviation need not travel
the same route as a critical one.

## What you can build

| Capability | What it gives you |
| --- | --- |
| **Task steps** | Assign work, with a form for whatever must be captured. |
| **Approval steps** | Gate progress on sign-off — by everyone, or by any one approver. |
| **Scheduled steps** | Pause the record and come back to it weeks or months later. |
| **Effectiveness checks** | A scheduled step that records a verdict and can reopen the record. |
| **Electronic signatures** | Bind an action to a person with a PIN. |
| **Due dates** | Per-step SLAs that drive reminders and escalation. |
| **Role-based assignment** | Route by role, so the path survives people changing jobs. |
| **Versioning** | Change a template without disturbing records already running. |

## Key concepts

### Step types

| Step type | What it does |
| --- | --- |
| **Task** | A work step. Carries a form for what the assignee must capture, and can allow ad-hoc sub-tasks. The assignee fills it in and marks it complete. |
| **Approval** | A gate. One or more approvers sign off before the record moves on. |
| **Schedule Task** | A deliberate wait. The record parks and the step wakes on its own after the delay — for a follow-up check, a monitoring period, a review after a settling-in time. |

:::note Scheduled steps are how you park a record honestly
Before these existed, "check back in 90 days" was a calendar entry in somebody's
head. A Schedule Task step keeps the record open and accountable, and wakes it up
on time — with the delay, any extension, and who granted it all on the record.
:::

### Approval rule

| Rule | Meaning |
| --- | --- |
| ALL | Every assigned approver must sign off before the workflow advances. |
| ANY | The first approver to act carries the step. |

### Template version statuses

| Status | What it means |
| --- | --- |
| Draft | Editable and unpublished. Add and change steps freely. |
| Published | Locked and available to launch. To change it, create a new draft. |
| Retired | A superseded published version, kept read-only for history. |

### Instance statuses

| Status | What it means |
| --- | --- |
| In Progress | The run is active and moving through its steps. |
| Completed | Every step finished. |
| Rejected | An approver rejected a step and stopped the run. |
| Changes Requested | An approver sent it back to the owner before approving. |

### Step settings

Each step's gear button opens its settings.

| Setting | What it controls |
| --- | --- |
| Instructions | Guidance shown to whoever gets the step. |
| Due within | Days from step activation until it is due. Drives reminders and escalation. |
| Default delay | Schedule Task steps: how long to wait — 30, 60, 90, 180 or 365 days, or a specific date. |
| Max delay extensions | How many times a scheduled step may be pushed back before someone has to act. |
| Require Comments | The assignee must say something when acting. |
| Require E-signature | Identity is verified with a PIN before the action is recorded. |
| Runtime sub-tasks | Lets the record owner add ad-hoc sub-tasks while the run is live. |

## Templates and Approval Flows

The workflow list is split in two, because the two halves are used differently.

| List | Holds |
| --- | --- |
| **Templates** | Workflows carrying task forms and multi-step work — NC, CAPA, Change Control, and modules you build. |
| **Approval Flows** | Workflows that are purely sign-off — Document Control, Log Books, Inspections & Logs, Audits and QC. |

They are the same thing underneath and open in the same editor; the split just
keeps a list of approval paths from being buried among templates with forms
attached, and the other way round.

If a flow you expect is missing from one list, look in the other — a workflow
appears in Approval Flows when every step is an approval step.

## Designing a template

1. Go to **Templates** under Workflows and create a workflow, choosing the module
   it applies to.
2. Add steps in order. Give each a clear name — the name is what assignees see in
   their task list.
3. For each step, set its type, then open **settings** for instructions, the due
   window and compliance options.
4. Use the **people** button to set who handles the step (see below).
5. On Task and Schedule Task steps, build the **task form** — the fields the
   assignee fills in. You can compose one inline or reuse a saved form block.
6. **Publish** when the path is right.

:::tip Start from a working template
Every company is seeded with templates for the standard processes. Copying the
closest one and adjusting it is faster and safer than starting from an empty
canvas.
:::

### Assigning steps

Steps are assigned by **role**, not to named individuals. A step routed to
"Quality Manager" keeps working when the quality manager changes — no template
edit, no stranded records.

Where a workflow leaves the choice open, the record owner picks the specific
person at submission time.

:::note An assignment is routing, not a lock
The assignee is the accountable party, but anyone the permission matrix allows
can act on a step — otherwise one person on leave strands the record until
somebody reassigns it.

Acting on someone else's step looks different on purpose: the button names them
("Approve on behalf of Sam Patel"), so it cannot be clicked without noticing
whose it is. The assignee is notified, and the audit trail records who actually
acted rather than who it was assigned to.
:::

## Publishing and versioning

Publishing locks the template. To change a published workflow, create a new draft
version — records already running stay on the version they started with, so a
mid-flight change never rewrites the path a record is already taking.

Each record shows which **version** of the workflow it is following, so a record
that behaves differently from today's template has a visible reason.

## Running a workflow

When a record is submitted, its workflow launches and the first step activates.
Assignees get tasks; the record shows a **Workflow** card and a timeline of where
it is.

**Acting on a step.** Open the record or the task. Fill in the step's form, add a
comment if required, and Mark Complete — or Approve or Reject on an approval
step. If e-signature is required you will be asked for your PIN.

**Drafts.** Work in progress on a step form can be saved without completing the
step. A colleague picking the step up sees the draft rather than starting again.

**Grouped steps.** Consecutive steps belonging to the same person are shown as a
single card, so a run of five things one person does reads as one piece of work
instead of five. Each step keeps its own actions and its own history.

**Step history.** Every step carries its own trail — who acted, when, what they
said, and any delay scheduled, extended or skipped.

## Send-backs and rejections

An approver has three options:

- **Approve** — the run advances.
- **Request changes** — the record goes back to the owner to fix and resubmit.
  The run continues from where it left off.
- **Reject** — the run stops.

Both send-back and rejection require a comment, since "no" without a reason is
the thing everyone complains about.

## Effectiveness checks

A Schedule Task step can be marked as capturing an **effectiveness verdict** —
the "did the fix actually work?" question you must answer some time after a CAPA
is implemented, not on the day you implement it.

The step parks the record for the configured window, then asks for a verdict:

| Verdict | What it means |
| --- | --- |
| **Effective** | It worked. The record closes. |
| **Not Effective — Close Check** | It did not work, and you are closing the check with a justification rather than reopening. |

The verdict needs a comment and a signature, and the whole exchange stays on the
record. If it is too early to judge, the check can be extended — up to the limit
set on the step, so a check cannot be deferred indefinitely.

Because the check is a workflow step, it appears on the record's Workflow card
with everything else, and reporting can find every record with a check pending,
completed or overdue without digging through steps.

## Who can do what

Designing templates and acting on steps are separate permissions.

- **Workflows & Templates** — create, edit and publish templates.
- **The module's own capabilities** — act on a step. Approving a CAPA step needs
  the Approve capability on CAPA; completing a task step needs Update.

The permission matrix is checked for the assignee too: routing a step to someone
who lacks the capability does not grant it. If a step cannot be actioned by the
person it is assigned to, that is a role configuration to fix, not a workflow
one.

See [Roles and Permissions](../administration/roles-and-permissions.md).

## AI in this module

AI can **draft a workflow template** from a description of your process —
steps, roles and forms — created as a Draft for you to review and publish. It
proposes a structure; it does not publish anything.

The assistant reads; it does not act. It can find, summarise and draft — it
cannot create, edit, approve or close a record. Anything it produces is a
starting point you review and apply yourself, and the normal permission checks
run when you save it.

It can only reach modules you already have read access to.

→ [AI Assistant](../ai/ai-assistant.md) · [AI Access and Usage](../ai/ai-access-and-usage.md)

## Related

- [Task Forms and Form Blocks](./task-forms-and-form-blocks.md) — what a step captures
- [Forms and Form Templates](./forms-and-form-templates.md) — building forms
- [Automation Rules](./automation-rules.md) — condition-based actions and notifications
- [My Tasks](../operations/my-tasks.md) — where assignees pick work up
- [Document Control](../documents/document-control.md) — workflows on documents
- [CAPAs](../quality/capas.md) — effectiveness checks in context
