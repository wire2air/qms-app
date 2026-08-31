---
id: document-control
title: Document Control
sidebar_position: 1
description: Author, review, approve, release, and control SOPs and other quality documents — with versioning, e-signatures, training, and a tamper-evident PDF of every effective revision.
keywords: [document control, sop, versions, approval workflow, effective date, controlled copy, collaborators, e-signature, periodic review, iso 9001, iso 13485]
---

# Document Control

## Overview

Document Control is where your quality documents live — SOPs, work instructions,
policies, forms, specifications and manuals. Each document carries a unique
number, a defined approval path, and a complete revision history, so at any
moment you can answer the three questions an auditor actually asks: *which
version is current, who approved it, and who has been trained on it.*

Every document follows a controlled lifecycle. You write a **draft**, **submit it
for review**, it gets **approved**, and then it becomes **effective** — the
version everyone must follow. Change an effective document and you create a new
draft version; the old one is retained and marked superseded. Nothing is ever
quietly overwritten.

This is what standards like ISO 9001 (§7.5), ISO 13485 (§4.2) and 21 CFR Part 11
mean by controlled documents, and the module is built to satisfy them without
extra paperwork on your side.

## What you can do

| Capability | What it gives you |
| --- | --- |
| **Versioned authoring** | Rich-text sections, attachments, and a full revision history per document. |
| **Configurable approval** | Route each document through a workflow of your own design — sequential or parallel, one approver or many. |
| **Electronic signatures** | Approvals are signed and bound to the person and the moment, with a PIN. |
| **Collaboration** | Bring people in before review, with an in-document chat and their own task. |
| **Controlled release** | Release immediately on approval, or schedule a future effective date. |
| **Tamper-evident PDF** | Every effective version is captured as a fingerprinted PDF, automatically. |
| **Training on release** | Push read-and-understood training, with an optional quiz, the moment a version goes effective. |
| **Periodic review** | Get reminded before a document goes stale, on your own review cycle. |
| **Supplier access** | Give a supplier's portal users read access to a specific document. |
| **AI assistance** | Draft an outline, import an existing PDF, or generate quiz questions. |
| **Full-text search** | Find a document by its content, not just its title. |

## Key concepts

### Documents and versions

A **document** is the enduring thing — `SOP-001`, "Batch Release Procedure". It
holds the number, the owner, the site and department, and the review cycle.

A **version** is one revision of that document's content — `1.0`, `1.1`, `2.0`.
Content, status, approvals and signatures all belong to the version, not the
document. This is why a document can be effective and under revision at the same
time: the effective version stays in force while the new draft is written.

### Version statuses

| Status | What it means |
| --- | --- |
| Draft | Being authored or revised. Content edits save as you type. |
| In Review | Submitted into the approval workflow, waiting on reviewers. |
| Changes Requested | A reviewer asked for changes; edit and resubmit. |
| Rejected | A reviewer rejected the version; revise and resubmit. |
| Approved | Cleared the workflow, ready to be released. |
| Effective | The current, in-force version people must follow. |
| Superseded | Previously effective, replaced by a newer version. |
| Archived / Obsolete | Withdrawn from use; retained for the record only. |

### Section types

A version is built from numbered sections you can reorder, edit and comment on
individually.

| Section type | Use it for |
| --- | --- |
| Text Content | Rich-text body — headings, lists, tables, images, formatted instructions. |
| Attachments | Uploaded files: diagrams, forms, a source PDF. |

Sections are the unit of review as well as authoring: reviewers leave feedback
against a specific section, so "fix section 4.2" arrives as a comment on 4.2
rather than an email.

### Document types and numbering

You pick a **Document Type** — SOP, Policy, Work Instruction, Specification,
Record, Form, Manual — when creating. The type supplies a **prefix**, and the
prefix plus an auto-incrementing counter forms the number, for example `SOP-001`.
Prefixes can include `{SITE_CODE}` and `{DEPARTMENT_CODE}`, filled in from the
site and department you choose, giving numbers like `MFG-SOP-001`.

:::note Numbers are assigned at first submission, not at creation
A draft you abandon never consumes a number. The counter advances when a document
is first submitted for review, so your numbering has no unexplained gaps — which
is exactly the kind of thing an auditor asks about.
:::

### Sites and applicability

A document belongs to an owning **site**, and can additionally be marked as
applying to **all sites** or to a specific list. This drives who sees it: people
see documents for the sites they are assigned to. A corporate policy can apply
everywhere while a line-specific work instruction stays local.

## Creating a document

1. Go to **Documents** and choose **Create New Document**.
2. On the **Properties** tab, set **Document Type**, **Title**, **Site**,
   **Department** and **Prefix**. Optionally add a related standard, tags, and a
   **Periodic Review Frequency** in months.
