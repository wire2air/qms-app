---
id: company-settings
title: Company Settings
sidebar_position: 8
description: Manage your organization's profile, branding, regional preferences, module defaults, print customization, and shared lookup lists from one place.
keywords: [company settings, branding, defaults, lookups, regional settings, administration]
---

# Company Settings

## Overview

Company Settings is where administrators manage how your organization works across the whole Qability QMS app. From a single screen you can update your company name and logos, set regional preferences, define the defaults that new workflows and document templates inherit, customize how documents print, and maintain shared lookup lists used by the Nonconformance module.

Changes save automatically as you type or toggle, so there is no separate **Save** button on most cards. A small status indicator at the top-right of each card shows when changes are being saved.

:::note
Some settings affect every user in your company. Changes can take up to 5 minutes to appear across all active user sessions.
:::

## Key concepts

Company Settings is organized into four tabs along the top of the page.

| Tab | What you manage there |
| --- | --- |
| **General** | Company name and code, light/dark logos, regional preferences (time zone, first day of week), and read-only system information. |
| **Defaults** | The default values new approval workflows, document templates, and asset requests inherit across the app's modules. |
| **Print** | Branding applied to printed documents — logo override, mailing address, footer notice, and accent color. |
| **Lookups** | Shared master lists used by the Nonconformance module: NC Disposition Types and NC Issue Types. |

:::tip
Some areas of the app link straight to a specific tab. For example, an NC Dispositions link opens Company Settings with the **Lookups** tab already selected.
:::

## How to update general company information

1. Open **Company Settings** and select the **General** tab.
2. In the **General Information** card, edit the **Company Name** field. Your change saves automatically.
3. The **Company Code** is system-generated and read-only. It identifies your company throughout the app and cannot be edited here.

## How to set branding (logos)

Your company can have separate logos for light and dark display modes.

1. On the **General** tab, find the **Branding** card.
2. Under **Light Mode Logo**, click **Upload Light Icon**, then crop and confirm your image. This logo is used on light backgrounds.
3. Under **Dark Mode Logo**, click **Upload Dark Icon** and do the same. This logo is used on dark backgrounds.
4. To remove a logo, reopen the upload dialog and choose the delete option.

A square image around 512×512px (PNG, SVG, or JPG) works best.

## How to adjust regional settings

1. On the **General** tab, open the **Regional Settings** card.
2. Choose a **Default Time Zone** — used for timestamps and scheduling.
3. Choose a **First Day of Week** — used for calendar views.

The **System Information** card on the same tab shows your subscription level, account status, and the dates your company was created and last updated. These values are read-only.

## How to set module defaults

The **Defaults** tab controls the starting values that new records inherit across the app's modules, so you don't have to set them each time.

1. Open the **Defaults** tab.
2. Under **Approval Workflow Defaults**, set the **Default SLA (days)**, choose a **Default Approval Rule** (**ALL** — every approver must approve, or **ANY** — one approver is enough), and use the switches to require a signature or comment by default on workflow steps.
3. Under **Document Template Defaults**, set the **Periodic Review (months)**, **Review Limit (days)**, and **Approval Limit (days)**, and toggle whether new templates include training, require retraining on new versions, and become effective automatically on approval.
4. Under **Asset Request Defaults**, set **Default Due In (days)** to control the due date applied to new asset requests.

Defaults apply only to new records — existing workflows, templates, and requests keep their current values.

## How to customize print settings

1. Open the **Print** tab.
2. **Logo:** optionally enter a **Logo URL (override)**. If left blank, printouts fall back to your company logo from the General tab, then to a placeholder. Use the reset button to clear an override.
3. **Mailing Address:** enter the address printed beneath your company name in the document header.
4. **Page Footer:** enter a **Footer notice**, or leave it blank to use the default wording. Pick an **Accent color** (used on header dividers, section headings, and the document title), or reset it to the default.
5. To preview, open any document and click **Print**.

## How to manage lookups (NC dispositions and issue types)

The **Lookups** tab holds shared lists used when working with nonconformances. These lists are specific to your company.

| Lookup list | Purpose |
| --- | --- |
| **NC Disposition Types** | The disposition options reviewers choose when closing out a nonconformance. |
| **NC Issue Types** | The categories used to classify a nonconformance. |

To add or edit an entry:

1. Open the **Lookups** tab.
2. Click **Add Disposition** (or **Add** on the issue types card). Enter a **Name**; a **Code** is generated automatically from the name. Click **Edit** beside the code if you need to override it.
3. For dispositions, turn on **Tracks Cost** if choosing that disposition should require a Cost of NC entry (for example Scrap, Rework, Repair, or Return-to-Supplier).
4. Set an optional **Description** and a **Display Order**, then click **Add** or **Save**.
5. To change an existing entry, click the pencil (edit) icon. To deactivate one, click the trash icon — existing nonconformances keep their reference, but the option no longer appears in new pickers.
6. Deactivated entries appear in a collapsible **Deactivated** section, where you can **Restore** them.

:::warning
Only the company owner can add, edit, deactivate, or restore lookup entries. Other users can view the lists but will see a read-only notice. A lookup's **Code** is a permanent identifier and cannot be changed after it is created.
:::
