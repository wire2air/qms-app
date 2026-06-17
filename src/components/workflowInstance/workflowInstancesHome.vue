<script setup>
const filters = ref({ search: '', statusId: null })
</script>

<template>
  <BasePage width="standard" density="compact">
    <!-- Header teleports -->
    <SafeTeleport to="#main-header-title">
      <div>
        <div class="tw:text-xl tw:font-bold tw:text-on-main">Approvals Inbox</div>
        <div class="tw:text-xs tw:text-secondary tw:hidden tw:sm:block">
          Review and authorize pending quality management tasks.
        </div>
      </div>
    </SafeTeleport>

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
