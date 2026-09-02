# Supervisor task visibility + due-in filter — session handoff

**Date:** 2026-09-02
**Branch:** `claude/supervisor-task-visibility-9br6nc`
**Status:** frontend AND backend implemented and pushed. No PR opened in either
repo yet.

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

## Backend — DONE (wire2air/qms, same branch name)

The gap was real: `task_instance_select_rls` (`database/rls.sql:5708`) had no
supervisor concept, and the only arm that could have carried a team view —
`authz.scope_allowed('tasks','read', assigned_to, NULL, NULL)` — passes NULL for
both `p_dept` and `p_site` because `task_instances` has neither column. Both
tiers inside `scope_allowed` are guarded on `IS NOT NULL`, so a `tasks:read`
grant at **department** or **site** scope was **inert**, and the only grant that
released a colleague's task was **tenant**, which released the whole company.

### What shipped

| File                                                                | Change                                                                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/rls.sql`                                                  | New `public.is_supervisor_of(uuid)` (`STABLE SECURITY DEFINER COST 500`); `task_instance_select_rls` gains `OR public.is_supervisor_of(assigned_to)` |
| `backend/api/tests/integration/authz/task-supervisor-scope.test.js` | 10 L2 cases against real RLS                                                                                                                         |
| `backend/api/tests/integration/harness/factories.js`                | `createUser({supervisorId})`, `createDepartment({supervisorUserId})`, new `createTaskInstance()`                                                     |
| `docs/modules/tasks/24-change-addendum-2026-09-02.md` + `README.md` | The module pack's record of the change                                                                                                               |

**No migration.** Hand-written policies live in `rls.sql`, which
`scripts/apply-rls.js` replays after every migrate in every environment — a
`CREATE POLICY` written in a migration is silently reverted on the next deploy.
The root `CLAUDE.md` is explicit about this.

The function unions the two relationships the schema already carries —
`users.supervisor_id` and `departments.supervisor_user_id` — matching the
frontend roster exactly, so the UI's people list and the rows the DB returns are
the same set.

### Decisions

- **Not a permission.** Nobody grants anything for a supervisor to see their own
  team, and no grant can be mis-set to widen it.
- **Does not reopen F-03.** The 2026-09-01 removal closed a `document_control:read`
  arm that leaked every task to 43 of 45 roles because it keyed on an unrelated
  module read. This keys on a named relationship to the assignee.
- **READ only.** `task_instance_update_rls` untouched; a test pins that a
  supervisor's `UPDATE` affects 0 rows. Acting on a task still goes through
  API-03 (record's module + e-signature).
- **One level.** A manager's manager is not admitted. Matches the frontend.
- **SECURITY DEFINER is load-bearing** — and so is the definer being a superuser.
  `users` and `departments` both carry `FORCE ROW LEVEL SECURITY`, so a
  merely-owning (non-superuser) role would be filtered by `users_sel` and the
  function would silently return false. On this deployment `apply-rls.js` runs as
  the superuser `DB_USER`, so it is correct. If `DB_USER` is ever de-escalated,
  re-check this function first — the failure is silent.

### Known residual — cross-site roster

The DB now returns the whole span, but the frontend roster is built from `User` /
`Department` rows in IndexedDB, which arrived under `users_sel`. That policy's
ungated directory branch covers same-site and site-less colleagues, so the
ordinary case works — but a report at a site the supervisor has **no** assignment
to (most plausibly a company-wide department whose members sit at several sites)
is missing from the roster, so the UI never asks for their tasks.

Fix shape is `OR public.is_supervisor_of(id)` on `users_sel`, but that policy is
generator-managed: it means editing the `authz.module_table_bindings` row's
`extra_read_sql` and re-running the generator in a migration (precedent:
`20260807140000-users-directory-read-drop-admin-branches`). It also widens the
**people directory**, a different security decision from task visibility — so it
is flagged, not folded in. Full write-up in
`docs/modules/tasks/24-change-addendum-2026-09-02.md` §6.

### How the backend was verified

A real Postgres was stood up in the session (local PG16 + `postgresql-16-pgvector`;
no docker daemon available), the project's own `globalSetup` built
`qms_authz_test` through all 596 migrations + `apply-rls.js`, and the authz
integration suite ran against it under real RLS (`SET LOCAL ROLE app_user`).

- **Baseline, before the change:** 15 files / **166 tests passed**.
- **After:** 16 files / **176 tests passed** — the 10 new cases, and not one of
  the 166 existing authz tests regressed.
- **Whole backend integration suite:** 76 files / **1298 passed, 1 failed**.
- `lint:db-invariants` reports only pre-existing structural classes (unindexed
  FKs, missing audit triggers, RLS-without-policy); nothing names
  `task_instances`, and invariant (H) — a tenancy-only UPDATE gate on a
  `signature_id` table — does not fire, confirming the UPDATE policy was not
  loosened.

**The one failing test is a PG16 artefact, not this change.**
`quality-event-close-signature.test.js` expects SQLSTATE `23001`
(`restrict_violation`) on hard-deleting a signed event and gets `23503`. Checked
two ways rather than assumed:

1. Reverting `database/rls.sql` and `harness/factories.js` to the parent commit
   reproduces it identically.
2. The FK really is `RESTRICT` (`confdeltype = 'r'`; migration `20260831120000`
   writes `ON DELETE RESTRICT`), and a minimal two-table experiment on the same
   server shows **PG16 raises `23503` for a RESTRICT FK** — the test is correct
   for production, which is **PG18** (`pgvector/pgvector:pg18`) and reports the
   distinct code.

Nothing in this change uses version-specific syntax, but the suite has not been
run on 18 and should be before shipping.

### To reproduce the DB locally in a fresh session

```bash
apt-get install -y postgresql-16-pgvector
service postgresql start
su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\""
apt-get install -y redis-server && redis-server --daemonize yes   # log.js retries forever without it
cd /home/user/qms && cp .env.example .env && pnpm install
cd backend/api && pnpm test:integration tests/integration/authz
```

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

1. Decide on the cross-site roster residual above (widen `users_sel`, or accept).
2. Manual pass as a supervisor: switch scopes, search a name in the dropdown, check the
   ASSIGNEE column, the due windows, and the CSV export.
3. Decide whether to keep the department filter — it is genuinely useful for a
   multi-department supervisor but was not part of the requested design.
4. Re-run the authz integration suite on PG18 before shipping.
5. Open a PR in each repo when happy. **They must land together:** the frontend
   is inert without the RLS arm, and the RLS arm is unused without the frontend.
