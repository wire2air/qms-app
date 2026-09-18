---
id: roles-and-permissions
title: Roles & Permissions
sidebar_position: 2
description: Create roles, choose what each role can do and how far that access reaches, and assign roles to the people on your team.
keywords: [roles, permissions, access control, user roles, administration, security, scope, level]
---

# Roles & Permissions

## Overview

Roles control what each person can see and do in Qability. Instead of setting access one person at a time, you build a **role** (for example, "Quality Engineer" or "Site Supervisor"), set its permissions, and assign the role to users. Everyone who holds the role gets exactly the access it grants. A user can hold more than one role — their access is the combination of everything their roles grant.

You manage all of this from the **Roles Administration** page. From there you can create roles, edit their permissions, activate or deactivate them, and decide which users they apply to.

:::note
**The permission matrix decides everything.** There is no separate "super user" setting to hand out — a role holding every capability on every module, company-wide, *is* full access. Give that role to as many people as you need. Because it's a role, you can see who holds it, take it away in one click, and even scope it (all capabilities, but only at one site).

The one exception is the **company owner flag**, set automatically on the person who first creates the workspace. It bypasses roles entirely and exists as a recovery route in case roles are ever misconfigured — not as a way to grant access. It can't be changed from inside the app.
:::

## How a permission works: Level × Scope

Every module row in the permission matrix is set with two choices:

### Level — what the role can do

| Level | What it allows |
| --- | --- |
| No access | The module doesn't appear for this role. |
| Reference data only | *(reference modules)* Everyone can already use this data in forms and pickers; this role can't author it. |
| Viewer | Read only — browse and open records, no changes. |
| Editor | Create, edit, and export records. |
| Approver | Everything Editor allows, plus approve and reject. |
| Full control | Every capability the module offers, including delete. |
| Custom | A hand-tuned combination set through **Customize** (see below). |

