---
id: training-matrix
title: Training Matrix Report
sidebar_position: 3
description: Read the people-by-training compliance grid — who has completed what, where the gaps are, and how to print it for an audit.
keywords: [training matrix, training report, compliance, gaps, completion, audit evidence]
---

# Training Matrix Report

## Overview

The Training Matrix is your compliance picture: a grid of **people against
trainings**, showing who has completed what and where the gaps are. It is the
report an auditor asks for when they want evidence that the people doing the work
are trained to do it.

It is a **report**, not a configuration screen. Nothing is assigned here. What
people are _required_ to complete is defined by
[Training Curriculum](./training-curriculum.md), which maps trainings to roles;
this page shows the result.

:::note This page changed
Requirements used to be configured on a Training Matrix page — a list of
"this training is required for this role" rules you edited directly. That was
replaced by the curriculum layer, which groups trainings so a change to a set is
made once instead of against every role.

The matrix survives as what it was always most used for: reading compliance.
:::

## How to read it

1. Open **Training Reports** from the Training area.
2. Each row is a person; each column is a training.
3. Each cell shows that person's state for that training — completed, assigned
   and outstanding, or not required.
4. Filter by **site**, **department** and **role** to narrow to the group you
   care about.

Read across a row to see one person's standing. Read down a column to see
everyone's standing on one training — which is the view you want before releasing
a revision of the document behind it.

## Using it for an audit

Use **Print** to produce the grid as a document, filters and all, with your
company header. Auditors generally ask for a specific scope — one site, one
department, one procedure — so filter first and print the answer to the question
rather than the whole company.

Because completion records are pinned to the document version people were trained
on, the grid distinguishes someone trained on the current revision from someone
whose training predates it.

## Closing a gap

A gap is either a requirement that was never assigned, or an assignment nobody
completed.

- **Never assigned** — the person's role is not mapped to a curriculum containing
  that training. Fix it in [Training Curriculum](./training-curriculum.md).
- **Assigned, not completed** — the training is sitting in their task list. Their
  manager can see it under [My Tasks](../operations/my-tasks.md).

## Related

- [Training Curriculum](./training-curriculum.md) — defining what is required
- [Training](./training.md) — the library, assignments and quizzes
- [Document Control](../documents/document-control.md) — training released with a document
