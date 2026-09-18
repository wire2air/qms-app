---
id: training-overview
title: Training — How It Works
sidebar_position: 1
description: How the Training module fits together — the library, curricula, role assignment, instances and verification — and what to set up first.
keywords:
  [
    training overview,
    training module,
    how training works,
    setup order,
    library,
    curriculum,
    roles,
    competency,
  ]
---

# Training — How It Works

## Overview

The Training module answers one question for an auditor: **can you show that the
people doing the work are trained to do it?** Everything in the module exists to
make that answer defensible without anyone maintaining a spreadsheet.

It has five parts, and they are easier to use once you see how they relate.

## The five parts

| Part                       | What it is                                     | What it answers            |
| -------------------------- | ---------------------------------------------- | -------------------------- |
| **Training Library**       | The catalogue of trainings you offer.          | _What can be taught?_      |
| **Training Curriculum**    | Named groups of trainings, mapped to roles.    | _Who needs what?_          |
| **Training Instances**     | One launch of a training to a group of people. | _Who is doing it now?_     |
| **Training Verification**  | A manager confirming competency.               | _Can they actually do it?_ |
| **Training Matrix Report** | The people-by-training grid.                   | _Where are the gaps?_      |

## How they connect

```
Training Library ──┐
                   ├──► Curriculum ──► Role ──► Person ──► Instance ──► Verification
Controlled Document┘
```

Read left to right:

1. A **training** exists in the library — or is generated from a controlled
   document.
2. Trainings are grouped into a **curriculum**.
3. The curriculum is mapped to one or more **roles**.
4. Anyone holding that role is assigned everything in it.
5. Each assignment becomes part of an **instance** they work through.
6. Where competency must be confirmed, a manager **verifies** it.

The **matrix report** reads across the whole chain to show where people actually
stand.

:::note Why requirements attach to roles, not to people
Assigning training person by person works until someone changes job — and then
it silently stops working, because nothing connects their new responsibilities to
what they now need to know.

Mapping requirements to roles means a job change updates training automatically:
the person gains the role, and the curricula come with it. The requirement is
stated once, in the place that describes the job, rather than repeated against
every individual who holds it.
:::

## What to set up first

Work outward from the content. Each step is usable on its own, so you can stop
after any of them and still have something working.

### Step 1 — Build the Training Library

Create your trainings: the material, whether there is a quiz, whether a manager
must verify competency afterwards, and how often it must be repeated.

Start with what you already teach. You do not need the whole catalogue before the
rest becomes useful.

→ [Training Library](./training.md)

### Step 2 — Group them into curricula

Create curricula for the sets people actually need — "New Operator Induction",
"Internal Auditor", "GMP Refresher" — and put the relevant trainings in each.

Name them after the person or the job, not the paperwork. The name is what
appears in gap reports.

→ [Training Curriculum](./training-curriculum.md)

### Step 3 — Map curricula to roles

Map each curriculum to the roles that require it. This is the step that turns a
catalogue into a requirement: from here on, anyone holding the role is assigned
its training automatically.

→ [Roles and Permissions](../administration/roles-and-permissions.md)

### Step 4 — Let assignments flow

New joiners and role changes now assign themselves. People see their training in
[My Tasks](../operations/my-tasks.md); progress is tracked as instances.

→ [Training Instances](./training.md)

### Step 5 — Verify where competency matters

For training where reading is not enough, switch on verification so a manager
confirms the person can do the task.

→ [Training Verification](./training-verification.md)

### Step 6 — Read the gaps

Use the matrix report to see who is outstanding, filtered by site, department or
role — and print it when an auditor asks.

→ [Training Matrix Report](./training-matrix.md)

## Training that comes from a document

Training does not only start in the library. A controlled document can carry its
own training, and when a new version becomes **effective** the training launches
automatically, pinned to that version.

This is the mechanism behind read-and-understood on SOPs. It matters that the
assignment is pinned: nobody is recorded as trained on a revision they never saw,
and releasing a new revision retrains the people it affects rather than leaving
stale completions in place.

→ [Document Control](../documents/document-control.md)

## Where training is enforced

Training records are not only evidence — in one place they are a gate.

A **log book** linked to controlled documents will refuse an entry from someone
whose training on those documents is not verified. Assignment gives a warning and
the task names what is outstanding, but the entry itself is blocked.

→ [Inspections and Logs](../operations/inspections-and-logs.md)

## Who does what

| Role                   | Typically                                                       |
| ---------------------- | --------------------------------------------------------------- |
| Training administrator | Builds the library and curricula, maps them to roles.           |
| Manager / supervisor   | Verifies competency, chases outstanding training in their area. |
| Everyone               | Completes their own training from My Tasks.                     |
| Quality / auditor      | Reads the matrix report and prints evidence.                    |

Each is a permission grant rather than a fixed job title — see
[Roles and Permissions](../administration/roles-and-permissions.md).

## Related

- [Training Library](./training.md) — building trainings
- [Training Curriculum](./training-curriculum.md) — grouping and role mapping
- [Training Verification](./training-verification.md) — confirming competency
- [Training Matrix Report](./training-matrix.md) — completion and gaps
- [Document Control](../documents/document-control.md) — training released with a document
