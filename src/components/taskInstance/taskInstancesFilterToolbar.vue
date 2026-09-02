<script setup>
import { IconCalendar, IconSearch } from '@tabler/icons-vue'
import { isDueWindowActive } from '@/utils/taskDueWindows.js'

const props = defineProps({
  // Whether this viewer supervises anyone. False = no scope control at all:
  // there is exactly one answer to "whose tasks", so asking is noise.
  showScope: { type: Boolean, default: false },
  // The people the scope menu may offer, already narrowed by Department.
  teamUserIds: { type: Array, default: () => [] },
  // Departments this viewer supervises. The filter appears only past one —
  // with a single department it can only ever be a no-op.
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
      (filters.value.scope && filters.value.scope !== 'mine')
    ) || isDueWindowActive(filters.value.dueWindow),
)

function clearAll() {
  filters.value = {
    ...filters.value,
    search: '',
    statusId: null,
    createdAt: null,
    dueWindow: null,
    scope: 'mine',
    departmentId: null,
  }
}

// A viewer who loses their roster (last report reassigned) must not be left on
// a scope whose control no longer renders — an invisible filter is the one that
// gets reported as "the list is empty and I don't know why".
watch(
  () => props.showScope,
  (canScope) => {
    if (canScope) return
    if (filters.value.scope !== 'mine' || filters.value.departmentId) {
      filters.value = { ...filters.value, scope: 'mine', departmentId: null }
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
      <!-- Whose tasks — first, because it decides what the rest narrow. -->
      <TaskScopeSelectMenu v-if="showScope" v-model="filters.scope" :userIds="teamUserIds" />
      <DepartmentSelectMenu
        v-if="showScope && teamDepartmentIds.length > 1"
        v-model="filters.departmentId"
        :departmentIds="teamDepartmentIds"
        :allowCreate="false"
        isFilter
      />
      <TaskInstanceStatusSelectMenu v-model="filters.statusId" />
      <TaskDueWindowSelectMenu v-model="filters.dueWindow" />
      <BaseFilterMenu v-model="filters" :items="filterItems" />
    </template>
  </BaseFilterBar>
</template>
