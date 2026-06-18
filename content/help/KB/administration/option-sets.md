---
id: option-sets
title: Option Sets & Lookups
sidebar_position: 5
description: Create and manage reusable lists of dropdown choices that power forms across your Qability workspace.
keywords: [option sets, lookups, dropdown values, picklists, form options, administration]
---

# Option Sets & Lookups

## Overview

An **option set** (sometimes called a lookup) is a reusable list of choices that you build once and use in many places. For example, you might create a "Priority Levels" set with the values **Low**, **Medium**, and **High**, then use that same set wherever a form needs a priority field.

Option sets keep your choices consistent. Instead of retyping the same list of values every time you build a form, you point the form's dropdown, radio group, or checklist at an existing option set. When you update the set later, every form that uses it stays in step with the new values.

You manage option sets from the **Option Sets** page in the Administration area.

## Key concepts

Each option set is made up of a few simple fields:

| Field | What it is |
| --- | --- |
| Name | The label you give the set, such as "Priority Levels" or "Departments". This is how you find and recognise it in lists. |
| Description | An optional note explaining what the set is for. Helpful when several admins share a workspace. |
| Options | The individual choices in the set, shown as a numbered list. These are the values people will pick from in a form. |
| Created | The date the set was added. Shown on the list so you can sort by newest. |

On the Option Sets list, each row also shows an **Options** count badge so you can see at a glance how many values a set contains.

:::note
What you can do depends on your permissions. You may be able to view option sets but not create, edit, or delete them. If a button described below is missing, your account does not have that permission.
:::

## How to find your option sets

1. Open the **Option Sets** page from the Administration area.
2. The page lists every option set in your workspace, newest first.
3. Use the **Search option sets...** box at the top to filter by name or description. The list updates as you type.
4. Click any column header such as **Name** or **Created** to sort the list.

## How to create an option set

1. On the Option Sets page, click **Create Option Set** in the top-right corner.
2. In the dialog, enter a **Name**. This field is required.
3. Optionally add a **Description** to explain what the options are for.
4. Click **Create Set**. The new set is saved and appears in the list.

:::tip
Creating the set only sets up its name and description. You add the actual choices afterwards on the set's detail page (see below).
:::

## How to add, edit, and remove choices

Open a set to manage its list of values.

1. On the Option Sets page, click a row to open its detail page. You'll land on the **Edit Option Set** screen.
2. In the **Options** card, click **Add Option**. A new blank entry appears, ready to type in.
3. Enter the value (for example, "High") and press **Enter** or click elsewhere to confirm it.
4. To change an existing value, click it, edit the text, then press **Enter** or click away.
5. To remove a value, hover over its row and click the trash icon on the right.
6. Repeat to build out your full list. Each option is numbered in order.

:::warning
Name and description changes save automatically, but **changes to the options list are saved for you only once every value has text in it**. If any option is left blank, the list won't save. Make sure to fill in or remove empty entries before leaving the page.
:::

## How to rename or update details

You can edit a set's name and description in two ways:

- On the **Edit Option Set** detail page, change the **Name** or **Description** fields in the Settings card. These save automatically as you type.
- From the Option Sets list, you can also reopen the create dialog to update the name and description, then click **Update**.

## How to delete an option set

1. Open the set's detail page and click **Delete** in the top-right corner, or use the row menu (the three-dot menu) on the Option Sets list and choose **Delete**.
2. Confirm the deletion when prompted.

:::warning
Deleting an option set cannot be undone. Before removing a set, check that it isn't being used by any forms, as those choices will no longer be available.
:::

## Where option sets appear

Once a set exists, you can attach it to fields when building forms and templates. Anywhere a form has a **dropdown**, **radio group**, or **checklist** field, you can point it at an option set instead of typing the choices by hand. People filling in the form then pick from the values you defined.

Because the values live in one place, updating an option set updates the choices everywhere that set is used, keeping your forms consistent across the workspace.