3. Choose the **Workflow** that will approve it, and decide whether
   **Automatically make effective** should be on (see
   [Releasing a document](#releasing-a-document-making-it-effective)).
4. On the **Content** tab, add your sections. Three ways to start:
   - **Write them yourself** — add text and attachment sections as you go.
   - **Draft with AI** — describe the document and get a structured starting
     outline to edit. It is a first draft, not a finished document.
   - **Import PDF** — bring an existing document in and have its structure
     extracted into editable sections.
5. On the **Training Assessment** tab, optionally set up training that launches
   when the document becomes effective.
6. Choose **Save Draft**. The document opens at version 1.0 in **Draft**.

:::tip Start from a template
If you have [Document Templates](./document-templates.md), starting from one
gives you the section structure and boilerplate already in place. For getting many
existing documents in at once, use [Bulk Document Import](./bulk-document-import.md)
— the **Bulk Import** button sits next to **Create Document**.
:::

## Working with collaborators

Collaborators are the people you want *in* the document before it goes to formal
review — a subject-matter expert, the supervisor who actually runs the process,
a colleague from another department.

**Adding one.** Open the document and use the **Collaboration** card in the right
rail. The candidate list excludes you, the owner and the author, since none of
those are collaborators.

**What happens.** Adding a collaborator raises a **review task** for that person
and notifies them, so the request lands in their task list rather than relying on
them noticing. They can read the document and comment on sections.

**Messages.** The Collaboration card also carries a chat thread for the document.
It appears once there is at least one collaborator — with nobody to talk to there
is nothing to show. Every message notifies all collaborators plus the owner and
author, minus whoever sent it. Use it for the conversation *about* the document;
use section comments for "change this paragraph".

:::tip
Collaboration is deliberately separate from approval. Collaborators help you get
the draft right; reviewers formally approve it. Using collaborators first usually
means fewer rejected review cycles.
:::

## Review and approval

1. Open the document and select the draft version.
2. Edit sections as needed — changes auto-save while the version is a draft.
3. Choose **Submit For Review**. You will see a preview of the approval path,
   then pick reviewers where the workflow leaves that open.
4. The version moves to **In Review** and reviewers receive their tasks.
5. Track progress in the **Workflow Timeline** in the right rail, or choose
   **Show Workflow** for the full view.
6. Reviewers approve, request changes, or reject — leaving per-section feedback.
   If changes are requested, address them and submit again.
7. Once the last approval lands, the version becomes **Approved**.

**Electronic signatures.** Approval steps are signed with your personal PIN. The
signature records who signed, what they signed, when, and the meaning of the
signature — the Part 11 requirements — and is retained with the version
permanently.

**Cancelling.** If you submitted too early, **Cancel Review** returns the version
to draft and withdraws the outstanding tasks.

:::note Who approves is set by the workflow
Approval steps are defined by **role**, not by named person, so the workflow keeps
working when people change jobs. The owner picks the specific reviewer at
submission time where the workflow allows it. See
[Workflows](../automation/workflows.md).
:::

## Releasing a document (making it effective)

There are two release paths, and you choose per document.

**Automatic.** With **Automatically make effective** turned on, the version is
released as soon as the final approval lands. Nothing else to do.

**Manual.** With it off, an approved version waits for someone to choose **Set
Effective**. Use this when release has to line up with something outside the
system — training completion, a shift change, a customer notification.

**Scheduling a future date.** On the manual path you can set an **effective
date** in the future. The system holds the approved version and releases it on
that date automatically, re-checking first that it is still approved and still
meant to go out.

:::note Effective dates only apply to manual release
With automatic release on, the effective date *is* whenever the final approval
lands, so the field is not offered — it would only invite a value the system
would ignore.

A date that has already passed by the time approval completes simply makes the
document effective on approval. That is deliberate: a document approved later
than planned should go into force, not get stranded.
:::

When a version becomes effective, the previously effective version becomes
**Superseded** automatically. There is never more than one effective version.

## The PDF snapshot

Every version that becomes effective is automatically captured as a PDF.

The snapshot is rendered from the document itself — cover page, approvals,
sections, formatting intact — then fingerprinted with a SHA-256 hash and stored
in private, access-controlled storage. The fingerprint appears in the
**Properties** card in the right rail.

This is what makes the record tamper-evident: re-hash the file at any point in
the future and compare. A file that produces a different fingerprint is not the
file that was approved. It happens with no action from you, on every effective
version.

See [Audit Snapshots](./audit-snapshots.md) for how to find and verify one.

## Training on release

If the document has a training configuration, the moment a version goes effective
the system launches training pinned to **that specific version** — so nobody is
ever recorded as trained on a revision they did not read.

You can assign by role or by named users, require a manager verification step,
and add a quiz. Quiz questions can be generated from the document's own content
and then edited.

Because assignments are pinned to a version, releasing a new revision retrains
the affected people rather than leaving stale completions in place. See
[Training](../training/training.md).

## Periodic review

Documents go stale quietly. Set a **Periodic Review Frequency** in months and the
system watches the clock for you: ahead of the due date it raises a review task
for the document's **owner**, and keeps raising it while the review is overdue.

The next review date is calculated from the last review — or from creation, if it
has never been reviewed. The document list shows a review badge so you can see
what is coming due without opening anything.

:::tip
The task goes to the document's **owner** — the person accountable for it — which
may not be the author who originally wrote it. Check the owner is right when you
set a review cycle.
:::

## Sharing with a supplier

You can give a supplier's portal users read access to a specific document — a
specification they build to, a packaging standard, an inspection procedure.

Use the **Supplier portal access** card in the right rail to grant or revoke
access. The supplier sees the document in their portal; they cannot edit it, and
they see nothing else you have not shared.

This works at **any status**, including on a closed or superseded document, which
matters when a supplier asks for the specification that applied to a batch you
shipped last year.

:::note Two different things called "sharing"
Granting portal access is a **read** grant, and it changes nothing about the
document's workflow.

Separately, if a workflow step assigns a task to a supplier user, they
automatically get access to what they need in order to do it. That access follows
the workflow rather than being managed by hand.
:::

Granting access requires the Update capability on Document Control.

## Related records

Documents can be linked to other records — the NC that prompted a revision, the
CAPA that required it, the change request that authorised it, or a form-based
module record. Use the **Related records** card in the right rail to search by
number or title and link across modules.

Documents also connect to [Log Books](../operations/inspections-and-logs.md)
(where a linked document can gate who is allowed to make entries) and to
[Equipment](../operations/equipment.md).

## New versions and change control

1. Open the document and choose **Create New Draft**. This is available when the
   document is approved or effective and no draft is already in progress.
2. Fill in the change-control details: **change reason**, **change type**, a
   summary, whether there is regulatory impact, and which sections changed. These
   are required for every revision after 1.0.
3. The new draft starts as a copy of the previous version's sections, so you edit
   from where things stand rather than starting over.
4. It then follows the same review, approval and release path.

**Revision History** in the toolbar shows change control and the approval chain
for every version — the audit-ready story of how the document got here.

## Printing a controlled copy

1. Open the document and select the version you want.
2. Choose **Print**. The print view shows the company header, status, approvals,
   and an identifier such as `SOP-001 v1.2`.
3. Use your browser's print dialog, or Save as PDF.

:::warning A printout is a snapshot in time
Draft and In Review versions are watermarked "not for controlled use." Even a
printed effective version can be superseded the next day — always confirm against
the system before relying on paper.
:::

## Archiving and obsoleting

**More Actions** lets an owner delete a draft that was never submitted, or
**Archive** the document. Archiving requires a reason, because withdrawing a
controlled document is itself a regulated event and the reason forms part of the
record. Archived documents remain fully readable and auditable — they are removed
from use, not from history.

## Who can do what

Access is granted through roles, using a **capability × scope** matrix. For
Document Control the capabilities are:

| Capability | Allows |
| --- | --- |
| Read | See documents and their versions. |
| Create | Start new documents and new draft versions. |
| Update | Edit content and properties, manage collaborators, grant supplier access. |
| Delete | Remove an unsubmitted draft. |
| Approve / Reject | Act on review tasks assigned to them. |
| Close | Archive or obsolete a document. |
| Reopen | Return an archived document to use. |
| Export | Export and print. |
| Assign | Route tasks to other people. |

Each is granted at a **scope**: Own, Department, Site, or Company-wide. So
"Update, Department" edits documents in your department and nowhere else.

Three things worth knowing:

- **Owning a document is not a permission.** The owner is who the system holds
  accountable — who gets the periodic-review task. They still need the matching
  capability to act. Ownership decides *which* records an Own-scoped grant
  reaches, not *what* can be done to them.
- **Author and owner can differ.** The author wrote it; the owner is responsible
  for it now. Both are recorded.
- **Read access is enforced at the data layer.** Documents outside your scope are
  never sent to your device — this is real access control, not hidden buttons.

By default, general readers see **effective** versions. Drafts and in-review
versions are visible to the people working on them — the author, the owner,
collaborators and assigned reviewers.

For the full model, see [Roles and Permissions](../administration/roles-and-permissions.md).

## Finding documents

- **Search** covers document content, not just titles — full-text across sections.
- **Filters** on the document list narrow by type, status, site, department, owner
  and tags.
- **Tabs** separate what is in force from what is in progress.

## Related

- [Document Templates](./document-templates.md) — reusable starting structures
- [Bulk Document Import](./bulk-document-import.md) — bringing existing documents in
- [Audit Snapshots](./audit-snapshots.md) — verifying the PDF of an effective version
- [Workflows](../automation/workflows.md) — designing the approval path
- [Training](../training/training.md) — read-and-understood and quizzes
- [Roles and Permissions](../administration/roles-and-permissions.md) — who can do what
- [Change Requests](../quality/change-requests.md) — authorising a document change
