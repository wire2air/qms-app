---
id: roles-and-permissions
title: Roles & Permissions
sidebar_position: 2
description: Create roles, choose which features and data they can access, and assign those roles to the people on your team.
keywords: [roles, permissions, access control, user roles, administration, security]
---

# Roles & Permissions

## Overview

Roles control what each person can see and do in Qability. Instead of setting access one person at a time, you build a **role** (for example, "Field Supervisor" or "Quality Manager"), turn on the **permissions** that role should have, and then assign the role to users. Everyone who holds that role gets exactly the access it grants.

You manage all of this from the **Roles Administration** page, reachable from the Roles area of the app. From there you can create roles, edit their permissions, activate or deactivate them, and decide which users they apply to.

## Key concepts

### Role statuses

Each role carries a status shown as a colored badge on the role card and the role detail page.

| Status | Badge color | What it means |
| --- | --- | --- |
| Active | Green | The role is in use. Its permissions apply to everyone assigned to it. |
| Inactive | Red | The role has been deactivated and is no longer applied. You can reactivate it at any time. |

New roles are created as **Active**.

### How permissions are organized

Permissions are grouped into easy-to-scan **categories** (for example, Users, Sites, Documents, CAPAs, Item Master), and those categories are gathered into broader **sections**:

| Section | Examples of what it covers |
| --- | --- |
| Company Management | Company, Users, Teams, Sites, Departments, Roles, Option Sets, Suppliers, Item Master, Nonconformances, CAPAs |
| Configuration | Form Templates, RCA Templates, Risk Assessment Templates, Records, Documents, Document Templates, Workflows |
| Training | Trainings, Training Instances, Training Matrix |
| Inspections & Logs | Field Records, Log Books, Inspections, Equipment |
| AI | AI features |

Within each category, permissions are offered as individual actions you switch on with a checkbox:

| Action | What it allows |
| --- | --- |
| Create | Add new records in that area |
| Read | View records in that area |
| Update | Edit existing records |
| Delete | Remove records |
| Manage | Broader administrative control over that area |

Not every category offers every action — you only see the checkboxes that apply.

:::note
Your ability to create or edit roles depends on your own permissions. If you don't have role-management access, the **Create New Role** button, the **Save Changes** button, and the permission checkboxes won't appear or will be read-only.
:::

## How to create a role

1. Open the **Roles Administration** page.
2. Click **Create New Role** in the top right.
3. Enter a **Role Name** (required), such as "Field Supervisor."
4. Optionally add a **Description** explaining the role's purpose and responsibilities.
5. Use the **Copy From** menu to choose a starting point:
   - **Custom** starts the role with no permissions.
   - Selecting an existing role copies that role's permissions as a starting point. The dialog tells you how many permissions will be copied.
6. Click **Create Role**. The new role appears in the list, ready for you to fine-tune its permissions.

:::tip
Copying from a similar role is the fastest way to build a new one — create it from the closest match, then open it and adjust the checkboxes.
:::

## How to assign permissions to a role

1. On the **Roles Administration** page, click a role to open its detail page.
2. Scroll to the **Permissions** section. Permissions are grouped by section and category.
3. Tick or untick the checkboxes for each action (Create, Read, Update, Delete, Manage) you want this role to have.
4. To find a specific area quickly, type in the **Search permissions...** box to filter the list.
5. To grant everything at once, click **Select All**.
6. When you're done, click **Save Changes** in the top right. Use **Cancel** to discard your edits.

You can also rename the role or edit its description directly on this page — click the role name or description text to edit it, then save.

## How to assign a role to users

1. Open the role's detail page.
2. In the role information card, click **View All Users**. The **Assign Users to Role** window opens.
3. Use the **Search users by name or email...** box to find people.
4. Tick the checkbox next to each user who should hold this role. People who already have it are marked **Currently Assigned**. A counter shows how many users are selected.
5. Click **Save Assignments**. The selected users now hold the role and gain its permissions; anyone you unticked has it removed.

The role information card and each role card on the list page show an **Assigned Users** count so you can see at a glance how widely a role is used.

## How to activate or deactivate a role

- **Deactivate:** On the role detail page, click **Deactivate** (or use the menu on a role card). Confirm when prompted. The role's status changes to **Inactive** and it stops granting access.
- **Activate:** For an inactive role, click **Activate** and confirm. The status returns to **Active**.

:::warning
Deactivating a role removes its access from everyone assigned to it. Check the **Assigned Users** count before deactivating so you know who will be affected.
:::
