<script setup>
const props = defineProps({ outcome: { type: String, default: null } })
const MAP = {
  PASS: { id: 'PASS', name: 'Pass' },
  FAIL: { id: 'FAIL', name: 'Fail' },
  NA: { id: 'NA', name: 'N/A' },
}
const status = computed(
  () => MAP[props.outcome] || (props.outcome ? { id: props.outcome, name: props.outcome } : null),
)
</script>

<template>
  <InspectionOutcomeBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
