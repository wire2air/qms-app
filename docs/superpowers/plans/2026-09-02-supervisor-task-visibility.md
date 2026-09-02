# Supervisor task visibility + due-in filter — session handoff

**Date:** 2026-09-02
**Branch:** `claude/supervisor-task-visibility-9br6nc`
**Status:** frontend implemented and pushed, no PR opened yet. **Blocked on a
backend RLS change** — see "RESOLVED" below.

**Repos:** `wire2air/qms-app` (frontend, this branch) and `wire2air/qms` (backend
monorepo — attach with `add_repo`, clone to `/home/user/qms`).

Pick-up note for continuing this work on another machine.

---

## What was asked for

> Need to add functionality in My Tasks or we add another menu or just rename this my
> task so a department supervisor can see all pending tasks for all employees in the
> department — or, if we have a supervisor field on the user, that supervisor can also
> see all tasks assigned to the team. Sorted by due date, filter 7/15/30/60/custom days
> due.

Refined in the same session to:

> Manager can filter by employees as well. By default the filter can have My tasks / All
> tasks / list of employees to select, or search the employee name in the dropdown. A
> user with no subordinates sees only My Tasks.

## What was decided

**Extend the existing My Tasks page, do not add a nav entry.** The inbox already runs
~15 entity-resolution live queries to turn a `TaskInstance` into a readable row
(documents, NCs, CAPAs, training, audits, QC lots, module records…). A second page would
have duplicated all of it. The sidebar entry stays **My Tasks** for everyone.

**One scope control, not a tab plus an assignee filter.** The first pass shipped a
`BaseTabs` scope switch (Assigned to me / My team) plus a separate assignee dropdown.
That was replaced: both were answering the same question, they could disagree, and a
manager had to set two things to ask one. It is now a single `TaskScopeSelectMenu` in the
filter bar whose value is one token:

| Value            | Rows shown                                           |
| ---------------- | ---------------------------------------------------- |
| `mine` (default) | The viewer's own tasks.                              |
| `all`            | The viewer's tasks **plus** everyone they supervise. |
| _a user id_      | That one person. Searchable by name in the dropdown. |

**Who counts as a supervisor** — the union of the two relationships already in the
schema, because tenants use them differently and both are load-bearing:

1. `users.supervisorId` — an explicit reporting line.
2. `departments.supervisorUserId` — accountability for a whole department (the same
   field the equipment-calibration escalations target).

No new model, no migration. A viewer whose roster is empty gets **no control at all**.

**Due-in filter** on every scope: Overdue / 7 / 15 / 30 / 60 days / custom range.

Two semantics chosen deliberately (both documented in `src/utils/taskDueWindows.js`):

- A day window is a **deadline cutoff, not a slice**. "Due in 7 days" includes work that
  is _already overdue_, because the alternative hides the most urgent rows from the very
  filter someone opens to chase deadlines. `Overdue` isolates the late tail.
- Presets are stored as **ids**, re-resolved against "now" on each run, so a tab left
  open overnight rolls to the new day instead of filtering on yesterday's boundary.
- Tasks with **no due date** never match an active window.

## Files

**New**

