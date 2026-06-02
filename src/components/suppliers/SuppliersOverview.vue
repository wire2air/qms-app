<script setup>
defineProps({
  supplier: {
    type: Object,
    required: true,
  },
  canUpdate: {
    type: Boolean,
    default: false,
  },
  supplierId: {
    type: String,
    default: null,
  },
})
</script>

<template>
  <div class="tw:grid tw:grid-cols-12 tw:gap-6">
    <SuppliersBasicInfoCard
      :supplier="supplier"
      :canUpdate="canUpdate"
      class="tw:col-span-12 tw:lg:col-span-8"
    />
    <SuppliersRiskCard
      :supplier="supplier"
      :canUpdate="canUpdate"
      class="tw:col-span-12 tw:lg:col-span-4"
    />
    <SuppliersAuditFindingsCard
      :supplierId="supplierId"
      class="tw:col-span-12 tw:lg:col-span-4"
    />
    <SuppliersContactCard
      :supplierId="supplierId"
      :canUpdate="canUpdate"
      class="tw:col-span-12 tw:lg:col-span-8"
    />
    <SuppliersAssociatedSitesCard
      :supplierId="supplierId"
      :canUpdate="canUpdate"
      class="tw:col-span-12"
    />
  </div>
</template>
