---
id: users
title: Users & Invitations
sidebar_position: 1
description: Add people to your Qability workspace, send invitations, set their status, and assign the roles that control what they can do.
keywords: [users, invitations, invite user, user status, roles, administration]
---

# Users & Invitations

## Overview

The **Users** page in Settings is where company admins manage the people in their
organization's workspace. From here you can add new users, send them an email
invitation to set up their account, see who is active or still pending, and assign
the roles that determine what each person can access. Keeping this list accurate
ensures the right people have the right level of access to your quality system.

:::note
You can only create users or edit profiles if you have the matching permission
(roles that include user create or update access). If you don't see the **Create
User** button or editable fields, your role doesn't grant that access.
:::

## Key concepts

### User statuses

Every user has a status that reflects where they are in the onboarding process. You
can filter the list by status and change a user's status from their profile.

| Status | What it means |
| --- | --- |
| **Active** | The user has accepted their invitation, set a password, and can sign in and use the workspace. |
| **Invited** | An invitation email has been sent, but the user hasn't set their password yet. |
| **Inactive** | The user has been created but not yet invited, or has been deactivated and can no longer sign in. |

When you create a user, they start as **Inactive**. Sending an invitation moves them
to **Invited**, and once they accept and set a password they become **Active**.

### Profile fields

| Field | Description |
| --- | --- |
| **First / Last Name** | The user's name, shown throughout the app. |
| **Email Address** | Used for sign-in and to send the invitation. Set when the user is created. |
| **Roles** | One or more roles that control what the user can see and do. |
| **Sites** | A **primary** site plus any number of **additional** sites. Every assigned site counts for access — a Site-scoped permission reaches records at all of them. |
| **Department** | The team the user belongs to. |
| **Preferred Language** | The display language for the user. |
| **Timezone** | The time zone used when showing dates and times for the user. |
| **User Color** | A color used for the user's avatar and to identify them across the app. |
| **Status** | Active, Invited, or Inactive (see above). |

## Sites and what a user can reach

A user has one **primary** site and any number of **additional** ones. This is not
cosmetic — it is half of how access is decided.

A permission granted at **Site** scope reaches records at **every site assigned to
the user**, not just the primary one. So adding a second site to someone widens
what they can see, wherever their roles are site-scoped.

:::tip
Review site assignments when someone changes job, not only their roles. A role
change with a stale site list is one of the easier ways to leave access wider than
intended, and it is invisible if you only look at the roles.
:::

Users also see their assigned sites automatically in pickers — no separate Sites
permission needed for that. A Sites read grant is only for roles that must choose
across **all** sites.

## Checking effective permissions

Roles combine, and what someone ends up with is not always obvious from a list of
role names. The user's detail page has an **effective permissions** panel showing
what their roles actually add up to, module by module.

Use it to answer "why can this person do that?" — it is faster and more reliable
than reading each role in turn.

## How to invite a new user

1. Go to **Settings → Users**.
2. Select **Create User** in the top-right corner.
3. In the **Create New User** dialog, fill in the required fields: **First Name**,
   **Last Name**, and **Email**.
4. Choose one or more **Roles**, then set the user's **primary site**, any **additional sites** they work across, and their **Department**.
5. Optionally pick a **User Color** in the side panel.
6. To email the invitation right away, tick **Send Invite**. Leave it unticked to add
   the user now and invite them later.
7. Select **Create User**.

If you ticked **Send Invite**, the new user receives an email and their status becomes
**Invited**. If you left it unticked, the user is created as **Inactive** and you can
send the invitation later.

:::tip
You don't have to invite people the moment you add them. Add everyone first, then
send invitations when you're ready for them to log in.
:::

## How to send (or resend) an invitation

1. Open the user from the **Users** list.
2. If they haven't been invited yet, select **Send Invitation** in the top-right of
   their profile.
3. The user receives an email with a secure link and their status changes to
   **Invited**.

The **Send Invitation** button only appears for users who have not yet been invited.

### What the invited person does

The invited user clicks the link in their email, which opens a **Welcome** screen
showing their name and email. They set a password (at least 8 characters), confirm it,
and select **Accept Invitation**. Their account is then activated and they're taken to
the sign-in page. If the link has expired, they'll see an "Invitation Expired" message
and should ask you to send a new invitation.

## How to assign or change roles

Roles control what a user can do in the app, so review them whenever someone's
responsibilities change.

1. Open the user's profile from the **Users** list.
2. In the **Role Assignments** panel on the right, select the **plus (+)** button.
3. Tick the roles you want to add and untick any you want to remove.
4. To remove a single role quickly, select the **X** (or trash) icon next to it in the
   list.

Changes save automatically. A user with no roles shows "No roles assigned."

## How to edit a user profile

The profile page edits inline — there's no separate edit form, and your changes save
automatically as you go.

1. Open the user from the **Users** list.
2. To change the name, select it and type the new **First** and **Last Name**.
3. Update any field as needed: **Preferred Language**, **Timezone**, **Site**,
   **Department**, **Status**, or **User Color**.
4. To set or change the profile picture, select the avatar and upload an image in the
   **Profile Picture** dialog.

A **Saving…** indicator appears briefly while changes are stored. If something can't be
saved, an error message appears at the top of the page.

:::tip
You can review everything a user has done by selecting **View Audit Logs** at the
bottom of their profile.
:::

## Finding users

Use the toolbar at the top of the **Users** list to narrow things down:

- **Search** by name or email.
- Filter by **role** using the role dropdown.
- Filter by status with the **All / Active / Invited / Inactive** buttons.

:::note
Supplier users are managed separately under the Suppliers area and do not appear on
this page.
:::
