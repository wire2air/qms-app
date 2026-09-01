---
id: ai-assistant
title: AI Assistant
sidebar_position: 1
description: Use Qability's built-in AI to draft documents, import from PDFs, summarize and compare versions, generate training quizzes, find similar records, and ask questions about any record.
keywords:
  [
    AI,
    assistant,
    draft with AI,
    import PDF,
    AI summary,
    ask AI,
    similar records,
    chat,
    quiz generation,
  ]
---

# AI Assistant

## Overview

Qability includes a built-in **AI Assistant** that helps you work faster without leaving
the system. It can draft a document from a topic, turn a PDF into a structured document,
summarize and compare versions, generate quiz questions for training, surface similar
records, and answer questions about whatever record you're looking at.

AI is there to give you a strong starting point and quick answers — **you always stay in
control**. Every AI suggestion is shown as a preview that you review and edit before it's
saved. Nothing is published on your behalf without your confirmation.

:::note
AI features are enabled per workspace. If you don't see the AI buttons described below,
your administrator hasn't turned on AI for your company, or your role doesn't include the
**AI** permission. See [AI Access & Usage](./ai-access-and-usage.md).
:::

## What the AI Assistant can do

| Feature                     | Where you'll see it                                       | What it does                                                                                  |
| --------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Draft with AI**           | Creating or editing a document                            | Generates a starting outline and sections from a short topic prompt.                          |
| **Import PDF**              | Creating a document                                       | Reads an uploaded PDF and structures it into editable document sections.                      |
| **AI Summary**              | A document version                                        | Produces a short summary — the gist, key points, intended audience, and any compliance notes. |
| **Explain changes**         | Between two document versions                             | Describes in plain language what changed from one version to the next.                        |
| **Generate quiz questions** | A document used for training                              | Drafts assessment questions based on the document's content.                                  |
| **Ask AI**                  | The header of a record (such as a CAPA or nonconformance) | Opens a chat focused on that record so you can ask questions about it.                        |
| **Similar records**         | Records like documents, NCs, and CAPAs                    | Finds existing records that look related, so you can spot duplicates and precedents.          |
| **AI chat**                 | The floating chat panel                                   | Answers questions, looks up records, and finds related items across your workspace.           |

## How to draft a document with AI

1. Start creating a new document, or open an existing one to edit.
2. On the **Content** tab, choose **Draft with AI**.
3. Describe what the document should cover in a sentence or two.
4. Review the generated outline and sections in the preview.
5. Edit anything you want, then apply it. The result is a normal draft — it still goes
   through your usual review and approval before becoming effective.

## How to import a document from a PDF

1. Start creating a new document and choose **Import PDF**.
2. Upload the PDF.
3. The AI extracts the content and proposes a structured set of sections.
4. Review and adjust the preview, then apply it to create your draft.

## The AI chat panel

The chat panel is the assistant you can open anywhere, and it works two ways.

**Scoped to a record.** Records that show an **Ask AI** button open a chat with
that record already in context, so you can ask "summarise the investigation so
far" or "what's the proposed corrective action?" without explaining which record
you mean.

**Open-ended.** Opened on its own, it can search across the workspace — find
records matching a description, list what is open, surface similar records, and
report on your metrics.

### What it can do

| It can                   | Example                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| Find and list records    | "Show me open CAPAs at the Leeds site"                                       |
| Summarise a record       | "Summarise this NC's investigation"                                          |
| Find similar records     | "Has anything like this happened before?"                                    |
| Answer from your metrics | "How many NCs closed last quarter?"                                          |
| Search the audit trail   | "Who changed this document's status?"                                        |
| Draft content            | Outlines, questions, narratives — in the places listed on each module's page |

### What it cannot do

**It reads and proposes; it does not act.** The assistant cannot create, edit,
approve, close, assign or delete anything. There is no phrasing that will make it
change a record.

Where AI produces content — a document outline, a workflow draft, a proposed
field list — it hands you something to review. **You** apply it, and the normal
permission checks run at that point, exactly as if you had typed it.

It also cannot reach modules you have no read access to.

:::warning AI output is a draft, not a record
Always review AI-generated content for accuracy and completeness before relying
on it — especially where quality, safety or regulatory compliance is involved.

The assistant can be confidently wrong, and it does not know what it does not
know. Treat everything it produces the way you would treat a competent
colleague's first draft: useful, and not yet checked.
:::

:::tip
Specific prompts work far better than vague ones. "Draft an SOP for cleaning the
Class 100,000 cleanroom, including PPE and frequency" produces something usable;
"cleaning SOP" does not.
:::

## Related

- [AI Access & Usage](./ai-access-and-usage.md) — enabling AI, the usage dashboard, and
  personal access tokens.
- [Document Control](../documents/document-control.md) — where drafting and PDF import live.
- [Training](../training/training.md) — where AI-generated quiz questions are used.
