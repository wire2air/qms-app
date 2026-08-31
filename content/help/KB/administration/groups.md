---
id: groups
title: Groups & Teams
sidebar_position: 3
description: Create groups and teams, add members, and use groups to organize people for assignments in your QMS.
keywords: [groups, teams, members, leadership team, assignments, administration]
---

# Groups & Teams

## Overview

Groups (also called teams) let you organize the people in your company into named
collections — for example a Quality Assurance team, an internal audit group, or your
leadership team. Once a group is set up, you can use it to keep people organized and to
make assignments easier: instead of picking the same individuals over and over, you work
with a single named group.

You manage groups from the **Groups** page in the Administration area. Each group has a
name, a color, an optional avatar, an optional Leadership flag, and a list of members.

## Key concepts

### Group fields

| Field | What it does |
| --- | --- |
| **Group name** | The display name for the group (required). For example, "Quality Assurance Team". |
| **Group color** | A color used for the group's avatar and visual identity throughout the app. |
| **Avatar** | An optional image for the group. If you don't upload one, the group shows a colored placeholder. |
| **Type** | Either **Standard Team** or **Leadership Team** (see below). |
| **Members** | The active people who belong to the group. |
| **Team ID** | A unique identifier for the group, shown on the group's detail page. You can copy it for reference. |

### Group types

| Type | Meaning |
| --- | --- |
| **Standard Team** | A normal working group with no special designation. This is the default. |
| **Leadership Team** | A group flagged as a core management group. Leadership teams show a **Leadership** badge in the group list and on the group page. |

:::note
Only **active** people appear in the member picker and in a group's member list. People who
are invited but haven't joined yet, or who have been deactivated, won't be shown until they
become active.
:::

## How to create a group

1. Open the **Groups** page from the Administration area.
2. Select **Create Group** in the top-right corner.
3. In the **Create New Group** dialog, enter a **Group Name** (this is required).
4. Optionally pick a **Group Color** from the color picker on the right.
5. Optionally check **Leadership Team** if this group is a core management group.
6. Optionally add starting **Members** using the member picker (you can also add members later).
7. Select **Create Group** to save. The new group appears at the top of the list.

:::tip
If you don't see the **Create Group** button, you may not have permission to create groups.
Ask a company admin to grant you the right access.
:::

## How to find and open a group

1. On the **Groups** page, browse the list of groups. Each card shows the group's avatar,
   name, member count, and a **Leadership** badge where it applies.
2. To narrow the list, type in the **Search groups** box at the top. The list filters to
   groups whose name matches what you type.
3. Select a group card to open its detail page.

## How to edit a group

On a group's detail page you can change its details inline — changes save automatically, and
a **Saving…** indicator appears briefly while the update is recorded.

1. Open the group from the **Groups** page.
2. To rename it, select the group name at the top and type a new name. Press **Enter** or
   click away to finish.
3. To change its color, use the **Group Color** picker in the **Team Settings** panel.
4. To mark or unmark it as a leadership group, use the **Leadership Team** toggle under **Type**.
5. To set a picture, select the avatar, then upload and crop an image in the **Team Avatar**
   dialog. You can also remove the current image from the same dialog.

## How to add and remove members

1. Open the group from the **Groups** page.
2. In the **Members** panel, select **Add Members**.
3. Choose one or more active people from the list. The picker shows only people who aren't
   already in the group.
4. Your selections are saved as you go — added people appear in the member list immediately,
   and the member count updates.
5. To remove someone, find them in the member list and select the clear (remove) control next
   to their name.

:::note
Removing someone from a group doesn't delete their account — it only ends their membership in
that group. If you add the same person back later, their membership is simply restored.
:::

## How to delete a group

1. On the **Groups** page, find the group you want to remove.
2. Select the actions menu on the group's card and choose **Delete**.
3. Confirm in the **Delete Group** dialog by selecting **Delete**.

:::warning
Deleting a group removes it from the Groups list and from any place it was used. If you only
need to change who belongs to the group, remove members instead of deleting the whole group.
:::

## How groups are used in assignments

Groups give you a reusable way to refer to a set of people. Rather than selecting individuals
one at a time, you can choose a named group wherever a group can be assigned — keeping related
work organized around the same team. Leadership teams are useful for grouping the people
responsible for management-level oversight, so they're easy to identify at a glance.

Keep your groups and their members up to date so that anything organized around a group always
reflects the right people.

## Roles granted through a group

A group can carry roles, so everyone in it picks them up. That is convenient, and
it is also the reason someone's access can be puzzling: their user page shows a
role they were never given directly.

Group-granted roles are shown with their **provenance** — which group they came
from. When you need to take access away, that tells you whether to change the
person or the group. Removing the role from the user will not stick if the group
is still granting it.
