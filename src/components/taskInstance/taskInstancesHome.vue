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
  filters: { search: '', statusId: 'ASSIGNED', createdAt: null },
  syncUrl: true,
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
