---
id: audit-snapshots
title: Audit Snapshots
sidebar_position: 3
description: Understand the immutable, fingerprinted PDF copy Qability captures of every document version the moment it becomes Effective — your evidence for ISO 13485 and 21 CFR Part 11 audits.
keywords: [audit snapshot, document snapshot, effective copy, Part 11, ISO 13485, immutable record, SHA-256, controlled copy]
---

# Audit Snapshots

## Overview

Every time a document version becomes **Effective**, Qability automatically captures an
**Audit Snapshot** — a permanent, unchangeable PDF copy of exactly what that version said
on the day it went live. The snapshot is fingerprinted with a unique code (a SHA-256 hash)
so anyone can later prove the file hasn't been altered.

This exists for one reason: **audit-grade evidence**. When a regulator or auditor asks
"what did SOP-014 v3.0 actually say on the day it became effective?", you can produce the
exact document — content, approvals, and history — and demonstrate it's authentic. It
supports ISO 13485 and FDA 21 CFR Part 11 expectations for controlled, tamper-evident
records.

You don't create or manage snapshots yourself. The system generates them automatically.
Your job is to know where to find one and how to verify it.

## Key concepts

| Concept | What it means |
| --- | --- |
| **Audit Snapshot** | The frozen PDF copy of a document version, captured when it became Effective. |
| **Fingerprint (SHA-256)** | A unique code calculated from the file's contents. If even one character of the PDF changed, the fingerprint would no longer match. |
| **Generated date** | The moment the snapshot was captured. |
| **Immutable** | The snapshot is never edited. Editing a document creates a *new* version with its *own* snapshot when it goes effective; older snapshots are kept untouched. |

## What a snapshot contains

A snapshot is self-contained — it captures the full picture as of the effective date:

- A **cover page** identifying the document and version.
- The complete **section content** of that version.
- The **Approvals & Signatures** record — who approved it and when.
- A **recent audit history** of the version.
- Any **attachments** linked to the document, combined into the same PDF (supported file
  types are merged in; others are listed on a reference page).

## How to find a snapshot

1. Open the document.
2. In the right-hand panel, look for the **Audit Snapshot** block.
3. It shows a **download link**, the **generated date**, and the start of the snapshot's
   **fingerprint**.
4. Select the download link to save the PDF.

:::note
A snapshot appears only after a version has reached **Effective**. Draft and in-review
versions don't have one yet — they may still change, so there's nothing immutable to
capture.
:::

## How to verify a snapshot is authentic

If you ever need to prove a snapshot hasn't been tampered with:

1. Download the snapshot PDF from the document's **Audit Snapshot** block.
2. Calculate the file's SHA-256 fingerprint with any standard tool. For example, on a Mac
   or Linux machine:

   ```bash
   shasum -a 256 snapshot.pdf
   ```

3. Compare the result to the fingerprint Qability recorded for that snapshot. A match
   confirms the file is byte-for-byte identical to the original; a mismatch means you have
   the wrong file or a modified copy.

:::tip
Because each snapshot is permanently retained, superseding a document with a newer version
never erases the old evidence. If an audit references an earlier version, its snapshot is
still available, with its original fingerprint intact.
:::

:::warning
A snapshot embeds the document's images and attachments directly in the PDF, so anyone you
share the file with receives that content too. Share snapshots only with people authorized
to see the underlying document.
:::