| File                                               | Purpose                                                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/taskDueWindows.js`                      | Pure preset catalogue + `resolveDueWindow` / `matchesDueWindow` / `isDueWindowActive` / `dueWindowLabel`. Injectable `now`. |
| `src/utils/taskDueWindows.spec.js`                 | 12 unit tests over the above.                                                                                               |
| `src/components/menus/TaskDueWindowSelectMenu.vue` | The Overdue / 7 / 15 / 30 / 60 / Custom control. Emits `{ id, from?, to? }`.                                                |
| `src/components/menus/TaskScopeSelectMenu.vue`     | The My tasks / All tasks / employee dropdown (grouped, searchable).                                                         |

**Changed**

| File                                                         | Change                                                                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/taskInstance/taskInstancesHome.vue`          | Owns the roster live query, `activeScope` resolution, the stale-scope guard, `assigneeIds`, and the dynamic title/subtitle.                    |
| `src/components/taskInstance/taskInstancesFilterToolbar.vue` | Scope + department + due-window controls; clears scope when the roster disappears.                                                             |
| `src/components/taskInstance/taskInstancesTable.vue`         | Queries N assignees instead of one; due-window filter; ASSIGNEE column + mobile badge; per-scope default sort; export mirrors the active sort. |
| `src/components/menus/UserSelectMenu.vue`                    | New `userIds` id-whitelist prop.                                                                                                               |
| `src/components/menus/DepartmentSelectMenu.vue`              | New `departmentIds` id-whitelist prop.                                                                                                         |
| `content/help/KB/operations/my-tasks.md`                     | Documents the Show menu and the due-date filter.                                                                                               |
| `components.d.ts`                                            | Auto-generated registration for the two new components.                                                                                        |

## Decisions worth not re-litigating

- **Inactive users stay in the roster.** Someone who left mid-approval is precisely who a
  manager opens this view to find; their open tasks are the ones needing reassignment.
  The ASSIGNEE column resolves names with `findByPk(id, { force: true })` for the same
  reason.
- **`all` includes the viewer's own tasks.** A manager asking for "all tasks" means
  everything in their span of control, their own included.
- **The roster is the only source of assignee ids the table will query.** A hand-typed
  `?scope=<some-uuid>` outside the roster resolves back to `mine` and is rewritten in the
  URL, so the menu never renders a selection absent from its own list.
- **The default sort flips per scope** — personal inbox stays newest-created-first (its
  historical order); any team scope opens on due date ascending, because that list reads
  as a deadline queue. Empty dates sink to the bottom in _either_ direction: "no
  deadline" is not "the earliest deadline".
- **The mobile card list and the CSV export mirror the active sort** rather than
  hardcoding newest-first. An export that ignores the on-screen sort arrives as a
  different list from the one that was asked for.
- **The table's roster dep is a joined id string, not the array.** The roster comes from
  a live query that returns a fresh array on every `User`/`Department` sync tick; an
  identity-compared dep would re-run the task query and all ~15 entity maps hanging off
  it for a roster that never changed.
- **The department filter renders only past one department.** With a single supervised
  department it can only ever be a no-op.

## RESOLVED — the backend does NOT allow this yet

`wire2air/qms` was attached to the session on 2026-09-02 and the policy read
directly. **`task_instances` SELECT is not tenant-wide, and there is no supervisor
concept in RLS at all.** The team scopes will render EMPTY for a normal department
supervisor until the backend changes.

`database/rls.sql:5708` — `task_instance_select_rls` admits a row when any of:

1. `is_owner` (company owner),
2. `assigned_to = me` — the personal inbox, asks no permission,
3. `authz.scope_allowed('tasks', 'read', assigned_to, NULL, NULL)`,
4. `authz.can_read_workflow_resource(entity_type, entity_id)` — you may read the
   record the task hangs off,
5. `entity_type = 'Document' AND has_permission('document_control','read')` — a
   documented stopgap for the collaborator / periodic-review cards.

**Branch 3 is the one that would carry a team view, and it cannot.**
`authz.scope_allowed(p_module, p_action, p_owner, p_dept, p_site)`
(`backend/api/migrations/20260709120300-permissions-03-functions.js:56`) ends:

```sql
RETURN (v_rank >= 4)
    OR (v_rank >= 3 AND p_site IS NOT NULL AND p_site = v_usite)
    OR (v_rank >= 2 AND p_dept IS NOT NULL AND p_dept = v_udept)
    OR (v_rank >= 1 AND p_owner IS NOT NULL AND p_owner = v_user);
```

The policy passes **NULL for both `p_dept` and `p_site`**, so the department and
site tiers can never fire — `task_instances` carries no department or site column
to pass. The effective ladder is therefore:

