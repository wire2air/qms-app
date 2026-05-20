<script setup>
const props = defineProps({
  taskKindId: { type: String, default: null },
})

const filters = ref({ search: '', statusId: null })

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
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div>
        <div class="tw:text-xl tw:font-bold tw:text-on-main">{{ title }}</div>
        <div class="tw:text-xs tw:text-secondary tw:hidden tw:sm:block">{{ subtitle }}</div>
      </div>
    </SafeTeleport>

    <TaskInstancesFilterToolbar v-model:filters="filters" />

    <div class="tw:flex tw:gap-4 tw:flex-1 tw:min-h-0">
      <div class="tw:flex-1 tw:min-w-0 tw:flex tw:flex-col">
        <TaskInstancesTable
          :search="filters.search"
          :statusId="filters.statusId"
          :taskKindId="taskKindId"
        />
      </div>
    </div>
  </div>
</template>