Not every module offers every level — the list adapts to what each module actually supports. Administrative modules (like Custom Fields or Lookups) offer just **No access / Full control**, because they are managed as a whole. Reference modules (templates, lookups, equipment) start at **Reference data only** instead of "No access" — see [Reference data just works](#reference-data-just-works--no-companion-grants).

### Scope — how far that reach extends

| Scope | Who/what it covers |
| --- | --- |
| Own | Only records the user owns or created. |
| Department | Records in the user's department. |
| Site | Records at **every site assigned to the user** — users can be assigned to more than one site, and all of them count. |
| Company-wide | All records in the company. |

A wider scope always includes the narrower ones, and users can always reach records they own. Scope is enforced at the data level: records outside a user's reach are never delivered to their device — this is real access control, not just hidden buttons.

Some modules only offer **Company-wide**. That's intentional, not a bug: scope options appear only where records actually carry the matching information (an owner, a department, a site). QC inspection lots, for example, aren't tagged with a site today, so site-level scoping there would filter nothing.

### Customize — for the exceptions

The small adjustments button on each row opens the advanced controls:

- **Access (read)** and **Can edit (write)** as separate reaches — for example, *read Site-wide but only approve your Own*. Reading can be wider than editing, never narrower.
- **Individual capabilities** — the specific verbs the module supports (Create, Update, Delete, Approve, Reject, Close, Assign, Export, …) toggled one by one.

Rows configured this way display the **Custom** level. You rarely need this — the standard levels cover most roles.

## Reference data just works — no companion grants

Records depend on reference data: forms need lookup lists, submit flows need workflow pickers, NCs point at items and suppliers. You never need to grant "Viewer" on reference data to make a record module work — the system implies the right access:

- **Templates and lookups** — workflow templates, form blocks and templates, document templates, RCA and risk assessment templates, training curricula, equipment, and lookup lists (issue types, dispositions, categories, …) are **available to every user automatically**. In the matrix these rows say **"Reference data only"** at the bottom of the Level list — permission levels there control **authoring** (who can create, change, or retire them).
- **Sites** — every user automatically sees **their assigned sites** in pickers. A Sites read grant is only for roles that must pick across **all** sites.
- **Departments follow site visibility** — users see org-wide departments plus the departments of their assigned sites; no grant needed.
- **People-pickers follow site visibility too** — every user sees themselves, colleagues at their assigned sites, and org-wide users with no site, so training-manager/reviewer/assignee pickers always work. A Users read grant widens to the whole company directory.
- **Suppliers and Item Master** — reads are **implied by the record modules that reference them**: any grant on NC, CAPA, Complaints, QC Inspection, Audits, or Documents lets that role pick suppliers/items in those flows. Their "Viewer" level still means something real: browsing the supplier/item workspaces themselves.

The left navigation follows the same logic:

- **Record modules** (NCs, CAPAs, Documents, …) appear in the menu at any level — Viewer and up.
- **Reference and admin pages** (templates, master data, Sites, Departments, Equipment, Lookups) appear only when the role can **author** that data — implied read access never clutters anyone's navigation.
- **Personal pages** (My Tasks, My Trainings) are always there.

:::note
If a module is missing from the matrix and the navigation entirely, it may not be part of your workspace's **plan** — module availability per workspace is managed at the platform level, above roles. Roles decide who can use what your plan includes.
:::

## Owning a record, and being assigned a task

Two things people often assume grant special powers. Neither does — both mark **who is accountable**, and the matrix still decides who *can*.

### The record owner is the custodian, not the only one who can act

The owner of an NC or CAPA is the person responsible for driving it. That does **not** make them the only person who can work on it, and it does **not** hand them capabilities their role lacks:

- Someone else whose role covers the record — same site, same department, or company-wide — can edit it, without being made the owner.
- The owner still needs the **Close** capability to close it. Owning a CAPA is not permission to close a CAPA.

Where ownership does count is **scope**: an `Own`-scoped grant reaches the records you own and no others. So "Editor, Own" behaves exactly as it reads.

### An assigned task routes work — it doesn't lock it

A task in someone's queue says *this is yours to do*. It doesn't stop a colleague with the right permission from doing it when they're away:

- Acting on an **action step** needs the module's edit capability; **approving** needs Approve.
- The task stays in the assignee's queue and never appears in anyone else's — reaching it means opening the record deliberately.
- When someone else does act, the button says so — **"Approve on behalf of Sam Patel"** — so it can't be clicked without noticing whose task it is.
- The assignee is **notified straight away**, and the audit trail and electronic signature record both who acted and whose task it was.

This is what stops work stalling when someone is on leave, without anyone quietly taking over another person's approval.

:::tip
If you want approvals restricted to a specific group, don't rely on the assignment — grant **Approve** only to the roles that should have it. A role with Editor can act on action steps but cannot approve.
:::

## Access can also come from involvement, not just roles

Roles aren't the only path to a record. A person also sees a specific record when they are **pulled into it**:

- **Assigned a workflow task** on it (a reviewer or approver sees the record their task belongs to).
- **Added as a collaborator** on a document.
- **Shared into it** through a workflow step — this is how supplier users see the one NC or CAPA they're working, without any module access.

This means you don't need to hand out Viewer levels just so an approver can act on the records assigned to them. Grant module-level Viewer only when the role should **browse the whole module** — its lists, search, and reports.

You can check the result for any individual on their user page under **Effective Permissions**, which shows what they can do and **which role grants it** — useful for answering "why does this person have access to X?".

## Setting up a role

### Create a role

1. Open the **Roles Administration** page.
2. Click **Create New Role**.
3. Enter a **Role Name** (required) and optionally a **Description**.
4. Use **Copy From** to start from an existing role's permissions, or **Custom** to start from nothing.
5. Click **Create Role**, then open it to fine-tune.

:::tip
Copying from the closest existing role, then adjusting a few rows, is much faster than building from scratch. Presets (**Viewer, Contributor, Approver, Supervisor, Administrator**) apply a level and scope across every module at once — a good first stroke before fine-tuning.
:::

### Set its permissions

1. Open the role and scroll to the **Permissions** section.
2. For each module, pick a **Level** and a **Scope**. Use the search box or the **All / Granted / Modified** filter chips to move around quickly.
3. Use **Customize** on a row only when you need split read/write reach or an unusual capability mix.
4. Click **Save Changes**. Modified rows are highlighted until you save; the page warns you before leaving with unsaved changes.

### Assign it to users

1. On the role's detail page, click **View All Users**.
2. Search, tick the people who should hold the role, and click **Save Assignments**.

Permission changes take effect on each user's next page refresh.

## Keeping control

- **Deactivate / Activate** — an Inactive role stops granting access to everyone assigned to it (reversible at any time). Check the **Assigned Users** count first so you know who's affected.
- **Lock** — a locked role can't have its permissions changed until it's unlocked. Use it for baseline roles you don't want edited casually.
- **Access audit** — every permission change and every assignment change is recorded. Open the role's audit view to see who changed what, and when.

:::warning
Deactivating a role removes its access from everyone assigned to it, immediately. If a person loses all their roles, they keep only what involvement gives them (their assigned tasks and shared records) plus reference data.
:::
