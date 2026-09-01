---
id: root-cause-analysis
title: Root Cause Analysis
sidebar_position: 4
description: Set up reusable Root Cause Analysis templates and use Fishbone, 5 Whys, Is/Is Not, and Why Tree methods to record root causes inside nonconformances and CAPAs.
keywords: [root cause analysis, RCA template, fishbone, 5 whys, nonconformance, CAPA]
---

# Root Cause Analysis

## Overview

Root Cause Analysis (RCA) helps your team move past symptoms and identify the underlying reasons a problem occurred. In Qability, an admin builds reusable **RCA templates** once, and investigators then apply them inside a nonconformance (NC) or corrective action (CAPA) workflow. Each template comes with four ready-to-use analysis methods, so the investigator can pick the approach that best fits the problem in front of them and end up with one clear primary root cause plus any contributing factors.

## Key concepts

### Analysis methods

Every RCA template makes all four methods available. The investigator chooses one when they start the analysis.

| Method      | What it does                                                                                                           | What the admin sets up                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Fishbone    | Sorts possible causes into branch categories (People, Machine, Method, Material, Measurement, Environment by default). | The branch names. Investigators add the causes.                              |
| 5 Whys      | Asks "why" repeatedly until the underlying cause surfaces.                                                             | A problem prompt and the list of "why" prompts.                              |
| Is / Is Not | Compares what the problem is versus what it is not across several dimensions.                                          | The dimension rows (What, Where, When, Who, How Much / How Many by default). |
| Why Tree    | Builds a branching causal tree from the problem down to root causes.                                                   | A problem prompt. The tree is built live during the investigation.           |

### Root cause records

When the analysis is finalized, each identified cause is saved as a row.

| Field        | Meaning                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| Primary      | The single canonical root cause for the investigation. Every analysis has exactly one and it cannot be removed. |
| Contributing | Optional additional factors that played a part. Add or remove as many as needed.                                |
| Category     | An optional label (such as People or Machine) used to group causes for reporting.                               |
| Description  | The written explanation of the cause.                                                                           |
| Method used  | The method that produced the cause, recorded automatically.                                                     |

:::note
Categories and their labels are frozen onto each root cause when you finalize the analysis, so renaming or removing a category later will not change past records.
:::

## How to create an RCA template

Templates are managed on the **RCA Templates** page (admins with the right permission).

1. Open **RCA Templates** from the menu.
2. Click **New Template**.
3. Enter a **Template Name** (required) and an optional **Description** describing when to use it.
4. Configure each method using the tabs:
   - **Fishbone** – edit the branch names directly on the diagram; add or remove branches as needed.
   - **5 Whys** – set the **Problem Prompt** and add or edit the numbered **Why Prompts** (at least five recommended).
   - **Is / Is Not** – add, rename, or remove the **Dimensions** that appear as rows in the comparison table.
   - **Why Tree** – set the **Problem Prompt**; the causal tree itself is built later by the investigator.
5. Click **Create Template**.

You only need to configure the methods your team will actually use, but all four stay available to investigators.

## How to edit or delete a template

1. On the **RCA Templates** page, use the search box to find the template by name.
2. Open the row's menu (the actions button at the end of the row).
3. Choose **Edit** to change the name, description, or method setup, then click **Save Changes**.
4. Choose **Delete** to remove it, then confirm. Deleting cannot be undone.

## How to record root causes in an NC or CAPA

When a nonconformance or CAPA workflow includes an RCA step, the linked template appears directly in that step.

1. Open the workflow step that contains the Root Cause Analysis field.
2. Under **Select Analysis Method**, choose Fishbone, 5 Whys, Is / Is Not, or Why Tree. You can switch later with **Change method** before finalizing.
3. Work through the method:
   - **Fishbone** – add causes under each branch. The primary root cause description is auto-filled from your causes as you go.
   - **5 Whys** – answer each "why" prompt in turn.
   - **Is / Is Not** – fill the is and is-not columns for each dimension and note probable causes.
   - **Why Tree** – add a "why" for the problem, then drill down until you reach root causes.
4. In the **Root Causes** panel, refine the **Primary** root cause description and optionally pick a category for it.
5. Click **+ Add contributing cause** to record additional factors. Give each one a description and, optionally, a category. Remove any contributing row with the ✕ button.
6. When the investigation is complete, click **Finalize Analysis**.

After finalizing, the analysis is marked **Completed** with a timestamp, the fields become read-only, and the recorded causes are available for reporting across your records.

:::tip
If a step shows "No RCA template linked to this field," contact your administrator to attach a template to that workflow step.
:::

## Tips

- Build one template per problem type (for example, equipment failure or process error) so investigators always start from a sensible structure.
- Use categories consistently to make root-cause trends easier to spot in reports.
- Confirm the **Primary** root cause is the true underlying cause, not a symptom, before you finalize.

## AI in this module

AI can **propose causes** and help articulate the root-cause statement from the
evidence gathered. The analyst applies what is useful; the problem statement
stays yours.

The assistant reads; it does not act. It can find, summarise and draft — it
cannot create, edit, approve or close a record. Anything it produces is a
starting point you review and apply yourself, and the normal permission checks
run when you save it.

It can only reach modules you already have read access to.

→ [AI Assistant](../ai/ai-assistant.md) · [AI Access and Usage](../ai/ai-access-and-usage.md)
