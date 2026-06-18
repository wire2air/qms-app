---
id: equipment
title: Equipment
sidebar_position: 5
description: Register and track instruments, machines, and other equipment, set calibration and maintenance due dates, and manage service status.
keywords: [equipment, calibration, preventive maintenance, asset tag, service status, log books]
---

# Equipment

## Overview

The **Equipment** page is your central catalog of the instruments, machines, vehicles, sensors, and other equipment your organization tracks in the QMS. Each record holds identifying details (name, code, serial number), where the equipment lives, its current service status, and optional dates for the next calibration and preventive maintenance (PM).

Keeping equipment up to date matters because **log books reference these records** for calibration checks, preventive maintenance, and equipment-specific routines. A well-maintained catalog also lets the page flag items that are due soon or overdue, so nothing quietly slips past its calibration or PM date.

You reach the page from the Equipment area in the navigation. From there you can search, filter, add new equipment, and (with the right permission) open a record to edit it.

## Key concepts

### Statuses

Every piece of equipment has a service status. The list page defaults to showing **In service** equipment so retired items don't crowd the view.

| Status | What it means |
| --- | --- |
| In service | Active and available for use. The default for new equipment. |
| Out of service | Temporarily unavailable (for example, awaiting repair or calibration). |
| Retired | Permanently taken out of use. When you set this status, the **Retired** date is stamped automatically if you haven't set one. |

### Categories

Categories help you group and filter the catalog. They are optional.

| Category | Typical use |
| --- | --- |
| Instrument | Measuring or test instruments |
| Machine | Production or process machinery |
| Vehicle | Cars, forklifts, and other vehicles |
| Sensor | Standalone sensors and probes |
| Other | Anything that doesn't fit the above |

### Key fields

| Field | Notes |
| --- | --- |
| Name | Required. A friendly label, e.g. "Freezer #3". |
| Code | Required, unique. The asset tag used in audit reports and log book references. Locked after creation. |
| Serial number | Optional. Searchable alongside name and code. |
| Manufacturer / Model | Optional identifying details. |
| Site | Required. The location where the equipment operates. |
| Department | Optional. The owning department. |
| Location | Optional free text, e.g. "Rack 3, Bay B". |
| Installed / Retired | Optional lifecycle dates. |
| Next calibration due | Optional. Used to flag due-soon and overdue items. |
| Next PM due | Optional. Used to flag due-soon and overdue preventive maintenance. |
| Notes / Description | Optional context. |

## How to register new equipment

You need the **create equipment** permission to add records.

1. Open the Equipment page.
2. Select **New Equipment** in the header (or **Add the first one** if the catalog is empty).
3. Enter a **Name** and a **Code**. The code must be unique; a green check confirms it's available, and a red mark means it's already in use. Use letters, numbers, hyphens, and underscores.
4. Choose a **Category** and a **Status** (new equipment defaults to In service).
5. Select the **Site**. This is required.
6. Optionally fill in Description, Manufacturer, Model, Serial number, Department, and a free-text Location.
7. Optionally set lifecycle and maintenance dates: Installed, Retired, Next calibration due, and Next PM due.
8. Add any internal **Notes**.
9. Select **Add equipment**. The new record appears in the list right away.

:::note
The **Code** can't be changed after you create the record. This keeps audit references and existing log book entries pointing at the same equipment. Choose it carefully.
:::

## How to set calibration and maintenance dates

Calibration and PM tracking is driven by the two date fields on each record.

1. Open a record (or add a new one) and find **Next calibration due** and **Next PM due**.
2. Pick the date the next calibration or preventive maintenance is required.
3. Save the record.

Once set, the list highlights these dates so you can scan for what needs attention:

- A date coming up **within 30 days** is shown in amber as a due-soon nudge.
- A date that has **already passed** is shown in red with an alert icon to mark it overdue.

:::tip
Populating the calibration and PM due dates is what turns the catalog into a working maintenance overview. Equipment without dates simply shows a dash in those columns and won't be flagged.
:::

## How to update status and edit a record

You need the **update equipment** permission to edit.

1. On the Equipment page, select the row for the item you want to change.
2. The Edit Equipment window opens with the current details filled in.
3. Update any field — including the **Status** — or change the calibration / PM dates.
4. Select **Save changes**.

When you set the status to **Retired**, the Retired date is filled in automatically if you left it blank. You can also enter a Retired date yourself for an accurate historical record.

## How equipment links to your records

Equipment doesn't stand alone — it connects to the rest of the QMS:

- **Log books** reference equipment so calibration, preventive maintenance, and routine checks are recorded against the right item.
- The **Code** appears in audit reports and log entries, which is why it's kept stable.
- The **Site** (and optional Department) ties each item to where it operates.

## How to find equipment

Use the controls at the top of the list:

- **Search** by name, code, or serial number.
- **Status** filter — All, In service, Out of service, or Retired (defaults to In service).
- **Category** filter — narrow to a single category.

The list is sorted alphabetically by name, with each row showing the name, code, category, site, status, and the next calibration and PM dates at a glance.
