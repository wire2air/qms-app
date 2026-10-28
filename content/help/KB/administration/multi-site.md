---
id: multi-site
title: Multi-site Setup
sidebar_position: 4.5
description: Give people a primary site plus additional sites, and understand how site assignments work together with role scopes in QAbility QMS.
keywords: [multi-site, sites, primary site, additional sites, site access, role scope, administration]
access: public
---

# Multi-site Setup

## Overview

If your company operates from more than one location, each person in QAbility can be linked to more than one site. Every user has exactly one **Primary Site** and can also hold any number of **Additional Sites** — useful for regional managers, corporate quality staff, or anyone who works across several locations without needing company-wide access.

Site assignments work together with roles. **Role permissions decide what a user can see and do; a Site-scoped permission limits access to the user's sites in the areas that support site scoping.** Assigning sites on its own does not grant access to anything.

Before you start, set up your sites as described in [Sites & Departments](./sites-and-departments.md). For general user administration, see [Users & Invitations](./users.md).

## Key concepts

### Primary and additional sites

| Term | What it is |
| --- | --- |
| Primary Site | The site the person belongs to. Required for every user and chosen when the user is created. The user's **Department** is picked from departments at this site. |
| Additional Sites | Extra sites the person is responsible for, on top of their primary site. Optional, and added from the user's profile after the user exists. |
| Site access | The primary site plus all additional sites. The user profile shows this as **Effective access** (for example, "3 sites"). |

### Role scopes

When an administrator sets up a role on the **Roles** page, each module has a **Scope** that sets how far the role reaches:

| Scope | What it reaches |
| --- | --- |
| Own | Only records the user owns. |
| Department | Records in the user's department. |
| Site | Records at every site assigned to the user — primary and additional. |
| Company-wide | All records, company-wide. |

Not every module offers every scope — the options shown for a module are the ones it supports.

:::note
Site assignments only matter for roles granted at **Site** scope. A **Company-wide** role already reaches every site, and an **Own** role reaches only the user's own records, regardless of how many sites they hold. Not every area of the app filters by site, so check with your administrator which areas apply site scoping for your company.
:::

### Accepting new user assignments

Each site has an **Accepting new user assignments** switch. When it's off, the site stops being offered when you assign a primary or additional site to someone. People already assigned keep their access, and the site still appears in filters and on existing records.

## How to set a user's primary site

When creating a user:

1. Go to **Settings → Users** and select **Create User**.
2. In the **Create New User** dialog, fill in **First Name**, **Last Name**, **Email**, and **Roles**.
3. Choose the **Primary Site**. Only sites accepting new user assignments are listed.
4. Choose the **Department** — the list shows departments at the chosen site.
5. Select **Create User**.

To change the primary site later, open the user from the **Users** list and choose a new site in the **Primary Site** field.

:::tip
If you change someone's primary site to a site they already hold as an additional site, it simply becomes their primary — the site isn't listed twice.
:::

## How to add additional sites to one user

1. Go to **Settings → Users** and open the user.
2. Scroll to the **Site access** section.
3. In **Additional Sites**, select each site the person should also cover. Selected sites appear as chips, and the count shows how many are assigned.
4. To remove an additional site, clear it from the same field.
5. Check the **Effective access** line underneath, which shows the total number of sites a Site-scoped role will reach for this person.

The primary site is always included in the user's access and isn't shown as a removable chip here.

## How to assign sites to several users at once

1. Go to **Settings → Users**.
2. Tick the checkboxes next to the users you want to update.
3. Choose **Assign sites** from the bulk actions.
4. In the **Assign sites to…** dialog, choose an **Action**:
   - **Add** — adds the selected sites; existing assignments are kept.
   - **Remove** — removes the selected sites; everything else is kept.
   - **Replace** — the selected sites become the complete set of additional sites; anything not listed is removed.
5. Choose the **Sites** and select **Apply**.

:::warning
**Replace** with no sites selected clears every selected user's additional sites. Primary sites are never changed by this dialog.
:::

## How to see who has access to a site

1. Go to **Settings → Sites**.
2. Open the row menu for the site and choose **View members**.
3. The drawer lists everyone assigned to the site, each tagged **Primary** or **Additional**.
4. To take away an additional assignment, clear the **Additional** badge next to the person. Primary assignments can only be changed from the person's profile.

## How sites affect records

- **Viewing records.** In areas that support site scoping, a user whose role is Site-scoped sees records at any of their assigned sites. Adding a site widens what they can see; removing one narrows it.
- **Choosing a site on a record.** Many records (for example nonconformances and CAPAs) have a **Site** field. The picker lists your company's sites. In areas that support site scoping, a user with Site-scoped access may not be able to save or work on a record at a site outside their assigned sites.
- **Winding down a site.** Turn off **Accepting new user assignments** rather than deleting the site, so existing people and records aren't disrupted.

## Tips

:::tip
Review a person's site assignments whenever their job changes, not just their roles. A stale site list can leave access wider than intended.
:::

- Use additional sites for people who span locations; use a Company-wide scope only for roles that genuinely need every site.
- Use **View members** on the Sites page to audit who can reach a location.
- Assigning sites requires permission to update users. If you don't see **Assign sites** or can't edit the site fields, ask an administrator.
