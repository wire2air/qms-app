---
id: suppliers
title: Suppliers
sidebar_position: 1
description: Onboard suppliers, manage contacts and documents, give suppliers portal access, and request documents through asset requests.
keywords: [suppliers, supplier portal, asset requests, document requests, supplier contacts, onboarding]
---

# Suppliers

## Overview

The Suppliers area is where you keep a record of every manufacturing or service partner your company works with. From a supplier's record you can track their basic details and risk level, store the documents you hold on file for them, invite their staff into a read-only supplier portal, and formally request documents (such as certificates and licenses) that you need them to send back.

You reach this area from the **Suppliers** menu. The main list shows a count of total suppliers and a filter toolbar so you can search by name or code and narrow by status, category, or risk level.

## Key concepts

### Supplier statuses

A supplier's status appears as a badge next to its name. New suppliers start as **Pending**; your administrator can configure additional statuses for your company.

### Categories and risk levels

| Field | Available values |
| --- | --- |
| Category | Raw Materials, Component, Service, Software |
| Risk Level | Low, Medium, High |

### Asset request statuses

When you request documents, each request and each document line tracks its own progress.

| Status | Where it shows | Meaning |
| --- | --- | --- |
| Pending | Request / line | Requested, waiting for the supplier to upload |
| Overdue | Request | Past its due date and not yet received |
| Received | Request / line | The supplier has uploaded the file |
| Skipped | Line | You marked that line as not applicable |
| Accepted | Request | You reviewed the file and accepted it |
| Rejected | Request | You reviewed the file and rejected it with a reason |

:::note
**Contacts** are notification targets (email and phone) only. **Supplier users** are real login identities who can access the supplier portal. They are managed separately.
:::

## How to add a supplier

1. From the Suppliers list, click **Create New Supplier**.
2. On the **New Supplier Onboarding** page, enter the **Supplier Name** and a **Supplier Code**. The code is checked automatically — wait for the **Code available** confirmation. If you type a name first, a suggested code may be filled in for you.
3. Choose a **Category** (required).
4. Optionally add the **Registered Address**, assign one or more **Sites**, set a **Risk Level**, and attach **Certificates** and **Licenses** under Compliance Documents.
5. Add at least one contact (see below) and mark one as **Primary**.
6. Click **Submit for Onboarding**. The supplier is created with a **Pending** status and appears in the list.

To open an existing supplier, click its row in the list. To delete one, use the delete action on the row and confirm.

## How to add contacts

Contacts capture the email and phone number you use to reach the supplier.

1. While creating a supplier (in the **Contact Details** card) or on the supplier record, click **Add Contact**.
2. Enter an email and/or phone number.
3. Use the **Primary** toggle to mark the main contact. At least one contact with an email or phone is required, and exactly one is primary.
4. To remove a contact, click the **X** beside it. If you remove the primary contact, the next one becomes primary automatically.

## How to manage supplier documents

The **Documents** tab on a supplier record lists every file you hold for that supplier. A badge shows each file's source: **via request** (uploaded by the supplier through the portal) or **ad-hoc** (attached by you).

1. Open the supplier and select the **Documents** tab.
2. Click **Upload document**.
3. Enter a **Title** (required), an optional description, choose a document type, and select a file.
4. Click **Upload**.

Use the open icon to view a file in a new tab, or the trash icon to remove it.

## How to share controlled documents

:::note Sharing goes to portal users, not to a public link
Documents used to be shared as a public token URL sent to the supplier's primary
contact — anyone holding the link could open it. That is retired.

Sharing now grants access to named **supplier portal users**, who sign in to see
it. Access is attributable, and it can be withdrawn.
:::

On the **Shared Documents** tab you can share an internal controlled document with the supplier so it shows up in their portal.

1. Open the supplier and select **Shared Documents**.
2. Click to share, choose a document from the list (only the latest versions appear), and confirm.

## How to give suppliers portal access

Invite people at the supplier so they can log in to the supplier portal.

1. Open the supplier and select the **Users** tab.
2. Click **Invite user**.
3. Enter the **First name** and **Email** (required), plus an optional last name and job title.
4. Click **Send invitation**. They receive an email to set a password. Their status shows as **Invited** until they accept, then **Active**.

You can cancel an invitation that hasn't been accepted yet using the **X** on the user's row.

When a supplier user logs in, their portal shows a welcome dashboard with anything explicitly shared with them — documents, CAPAs, and non-conformances — plus their document requests.

## Qualifying and scoring suppliers

Beyond holding a supplier's documents, you can **qualify** them: run a structured
assessment, score it, and end up with a rating you can act on.

**How it is built.** Qualification is a form-based module you design, linked to
suppliers. In the form builder you give answers **scores** and fields **weights**;
on the module's **Scoring** page you define the **rating bands** that turn a
0–100 total into a rating and an outcome — Approved, Conditional, Rejected, or
whatever your process calls them.

**Why bands rather than a raw number.** A score of 72 means nothing on its own,
and everyone reads it differently. A band converts it into a decision, and that
decision is what automation and approval steps can react to — so "below 60 routes
to the quality manager" becomes a rule rather than a habit.

**Re-qualification.** Each cycle creates a **new** assessment record rather than
overwriting the last one. The supplier's **Evaluations** tab lists every one,
newest first, with its status, sealed rating and next-review date — so you can
show an auditor not just the current rating but how it has moved.

Start one from the supplier's Evaluations tab, which opens the assessment with
that supplier already in context.

:::tip
Weight the questions that actually predict problems for you, not the ones that
are easiest to answer. A questionnaire where every question counts the same
produces ratings that cluster in the middle and separate nobody.
:::

## How to create document (asset) requests

Use asset requests to formally ask a supplier for documents and track them to completion.

1. Open the supplier and select the **Asset Requests** tab.
2. Click **New Request**.
3. Enter a **Title** and tick at least one **Supplier Contact** to notify.
4. Choose the **Documents to request** from the master list (items already on file are greyed out and marked **already on file**). Add **ad-hoc items** for one-off documents not in the list.
5. Optionally set a **Due Date** and **Expiry Date** and a description shown to the supplier.
6. Click **Send**. The supplier is emailed and each requested document becomes a tracked line.

On the supplier's side, the **Document Requests** page lists every line under **Pending**, **Already shared**, and **Not applicable**. They click **Upload** to submit a file, or **Replace** to swap a file they already sent.

## How to review submitted documents

When a request shows **Received**, review what the supplier sent.

1. On the **Asset Requests** tab, click the review (star) icon on the request.
2. Open the submitted file to inspect it.
3. Click **Accept**, or **Reject** and enter a reason.
4. Confirm. The supplier is notified, and the request moves to **Accepted** or **Rejected**.

:::tip
Expand any request row to see its individual document lines and their progress (for example, *2 / 3 received*). The tab header shows how many requests are still pending or overdue at a glance.
:::

## AI in this module

Where a qualification form is scored, AI can **draft the narrative** that
explains the rating — a summary of what drove the score, for you to check
against what the assessment actually says.

The assistant reads; it does not act. It can find, summarise and draft — it
cannot create, edit, approve or close a record. Anything it produces is a
starting point you review and apply yourself, and the normal permission checks
run when you save it.

It can only reach modules you already have read access to.

→ [AI Assistant](../ai/ai-assistant.md) · [AI Access and Usage](../ai/ai-access-and-usage.md)
