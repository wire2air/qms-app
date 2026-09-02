<script setup>
import { currentSession } from '@/utils/currentSession'
import { IconDownload, IconUser, IconUsersGroup } from '@tabler/icons-vue'

/**
 * My Tasks / My Trainings — the assignee inbox list. Built on the Enterprise
 * Page Framework list template: `useListLayout` (filter state + resolved
 * content state) + `BaseListLayout` (header / filters / state region). The
 * rows themselves live in `TaskInstancesTable`, which owns the (large,
 * per-entity) live queries and its own mobile/empty rendering — so this page
 * only owns the filter object and hands it down as props.
 *
 * ── Scope: the inbox is no longer only "mine" ───────────────────────────────
 * A supervisor's question is "what is my team sitting on, and what lands this
 * month" — which the assignee inbox could not answer at all. Rather than a
 * second nav entry duplicating fifteen entity-resolution queries, the page
 * gained a SCOPE tab: Mine, and Team when the viewer supervises anyone.
 *
 * "Supervises" is the union of the two relationships the schema already
 * carries, because tenants use them differently and both are load-bearing:
 *   1. `users.supervisorId`       — an explicit reporting line.
 *   2. `departments.supervisorUserId` — accountability for a whole department
 *      (the same field the equipment-calibration escalations target).
 * Neither is a permission. The tab is a UX affordance computed from records
 * already in IndexedDB; RLS on `task_instances` is what actually decides which
 * rows a viewer can read, exactly as it does for the Mine scope. A viewer who
 * supervises nobody never sees the tab, and a hand-typed `?scope=team` falls
 * back to Mine (see `activeScope`) rather than rendering an empty stranger's
 * inbox.
 *
 * URL sync was intentionally OFF for a long time: `taskKindId` lives in the
 * route query and is read by the parent page (`pages/task-instances.vue`), and
 * `useListLayout`'s writer used to REPLACE the whole query with just its own
 * filter keys — clobbering it.
 *
 * That writer now merges, preserving every key it does not own, and `taskKindId`
 * is not one of this instance's keys. So sync is on: filters are shareable and
 * bookmarkable again, and an analytics drill can carry `statusId` in as well as
 * `taskKindId`. If a future filter here is ever NAMED `taskKindId`, the two
 * would genuinely fight — merging preserves foreign keys, it cannot arbitrate a
 * shared one.
 */
const props = defineProps({
  taskKindId: { type: String, default: null },
})

const tableRef = ref(null)

// Filter state + resolved content state. Default the Status filter to "Assigned"
// so the inbox opens on the tasks that still need action, not the full history —
// a drill arriving with an explicit ?statusId= overrides it on hydrate.
const list = useListLayout({
  filters: {
    search: '',
    statusId: 'ASSIGNED',
    createdAt: null,
    // Due-in window (Overdue / 7 / 15 / 30 / 60 / custom). Stored as the preset
    // descriptor, resolved against "now" at filter time — see taskDueWindows.
    dueWindow: null,
    scope: 'mine',
    // Team-scope narrowing only; ignored while scope is 'mine'.
    departmentId: null,
    assignedTo: null,
  },
  syncUrl: true,
})

// The people this user supervises, with the department each sits in so the
// Department filter can narrow the roster without a second query.
//
// Inactive users are deliberately NOT excluded: someone who left mid-approval
// is precisely the case a supervisor opens this view to find, and hiding their
// rows would hide the open tasks that need reassigning.
const teamMembers = useLiveQueryWithDeps(
  [() => currentSession.value?.userId],
  async (db, [userId]) => {
    if (!userId) return []
    const [users, departments] = await Promise.all([
      db.User.where().exec(),
      db.Department.where().exec(),
    ])
    const ownedDepartmentIds = new Set(
      departments.filter((d) => d.supervisorUserId === userId).map((d) => d.id),
    )
    return users
      .filter((u) => u.id !== userId)
      .filter(
        (u) =>
          u.supervisorId === userId || (u.departmentId && ownedDepartmentIds.has(u.departmentId)),
      )
      .map((u) => ({ id: u.id, departmentId: u.departmentId }))
  },
  { models: ['User', 'Department'], initial: [] },
)

const isSupervisor = computed(() => teamMembers.value.length > 0)

