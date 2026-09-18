---
id: documents-overview
title: Documents — How It Works
sidebar_position: 0
description: How the Documents module fits together — controlled documents, templates, importing an existing library, and the tamper-evident PDF of every effective version.
keywords:
  [
    documents overview,
    document module,
    how documents work,
    setup order,
    templates,
    import,
    snapshots,
  ]
---

# Documents — How It Works

## Overview

The Documents module holds your controlled documents — SOPs, work instructions,
policies, forms, specifications and manuals — and everything that keeps them
controlled: versioning, approval, release, training and audit evidence.

It has four parts.

| Part                   | What it is                                       | What it answers                                       |
| ---------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| **Document Control**   | The documents themselves.                        | _What do we say, and which version is current?_       |
| **Document Templates** | Reusable starting structures.                    | _How should this kind of document be laid out?_       |
| **Bulk Import**        | Bringing an existing library in.                 | _How do we get what we already have into the system?_ |
| **Audit Snapshots**    | The fingerprinted PDF of each effective version. | _Can we prove what it said on the day?_               |

## What to set up first

### Step 1 — Decide your document types and numbering

Document types (SOP, Policy, Work Instruction…) supply the **prefix** that forms
the document number — `SOP-001`. Prefixes can include the site and department
codes, giving numbers like `MFG-SOP-001`.

Get this right early. It is the identifier people will quote for years, and it
is the one thing awkward to change once a library exists.

### Step 2 — Build the approval paths

A document is released through a **workflow**. Documents typically use
**Approval Flows** — workflows made purely of sign-off steps.

Decide who approves what, and whether a document becomes effective automatically
on final approval or waits for someone to release it.

→ [Workflows](../automation/workflows.md)

### Step 3 — Create templates for your common document types

A [document template](./document-templates.md) carries the section structure and
boilerplate for a kind of document, so every SOP starts the same shape instead of
depending on who wrote it.

Optional, but it is the difference between a consistent library and a collection.

### Step 4 — Bring in what you already have

If you are migrating from paper, a shared drive or another system, use
[Bulk Import](./bulk-document-import.md) rather than re-creating documents by
hand.

### Step 5 — Author, review, release

From here the day-to-day loop is: draft → collaborate → submit for review →
approve → make effective. Each effective version is captured as a fingerprinted
PDF automatically, and training launches if the document carries any.

→ [Document Control](./document-control.md)

## Getting existing documents in

Two different jobs, often confused:

|            | **Bulk Import**                                   | **Import PDF**                                       |
| ---------- | ------------------------------------------------- | ---------------------------------------------------- |
| Use it for | A whole library, many files at once               | One document you are authoring now                   |
| Produces   | A document per file, numbered and filed           | Editable sections inside a draft you already started |
| Where      | The **Bulk Import** button beside Create Document | The **Import PDF** option on the Content tab         |

Bulk Import is a migration tool: point it at your files, it creates documents
from them in batches. Import PDF is an authoring aid: it extracts structure from
one file so you are editing rather than retyping.

:::tip
Before a large import, run a small batch first and check what the documents look
like — numbering, type, site, and how the content came through. Fixing the
mapping after 400 documents is considerably more work than after four.
:::

## How a document connects to the rest of the system

- **Training** — a document can carry read-and-understood training that launches
  when a version becomes effective, pinned to that version.
- **Log books** — a log book can require training on its linked documents before
  anyone may make an entry.
- **Change control** — a change request can authorise a document revision.
- **Suppliers** — a document can be shared with a supplier's portal users.
- **Search** — document content is searchable, not just titles.

## Related

- [Document Control](./document-control.md) — authoring, review, release
- [Document Templates](./document-templates.md) — reusable structures
- [Bulk Document Import](./bulk-document-import.md) — migrating a library
- [Audit Snapshots](./audit-snapshots.md) — proving what a version said
- [Workflows](../automation/workflows.md) — designing approval paths
