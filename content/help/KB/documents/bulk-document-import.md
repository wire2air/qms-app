---
id: bulk-document-import
title: Bulk Document Import
sidebar_position: 4
description: Bring an existing library of controlled documents into Qability in batches — what each file becomes, which formats are read, and what to check before you start.
keywords:
  [
    bulk import,
    migration,
    document import,
    onboarding,
    legacy documents,
    batch import,
    import queue,
  ]
---

# Bulk Document Import

## Overview

Bulk Import exists for one job: getting the documents you already have into Qability when
you first onboard. You point it at a set of files, it creates one **draft document per
file** with the original attached, and you review and submit them at your own pace.

Nothing is approved, numbered or made effective by the import. Every document lands as a
**draft**, exactly as if someone had created it by hand.

:::note Where to find it
**Bulk Import** appears in the sidebar under Document Control for users who can create
documents. If you can only read documents, you won't see it.
:::

## What each file becomes

One file in gives you one draft document with:

| Part                | Where it comes from                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------- |
| **Title**           | The document's own title if we can read one, otherwise the filename                          |
| **Source Document** | A section holding the original file, attached unchanged                                      |
| **Tags**            | `import`, plus the document's own identifier if it prints one (e.g. `SOP-QA-006`)            |
| **Site**            | The site you chose for the batch                                                              |
| **Department**      | The department named on the document if it matches one of yours, otherwise the batch default |
| **Approval flow**   | From the document template you chose for the batch                                            |

The original file is always attached. Even when nothing else can be read, you still have
the document itself in the system, filed and searchable.

## Supported formats

| Format               | What we read from it                                          |
| -------------------- | ------------------------------------------------------------- |
| **PDF** (`.pdf`)     | Title, and the document number / department from page one     |
| **Word** (`.docx`)   | Document number / department from the header block or table   |
| **Excel** (`.xlsx`, `.xls`) | Document number / department from a cover sheet        |
| **Word 97-2003** (`.doc`)   | Filename only — this old binary format can't be read    |

Anything else — images, plain text, CSV — is skipped, and the import tells you how many
files it left out.

:::tip Convert legacy .doc first
`.doc` files import perfectly well, they just arrive without their document number. If you
have a lot of them, batch-converting to `.docx` before importing means their numbers come
across too.
:::

## Finding the document number

Most controlled documents print their own identifier in a block at the top of page one:

```
Document Number: SOP-QA-006
Department: Quality Assurance
```

Qability reads that block and records the number as a tag, so a document you have always
known as `SOP-QA-006` is still findable by that name after migration — even though
Qability will mint its own number when the draft is first submitted.

Labels vary between organisations. `Document Number`, `Doc No`, `Document ID`,
`Reference`, `SOP Number` and similar are all recognised, in a table or as
`Label: Value` text.

**Nothing is guessed.** If a document doesn't print a number, the field is left empty
rather than filled with something that looks plausible. The same applies to the
department: it is matched only on an exact name, so `QA` will not be filed as
`Quality Assurance`.

## How to run an import

1. **New import** — give the batch a name and choose its Site, Department, Document
   Template and prefix. These apply to every document in the batch.
2. **Add files** — drag them in, or browse. Files are read on your own machine and
   uploaded one at a time, so a large batch takes a while but never floods the connection.
3. **Review the list.** Each file shows what was read from it. This is the moment to catch
   a wrong reading — before any documents exist.
4. **Start import.** Documents are created in the background; you can close the dialog.

You can add files across several sittings. The batch does nothing until you start it.

:::caution Check the first few before importing hundreds
Run a batch of three or four real documents first and look at the extracted numbers. If
your house style uses a label we don't recognise, you'll see it immediately — and it is
far easier to fix before 200 documents exist.
:::

## When something fails

Every file carries its own status and its own reason for failing, so a batch of 200 where
3 fail tells you exactly which 3 and why. **Retry failed** re-runs only those — the files
are already uploaded and read, so it is quick.

Two common causes:

- **The document template has no published approval flow.** A document with no route to
  approval could never leave draft, so the batch stops rather than creating them. Publish
  the template and retry.
- **No site on the batch.** Every document must be filed against a site.

## What Bulk Import does not do

- It does not read your documents into editable sections. The original is attached whole.
  For that, import documents one at a time from **Document Control → New Document**, where
  the content can be restructured into sections you can edit.
- It does not submit anything for approval, assign owners beyond the person importing, or
  set effective dates.
- It does not remove duplicates across batches. Adding the same folder to two different
  batches will import it twice.

## Related

- [Document Control](./document-control.md) — the lifecycle each imported draft then follows
- [Document Templates](./document-templates.md) — where the approval flow comes from
