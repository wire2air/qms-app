<script setup>
defineProps({
  status: {
    type: String,
    required: true,
    validator: (value) => ['ACTIVE', 'INACTIVE', 'DRAFT'].includes(value),
  },
})

function getBadgeClass(status) {
  if (status === 'ACTIVE') {
    return 'tw:bg-good/10 tw:text-good'
  }
  if (status === 'INACTIVE') {
    return 'tw:bg-bad/10 tw:text-bad'
  }
  if (status === 'DRAFT') {
    return 'tw:bg-secondary/10 tw:text-secondary'
  }
  return 'tw:bg-secondary/10 tw:text-secondary'
}

function getBadgeLabel(status) {
  if (status === 'ACTIVE') return 'Active'
  if (status === 'INACTIVE') return 'Inactive'
  if (status === 'DRAFT') return 'Draft'
  return status
}
</script>

<template>
  <span
    :class="getBadgeClass(status)"
    class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wide tw:px-2 tw:py-0.5 tw:rounded"
  >
    {{ getBadgeLabel(status) }}
  </span>
</template>
