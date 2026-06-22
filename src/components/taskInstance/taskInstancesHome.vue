<script setup>
import { IconDownload } from '@tabler/icons-vue'

/**
 * My Tasks / My Trainings — the assignee inbox list. Built on the Enterprise
 * Page Framework list template: `useListLayout` (filter state + resolved
 * content state) + `BaseListLayout` (header / filters / state region). The
 * rows themselves live in `TaskInstancesTable`, which owns the (large,
 * per-entity) live queries and its own mobile/empty rendering — so this page
 * only owns the filter object and hands it down as props.
 *
 * URL sync is intentionally OFF: the `taskKindId` lives in the route query and
 * is read by the parent page (`pages/task-instances.vue`), then passed in as a
 * prop. Enabling `useListLayout`'s `syncUrl` would rewrite the query with only
 * the filter keys and clobber `taskKindId`, so filters stay in component state.
 */
const props = defineProps({
  taskKindId: { type: String, default: null },
})

const tableRef = ref(null)

// Filter state + resolved content state. URL sync stays off (see header note).
const list = useListLayout({
  filters: { search: '', statusId: null, createdAt: null },
  syncUrl: false,
})

const title = computed(() => {
  if (props.taskKindId === 'TRAINING') return 'My Trainings'
  return 'My Tasks'
})

const subtitle = computed(() => {
  if (props.taskKindId === 'TRAINING') return 'Training tasks assigned to you.'
  return 'Review and act on tasks assigned to you.'
})
</script>

<template>
  <BaseListLayout
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
      <TaskInstancesFilterToolbar v-model:filters="list.filters.value" />
    </template>

    <div class="tw:flex tw:gap-4 tw:flex-1 tw:min-h-0">
      <div class="tw:flex-1 tw:min-w-0 tw:flex tw:flex-col">
        <TaskInstancesTable
          ref="tableRef"
          :search="list.filters.value.search"
          :statusId="list.filters.value.statusId"
          :taskKindId="taskKindId"
          :createdAt="list.filters.value.createdAt"
        />
      </div>
    </div>
  </BaseListLayout>
</template>
