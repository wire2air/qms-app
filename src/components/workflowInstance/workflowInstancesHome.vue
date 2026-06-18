<script setup>
const filters = ref({ search: '', statusId: null })
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      title="Approvals Inbox"
      subtitle="Review and authorize pending quality management tasks."
    />

    <!-- Filter toolbar -->
    <WorkflowInstancesFilterToolbar v-model:filters="filters" />

    <!-- Split-view layout -->
    <div class="tw:flex tw:gap-4 tw:flex-1 tw:min-h-0">
      <!-- Table -->
      <div class="tw:flex-1 tw:min-w-0 tw:flex tw:flex-col">
        <WorkflowInstancesTable :search="filters.search" :statusId="filters.statusId" />
      </div>
    </div>
  </BasePage>
</template>
