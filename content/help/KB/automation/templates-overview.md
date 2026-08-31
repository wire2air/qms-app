---
id: templates-overview
title: Templates — Which One Do I Need?
sidebar_position: 0
description: The three kinds of template — document, workflow and form — what each one controls, and how they combine on a single record.
keywords:
  [
    templates,
    document template,
    workflow template,
    form template,
    form builder,
    approval flow,
    which template,
  ]
---

# Templates — Which One Do I Need?

## Overview

"Template" means three different things in Qability, and they are easy to confuse
because a single record often uses all three at once.

| Template              | Controls                              | Answers                                          |
| --------------------- | ------------------------------------- | ------------------------------------------------ |
| **Document Template** | The starting structure of a document. | _What sections does this kind of document have?_ |
| **Workflow Template** | The path a record takes.              | _Who reviews and approves it, in what order?_    |
| **Form Template**     | The fields captured.                  | _What information do we collect?_                |

A single SOP can use all three: a **document template** gives it its sections, a
**workflow template** routes it for approval, and the approval steps may carry
**forms** for what each reviewer must record.

## Document Templates

A reusable document skeleton — the sections, their order, and any boilerplate
text that should be there every time.

Use one when you want every document of a kind to have the same shape: every SOP
with Purpose, Scope, Responsibilities, Procedure, References.

→ [Document Templates](../documents/document-templates.md)

## Workflow Templates

The path: the steps a record passes through, who handles each, and what has to
happen before it advances.

The list is split in two, because the two halves read differently:

| List               | Holds                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Templates**      | Workflows with task forms and multi-step work — NC, CAPA, Change Control, your own modules. |
| **Approval Flows** | Workflows that are purely sign-off — Documents, Log Books, Audits, QC.                      |

They are the same thing underneath and open in the same editor.

### The step types

| Step              | What it does                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| **Task**          | Work to be done, with a form for what must be captured.                                         |
| **Approval**      | A sign-off gate — by everyone assigned, or by any one of them.                                  |
| **Schedule Task** | A deliberate wait, then the step wakes on its own. Used for follow-up and effectiveness checks. |

The difference that matters: a **Task** step captures information, an **Approval**
step makes a decision, and a **Schedule Task** step buys time. If you find
yourself adding a task step whose only purpose is someone saying yes, you want an
approval step.

→ [Workflows](./workflows.md)

## Form Templates

The fields. Built in the **form builder**, which is also where you set field
types, whether an answer is required, and how answers score if the form is being
used to rate something.

Forms show up in three places:

- **On a workflow step**, as the task form the assignee fills in.
- **As a form block**, a reusable group of fields you drop into several forms
  rather than rebuilding.
- **Promoted to a module**, which turns a form into a whole record type with its
  own list, numbering, permissions and workflow.

→ [Forms and Form Templates](./forms-and-form-templates.md) ·
[Task Forms and Form Blocks](./task-forms-and-form-blocks.md)

## Which one am I looking for?

- _"Every SOP should start with the same sections"_ → **Document Template**
- _"This needs two approvals before it goes live"_ → **Workflow Template**
- _"I need to capture six specific things at this step"_ → **Form Template**
- _"I want a whole new kind of record"_ → **Form Template, promoted to a module**
- _"The same five fields appear on four forms"_ → **Form Block**

:::tip
Build them in that order — document structure, then the path, then what each
step captures. Each is usable before the next exists, and going the other way
usually means rebuilding forms once the path changes.
:::

## Related

- [Workflows](./workflows.md) — steps, assignment, versioning
- [Forms and Form Templates](./forms-and-form-templates.md) — the form builder
- [Task Forms and Form Blocks](./task-forms-and-form-blocks.md) — step forms and reusable blocks
- [Document Templates](../documents/document-templates.md) — document structures
