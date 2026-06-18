---
id: sites-and-departments
title: Sites & Departments
sidebar_position: 4
description: Set up your organization's sites and departments to organize locations, scope records, and group the people who work in them.
keywords: [sites, departments, locations, organization structure, administration, scoping]
---

# Sites & Departments

## Overview

Sites and Departments describe the structure of your organization inside Qability. A **Site** is a physical location your company operates from — a headquarters, a plant, a regional office. A **Department** is a team or function that lives within one of those sites, such as Quality Assurance, Production, or Maintenance.

Setting these up early matters because they become the building blocks used across the rest of the QMS. Departments are always attached to a site, people are assigned to a site, and records can be organized and filtered by the location they belong to. A clean site and department structure keeps everyone looking at the records that are relevant to them.

## Key concepts

### Site fields

| Field | Required | What it is |
| --- | --- | --- |
| Site Name | Yes | The full, readable name of the location (for example, "New York Headquarters"). |
| Code | Yes | A short unique identifier (for example, "NY-HQ"). Used as a quick reference label. Must be unique and cannot be changed after the site is created. |
| Address | No | The physical address of the site. |
| Timezone | No | The time zone the site operates in. Defaults to UTC. |

### Department fields

| Field | Required | What it is |
| --- | --- | --- |
| Department Name | Yes | The name of the team or function (for example, "Quality Assurance"). |
| Code | Yes | A short unique identifier (for example, "QA"). Must be unique and cannot be changed after the department is created. |
| Site | Yes | The site this department belongs to. Every department lives under exactly one site. |
| Description | No | A short note explaining what the department does. |

:::note
Sites and Departments don't have statuses — they exist as part of your structure until you remove them. The **Code** field is a permanent identifier, so choose it carefully when creating a record.
:::

## How to set up a site

1. Open the **Sites** page from the administration area.
2. Select **Create New Site** in the top-right of the page.
3. Enter the **Site Name**. When you move out of that field, the app suggests a **Code** for you automatically — you can keep it or type your own.
4. Confirm the **Code**. A green check mark means the code is available; a red mark means it's already in use and you'll need to change it.
5. Optionally add the **Address** and choose a **Timezone**.
6. Select **Create Site** to save. The new site appears in the list immediately.

To change a site later, select the menu (the action icon) at the end of its row and choose **Edit**. You can update the name, address, and timezone, but the code stays fixed.

## How to set up a department

Create at least one site first, since every department must be attached to one.

1. Open the **Departments** page from the administration area.
2. Select **Create New Department**.
3. Enter the **Department Name**. As with sites, a **Code** is suggested automatically when you leave the name field.
4. Confirm the **Code** is available (look for the green check mark).
5. Choose the **Site** this department belongs to from the dropdown.
6. Optionally add a **Description**.
7. Select **Create Department** to save.

To edit a department, use the row menu and choose **Edit**. You can change its name, site, and description; the code is fixed.

## How sites and departments scope records and users

Sites and departments act as the organizing layer for the rest of the system:

- **People are assigned to a site.** When you set up a user, you choose the site they belong to, which ties that person to a location.
- **Departments group teams within a site.** Because each department points to a single site, departments give you a finer level of grouping beneath each location.
- **Records can be organized by location.** Throughout the app, the site and department associated with a record let you filter and focus on the items that belong to a particular part of the organization.

On the **Departments** page you can see this in action: use the **Site** filter at the top to show only the departments for one location, and the search box to find a department by name. On the **Sites** page, the search box filters the list by site name. Each department row also shows a badge for the site it belongs to, so the relationship is always visible at a glance.

## How to remove a site or department

1. Find the record in the **Sites** or **Departments** list.
2. Open the row menu and choose **Delete**.
3. Confirm in the dialog that appears.

:::warning
Deleting a site or department cannot be undone. Because departments depend on their site and other records may be organized by these locations, remove them only when you're sure they're no longer needed. Consider reassigning any departments or people to another site or department first.
:::

## Tips

:::tip
Decide on a simple, consistent **Code** convention before you start — for example, location abbreviations for sites and short function names for departments. Since codes can't be changed later, a little planning keeps your structure tidy as your organization grows.
:::

Creating, editing, and deleting sites and departments are controlled by permissions. If you don't see the **Create New** button or the Edit and Delete options, your account doesn't have those rights — ask an administrator to grant them or to make the change for you.
