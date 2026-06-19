---
id: document-templates
title: Document Templates
sidebar_position: 2
description: Create reusable document templates that define numbering, default settings, and section structure for new controlled documents.
keywords: [document templates, document control, template status, document prefix, sections, publish template]
---

# Document Templates

## Overview

Document Templates let you define a reusable blueprint for the formal documents your
organization creates — such as Standard Operating Procedures, Work Instructions, or Policies.
A template controls the document numbering prefix, default review and approval settings,
training behavior, and the section structure that every new document starts with.

By setting these defaults once, you make sure documents of the same kind look and behave
consistently, and that the people creating them don't have to re-enter the same settings every
time.

You'll find Document Templates under Document Control. The main page shows summary cards
(Total Templates, Active, With Training) and a table of all your templates.

## Key concepts

### Template statuses

Every template has a status that controls whether it can be edited and whether it can be used
to start new documents.

| Status | What it means | Can you edit it? | Can it be used for new documents? |
| --- | --- | --- | --- |
| Draft | The template is still being built or refined. | Yes | No |
| Published | The template is finalized and live. | No | Yes |
| Archived | The template has been retired. | No | No |

:::note
A published template is locked. Because it may already be referenced by documents, you can't
change its details. If you need to make changes, archive it, then unarchive it to return it to
Draft.
:::

### Template fields and settings

| Field | What it controls |
| --- | --- |
| Name | The template's display name (e.g. "Standard Operating Procedure"). |
| Document Prefix | The leading code for document numbers. Supports the placeholders `{SITE_CODE}` and `{DEPARTMENT_CODE}` (e.g. `SOP-{SITE_CODE}`). Use uppercase letters, numbers, and hyphens. |
| Department | The department this template belongs to (optional). |
| Related Standard | A standard this template maps to, such as an ISO clause (optional). |
| Training Available | Whether documents from this template require training. |
| Retraining on Version | Whether a new version requires staff to be retrained. |
| Periodic Review Period (months) | How often documents must be reviewed. |
| Review Limit (days) | How long reviewers have to complete a review. |
| Approval Limit (days) | How long approvers have to approve. |
| Auto Effective on Approval | Whether a document becomes effective automatically once approved. |
| Show Section Titles | Whether section headings appear in the finished document. |

### Section types

Each template is built from ordered sections. Available section types:

| Type | Use it for |
| --- | --- |
| Text | Written content, edited in a rich-text editor. |
| Attachment | One or more uploaded files. |

## How to create a document template

1. Open Document Templates under Document Control.
2. Select **Create Template** in the top right.
3. Under **Basic Information**, enter a **Name** and a **Document Prefix**. As you type the
   prefix, the app checks that it isn't already in use — a green check means it's available,
   a red mark means it's taken.
4. Optionally choose a **Department** and a **Related Standard**.
5. Under **Default Settings**, set the training, review, and approval options that should
   apply to documents created from this template.
6. Under **Sections**, build the structure of the document:
   - Select **Add Section** to add a section.
   - Give each section a **title** and choose a **type** (Text or Attachment).
   - For text sections, enter default content in the editor.
   - Use the up and down arrows to reorder sections, and the trash icon to remove one.
7. Select **Create Template** at the bottom to save. The template is created in **Draft**
   status.

:::tip
Every template needs at least one section, and each section must have a title before you can
save.
:::

## How to publish a template

A template must be published before anyone can use it to start a document.

1. Open the template from the Document Templates table.
2. Confirm the details are correct. While it's in Draft, you can edit the name, prefix,
   settings, and sections directly on the page — your changes save automatically.
3. Select **Publish** in the top right and confirm.

After publishing, the template is locked and shows the **Published** status.

## How to use a template to start a document

1. Go to Documents and start creating a new document.
2. In the document's properties, open the **Document Template** menu and choose a published
   template.
3. The document automatically inherits the template's settings — its numbering prefix, related
   standard, periodic review period, and effective-on-approval behavior — along with the
   template's section structure.
4. Continue filling in the document details and save.

## How to archive or unarchive a template

When a template is no longer in use, archive it so it can't be selected for new documents.

1. From the Document Templates table, open the row menu and choose **Archive** — or open the
   template and select **Archive** in the top right. Confirm the action.
2. To bring an archived template back, open it and select **Unarchive**, or use the row menu.
   The template returns to **Draft** status, where it's editable again. You'll need to publish
   it again before it can be used for new documents.

:::warning
Archiving doesn't affect documents that were already created from the template — it only
prevents the template from being chosen for new documents.
:::
