<script setup>
import { IconSearch } from '@tabler/icons-vue'

const filters = defineModel('filters', {
  type: Object,
  required: true,
})
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-2 tw:p-2 tw:rounded-lg tw:bg-sidebar">
    <SafeTeleport to="#main-header-search">
      <BaseTextInput
        v-model="filters.search"
        placeholder="Search by title or document number..."
        class="tw:flex-1 tw:max-w-md"
      >
        <template #icon>
          <IconSearch :size="18" class="tw:text-secondary" />
        </template>
      </BaseTextInput>
    </SafeTeleport>

    <TaskInstanceStatusSelectMenu v-model="filters.statusId" />
    <DateRangeFilter
      :from="filters.dateFrom"
      :to="filters.dateTo"
      @update:from="(v) => (filters.dateFrom = v)"
      @update:to="(v) => (filters.dateTo = v)"
    />
  </div>
</template>
