---
id: analytics
title: Analytics
sidebar_position: 1
description: Build dashboards, define your own metrics, explore data, send scheduled reports, and set threshold alerts in QAbility QMS.
keywords: [analytics, dashboards, reports, data explorer, alerts, metrics, widgets, scheduled reports]
access: public
---

# Analytics

## Overview

The Analytics area turns the records in your QMS into figures, charts, and reports. You define the **metrics** you want to measure, place them on **dashboards**, try out questions in the **Data Explorer**, bundle metrics into **reports** that can be emailed on a schedule, and set **alerts** that notify people when a figure crosses a threshold.

Open it from the **Analytics** group in the left navigation. It contains five pages: **Dashboards**, **Reports**, **Data Explorer**, **Alerts**, and **Metrics**. You only see the pages your role grants access to, and Analytics must be included in your company's subscription — otherwise the pages show **Not included in your plan**.

Every figure is worked out for the person looking at it, under that person's own access. A dashboard, report, or alert stores the *question*, not the answer, so two people opening the same shared dashboard can legitimately see different numbers.

## Key concepts

| Term | What it means |
| --- | --- |
| Metric | A definition of something to measure, such as a count of records or a percentage that meet a condition. Metrics are created on the **Metrics** page. |
| Widget (tile) | One metric shown on a dashboard with a chosen visualization, period, and breakdown. |
| Dashboard | A board of widgets. Private to you or shared with your company. |
| Report | A named set of sections, each listing metrics and an optional breakdown table. Can be emailed as PDF or Excel. |
| Alert | A watch on a metric with one or more threshold bands that notify people when crossed. |

### Visibility

| Option | Who can open it |
| --- | --- |
| Private | Only you. |
| Shared | Anyone in your company with analytics access. Each reader still sees only the records their own access allows. |

### Metric statuses (Metrics page)

| Badge | What it means |
| --- | --- |
| Draft | Saved but not published, so it can't be used on dashboards, reports, or alerts yet. |
| Preparing | Published, but figures haven't been worked out yet. Figures are refreshed every 15 minutes. |
| Published | Ready to use. |
| No matching records | The definition is valid but nothing matched — often a filter naming a value no record uses. |

:::note
Small groups are withheld. When a breakdown group has fewer than 5 records it is shown as withheld rather than named, so individuals can't be identified. A withheld cell is not the same as zero.
:::

## How to create a metric

1. Go to **Analytics → Metrics** and select **New metric**.
2. Under **What would you like to track?**, pick a starting template, or select **Create your own** to start from a blank form.
3. Work through the sections:
   - **What are you measuring?** — enter a **Metric name**, choose the **Module**, and add an optional **Description**.
   - **Which records, and what about them?** — choose **What to work out**: **Number of records**, **Percentage**, **Total**, **Average**, or **Average time between dates**.
   - **Which records should be included?** — add **Conditions** using a **Field**, a **Comparison** (is one of, is not one of, is set, is not set), and **Values**.
   - **When should a record count?** — pick the date in **Counted by date** that decides which period a record falls into.
   - **Breakdown and reporting** — choose what the metric can be split by in **Break down by**, a **Direction** (for example **Higher is better**), and how often it is **Reported** (daily to yearly).
4. In the **Preview** panel, select **Preview** to see the figure computed live from current records. Nothing is saved by previewing.
5. Select **Save and publish**.

:::tip
A new metric shows **Preparing** until the next refresh. To skip the wait, use the refresh button on its card on the **Metrics** page.
:::

To change a metric later, use the edit button on its card. Use **Unpublish** to take it out of use without deleting it.

## How to create a dashboard and add widgets

1. Go to **Analytics → Dashboards**.
2. Type a name into **New dashboard** and select **Create**. The dashboard opens, and it starts **Private**.
3. Select **Add widget**.
4. Choose a **Metric**, then a **Visualisation** — for example **Single number**, **Line**, **Bar**, **Stacked bar**, **Donut**, **Heatmap**, **Ranked list**, **Sparkline**, or **Funnel** (only the ones that suit the metric are offered).
5. If offered, pick **Show separately by** to split the figure into groups.
6. Open **Options** to set the **Period** (such as **Last 30 days** or **This quarter**), **Show change vs**, and a **Title**. The period is saved as a relative window, so the widget keeps meaning the same thing next month.
7. Check the preview on the right, then select **Add widget**.

