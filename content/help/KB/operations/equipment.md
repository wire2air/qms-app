---
id: equipment
title: Equipment
sidebar_position: 5
description: Register and track instruments, machines, and other equipment, set calibration and maintenance due dates, and manage service status.
keywords: [equipment, calibration, calibration interval, calibration gate, preventive maintenance, asset tag, service status, log books, QC inspection, instrument, pH meter]
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
| Requires calibration | Marks the item as calibration-tracked. When on, you set a calibration interval, and the item is gated in QC Inspection (see below). |
| Calibration interval | A number **plus a unit** — Days, Weeks, Months, or Years — e.g. **1 Day** for a pH meter or **12 Months** for a balance. Used to roll the next-due date forward each time you record a calibration. |
| Next calibration due | The date the next calibration is required. Used to flag due-soon and overdue items, and to gate QC test capture. |
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

## How to set up calibration

For instruments used to take measurements, turn on calibration tracking so the system keeps the schedule for you.

1. Open a record (or add a new one) and tick **Requires calibration**.
2. Set the **Calibration interval** — a number and a unit. Pick the unit that matches how often the instrument really needs calibrating:
   - **Days** — e.g. a **pH meter** verified every **1 Day**.
   - **Weeks / Months / Years** — e.g. a balance every **12 Months**.
3. Optionally set the first **Next calibration due** date.
4. Save the record.

### Recording a calibration

There are two ways to record a calibration; both stamp the last-calibrated date and **roll the next-due date forward automatically** by the interval and unit (for example, a "1 Day" pH meter's next due becomes tomorrow):

- **Manually** — use **Record calibration** on the instrument's row. You can also enter an explicit next-due date instead of using the interval. This is the manager-only override.
- **Automatically from a calibration log book** — link a log book to the instrument (its **Equipment** field) and turn on **"Update this instrument's calibration when an entry is logged."** Then every time someone completes a calibration entry, the instrument's calibration rolls forward from the **entry's submit time** — no separate step. The submit time is used as the calibration date so it can't be back-dated; if you ever need to correct it, do that from Equipment (managers only).

The list highlights these dates so you can scan for what needs attention:

- A date coming up **within 30 days** is shown in amber as a due-soon nudge.
- A date that has **already passed** is shown in red with an alert icon to mark it overdue.

:::tip
Populating the calibration interval (and recording calibrations) is what turns the catalog into a working maintenance overview and keeps QC inspections trustworthy. Equipment without dates simply shows a dash in those columns and won't be flagged.
:::

## How calibration gates QC Inspection

This is the loop that keeps measurements trustworthy: **you can't record a test result on an instrument that isn't in calibration.**

Here's how the pieces connect:

1. In a **Specification**, a test (characteristic) can be marked **Requires an instrument** and pointed at a **preferred instrument** (a piece of equipment).
2. When the QA team captures results for an inspection lot, each instrument-requiring test resolves an instrument — the one chosen on the result row, else the test's preferred instrument, else the lot's default instrument.
3. Before the result is accepted, the system checks that instrument's calibration. Capture is **hard-blocked** (the result is rejected) if the instrument:
   - has **no assigned instrument** at all, or
   - is **calibration-tracked but has never been calibrated** (no next-due date), or
   - is **overdue** (its next-due date has passed).

The QA team then sees a clear message (for example, "*out of calibration (due 2026-05-01)*" or "*has no recorded calibration*") and must either pick a different, in-calibration instrument on that row or have the instrument recalibrated first. Visual or sensory tests that don't require an instrument are never blocked.

:::note
A daily-calibrated instrument (interval **1 Day**) that wasn't calibrated today will block that day's results until it's recalibrated — which is exactly the control most quality systems expect for something like a pH meter.
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
