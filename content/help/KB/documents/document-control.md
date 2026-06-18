---
id: document-control
title: Document Control
sidebar_position: 1
description: Create, version, review, approve, release, and print controlled documents in the Qability QMS.
keywords: [document control, versions, approval workflow, controlled copy, sections, document types]
---

# Document Control

## Overview

Document Control is where you author and manage your controlled documents — SOPs, work instructions, policies, forms, manuals, and more. Each document carries a unique document number, a defined approval path, and a full revision history, so you always know which version is current and who approved it.

Every document moves through a controlled lifecycle: you write a **draft**, **submit it for review**, get it **approved**, and **release** it so it becomes **effective**. When you need to change an approved document, you create a new draft version — the previous version stays on record. This keeps you audit-ready and meeting standards like ISO 9001 and ISO 13485.

## Key concepts

### Document version statuses

A document's content lives in versions. Each version shows its own status in the toolbar version selector and the Properties panel.

| Status | What it means |
| --- | --- |
| Draft | Being authored or revised. You can freely edit content and sections. |
| In Review | Submitted into the approval workflow and waiting on reviewers. |
| Changes Requested | A reviewer asked for changes; edit and resubmit. |
| Rejected | A reviewer rejected the version; you can revise and resubmit. |
| Approved | Cleared the workflow and is ready to be released. |
| Effective | The current, in-force version that people should follow. |
| Superseded | A previously effective version replaced by a newer one. |
| Archived / Obsolete | Withdrawn from use; kept for the record only. |

### Section types

A version is built from numbered sections you can reorder and edit.

| Section type | Use it for |
| --- | --- |
| Text Content | Rich-text body — headings, lists, tables, formatted instructions. |
| Attachments | Uploaded files such as diagrams, forms, or a source PDF. |

### Document types and numbering

You pick a **Document Type** (for example SOP, Policy, Work Instruction, Specification, Record, Form, Manual) when you create a document. The type drives a default **prefix**, and the prefix plus an auto-incrementing counter produces the document number (for example `SOP-001`). Prefixes can include the placeholders `{SITE_CODE}` and `{DEPARTMENT_CODE}`, which are filled in from the site and department you select.

## How to create a document

1. Go to **Documents** and choose **Create New Document**.
2. On the **Properties** tab, set the **Document Type**, **Title**, **Site**, **Department**, and **Prefix**. Optionally add a template, related standard, effective date, tags, and a **Periodic Review Frequency** (in months).
3. Choose a **Workflow** for the approval path, and decide whether **Automatically make effective** should be on. When on, the document is released automatically after final approval; when off, you release it manually.
4. (Optional) On the **Change Control** tab, record a change summary, reason, and type, and flag any regulatory impact.
5. On the **Content** tab, add your sections. You can also use **Draft with AI** or **Import PDF** to generate a starting outline, then edit each section.
6. (Optional) On the **Training Assessment** tab, set up training for the document.
7. Choose **Save Draft**. The document opens at version 1.0 in **Draft** status.

:::tip
Required fields are marked with an asterisk. If something is missing, you'll be taken back to the tab that needs attention.
:::

## How to take a document through review and approval

1. Open the document and select the draft version in the **Version** selector.
2. Edit sections as needed — changes auto-save while the version is a draft. Use **Add New Section** to insert text or attachment sections.
3. Choose **Submit For Review**. You'll see a workflow preview, then the version moves to **In Review** and reviewers receive their tasks.
4. Track progress in the **Workflow Timeline** on the right, or choose **Show Workflow** to open the full approval view.
5. Reviewers can leave per-section feedback. If they request changes or reject the version, address their comments and submit again.
6. Once approved, the version status becomes **Approved**.

## How to release a document (make it effective)

1. With an **Approved** version selected, choose **Set Effective**.
2. The version becomes **Effective** and is now the current controlled version. Any previously effective version becomes **Superseded**.

:::note
If **Automatically make effective** was enabled, release happens on its own after final approval and you won't need the **Set Effective** step.
:::

## How to create a new version

1. Open the document and choose **Create New Draft** (available when no draft is already in progress).
2. In the change-control dialog, enter the **change reason**, **change type**, and summary, flag regulatory impact if relevant, and mark which sections changed. These details are required for any revision after 1.0.
3. The new draft is created with the previous version's sections copied in, so you can edit from where you left off. It then follows the same review, approval, and release path.

You can view the full **Revision History** at any time from the toolbar to see change control and the approval chain for every version.

## How to print a controlled copy

1. Open the document and select the version you want.
2. Choose **Print**. A print view opens showing the company header, status, approvals, and an identifier such as `SOP-001 v1.2`.
3. Use your browser's print dialog (or **Save as PDF**) to produce the copy.

:::warning
Draft and In Review versions are watermarked "not for controlled use." Always confirm you are viewing the current effective version before relying on a printout — a printed copy is a snapshot and may go out of date.
:::

## Tips

- Use the **Version** selector to switch between versions; the effective one is marked **(Current)**.
- **More Actions** lets owners delete an in-progress draft or **Archive** a document (a reason is required, since archiving is a regulated event).
- Use **Discussion** for general document conversation and **Audit Log** to review the full change history across the document, its versions, sections, and links.
