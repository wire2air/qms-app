<script setup>
import { IconShieldCheck } from '@tabler/icons-vue'

defineProps({
  supplier: {
    type: Object,
    required: true,
  },
  canUpdate: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden tw:flex tw:flex-col tw:justify-between"
  >
    <div>
      <div
        class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-3"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-sky-100 tw:flex tw:items-center tw:justify-center"
        >
          <IconShieldCheck :size="20" class="tw:text-sky-600" />
        </div>
        <h3 class="tw:text-lg tw:font-semibold tw:text-on-main">Risk Profile</h3>
      </div>
      <div class="tw:p-6 tw:space-y-6">
        <div>
          <BaseLabel color="secondary" class="tw:mb-2">Current Risk Level</BaseLabel>
          <SupplierRiskLevelSelectMenu v-if="canUpdate" v-model="supplier.riskLevel" />
          <template v-else>
            <SupplierRiskLevelBadge v-if="supplier.riskLevel" :riskLevelId="supplier.riskLevel" />
            <p v-else class="tw:text-sm tw:text-secondary">Not assessed</p>
          </template>
        </div>
        <BaseDetailField
          label="Last Assessment"
          :value="supplier.lastEvaluationDate?.formatDate('date')"
          empty="Not evaluated"
        />
      </div>
    </div>
  </div>
</template>
