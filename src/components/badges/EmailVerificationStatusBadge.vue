<script setup>
// Enum badge — verification status of an email channel. INACTIVE wins
// over verification state when the channel is disabled.
const props = defineProps({
  verificationStatus: { type: String, default: null },
  stateId: { type: String, default: 'ACTIVE' },
})

const STATUS_MAP = {
  VERIFIED: { name: 'Verified', class: 'tw:bg-green-100 tw:text-green-700' },
  PENDING: { name: 'Pending verification', class: 'tw:bg-amber-100 tw:text-amber-700' },
  FAILED: { name: 'Verification failed', class: 'tw:bg-red-100 tw:text-red-700' },
}

const display = computed(() => {
  if (props.stateId === 'INACTIVE') {
    return { name: 'Disabled', class: 'tw:bg-gray-100 tw:text-gray-600' }
  }
  return (
    STATUS_MAP[props.verificationStatus] || {
      name: props.verificationStatus || '—',
      class: 'tw:bg-gray-100 tw:text-gray-600',
    }
  )
})
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="display.class">{{ display.name }}</BaseBadge>
</template>