### Arrange widgets

When you hover over a widget (or on a touch screen, at any time), a small toolbar appears:

- **Drag the grip handle** to move the widget. You can also focus the handle and use the arrow keys, Home, or End.
- Use the **narrower** and **wider** arrow buttons to resize the widget between one and four columns.
- Use the **pencil** to edit it, or the **trash** icon to remove it.

:::warning
Removing a widget happens immediately, without a confirmation step.
:::

### Share a dashboard

1. Open the dashboard and select **Sharing**.
2. Set **Visibility** to **Shared** (or back to **Private**) and select **Save**.

Shared dashboards appear for colleagues under **Shared with you** on the Dashboards page. Dashboards labeled **Provided with Qability** can't be deleted.

## How to use the Data Explorer

The Data Explorer lets you ask a question without saving anything.

1. Go to **Analytics → Data Explorer**.
2. Choose a **Metric**, a **Visualisation**, and any other options. The result appears on the right.
3. To keep it, choose a dashboard in **Save to dashboard** and select **Save as widget**.

You can also put a metric on a dashboard straight from the **Metrics** page using its add-to-dashboard button, which opens **Add to dashboard**; choose a **Dashboard** and select **Add tile**.

## How to build and send a report

1. Go to **Analytics → Reports** and select **New report**.
2. Enter a **Report name**, choose a **Period**, add an optional **Description**, and set **Visibility**.
3. Under **Sections**, select **Add section**. Give each section a **Section title** and choose its **Metrics**. Drag sections by their handle to reorder them.
4. Optionally tick **Add a breakdown table**, then pick **Break down which metric** and **By**.
5. Select **Create report**.

To get a copy by email, open the report and select **Email as PDF** or **Email as Excel**. The export is queued and emailed to you when ready.

### Schedule a report

1. Open the report and select the **Schedules** tab.
2. Select **New schedule**.
3. Enter a **Schedule name**, choose a **Format** (**PDF** or **Excel (XLSX)**), and set when it runs and its **Timezone**. Check the **Next runs** list to confirm the timing.
4. Choose recipients by **People**, **Groups**, or **Roles**.
5. Turn on **Active — send on this schedule** and select **Create schedule**.

:::note
Activating a schedule needs the reports export permission. Without it you can still save the schedule as a draft. Each recipient receives their own copy, worked out under their own access, and anyone who has lost export access is skipped.
:::

## How to set up a threshold alert

1. Go to **Analytics → Alerts** and select **New alert**.
2. Under **What to watch**, enter an **Alert name**, choose a **Metric**, and optionally use **Check separately by** to check each group on its own.
3. Under **Who is told**, choose recipients. If you can't name others, the alert notifies only you.
4. Set **Do not repeat within (minutes)** to limit repeat notifications, and leave **Active — evaluate this alert** ticked.
5. Under **Threshold bands**, set each band's **Severity** (**Info**, **Warning**, or **Critical**), **Fires when the value** (for example **is above**), **Threshold**, and **Measured over**. Select **Add band** for more levels.
6. Select **Create alert**.

Only the most severe band a person crosses fires, so a warning and a critical don't arrive together for the same number. Use the pause button on an alert's card to stop it from being evaluated, and open the alert to see what has been **Sent to you**.

:::warning
Each person is alerted using their own access. A recipient with narrower access may never reach the threshold you set, so they may not be notified.
:::

## Tips

:::note
As good practice, cross-check any figure you plan to act on or share — for example in a management review — against the source register in the relevant module before relying on it.
:::

:::tip
Start in the **Data Explorer** to find the view you want, then save it to a dashboard. It's quicker than editing widgets one at a time.
:::

- Give metrics names your quality team will recognize on a dashboard.
- Keep new dashboards private until they're ready, then share them.
- If a page is missing from the **Analytics** group, or you can't create or edit, ask an administrator to check your role.
