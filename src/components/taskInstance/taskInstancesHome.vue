<script setup>
import { IconDownload } from '@tabler/icons-vue'

const props = defineProps({
  taskKindId: { type: String, default: null },
})

const filters = ref({ search: '', statusId: null, dateFrom: '', dateTo: '' })
const tableRef = ref(null)

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
  <BasePage width="standard">
    <PageHeader :title="title" :subtitle="subtitle">
      <template #actions>
        <BaseButton variant="outline" @click="tableRef?.exportCsv()">
          <IconDownload :size="16" class="tw:mr-1" />
          Export
        </BaseButton>
      </template>
    </PageHeader>

    <TaskInstancesFilterToolbar v-model:filters="filters" />

    <div class="tw:flex tw:gap-4 tw:flex-1 tw:min-h-0">
      <div class="tw:flex-1 tw:min-w-0 tw:flex tw:flex-col">
        <TaskInstancesTable
          ref="tableRef"
          :search="filters.search"
          :statusId="filters.statusId"
          :taskKindId="taskKindId"
          :dateFrom="filters.dateFrom"
          :dateTo="filters.dateTo"
        />
      </div>
    </div>
  </BasePage>
</template>
