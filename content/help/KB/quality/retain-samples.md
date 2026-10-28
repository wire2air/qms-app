---
id: retain-samples
title: Retain Samples
sidebar_position: 8.5
description: Register physical samples kept back from an inspection lot, track where they are stored, print box labels, and record their e-signed disposal when the retain period ends.
keywords: [retain sample, reserve sample, reference sample, retention sample, storage location, label, disposal, chain of custody, QC inspection]
access: public
---

# Retain Samples

## Overview

A retain sample is a physical sample you keep back from an inspected lot. You can go back to it later for a customer complaint, a stability question or a re-test. The Retain Samples register records one entry per retained box or pack. Each entry is linked to the inspection lot it came from and records where the sample is stored, how long you must keep it, and when and how it was destroyed.

Open it from **QC Inspection → Retain Samples** in the sidebar. The register shows filter chips with live counts (**All**, **Retained**, **Due ≤30d**, **Overdue** and **Disposed**), a searchable table, and a **Print Register** button.

:::note
There is no "new" button on the register. Retain samples are always created from an inspection lot, so every sample traces back to its source inspection.
:::

## Key concepts

### Statuses

| Status (badge) | What it means |
| --- | --- |
| Retained | The sample is in storage and its retain-until date is more than 30 days away. |
| Due for Destruction | The sample is still retained, and its retain-until date is within the next 30 days. |
| Overdue Destruction | The sample is still retained, and its retain-until date has passed. |
| Disposed | The sample's destruction has been recorded and signed. This is final: the record can no longer be edited. |

Due for Destruction and Overdue Destruction are worked out from the **Retain until** date each time you view the record. A sample moves into them automatically as time passes, and you can take it out again by extending the date.

### Sample types

| Type | Use |
| --- | --- |
| Reserve | Kept for possible re-testing. |
| Reference | Analytical sample. |
| Retention | Full market pack. |

### Chain of custody

The **Chain of Custody** timeline on each sample records who did what and when:

| Event | Recorded when |
| --- | --- |
| Sample retained | The sample is registered. |
| Moved | The **Storage location** or **Position** is changed. |
| Seal broken | **Seal** is changed from **Sealed** to **Opened**. |
| Disposed | The disposal is recorded. |

:::warning
Changing the **Quantity** does not add a custody event. If you take material out of a retained sample for testing, record why in the sample's **Notes** or in your own custody log.
:::

## How to set up storage locations

Storage locations are the rooms, fridges and cabinets where retained samples are kept. They are managed by a company administrator.

1. In the sidebar, go to **Lookups** and open **Storage Locations** (in the QC Inspection group).
2. Click **Add**.
3. Enter a **Name** (for example, Cold Storage). A **Code** is suggested from the name. Click **Edit** next to it to change it, because it can't be changed later. Optionally add **Storage conditions** (for example, 2–8 °C), **Site**, **Description** and **Display Order**.
4. Click **Add** to save.

The **Storage conditions** you enter here print on retain-sample labels. To retire a location, use **Deactivate** from the row's actions. Deactivated locations can be brought back with **Restore**.

## How to register a retain sample

1. Open the inspection lot in **QC Inspection → Inspections**.
2. Click **Retain Sample**, either in the lot's header actions or in the **Retained Samples** card on the right.
3. In **Create Retain Sample**, check the details carried over from the lot: item, lot number, batch, and manufacturing and expiry dates.
4. Choose the **Sample type** and enter the **Quantity retained** and its **Unit**.
5. Choose the **Storage location**. Optionally enter a **Position** (shelf, box or slot, for example Shelf B, Box 12).
6. Optionally set **Retain until** and add **Notes**.
7. Click **Create Retain Sample**. The sample gets an RS number and appears in the lot's **Retained Samples** card and in the register.

### How the retain-until date is set

If you leave **Retain until** blank, it is set for you:

- **Expiry date + 12 months** when the lot has an expiry date.
- **Retained date + 24 months** when the lot has no expiry date.

You can change the date at any time before disposal, for example when your retention policy or a local rule calls for a longer period.

:::tip
In-process (IPQC) lots expect a retain sample before they are submitted for QA disposition. If you submit one without a retain sample, you're asked for a **Reason for no retain sample**.
:::

## How to update a retain sample

1. Open the sample from the register or from the lot's **Retained Samples** card.
2. Edit the fields under **Sample**: **Sample type**, **Quantity**, **Storage location**, **Position**, **Storage conditions**, **Retain until**, **Seal** and **Notes**. Changes save automatically.
3. The **Traceability** section shows the **Source inspection** (click it to open the lot), the **Retained** date, and the **Manufacturing date** and **Expiry date**.

Moving the sample or opening its seal adds an entry to the **Chain of Custody** timeline.

## How to print labels and the register

- **Label**: on the sample page, click **Print Label**. This opens a sheet of identical box labels headed **DO NOT USE — RETAIN SAMPLE**. Each label shows the RS number, product, lot, batch, dates, **Retain until**, quantity, storage conditions, location, type and a QR code that opens the sample's record.
- **Register**: on the Retain Samples list, pick a filter chip and click **Print Register** to print the inventory for that view, for example every overdue sample.

## Disposal-due reminders

Each night the system checks retained samples whose **Retain until** date is 30 days away or less:

- The person who registered the sample gets a task in their task inbox, with the usual email and in-app notification. If that person is no longer active, the task goes to whoever created the source lot.
- The task asks them to plan the e-signed disposal or extend the retain-until date. If the date has already passed, the task says so.
- Recording the disposal closes the open task.

Use the **Due ≤30d** and **Overdue** chips on the register to see the same backlog at a glance.

## How to record a disposal

Only users with disposal permission see the **Record Disposal** button.

1. Open the retain sample and click **Record Disposal**.
2. Choose the **Disposal method**: **Destroyed on site**, **Incinerated**, **Returned to batch**, **Sent for disposal** or **Other**.
3. Optionally add **Notes**, such as a witness or a destruction certificate reference.
4. Click **Sign & Record Disposal**.
5. Confirm your identity when prompted for your e-signature.

Your signature is checked before anything is saved. If it fails, nothing is recorded. When it succeeds, the status changes to **Disposed**, a **Disposed** custody event is added, and the sample page shows the disposal date, method and notes.

:::warning
Disposal is final. A disposed sample cannot be edited or returned to **Retained**, and **Record Disposal** no longer appears. Before disposing, check the retain-until date and any open complaint or investigation involving the lot. Once the sample is destroyed, questions about that batch can no longer be answered from the material.
:::

## Tips

- Set up storage locations with their conditions before you start registering samples, so labels print complete.
- Print and attach the label as soon as you register a sample. The QR code takes anyone holding the box straight to its record.
- Review the **Due ≤30d** chip regularly, and extend **Retain until** where needed, before samples become overdue.
- The register is linked to its lots. To see every sample from one lot, open the lot and check its **Retained Samples** card.
