<script setup>
defineProps({
  supplierId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-6">
    <SuppliersLocationsCard :supplierId="supplierId" :canUpdate="canUpdate" />
    <SuppliersContactCard :supplierId="supplierId" :canUpdate="canUpdate" />
  </div>
</template>
