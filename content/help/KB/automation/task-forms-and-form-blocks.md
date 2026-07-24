---
id: task-forms-and-form-blocks
access: public
title: Task Forms & Form Blocks
sidebar_position: 4
description: What a workflow step's Task Form is, how assignees fill it to complete a step, and how reusable Form Blocks help you build step forms fast.
keywords: [task form, form block, workflow step, step form, checklist, containment, sign-off, evidence, form builder, blocks]
---

# Task Forms & Form Blocks

## What is a Task Form?

A **Task Form** is the form an assignee fills in to complete a workflow step.
It captures the **evidence that step produced** — what was done, found, or
decided — and is saved on the record when the step is completed.

- **Action** and **Delay Action** steps can carry a Task Form. The assignee
  must submit the form before they can mark the step complete.
- **Approval** steps never carry a form — approvers review, comment, and sign
  off only.

You design a step's Task Form in the workflow builder: open the step and go to
the **Task Form** tab. A badge on the tab shows how many fields the form has;
an attention dot means the step has no form yet — the assignee would only be
able to add a comment and mark the step complete, with no data captured.

### What belongs in a Task Form

Keep it small and step-specific — the form is that step's evidence, not a
place to re-describe the problem:

- **Do** capture what the step produced: containment actions taken,
  verification results, implementation proof, attached evidence files.
- **Don't** re-collect fields that already live on the record (title,
  description, severity, disposition, dates). Those are filled in when the
  record is created — repeating them in a step form creates duplicate,
  conflicting data.

Most steps need only 1–5 fields. A rich-text "What was done" plus an
attachments field is a complete, useful Task Form for a generic working step.

## What is a Form Block?

A **Form Block** is a **reusable form fragment** — a section you can drop into
any step's Task Form instead of building it from scratch. Think of blocks as
your library of standard sections:

- **Task / Action** — a description field plus attachments.
- **Yes / No / N.A. Checklist** — a checklist grid with a verdict per row.
- **Containment Actions** — actions taken, affected scope, date, evidence.
- **Root Cause Narrative** — a root-cause write-up with supporting files.
- **Sign-off** — a signature plus comments.

Your company starts with this library; administrators can add custom blocks
under **Form Templates → Form Blocks**. Creating a block takes a name and the
form designer — nothing else.

### Blocks vs. Form Templates

They share the same designer but serve different jobs:

| | Form Template | Form Block |
| --- | --- | --- |
| Purpose | A standalone form that creates its **own records** | A reusable **section** embedded inside something else |
| Has record numbering, statuses, sites | Yes | No |
| Can become a module | Yes | No |
| Where it's used | Records, log books, public forms, modules | Workflow step Task Forms, child-step forms, checklists |

When a picker offers "blocks", it deliberately hides standalone templates —
a step's Task Form wants a containment section, not a whole Deviation Report.

## Using blocks in a workflow step

1. Open the workflow step → **Task Form** tab → **Create Task Form**.
2. Pick a starting point: a **Blank Form**, a built-in block, or one of
   **your saved blocks** — each card shows a live preview.
3. **Design Form** opens the builder seeded with your choice. Add, remove, or
   change any field — editing never changes the original block.
4. Save. The step now carries the form, and the tab badge shows its field
   count.

A copy of the block's fields is stored on the step, so later changes to the
block don't silently change published workflows — each workflow version keeps
exactly the form it was published with.

## Before you publish

When you publish a workflow, a readiness check lists any Action or Delay steps
that still have **no Task Form**, so nothing ships with an empty working step
by accident. You can publish anyway — some comment-only steps are intentional —
but the warning makes the gap visible first.
