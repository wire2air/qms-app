---
id: risk-assessments
title: Risk Assessments
sidebar_position: 5
description: Build reusable risk matrix templates, manage hazard categories, and score risks consistently across NC and CAPA workflows.
keywords: [risk assessment, risk matrix, hazard category, likelihood, severity, FMEA]
---

# Risk Assessments

## Overview

Risk Assessments let your team evaluate how serious a risk is using a consistent,
pre-defined scoring method. Instead of every assessor inventing their own scale, you
build **Risk Assessment Templates** once — a matrix of Likelihood and Severity that maps
to named risk levels — and then reuse them wherever a risk needs to be scored, such as
inside Nonconformance (NC) and Corrective and Preventive Action (CAPA) workflow steps.

Each finalized assessment records the likelihood, severity, the computed risk level, and
an optional justification, and tags it with a hazard category so risks can be grouped and
reported. Assessments can capture both an **initial** risk (before action) and a
**residual** risk (after action) for the same record.

## Key concepts

| Concept                  | What it means                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Template                 | A reusable risk matrix: the likelihood levels, severity levels, risk levels, and how they combine into a score.          |
| Likelihood               | How likely the risk is to occur. Each level has a label (e.g. "Likely") and a numeric score.                             |
| Severity                 | How serious the impact would be. Each level has a label (e.g. "Severe") and a numeric score.                             |
| Risk level               | The named, color-coded result a likelihood/severity combination maps to (e.g. Low, Medium, High).                        |
| Detectability (optional) | An extra factor for FMEA-style scoring. When enabled, the score becomes Likelihood × Severity × Detectability (the RPN). |
| Hazard category          | The bucket a risk belongs to, used for grouping and reporting.                                                           |
| Assessment type          | Whether the recorded result is the **Initial** risk or the **Residual** risk.                                            |

### Default risk levels

New templates start with five color-coded risk levels you can rename, recolor, or remove:

| Level   | Typical use                                 |
| ------- | ------------------------------------------- |
| Low     | Minimal concern, no action usually required |
| Low Med | Minor concern, monitor                      |
| Medium  | Moderate concern, review needed             |
| Med Hi  | Elevated concern, action recommended        |
| High    | Serious concern, action required            |

### Hazard categories

Your account starts with seven standard hazard categories that you can rename or extend:
Safety, Quality, Supply Chain, Regulatory, Financial, Operational, and Environmental.

## How to create a risk assessment template

1. Open the **Risk Assessment Templates** page.
2. Select **New Template** in the top-right corner.
3. Enter a **Template Name** (required) and an optional **Description** describing when
   to use this template.
4. Review the **Risk Levels**. Each level has a color swatch and a label. Use **Add Level**
   to add one, the color box to change its color, or the X to remove it.
5. Set up your **Likelihood** rows on the left. Edit each label and its score, use **Add**
   to add a row, or the X to remove one.
6. Set up your **Severity** columns across the top. Edit each label and score, use the plus
   button to add a column, or the X above a column to remove it.
7. In the matrix grid, **click any cell** to assign it a risk level. Each click cycles to
   the next risk level in your list, so keep clicking until the cell shows the level you want.
8. Select **Create Template** to save.

:::tip
The matrix is pre-filled with sensible defaults the first time you open it: rows near the
top are highest likelihood, columns to the right are highest severity. You only need to
adjust the cells you disagree with.
:::

### Turning on detectability (FMEA)

If you score risks using the FMEA Risk Priority Number method:

1. In the template editor, scroll to **Detectability (FMEA 3-factor RPN)**.
2. Switch it on.
3. Edit the detection levels and their scores. A score of 10 means hardest to detect; 1
   means easiest to detect.

When enabled, the risk score is calculated as Likelihood × Severity × Detectability.

## How to edit or delete a template

1. On the **Risk Assessment Templates** page, find the template in the list. You can use
   the search box to filter by name.
2. Open the actions menu at the end of the row.
3. Choose **Edit** to reopen the editor and select **Save Changes**, or **Delete** to
   remove it. Deletion asks you to confirm and cannot be undone.

:::note
The Edit and Delete options only appear if you have permission to update or delete
templates. If you don't see them, contact your administrator.
:::

## How to perform an assessment

You score a risk wherever a risk assessment is requested — typically a step inside an NC
or CAPA workflow:

1. Choose the **hazard category** that best describes the risk.
2. Pick the **Likelihood** level for how likely the risk is to occur.
3. Pick the **Severity** level for how serious the impact would be.
4. If the template uses detectability, pick the **Detectability** level too.
5. The matrix highlights the matching cell and shows the **computed risk level** (for
   example, Medium or High) and its score automatically.
6. Add a **justification** explaining your reasoning.
7. Save the step to record the assessment.

To capture a **residual** risk after corrective action, repeat the scoring on the same
record — the system keeps the initial and residual results as separate entries so you can
show the before-and-after comparison.

:::tip
Because each saved assessment stores the labels, scores, and colors used at the time, your
reports stay accurate even if a template, risk level, or hazard category is later renamed
or reconfigured.
:::
