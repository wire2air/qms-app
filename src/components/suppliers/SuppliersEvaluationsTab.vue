<script setup>
import { IconChartBar } from '@tabler/icons-vue'

defineProps({
  supplier: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden"
  >
    <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover">
      <BaseSectionHeader
        title="Evaluations"
        :icon="IconChartBar"
        iconVariant="boxed"
        iconColor="gray"
        :iconSize="20"
        :level="3"
        size="section-title"
      />
    </div>
    <BaseEmptyState :icon="IconChartBar" title="No evaluations available for this supplier." />
  </div>
</template>
