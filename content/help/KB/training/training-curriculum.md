---
id: training-curriculum
title: Training Curriculum
sidebar_position: 2
description: Group trainings into curricula and map them to roles, so people are assigned the right training automatically when they join or change job.
keywords:
  [
    training curriculum,
    role-based training,
    training requirements,
    onboarding,
    compliance,
    assignment,
  ]
---

# Training Curriculum

## Overview

A **curriculum** is a named group of trainings — "New Operator Induction", "GMP
Refresher", "Internal Auditor". You map curricula to **roles**, and anyone holding
that role is assigned everything in them.

This is how training requirements stay consistent without anyone assigning
courses person by person. Set the requirement once at the role level, and it
applies to everyone who holds the role, now and in future. When someone joins or
changes job, their training follows automatically.

The structure has two links:

```
Role  ⇄  Curriculum  →  Training
```

Both are many-to-many: a role can require several curricula, and one curriculum
can serve several roles.

:::note Why a group sits in the middle
A curriculum names a _set_ of trainings, so the set becomes a thing you can talk
about and change in one place.

Add a course to "New Operator Induction" and every role requiring that curriculum
picks it up, with no further mapping. Without the group you would be attaching the
same course to each role in turn, and nothing would name what those courses
collectively are.
:::

## Key concepts

| Concept             | What it means                                                              |
| ------------------- | -------------------------------------------------------------------------- |
| Curriculum          | A named group of trainings, with an optional description.                  |
| Curriculum training | One training inside a curriculum. A training can sit in several curricula. |
| Role mapping        | The link that makes a curriculum required for everyone holding a role.     |

## Building a curriculum

1. Go to **Training Curriculum**.
2. Choose **New curriculum** and give it a name — say what it is for, since this
   is the name people see in compliance reports.
3. Add a description if the scope needs explaining.
4. Add the **trainings** it contains.
5. Map the **roles** that require it.

Click a curriculum's name to rename it. Removing one does not un-assign training
people have already completed — completed records are permanent.

:::tip
Name curricula after the person, not the paperwork — "New Operator Induction"
reads better in a gap report than "SOP Set 4".
:::

## How assignment happens

- **New people.** When someone is given a role, every training in that role's
  curricula is assigned to them.
- **Role changes.** Gaining a role brings its curricula with it.
- **Document-driven training.** A controlled document can target a curriculum's
  audience, so releasing a new effective version retrains exactly the right
  people. See [Document Control](../documents/document-control.md).

## Checking for gaps

The curriculum page tells you what _should_ be required. To see what has actually
been completed, use the [Training Matrix report](./training-matrix.md) — the
people-by-training grid, with filters for site, department and role.

## Related

- [Training](./training.md) — the training library, assignments and quizzes
- [Training Matrix report](./training-matrix.md) — completion and gaps
- [Roles and Permissions](../administration/roles-and-permissions.md) — the roles you map to
- [Document Control](../documents/document-control.md) — training released with a document
