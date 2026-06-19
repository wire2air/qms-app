---
id: item-master
title: Item Master
sidebar_position: 2
description: Create and manage the central catalog of items your organization makes, buys, or uses, including their SKUs, families, types, and lifecycle statuses.
keywords: [item master, products, SKU, product type, product status, catalog]
---

# Item Master

## Overview

The Item Master is your organization's central catalog of items — the raw materials, components, intermediates, and finished goods you make, buy, or use. Each item record holds a name, a unique SKU, a family, a type, and a lifecycle status, so everyone works from one consistent, up-to-date list.

Keeping the Item Master accurate matters because other parts of the system rely on these records. A clean, well-organized catalog makes it easy to find items, track which ones are active, and retire those you no longer use.

You'll find the Item Master under **Suppliers & Items**. The page header shows a package icon and the title "Item Master."

## Key concepts

### Item fields

Each item in the catalog has the following fields. Fields marked required must be filled in before you can save.

| Field | Required | What it is |
| --- | --- | --- |
| Product Name | Yes | The item's display name, for example "Stainless Steel Bolt." |
| SKU | Yes | A unique code identifying the item, for example "BOLT-SS-M8." No two items can share the same SKU. |
| Product Family | Yes | A grouping label, for example "Fasteners," used to organize related items. |
| Product Type | Yes | The category that describes what kind of item this is (see below). |
| Status | Yes | The item's current lifecycle stage (see below). Defaults to Active. |
| Description | No | A short plain-text summary, up to 1,000 characters. |

### Item statuses

The status shows where an item sits in its lifecycle. Each status appears as a colored badge in the list.

| Status | Meaning |
| --- | --- |
| Active | The item is in use and available. |
| Under Review | The item is being evaluated or updated. |
| Obsolete | The item is no longer current but is kept for reference. |
| Discontinued | The item has been retired and should no longer be used. |

### Product types

Product types are categories you define for your organization, such as raw material, component, intermediate, or finished good. You pick a type from the **Product Type** menu when adding or editing an item. Types are shared across the catalog so everyone classifies items the same way.

## How to find an item

1. Open the Item Master page under **Suppliers & Items**.
2. Use the **Search** box at the top to search by item name or SKU.
3. Narrow the list further with the **Product Type** and **Status** filters next to the search box.
4. The table updates automatically as you type or change a filter. Items are sorted with the most recently created first.

## How to add a new item

1. On the Item Master page, select **Add New Item** in the top-right of the header.
2. In the **Create New Product** dialog, fill in the fields:
   - **Product Name** — the item's name.
   - **SKU** — a unique code. As you type, a green check confirms the SKU is available; a red mark means it's already in use and you'll need to choose another.
   - **Product Family** — the grouping label.
   - **Product Type** — choose a type from the menu.
   - **Status** — defaults to Active; change it if needed.
   - **Description** — optional summary.
3. Select **Create Product** to save. The new item appears in the list right away.

:::note
The **Add New Item** button only appears if your role includes permission to create items. If you don't see it, contact your administrator.
:::

## How to edit an item

1. Find the item in the list.
2. Select the actions menu at the end of the item's row and choose **Edit**.
3. Update any fields in the **Edit Product** dialog.
4. Select **Save Changes**.

## How to delete an item

1. Find the item in the list.
2. Select the actions menu at the end of the item's row and choose **Delete**.
3. Confirm in the **Delete Product** dialog by selecting **Delete**.

:::warning
Deleting an item is permanent and cannot be undone. If you simply want to stop using an item but keep its record, set its status to Obsolete or Discontinued instead of deleting it.
:::

## How to import and export items

You can move many items at once using CSV files.

**Export**

1. On the Item Master page, select **Export CSV** above the table.
2. A `products.csv` file downloads with the columns Name, SKU, Family, Product Type, Status, and Created.

**Import**

1. Select **Import CSV** above the table.
2. In the **Import Products from CSV** dialog, select the drop zone to choose a `.csv` file. The file must match the exported format with the columns NAME, SKU, FAMILY, PRODUCT TYPE, and STATUS.
3. Review the row count and the preview of the first five rows.
4. Select **Import** to add the items. You'll see a confirmation of how many imported successfully, and a notice if any rows failed.

:::tip
Export your current catalog first to get a correctly formatted template, then fill in your new rows before importing.
:::

## Tips

- SKUs must be unique. If a save is blocked, check the SKU field for an "already in use" message.
- Use Product Family and Product Type consistently so filters and searches stay reliable.
- Prefer changing an item's status over deleting it when you want to keep a historical record.