| `tasks:read` scope      | What the supervisor actually sees                     |
| ----------------------- | ----------------------------------------------------- |
| own / department / site | Their own tasks only — the department grant is inert. |
| tenant                  | **Every task in the tenant**, not just their team.    |

So the grant that makes the feature work is also the grant that over-shares, and
the one that describes the intent (department) does nothing.

Two further points that matter:

- **This policy was deliberately narrowed on 2026-09-01**, one day before this
  work — Tasks finding F-03 / HIGH-3 removed a blanket `document_control:read`
  branch that had released every task in the tenant to 43 of 45 roles. Any change
  here has to not reopen that.
- Its own header note justifies the narrowing partly with: _"No read surface
  regresses — taskInstancesTable, DashboardMyTasks and DashboardKpis all filter
  assignedTo client-side."_ **This change invalidates that stated assumption** —
  `taskInstancesTable` now queries other users' tasks. Worth citing when proposing
  the follow-up.

### Proposed fix — a supervisor branch, not a wider grant

Add a sixth arm that mirrors the frontend roster exactly, so the DB answers the
same question the UI asks:

```sql
OR authz.is_supervisor_of(assigned_to)
```

with a new `STABLE SECURITY DEFINER` helper (same shape as the other `authz`
predicates, `SET search_path = pg_catalog`, `REVOKE ALL FROM public` +
`GRANT EXECUTE TO app_user`):

```sql
-- Is the current user accountable for p_user? Unions the two relationships
-- already in the schema, matching taskInstancesHome's roster:
--   users.supervisor_id            — an explicit reporting line
--   departments.supervisor_user_id — accountability for a whole department
SELECT EXISTS (
  SELECT 1 FROM public.users u
   WHERE u.id = p_user
     AND u.company_id = v_comp
     AND u.deleted_at IS NULL
     AND ( u.supervisor_id = v_me
        OR EXISTS ( SELECT 1 FROM public.departments d
                     WHERE d.id = u.department_id
                       AND d.company_id = v_comp
                       AND d.deleted_at IS NULL
                       AND d.supervisor_user_id = v_me ) )
);
```

Why this shape rather than the alternatives:

- **It grants strictly less than `tasks:read` at tenant.** A supervisor sees their
  own span and nothing else, which is what was asked for; the 6 roles that
  legitimately hold tenant scope are unaffected.
- **It needs no new permission and no admin action.** The relationships are
  already maintained on the user and department records, so the feature works the
  day it ships instead of after a role-matrix migration.
- **It does not reopen F-03.** The arm is keyed on a relationship to the assignee,
  not on an unrelated module read held by nearly every role.
- Passing the assignee's department into `scope_allowed` instead was considered —
  it would make a `tasks:read`-at-department grant meaningful — but it answers a
  different question (same department, not accountable for) and still requires the
  grant to exist.

**Not implemented.** It is a Part-11-relevant security policy that was
deliberately tightened the day before; it wants an explicit decision, a migration
in `backend/api/migrations/`, and the measured before/after count the neighbouring
policy comments all carry.

## Verification done

- 12 new unit tests pass. Full suite: **1823 passed / 6 failed** — the same 6 failures
  exist untouched on the base branch (documentDetailConfig, roleDetailConfig, BaseBadge
  ×2, DataTable ×2).
- `vite build` clean. `lint:layout`, `lint:forms`, eslint, prettier clean on all changed
  files.
- `lint:ds` fails identically before and after (pre-existing ratchet debt at
  `no-raw-label` 174/173 and `no-raw-heading` 152/151 — not from this change).
- **Not run:** Playwright e2e, and no manual click-through — there is no backend in the
  session container.

## Suggested next steps

1. Decide on the `authz.is_supervisor_of` arm above and write the migration —
   the frontend is inert without it.
2. Manual pass as a supervisor: switch scopes, search a name in the dropdown, check the
   ASSIGNEE column, the due windows, and the CSV export.
3. Decide whether to keep the department filter — it is genuinely useful for a
   multi-department supervisor but was not part of the requested design.
4. Open a PR when happy.
