---
id: forms-and-form-templates
title: Forms & Form Templates
sidebar_position: 2
description: Build, publish, assign, and fill in reusable form templates using the drag-and-drop form builder in Qability QMS.
keywords: [form templates, form builder, field types, publish form, fill in form]
---

# Forms & Form Templates

## Overview

Form Templates are the reusable forms that drive structured data collection in Qability QMS — deviation reports, audit checklists, CAPA records, change requests, and inspection logs. You design a template once in the visual **Form Builder**, set its details, and make it available to your sites. When someone fills it in, the answers are saved as a record tied back to the template.

Open the **Form Templates** area from the navigation to see every template in your company. You can switch between **List View** and **Table View**, and filter by search term, document type, site, or status.

## Key concepts

### Template statuses

A template moves through statuses that control whether it can be used. You set the status from the template detail page (in the **Classification** section) using the **Status** menu.

| Status | What it means |
| --- | --- |
| Draft | The default for a new template. Still being designed; not yet ready for everyday use. |
| Active | Published and ready to be assigned and filled in. |

:::note
Inspection and log forms created with the **New Inspection & Log Form** action skip Draft and start as Active, because they are meant for immediate floor use.
:::

### Field types

The Form Builder palette groups fields into categories. The most common ones:

| Category | Fields |
| --- | --- |
| Input Fields | Text Input, Text Area, Number, Password |
| Selection Fields | Dropdown, Checkbox, Option Group, Checklist |
| Special Fields | Date/Time, File Upload, Photo, Rating, Slider, Toggle, Color Picker, Rich Text |
| Layout Elements | Section, Row, Column, Repeater, Separator, Instructions |
| Widgets | Input Table |
| Tools | Root Cause Analysis, Risk Assessment |

### Common field settings

Select any field on the canvas to open the **Field Settings** panel and adjust:

| Setting | Purpose |
| --- | --- |
| Label | The text the person filling the form sees above the field. |
| Name | A unique identifier for the field (required on every field). |
| Placeholder | Greyed-out example text shown inside the empty field. |
| Hint | A short helper note shown under the field. |
| Required | Forces an answer before the form can be submitted. |
| Read-only / Disabled | Shows the field but prevents editing. |

## How to build a form template

1. In **Form Templates**, click **Create New Template**.
2. On **Step 1 (Define Metadata)**, enter a **Template Name** and a short **Code** (letters, numbers, dashes, or underscores — used to generate record IDs). A checkmark confirms the code is available. Pick a **Document Type**, optionally turn on training requirements, and choose which **Sites** can use the template.
3. Click **Next: Select Template**. On **Step 2**, choose **Blank Form** to start fresh, or pick a ready-made preset such as Deviation Report, Internal Audit Checklist, CAPA Form, or Change Control Request.
4. Click **Design Form** to open the Form Builder.
5. Open the **Components** panel (the menu icon, top left) and add fields by clicking one or dragging it onto the canvas.
6. Click any field to open **Field Settings** and set its label, name, hint, options, and whether it is required.
7. Use **Section**, **Row**, and **Column** layout elements to group and arrange fields, and a **Repeater** for sections that can be added multiple times.
8. Use **Undo** / **Redo** in the header if you need to step back, and the **Preview** (eye) toggle to see the form exactly as users will.

:::tip
Add an **Instructions** block to give the person filling the form guidance, headings, or links to a procedure — it displays text only and does not collect an answer.
:::

## How to publish a form template

1. In the Form Builder, click **Save** in the top-right corner. Every field must have a unique **Name**, and any options, rows, or columns must have values, or the save is blocked with a message telling you what to fix.
2. Go to the template's detail page and find the **Status** menu in the **Classification** section.
3. Change the status from **Draft** to **Active**. The template is now ready to be used.

Changes you make on the detail page — title, description, status, and assigned sites — save automatically.

## How to assign a form to sites

1. Open the template and locate **Assigned Sites** in the **Classification** section.
2. Open the **Sites** menu and select every site that should have access to the template. Remove a site by clearing it from the same menu.

Only the sites you list here will see the template. People at those sites can then fill it in.

## How to fill in a form

1. Open an Active form template that has been shared with you.
2. Work through the fields, completing every one marked as **Required**.
3. For repeating sections, use the **Add** button to create additional entries.
4. Click **Submit**. The answers are saved as a new record with its own record number, and the form clears so the next entry can be started.

To review what has already been submitted, open a template and choose **View records**.

:::warning
The **Preview** inside the Form Builder is for checking layout only — submitting in preview does not save a record. A real record is created only when an Active form is filled in and submitted by a user.
:::
