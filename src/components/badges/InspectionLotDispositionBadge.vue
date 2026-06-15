<script setup>
defineProps({ disposition: { type: String, default: null } })

const LABEL = {
  RELEASE: 'Release',
  USE_AS_IS: 'Use as-is',
  REWORK: 'Rework',
  RETURN_TO_VENDOR: 'Return to vendor',
  REJECT: 'Reject',
}

const SCHEME = {
  RELEASE: 'tw:bg-green-100 tw:text-green-700',
  USE_AS_IS: 'tw:bg-teal-100 tw:text-teal-700',
  REWORK: 'tw:bg-amber-100 tw:text-amber-700',
  RETURN_TO_VENDOR: 'tw:bg-orange-100 tw:text-orange-700',
  REJECT: 'tw:bg-red-100 tw:text-red-700',
}
</script>

<template>
  <BaseBadge v-if="disposition" v-bind="$attrs" :class="SCHEME[disposition] || 'tw:bg-gray-100 tw:text-gray-600'">
    {{ LABEL[disposition] || disposition }}
  </BaseBadge>
</template>