// A hydrated ?scope=team from someone who supervises nobody resolves back to
// 'mine' — the filter value is a request, not the answer.
const activeScope = computed(() =>
  list.filters.value.scope === 'team' && isSupervisor.value ? 'team' : 'mine',
)

const teamDepartmentIds = computed(() => [
  ...new Set(teamMembers.value.map((m) => m.departmentId).filter(Boolean)),
])

// Candidate set for the Assignee picker: the roster narrowed by Department but
// NOT by the assignee filter itself — otherwise picking a person collapses the
// dropdown to that one person and there is no way back to a teammate.
const rosterUserIds = computed(() => {
  const { departmentId } = list.filters.value
  const members = departmentId
    ? teamMembers.value.filter((m) => m.departmentId === departmentId)
    : teamMembers.value
  return members.map((m) => m.id)
})

// The assignees the table should query. Always an explicit id list, so the
// team scope can never widen past the roster — a hand-typed ?assignedTo= for
// someone outside it resolves to an empty set rather than that user's inbox.
const assigneeIds = computed(() => {
  const me = currentSession.value?.userId
  if (activeScope.value !== 'team') return me ? [me] : []

  const { departmentId, assignedTo } = list.filters.value
  let members = teamMembers.value
  if (departmentId) members = members.filter((m) => m.departmentId === departmentId)
  if (assignedTo) members = members.filter((m) => m.id === assignedTo)
  return members.map((m) => m.id)
})

const isTeamScope = computed(() => activeScope.value === 'team')

const scopeTabs = computed(() => [
  {
    value: 'mine',
    label: props.taskKindId === 'TRAINING' ? 'Mine' : 'Assigned to me',
    icon: IconUser,
  },
  {
    value: 'team',
    label: 'My team',
    icon: IconUsersGroup,
    badge: teamMembers.value.length || undefined,
  },
])

const title = computed(() => {
  if (props.taskKindId === 'TRAINING') return isTeamScope.value ? 'Team Trainings' : 'My Trainings'
  return isTeamScope.value ? 'Team Tasks' : 'My Tasks'
})

const subtitle = computed(() => {
  if (props.taskKindId === 'TRAINING') {
    return isTeamScope.value
      ? 'Training tasks assigned to the people you supervise, soonest due first.'
      : 'Training tasks assigned to you.'
  }
  return isTeamScope.value
    ? 'Tasks assigned to the people you supervise, soonest due first.'
    : 'Review and act on tasks assigned to you.'
})
</script>

<template>
  <BaseListLayout
    helpSlug="KB/operations/my-tasks"
    :title="title"
    :subtitle="subtitle"
    :state="list.state.value"
    fullHeight
  >
    <template #actions>
      <BaseButton variant="outline" @click="tableRef?.exportCsv()">
        <IconDownload :size="16" class="tw:mr-1" />
        Export
      </BaseButton>
    </template>

    <template #filters>
      <div class="tw:flex tw:flex-col tw:gap-3">
        <!-- Scope switch, ABOVE the filter bar: it decides WHOSE tasks the
             filters below then narrow. Rendered only for a supervisor — for
             everyone else there is one scope and a one-tab tab bar is noise. -->
        <BaseTabs
          v-if="isSupervisor"
          :modelValue="activeScope"
          :tabs="scopeTabs"
          variant="segmented"
          ariaLabel="Task scope"
          class="tw:self-start"
          @update:modelValue="(v) => (list.filters.value.scope = v)"
        />
        <TaskInstancesFilterToolbar
          v-model:filters="list.filters.value"
          :teamScope="isTeamScope"
          :teamUserIds="rosterUserIds"
          :teamDepartmentIds="teamDepartmentIds"
        />
      </div>
    </template>

    <div class="tw:flex tw:gap-4 tw:flex-1 tw:min-h-0">
      <div class="tw:flex-1 tw:min-w-0 tw:flex tw:flex-col">
        <TaskInstancesTable
          ref="tableRef"
          :search="list.filters.value.search"
          :statusId="list.filters.value.statusId"
          :taskKindId="taskKindId"
          :createdAt="list.filters.value.createdAt"
          :dueWindow="list.filters.value.dueWindow"
          :assigneeIds="assigneeIds"
          :showAssignee="isTeamScope"
        />
      </div>
    </div>
  </BaseListLayout>
</template>
