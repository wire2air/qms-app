# Supervisor task visibility + due-in filter — session handoff

**Date:** 2026-09-02
**Branch:** `claude/supervisor-task-visibility-9br6nc`
**Status:** implemented, pushed, no PR opened yet.

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

## OPEN — needs checking against the backend

The scope control is a **UX affordance, not a permission**. It is computed from records
already in IndexedDB; RLS on `task_instances` still decides which rows a viewer can read,
exactly as it does for the personal scope.

**This repo is frontend-only, so the policy could not be verified here.**

- If `task_instances` SELECT RLS is **tenant-wide**, this ships as designed. The model's
  own header comment (`models/taskInstance.js`) says `task_instances_update_rls` "asks no
  permission question", and many components already read tasks by entity regardless of
  assignee — which points this way.
- If it is **assignee-scoped**, the backend needs a matching supervisor clause or the
  team scopes render empty.

Confirm before shipping. The root monorepo `CLAUDE.md` was not present in the session.

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

1. Confirm the `task_instances` SELECT policy (above).
2. Manual pass as a supervisor: switch scopes, search a name in the dropdown, check the
   ASSIGNEE column, the due windows, and the CSV export.
3. Decide whether to keep the department filter — it is genuinely useful for a
   multi-department supervisor but was not part of the requested design.
4. Open a PR when happy.
