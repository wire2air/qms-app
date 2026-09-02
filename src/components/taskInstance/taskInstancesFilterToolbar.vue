<script setup>
import { IconCalendar, IconSearch } from '@tabler/icons-vue'
import { isDueWindowActive } from '@/utils/taskDueWindows.js'

const props = defineProps({
  // Team scope adds the two roster narrowing controls (Department / Assignee).
  // They are hidden — and cleared, see below — in the Mine scope, where the
  // assignee is by definition the viewer.
  teamScope: { type: Boolean, default: false },
  teamUserIds: { type: Array, default: () => [] },
  teamDepartmentIds: { type: Array, default: () => [] },
})

const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const filterItems = computed(() => [
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
])

const showClear = computed(
  () =>
    !!(
      filters.value.search ||
      filters.value.statusId ||
      filters.value.createdAt ||
      filters.value.departmentId ||
      filters.value.assignedTo
    ) || isDueWindowActive(filters.value.dueWindow),
)

function clearAll() {
  filters.value = {
    ...filters.value,
    search: '',
    statusId: null,
    createdAt: null,
    dueWindow: null,
    departmentId: null,
    assignedTo: null,
  }
}

// Leaving the team scope must not leave an invisible roster filter applied —
// the controls disappear with the tab, and a filter nobody can see or clear is
// the one that gets reported as "the list is empty and I don't know why".
watch(
  () => props.teamScope,
  (isTeam) => {
    if (isTeam) return
    if (filters.value.departmentId || filters.value.assignedTo) {
      filters.value = { ...filters.value, departmentId: null, assignedTo: null }
    }
  },
)
</script>

<template>
  <!-- Scoped search stays in the app header (preserved placement). The
       teleport was shipped EMPTY, so `filters.search` — plumbed all the way
       through to the table's row filter — had no control to set it. -->
  <SafeTeleport to="#main-header-search">
    <BaseTextInput
      v-model="filters.search"
      name="search"
      placeholder="Search tasks by item name or number…"
      clearBtn
      class="tw:flex-1 tw:max-w-md"
    >
      <template #icon>
        <IconSearch :size="16" />
      </template>
    </BaseTextInput>
  </SafeTeleport>

  <BaseFilterBar hideSearch :showClear="showClear" @clear="clearAll">
    <template #filters>
      <TaskInstanceStatusSelectMenu v-model="filters.statusId" />
      <TaskDueWindowSelectMenu v-model="filters.dueWindow" />
      <DepartmentSelectMenu
        v-if="teamScope && teamDepartmentIds.length > 1"
        v-model="filters.departmentId"
        :departmentIds="teamDepartmentIds"
        :allowCreate="false"
        isFilter
      />
      <UserSelectMenu
        v-if="teamScope"
        v-model="filters.assignedTo"
        :userIds="teamUserIds"
        includeInactive
        nullLabel="— All team members —"
      />
      <BaseFilterMenu v-model="filters" :items="filterItems" />
    </template>
  </BaseFilterBar>
</template>
