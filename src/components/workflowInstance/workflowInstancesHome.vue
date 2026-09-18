<script setup>
import { IconInbox } from '@tabler/icons-vue'

// Filter state (URL-synced). The WorkflowInstancesTable child owns its own
// live query (`filteredInstances`) plus all the resource-resolution maps, so
// the parent can't observe the resulting row count. We therefore keep the
// list in the 'ready' state and let the child render its own table/empty
// handling — only the BasePage+PageHeader shell is swapped for BaseListLayout.
// Both filters are plain string/null values, so syncUrl is safe (no DateTime).
const list = useListLayout({
  filters: { search: '', statusId: null },
  syncUrl: true,
})
</script>

<template>
  <BaseListLayout
    title="Approvals Inbox"
    :icon="IconInbox"
    subtitle="Review and authorize pending quality management tasks."
    :state="list.state.value"
  >
    <template #filters>
      <WorkflowInstancesFilterToolbar v-model:filters="list.filters.value" />
    </template>

    <!-- Split-view layout -->
    <div class="tw:flex tw:gap-4 tw:flex-1 tw:min-h-0">
      <!-- Table -->
      <div class="tw:flex-1 tw:min-w-0 tw:flex tw:flex-col">
        <WorkflowInstancesTable
          :search="list.filters.value.search"
          :statusId="list.filters.value.statusId"
        />
      </div>
    </div>
  </BaseListLayout>
</template>
