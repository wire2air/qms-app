<script setup>
import { currentSession } from '@/utils/currentSession'
import { IconDownload } from '@tabler/icons-vue'

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
 * gained ONE scope control (`TaskScopeSelectMenu`): My tasks · All tasks · a
 * searchable list of the people the viewer supervises.
 *
 * One control, not a tab plus an assignee filter: both were answering the same
 * question, so the pair could disagree and a manager had to set two things to
 * ask one. The value is a single token — 'mine', 'all', or a user id — which is
 * also what makes the view shareable as one readable query param.
 *
 * "Supervises" is the union of the two relationships the schema already
 * carries, because tenants use them differently and both are load-bearing:
 *   1. `users.supervisorId`       — an explicit reporting line.
 *   2. `departments.supervisorUserId` — accountability for a whole department
 *      (the same field the equipment-calibration escalations target).
 * Neither is a permission. The control is a UX affordance computed from records
 * already in IndexedDB; RLS on `task_instances` is what actually decides which
 * rows a viewer can read, exactly as it does for the Mine scope. A viewer who
 * supervises nobody never sees the control at all — one possible answer needs
 * no question — and a hand-typed scope naming someone outside the roster falls
 * back to Mine (see `activeScope`) rather than rendering a stranger's inbox.
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
    // Whose tasks: 'mine' | 'all' | a supervised user's id.
    scope: 'mine',
    // Narrows the roster (and so the scope menu) for someone who supervises
    // more than one department; ignored while scope is 'mine'.
    departmentId: null,
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
  // No `initial` — undefined means "still loading", which the stale-scope guard
  // below must not mistake for "supervises nobody" and use to wipe a scope
  // hydrated from the URL before the roster has arrived.
  { models: ['User', 'Department'] },
)

const isSupervisor = computed(() => (teamMembers.value?.length ?? 0) > 0)

// The roster the scope menu offers: everyone supervised, narrowed by the
// Department filter when one is set.
const rosterUserIds = computed(() => {
  const { departmentId } = list.filters.value
  const members = departmentId
    ? (teamMembers.value ?? []).filter((m) => m.departmentId === departmentId)
    : (teamMembers.value ?? [])
  return members.map((m) => m.id)
})

const teamDepartmentIds = computed(() => [
  ...new Set((teamMembers.value ?? []).map((m) => m.departmentId).filter(Boolean)),
])

// The stored scope is a REQUEST; this is the answer. Anything naming someone
// outside the current roster — a stale bookmark, a department filter that just
// excluded them, a hand-typed id — resolves to 'mine' rather than showing a
// stranger's inbox or an empty list with no visible cause.
const activeScope = computed(() => {
  const scope = list.filters.value.scope
  if (!isSupervisor.value) return 'mine'
  if (scope === 'all') return 'all'
  if (scope && scope !== 'mine' && rosterUserIds.value.includes(scope)) return scope
  return 'mine'
})

// Reset a scope the roster can no longer honour, so the menu never renders a
// selection that isn't in its own list. Waits for the roster to load.
watch([activeScope, teamMembers], ([resolved, roster]) => {
  if (roster === undefined) return
  if (list.filters.value.scope !== resolved) list.filters.value.scope = resolved
})

// The assignees the table should query — always an explicit id list, so no
// scope can widen past the roster. 'all' includes the viewer: a manager asking
// for "all tasks" means everything in their span, their own included.
const assigneeIds = computed(() => {
  const me = currentSession.value?.userId
  const scope = activeScope.value
  if (scope === 'mine') return me ? [me] : []
  if (scope === 'all') return me ? [me, ...rosterUserIds.value] : rosterUserIds.value
  return [scope]
})

const isTeamScope = computed(() => activeScope.value !== 'mine')

const title = computed(() => {
  if (props.taskKindId === 'TRAINING') return isTeamScope.value ? 'Team Trainings' : 'My Trainings'
  return isTeamScope.value ? 'Team Tasks' : 'My Tasks'
})

const subtitle = computed(() => {
  const noun = props.taskKindId === 'TRAINING' ? 'Training tasks' : 'Tasks'
  if (activeScope.value === 'mine') {
    return props.taskKindId === 'TRAINING'
      ? 'Training tasks assigned to you.'
      : 'Review and act on tasks assigned to you.'
  }
  if (activeScope.value === 'all') {
    return `${noun} assigned to you and the people you supervise, soonest due first.`
  }
  return `${noun} assigned to the selected team member, soonest due first.`
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
      <TaskInstancesFilterToolbar
        v-model:filters="list.filters.value"
        :showScope="isSupervisor"
        :teamUserIds="rosterUserIds"
        :teamDepartmentIds="teamDepartmentIds"
      />
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
